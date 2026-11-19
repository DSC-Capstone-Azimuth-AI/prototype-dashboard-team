"""Generated synthetic raw fixtures only; exercise the CLI through the browser schema."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from test_derconnect_export import ROOT, csv_text, rows_at


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.output = self.folder / "exports"
        self.raw = self.folder / "raw.csv"
        rows = rows_at("2026-01-01T08:00:00Z", 450)
        rows += [[r[0], "E9000", "-2000"] for r in rows]
        self.raw.write_text(csv_text(rows))
        self.cmd = [sys.executable, "-B", str(ROOT / "tools/export_derconnect_batch.py"),
                    "--input", str(self.raw), "--meters", "E2451", "E9000", "--start", "2026-01-01T00:00:00-08:00",
                    "--end", "2026-01-01T01:00:00-08:00", "--output-dir", str(self.output), "--synthetic-fixture"]

    def run_batch(self, extra=()):
        return subprocess.run([*self.cmd, *extra], capture_output=True, text=True)

    def test_multiple_arbitrary_meters_schema_and_no_overwrite(self):
        run = self.run_batch()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("2 succeeded", run.stdout)
        files = sorted(self.output.glob("*.json"))
        self.assertEqual(len(files), 2)
        self.assertIn("20260101T080000Z--20260101T090000Z-15min", files[0].name)
        known, unknown = [json.loads(p.read_text()) for p in files]
        self.assertEqual(known["facility_type"], "Instructional")
        self.assertIsNone(unknown["facility_type"])
        self.assertEqual(unknown["records"][0]["mean_kw"], -2)
        # Actual generated outputs must pass the existing production JS validator.
        script = """const fs=require('fs'),vm=require('vm');global.window=global;global.DC={};
vm.runInThisContext(fs.readFileSync('js/real-data.js','utf8'));
for(const p of process.argv.slice(1)) DC.history.validate(JSON.parse(fs.readFileSync(p,'utf8')));"""
        checked = subprocess.run(["node", "-e", script, *map(str, files)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        before = {p: p.read_bytes() for p in files}
        self.assertEqual(self.run_batch().returncode, 2)
        self.assertEqual(before, {p: p.read_bytes() for p in files})

    def test_partial_failure_and_absent_range_channel_meter(self):
        run = self.run_batch(["--meters", "missing", "E2451", "../unsafe"])
        self.assertEqual(run.returncode, 2)
        self.assertIn("1 succeeded", run.stdout)
        self.assertIn("2 failed", run.stdout)
        self.assertEqual(len(list(self.output.glob("*.json"))), 1)
        self.assertIn("No observations", run.stderr)
        run = self.run_batch(["--channel", "Active_Power_B"])
        self.assertEqual(run.returncode, 2)
        self.assertIn("Raw CSV requires", run.stderr)
        run = self.run_batch(["--start", "2026-02-01T00:00:00-08:00", "--end", "2026-02-01T01:00:00-08:00"])
        self.assertEqual(run.returncode, 2)
        self.assertIn("No observations", run.stderr)

    def test_resolution_and_quality_preserved(self):
        self.raw.write_text(csv_text(rows_at("2026-01-01T08:00:00Z", 150) + rows_at("2026-01-01T08:00:00Z", 1)))
        run = self.run_batch(["--meters", "E2451", "--minutes", "5", "--chunksize", "37"])
        self.assertEqual(run.returncode, 0, run.stderr)
        data = json.loads(next(self.output.glob("*.json")).read_text())
        self.assertEqual(data["records"][0]["quality"], "cadence_collision")
        self.assertIsNone(data["records"][0]["mean_kw"])
        self.assertEqual(data["records"][1]["quality"], "missing")
        self.assertEqual(len(data["records"]), 12)

    def test_selected_phase_and_hourly_resolution(self):
        self.raw.write_text(self.raw.read_text().replace("Active_Power_A", "Active_Power_C"))
        run = self.run_batch(["--channel", "Active_Power_C", "--minutes", "60"])
        self.assertEqual(run.returncode, 0, run.stderr)
        for file in self.output.glob("*.json"):
            data = json.loads(file.read_text())
            self.assertEqual(data["channel"], "Active_Power_C")
            self.assertEqual(len(data["records"]), 1)
            self.assertEqual(data["records"][0]["quality"], "low_coverage")


if __name__ == "__main__":
    unittest.main()
