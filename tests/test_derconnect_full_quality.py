"""Small synthetic archives only; real measurements never enter regression fixtures."""
import csv
import io
import sys
from pathlib import Path
import tempfile
import unittest
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from derconnect_full_quality import scan_archive, aggregation_summary, phase_sum_allowed


def csv_text(rows, columns=None):
    columns = columns or ["_time", "DeviceID", "Active_Power_A", "Active_Power_B", "Active_Power_C"]
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(columns)
    writer.writerows(rows)
    return stream.getvalue()


class FullQualityTests(unittest.TestCase):
    def run_archive(self, members, **kwargs):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.zip"
            with zipfile.ZipFile(path, "w") as archive:
                for name, rows in members.items():
                    archive.writestr(name, csv_text(rows))
            result = scan_archive(path, months=["2026-01"], devices=["E2451"],
                                  calendar_tz="UTC", progress=None, **kwargs)
            self.assertEqual(list(Path(folder).iterdir()), [path], "analysis must not export datasets")
            return result

    def test_quality_time_gaps_and_chunk_duplicates(self):
        result = self.run_archive({"E2451/E2451_2026-01.csv": [
            ["2026-01-01T00:00:00Z", "E2451", "1000", "2000", "3000"],
            ["2026-01-01T00:00:02Z", "E2451", "bad", "", "inf"],
            ["2026-01-01T00:00:02Z", "E2451", "9000", "2000", "3000"],
            ["2026-01-01T00:00:08Z", "E2451", "-1000", "2000", "3000"],
            ["2026-01-01T00:00:04Z", "E2451", "1000", "2000", "3000"],
            ["2026-01-01T00:00:10", "E2451", "1000", "2000", "3000"],
            ["not-a-time", "E2451", "1000", "2000", "3000"],
            ["", "E2451", "1000", "2000", "3000"],
            ["2026-01-01T00:00:12Z", "E3020", "1000", "2000", "3000"],
        ]}, chunksize=2, minimum_coverage=0)
        summary = result["summary"].iloc[0]
        self.assertEqual(summary.rows, 9)
        self.assertEqual(summary.observed_slots, 4)
        self.assertEqual(summary.duplicate_rows, 1)
        self.assertEqual(summary.backwards_steps, 1)
        self.assertEqual(summary.naive_timestamps, 1)
        self.assertEqual(summary.invalid_timestamps, 1)
        self.assertEqual(summary.missing_timestamps, 1)
        self.assertEqual(summary.device_id_mismatch, 1)
        self.assertEqual(summary.gap_count, 2)  # one interior and one trailing gap
        self.assertEqual(summary.recording_gap_count, 1)  # 4 -> 8 seconds
        quality = result["measurements"].set_index("register")
        self.assertEqual(quality.loc["Active_Power_A", "invalid"], 1)
        self.assertEqual(quality.loc["Active_Power_B", "missing"], 1)
        self.assertEqual(quality.loc["Active_Power_C", "invalid"], 1)
        self.assertEqual(quality.loc["Frequency", "absent_column_rows"], 9)
        frame = result["aggregates"][("E2451", 5)]
        self.assertTrue(frame.iloc[0].duplicate_bin)
        self.assertTrue(pd.isna(frame.iloc[0]["Active_Power_A__mean_kw"]))
        self.assertFalse(result["total_enabled"])

    def test_weighted_aggregation_peaks_and_empty_bins(self):
        origin = pd.Timestamp("2026-01-01T00:00:00Z")
        rows = [[(origin + pd.Timedelta(seconds=2*i)).isoformat(), "E2451", i, 2*i, 3*i] for i in range(1800)]
        result = self.run_archive({"E2451/E2451_2026-01.csv": rows}, chunksize=147)
        five = result["aggregates"][("E2451", 5)]
        fifteen = result["aggregates"][("E2451", 15)]
        hour = result["aggregates"][("E2451", 60)]
        self.assertAlmostEqual(five.iloc[0]["Active_Power_A__mean_kw"], np.arange(150).mean()/1000)
        self.assertAlmostEqual(fifteen.iloc[0]["Active_Power_A__mean_kw"], np.arange(450).mean()/1000)
        self.assertAlmostEqual(hour.iloc[0]["Active_Power_A__mean_kw"], .8995)
        self.assertEqual(hour.iloc[0]["Active_Power_A__max_kw"], 1.799)
        self.assertEqual(hour.iloc[0]["Active_Power_A__min_kw"], 0)
        self.assertAlmostEqual(hour.iloc[0]["Active_Power_A__within_bin_std_kw"], np.arange(1800).std()/1000)
        self.assertEqual(hour.iloc[0]["Active_Power_A__coverage_pct"], 100)
        self.assertEqual(hour.iloc[1]["Active_Power_A__coverage_pct"], 0)
        self.assertTrue(pd.isna(hour.iloc[1]["Active_Power_A__mean_kw"]))
        stats = aggregation_summary(result)
        self.assertEqual(set(stats.interval_minutes), {5, 15, 60})
        self.assertTrue((stats.peak_reduction_pct > 0).all())

    def test_slot_coverage_not_inflated_by_jitter_or_extra_rows(self):
        result = self.run_archive({"E2451/E2451_2026-01.csv": [
            ["2026-01-01T00:00:00.1Z", "E2451", 1000, 1000, 1000],
            ["2026-01-01T00:00:01.9Z", "E2451", 1000, 1000, 1000],
            ["2026-01-01T00:00:02.1Z", "E2451", 1000, 1000, 1000],
        ]}, chunksize=1, minimum_coverage=0)
        self.assertEqual(result["summary"].iloc[0].observed_slots, 2)
        self.assertEqual(result["summary"].iloc[0].duplicate_rows, 0)
        self.assertAlmostEqual(result["aggregates"][("E2451", 5)].iloc[0].timestamp_coverage_pct, 2/150*100)

    def test_jitter_slot_hole_is_distinct_from_recording_gap(self):
        result = self.run_archive({"E2451/E2451_2026-01.csv": [
            ["2026-01-01T00:00:00.1Z", "E2451", 1000, 1000, 1000],
            ["2026-01-01T00:00:02.1Z", "E2451", 1000, 1000, 1000],
            ["2026-01-01T00:00:03.999Z", "E2451", 1000, 1000, 1000],
            ["2026-01-01T00:00:06.001Z", "E2451", 1000, 1000, 1000],
        ]}, minimum_coverage=0)
        self.assertEqual(result["summary"].iloc[0].gap_count, 2)
        self.assertEqual(result["summary"].iloc[0].recording_gap_count, 0)
        self.assertTrue(result["observation_gaps"].empty)

    def test_sum_requires_documented_review_and_all_finite_phases(self):
        self.assertFalse(phase_sum_allowed({"same_device_and_timestamp": True}))
        review = dict(same_device_and_timestamp=True, distinct_additive_phases=True,
                      compatible_signed_power_W=True, source_reference="Synthetic fixture specification")
        self.assertTrue(phase_sum_allowed(review))
        self.assertFalse(phase_sum_allowed({**review, "source_reference": None}))
        result = self.run_archive({"E2451/E2451_2026-01.csv": [
            ["2026-01-01T00:00:00Z", "E2451", 1000, 2000, 3000],
            ["2026-01-01T00:00:02Z", "E2451", 1000, "", 3000],
        ]}, chunksize=1, minimum_coverage=0, phase_review=review)
        self.assertTrue(result["total_enabled"])
        frame = result["aggregates"][("E2451", 5)]
        self.assertEqual(frame.iloc[0]["Total_Active_Power__mean_kw"], 6)
        self.assertEqual(frame.iloc[0]["Total_Active_Power__valid_rows"], 1)
        self.assertTrue(pd.isna(result["detail"].iloc[1].Total_Active_Power))

    def test_duplicate_across_files_and_source_month_mismatch(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/"synthetic.zip"
            with zipfile.ZipFile(path, "w") as archive:
                for month in ["2026-01", "2026-02"]:
                    archive.writestr(f"E2451/E2451_{month}.csv", csv_text([
                        ["2026-02-01T00:00:00Z", "E2451", 1000, 2000, 3000]]))
            result = scan_archive(path, months=["2026-01", "2026-02"], devices=["E2451"],
                                  calendar_tz="UTC", chunksize=1, minimum_coverage=0, progress=None)
            summary = result["summary"].set_index("month")
            self.assertEqual(summary.loc["2026-01", "outside_source_month"], 1)
            self.assertEqual(summary.loc["2026-01", "observed_slots"], 0)
            self.assertEqual(summary.loc["2026-02", "duplicate_rows"], 1)
            feb = result["aggregates"][("E2451", 5)].loc["2026-02-01T00:00:00Z"]
            self.assertTrue(feb.duplicate_bin)
            self.assertTrue(pd.isna(feb["Active_Power_A__mean_kw"]))

    def test_dst_empty_month_and_detail_limits(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("E2451/E2451_2026-03.csv", csv_text([
                    ["2026-03-08T01:59:58-08:00", "E2451", 1000, 2000, 3000],
                    ["2026-03-08T03:00:00-07:00", "E2451", 1000, 2000, 3000],
                    ["2026-03-08T03:00:02-07:00", "E2451", 1000, 2000, 3000]]))
            result = scan_archive(path, months=["2026-03", "2026-04"], devices=["E2451"],
                chunksize=1, minimum_coverage=0, detail_start="2026-03-08T09:00:00Z", max_detail_rows=2, progress=None)
            summary = result["summary"].set_index("month")
            self.assertEqual(summary.loc["2026-03", "expected_slots"], (31*24-1)*1800)
            day=result["daily"].set_index("date").loc["2026-03-08"]
            self.assertEqual(day.expected_slots, 23*1800)
            self.assertEqual(summary.loc["2026-04", "coverage_pct"], 0)
            self.assertEqual(summary.loc["2026-04", "files"], 0)
            self.assertEqual(len(result["detail"]), 2)
            self.assertTrue(result["metadata"]["detail_truncated"])
            self.assertEqual(summary.loc["2026-03", "interval_median_s"], 2)

    def test_no_offset_detail_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "offset"):
            self.run_archive({}, detail_start="2026-01-01")
        with self.assertRaisesRegex(ValueError, "detail_device"):
            self.run_archive({}, detail_device="E3020")


if __name__ == "__main__":
    unittest.main()
