"""Small generated synthetic raw inputs only; no private DERConnect measurements."""
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from export_derconnect_history import export_history, bounds


def csv_text(rows):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["_time", "DeviceID", "Active_Power_A"])
    writer.writerows(rows)
    return out.getvalue()


def rows_at(start, n, values=None):
    t = pd.Timestamp(start)
    return [[(t + pd.Timedelta(seconds=i * 2)).isoformat(), "E2451", values(i) if values else 1000]
            for i in range(n)]


def browser_fixture(folder):
    """Reproducible 48-hour synthetic fixture with zero, negatives and quality gaps."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    start = pd.Timestamp("2026-01-01T00:00:00-08:00")
    rows = []
    for i in range(48 * 1800):
        bin_id = i // 450
        if bin_id in (4, 5):  # missing bins
            continue
        if bin_id == 8 and i % 450 >= 200:  # below 80% coverage
            continue
        stamp = start + pd.Timedelta(seconds=i * 2)
        value = (stamp.hour - 6) * 1000
        rows.append([stamp.isoformat(), "E2451", "bad" if bin_id == 12 else value])
        if bin_id == 16 and i % 450 == 0:
            rows.append(rows[-1].copy())
    path = folder / "E2451_synthetic.csv"
    path.write_text(csv_text(rows))
    result = export_history(path, start=start.isoformat(), end=(start + pd.Timedelta(days=2)).isoformat(), synthetic_fixture=True)
    output = folder / "derconnect-history-fixture.json"
    output.write_text(json.dumps(result, allow_nan=False, separators=(",", ":")) + "\n")
    return output


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "E2451_test.csv"

    def run_rows(self, rows, **kwargs):
        self.path.write_text(csv_text(rows))
        return export_history(self.path, start=kwargs.pop("start", "2026-01-01T00:00:00Z"),
                              end=kwargs.pop("end", "2026-01-01T01:00:00Z"), synthetic_fixture=True, **kwargs)

    def test_offset_utc_zero_negative_units_extrema_and_determinism(self):
        rows = rows_at("2025-12-31T16:00:00-08:00", 450, lambda i: (i - 225) * 1000)
        first = self.run_rows(rows, chunksize=37)
        r = first["records"][0]
        self.assertEqual(r["timestamp_utc"], "2026-01-01T00:00:00Z")
        self.assertEqual((r["expected_slots"], r["valid_observations"], r["coverage"]), (450, 450, 1))
        self.assertEqual((r["mean_kw"], r["min_kw"], r["max_kw"]), (-0.5, -225, 224))
        self.assertEqual(first, export_history(self.path, start="2026-01-01T00:00:00Z", end="2026-01-01T01:00:00Z", chunksize=37, synthetic_fixture=True))
        self.assertEqual(first["provenance"]["inputs"][0]["sha256"], hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(first["display_unit"], "kW")
        self.assertEqual(first["timezone"], "America/Los_Angeles")
        json.dumps(first, allow_nan=False)

    def test_missing_invalid_naive_time_and_missing_numeric(self):
        rows = [["2026-01-01T00:00:00Z", "E2451", "0"],
                ["2026-01-01T00:00:02Z", "E2451", "-1000"],
                ["2026-01-01T00:00:04Z", "E2451", "bad"],
                ["2026-01-01T00:00:06Z", "E2451", "inf"],
                ["2026-01-01T00:00:08Z", "E2451", ""],
                ["2026-01-01T00:00:10Z", "E2451", "NaN"],
                ["bad", "E2451", 1000], ["", "E2451", 1000],
                ["2026-01-01T00:00:12", "E2451", 1000],
                ["2026-01-01T00:00:12Z", "E3020", 1000]]
        out = self.run_rows(rows, minimum_coverage=0)
        r = out["records"][0]
        self.assertEqual((r["mean_kw"], r["min_kw"], r["max_kw"]), (-0.5, -1, 0))
        self.assertEqual((r["valid_observations"], r["observed_slots"]), (2, 6))
        self.assertAlmostEqual(r["coverage"], 2 / 450)
        d = out["provenance"]["diagnostics"]
        for k in ("invalid_timestamps", "missing_timestamps", "naive_timestamps", "other_meter_rows"):
            self.assertEqual(d[k], 1)
        self.assertEqual((d["missing_values"], d["invalid_values"]), (2, 2))
        self.assertEqual(out["records"][1]["quality"], "missing")
        self.assertIsNone(out["records"][1]["mean_kw"])

    def test_coverage_threshold_and_complete_bin_boundaries(self):
        rows = rows_at("2026-01-01T00:00:00Z", 360)
        rows += [["2026-01-01T00:15:00Z", "E2451", 2000], ["2026-01-01T01:00:00Z", "E2451", 9000]]
        out = self.run_rows(rows)
        self.assertEqual(out["records"][0]["quality"], "ok")
        self.assertEqual(out["records"][1]["quality"], "low_coverage")
        self.assertEqual(out["records"][1]["valid_observations"], 1)
        self.assertEqual(out["provenance"]["diagnostics"]["outside_range_rows"], 1)
        out = self.run_rows(rows, minimum_coverage=0.80001)
        self.assertEqual(out["records"][0]["quality"], "low_coverage")

    def test_duplicates_chunk_boundaries_order_and_jitter_collisions(self):
        rows = rows_at("2026-01-01T00:00:00Z", 450)
        rows.append(rows[0].copy())
        out = self.run_rows(rows, chunksize=1)
        r = out["records"][0]
        self.assertEqual(r["quality"], "cadence_collision")
        self.assertEqual((r["valid_observations"], r["collision_slots"]), (449, 1))
        self.assertIsNone(r["mean_kw"])
        self.assertEqual(out["provenance"]["diagnostics"]["backwards_steps"], 1)
        out = self.run_rows([["2026-01-01T00:00:00.1Z", "E2451", 1000], ["2026-01-01T00:00:01.9Z", "E2451", 2000]], minimum_coverage=0)
        self.assertEqual(out["records"][0]["coverage"], 0)
        self.assertEqual(out["records"][0]["observed_slots"], 1)
        reverse = self.run_rows(list(reversed(rows[:-1])))
        self.assertEqual(reverse["records"][0]["mean_kw"], 1)

    def test_zip_cross_file_duplicates_directory_and_schema(self):
        raw = csv_text(rows_at("2026-01-01T00:00:00Z", 450))
        path = Path(self.temp.name) / "fixture.zip"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("E2451/E2451_2026-01.csv", raw)
            z.writestr("E2451/E2451_2026-02.csv", csv_text(rows_at("2026-01-01T00:00:00Z", 1)))
            z.writestr("E3020/E3020_2026-01.csv", "unsupported unrelated CSV")
        out = export_history(path, start="2026-01-01T00:00:00Z", end="2026-01-01T01:00:00Z")
        self.assertEqual(len(out["provenance"]["inputs"]), 2)
        self.assertEqual(out["records"][0]["quality"], "cadence_collision")
        self.path.write_text(raw)
        extracted = export_history(Path(self.temp.name), start="2026-01-01T00:00:00Z", end="2026-01-01T01:00:00Z")
        self.assertEqual(extracted["records"][0]["mean_kw"], 1)
        self.path.write_text("bin_utc,meter,P_total_mean\n2026-01-01,E2451,10\n")
        with self.assertRaisesRegex(ValueError, "Raw CSV"):
            export_history(self.path, month="2026-01")

    def test_resolutions_weighted_statistics_and_partial_hour_range(self):
        for minutes in (5, 15, 60):
            with self.subTest(minutes=minutes):
                out = self.run_rows(rows_at("2026-01-01T00:00:00Z", 1800, lambda i: i * 1000), minutes=minutes)
                n = minutes * 30
                self.assertEqual(len(out["records"]), 60 // minutes)
                self.assertEqual(out["records"][0]["mean_kw"], (n - 1) / 2)
                self.assertEqual(out["records"][0]["max_kw"], n - 1)
        out = self.run_rows(rows_at("2026-01-01T00:15:00Z", 450), start="2026-01-01T00:15:00Z", end="2026-01-01T00:30:00Z")
        self.assertEqual(len(out["records"]), 1)
        self.assertEqual(out["records"][0]["coverage"], 1)

    def test_dst_elapsed_days_and_local_month(self):
        for start, end, count in [("2026-03-08T00:00:00-08:00", "2026-03-09T00:00:00-07:00", 92),
                                   ("2026-11-01T00:00:00-07:00", "2026-11-02T00:00:00-08:00", 100)]:
            out = self.run_rows([], start=start, end=end)
            self.assertEqual(len(out["records"]), count)
            self.assertTrue(all(r["quality"] == "missing" for r in out["records"]))
        a, b = bounds(month="2026-03")
        self.assertEqual((b-a).total_seconds(), (31*24-1)*3600)

    def test_invalid_configuration_and_input(self):
        self.path.write_text(csv_text([]))
        for kwargs in [dict(meter="unknown"), dict(channel="P_total_mean"), dict(minutes=7),
                       dict(minimum_coverage=-1), dict(minimum_coverage=float("nan")), dict(chunksize=0),
                       dict(start="2026-01-01", end="2026-01-02"),
                       dict(start="2026-01-01T00:01:00Z", end="2026-01-02T00:00:00Z"),
                       dict(start="2026-01-02T00:00:00Z", end="2026-01-01T00:00:00Z"),
                       dict(start="2026-01-01T00:00:00Z", end="2026-03-01T00:00:00Z")]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                export_history(self.path, **(dict(month="2026-01") if not "start" in kwargs else {}), **kwargs)
        with self.assertRaises(FileNotFoundError):
            export_history(self.path.with_name("missing.csv"), month="2026-01")
        empty = Path(self.temp.name) / "empty"
        empty.mkdir()
        with self.assertRaises(ValueError):
            export_history(empty, month="2026-01")

    def test_invalid_only_and_valid_zero(self):
        out = self.run_rows([["2026-01-01T00:00:00Z", "E2451", "Infinity"]], minimum_coverage=0)
        self.assertEqual(out["records"][0]["quality"], "invalid")
        self.assertIsNone(out["records"][0]["mean_kw"])
        out = self.run_rows(rows_at("2026-01-01T00:00:00Z", 450, lambda i: 0))
        self.assertEqual(out["records"][0]["quality"], "ok")
        self.assertEqual(out["records"][0]["mean_kw"], 0)

    def test_cli_json_no_overwrite_and_errors(self):
        self.path.write_text(csv_text(rows_at("2026-01-01T00:00:00Z", 450)))
        output = Path(self.temp.name) / "result.json"
        cmd = [sys.executable, str(ROOT / "tools/export_derconnect_history.py"), "--input", str(self.path), "--month", "2026-01", "--output", str(output), "--synthetic-fixture"]
        run = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        result = json.loads(output.read_text())
        self.assertEqual(result["schema_version"], "1.0")
        self.assertEqual(result["measurement_kind"], "synthetic_fixture")
        content = output.read_bytes()
        self.assertEqual(subprocess.run(cmd, capture_output=True).returncode, 2)
        self.assertEqual(output.read_bytes(), content)
        self.assertEqual(subprocess.run([sys.executable, str(ROOT / "tools/export_derconnect_history.py"), "--output", str(output)], env={"PATH": str(Path(sys.executable).parent)}, capture_output=True).returncode, 2)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--fixture":
        print(browser_fixture(sys.argv[2]))
    else:
        unittest.main()
