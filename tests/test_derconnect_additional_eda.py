"""Synthetic-only regression checks for offline H–K analysis, not real findings."""
import csv
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from derconnect_full_quality import scan_archive
from derconnect_additional_eda import (calendar_tables, scan_measurements,
    quantile_bounds, matched_comparison, distribution_tables)


class AdditionalEDATests(unittest.TestCase):
    def fixture(self, rows):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        path = Path(folder.name) / 'synthetic.zip'
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(['_time', 'DeviceID', 'Active_Power_A', 'Active_Power_B',
                         'Active_Power_C', 'Voltage_A-N', 'Current_A', 'Frequency'])
        writer.writerows(rows)
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('E2451/2026-01.csv', stream.getvalue())
        base = scan_archive(path, devices=['E2451'], months=['2026-01'],
                            calendar_tz='UTC', minimum_coverage=0, chunksize=2, progress=None)
        return path, base

    def test_histogram_intervals_cover_empirical_quantile(self):
        values = np.array([-3., -2., 0., 0., 1., 4., 10.])
        counts, edges = np.histogram(values, bins=4, range=(-3, 10))
        for q in [0, .5, .95, 1]:
            low, high = quantile_bounds(counts, -3, 10, q)
            expected = np.sort(values)[max(1, int(np.ceil(q * len(values))))-1]
            self.assertLessEqual(low, expected)
            self.assertGreaterEqual(high, expected)
        self.assertEqual(quantile_bounds([5, 0], 7, 7, .95), (7., 7.))
        self.assertTrue(np.isnan(quantile_bounds([0, 0], np.nan, np.nan, .5)[0]))

    def test_chunked_peaks_units_nulls_constants_and_duplicate_withholding(self):
        path, base = self.fixture([
            ['2026-01-01T00:00:00Z', 'E2451', 5000, -2000, 0, 120, 5, 60],
            ['2026-01-01T00:00:02Z', 'E2451', 3000, -1000, 0, 120, '', 60],
            ['2026-01-01T00:05:00Z', 'E2451', 9000, 0, 0, 120, 4, 60],
            ['2026-01-01T00:05:00Z', 'E2451', 9000, 0, 0, 120, 4, 60],
            ['2026-01-01T00:15:00Z', 'E2451', 4000, -3000, 0, 120, 'inf', 60],
            ['2026-01-01T00:20:00Z', 'E3020', 99000, 0, 0, 999, 1, 60],
            ['2026-01-01T00:20:00', 'E2451', 99000, 0, 0, 999, 1, 60],
        ])
        extra = scan_measurements(path, base, chunksize=1, progress=None)
        stats = extra['statistics'].set_index('register')
        self.assertEqual(stats.loc['Active_Power_A', 'finite_rows'], 3)
        self.assertEqual(stats.loc['Active_Power_A', 'mean'], 4000)
        self.assertTrue(stats.loc['Voltage_A-N', 'constant'])
        self.assertEqual(stats.loc['Power_Factor_A', 'finite_rows'], 0)
        self.assertEqual(stats.loc['Current_A', 'finite_rows'], 1)
        peak = extra['daily_peaks'].set_index('channel').loc['Active_Power_A']
        self.assertEqual(peak.observed_peak_kw, 5)
        self.assertEqual(peak.peak_utc, pd.Timestamp('2026-01-01T00:00:00Z'))
        frame = extra['aggregates']['E2451']
        self.assertTrue(pd.isna(frame.iloc[0]['Voltage_A-N__mean']))
        self.assertEqual(frame.iloc[1]['Voltage_A-N__mean'], 120)
        self.assertEqual(frame.iloc[1]['Current_A__coverage_pct'], 0)
        raw, bins = distribution_tables(base, extra)
        self.assertEqual(raw.set_index('register').loc['Active_Power_A', 'mean_kw'], 4)
        self.assertEqual(bins.set_index('channel').loc['Active_Power_A', 'median_kw'], 4)
        self.assertEqual(list(path.parent.iterdir()), [path], 'No analysis exports')

    def test_calendar_dst_week_edges_and_missing_denominators(self):
        # March 8 is a 23-hour campus day. No imaginary local 02:00 bin.
        index = pd.date_range('2026-03-01T08:00Z', '2026-04-01T07:00Z', freq='h', inclusive='left')
        values = np.full(len(index), 2.)
        values[:24] = np.nan
        result = dict(metadata={'calendar_tz': 'America/Los_Angeles'}, channels=['Active_Power_A'],
                      aggregates={('E2451', 60): pd.DataFrame({'Active_Power_A__mean_kw': values}, index=index)})
        tables = calendar_tables(result)
        days = tables['daily'].set_index('local_day')
        self.assertEqual(days.loc[pd.Timestamp('2026-03-08', tz='America/Los_Angeles'), 'expected_hours'], 23)
        self.assertTrue(pd.isna(days.iloc[0].mean_kw))
        self.assertTrue(tables['weekly'].iloc[0].partial_calendar_period)
        self.assertEqual(tables['weekly'].iloc[1].expected_hours, 167)
        self.assertEqual(tables['monthly'].iloc[0].expected_hours, 743)
        self.assertEqual(tables['monthly'].iloc[0].mean_kw, 2)

    def test_common_windows_and_nonpositive_normalization(self):
        index = pd.date_range('2026-01-01', periods=3, freq='h', tz='UTC')
        result = {'aggregates': {('E2451', 60): pd.DataFrame({'p__mean_kw': [1., np.nan, 3.]}, index=index),
                                ('E3020', 60): pd.DataFrame({'p__mean_kw': [-2., 4., -4.]}, index=index)}}
        common, summary, normalized = matched_comparison(result, 'p')
        self.assertEqual(len(common), 2)
        self.assertEqual(summary.loc['E2451', 'mean'], 2)
        self.assertTrue(normalized.E3020.isna().all())
        self.assertEqual(normalized.E2451.tolist(), [.5, 1.5])
        result['aggregates'][('E2451', 60)]['p__mean_kw'] = np.nan
        common, summary, normalized = matched_comparison(result, 'p')
        self.assertTrue(common.empty)
        self.assertEqual(summary.common_hours.sum(), 0)

    def test_no_accepted_rows_keeps_explicit_empty_peak_schema(self):
        path, base = self.fixture([
            ['2026-01-01T00:00:00', 'E2451', 1000, 2000, 3000, 120, 5, 60],
        ])
        extra = scan_measurements(path, base, progress=None)
        self.assertTrue(extra['daily_peaks'].empty)
        self.assertIn('peak_local_hour', extra['daily_peaks'])
        self.assertTrue(extra['statistics'].finite_rows.eq(0).all())

    def test_out_of_order_tied_peak_uses_earliest_instant(self):
        path, base = self.fixture([
            ['2026-01-01T00:00:04Z', 'E2451', 5000, 0, 0, 120, 5, 60],
            ['2026-01-01T00:00:02Z', 'E2451', 5000, 0, 0, 120, 5, 60],
        ])
        extra = scan_measurements(path, base, chunksize=10, progress=None)
        peak = extra['daily_peaks'].query('channel == "Active_Power_A"').iloc[0]
        self.assertEqual(peak.peak_utc, pd.Timestamp('2026-01-01T00:00:02Z'))

    def test_notebook_empty_accepted_scope(self):
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
        from zoneinfo import ZoneInfo
        from inspect_derconnect import METERS, UNITS
        path, base = self.fixture([
            ['2026-01-01T00:00:00', 'E2451', 1000, 2000, 3000, 120, 5, 60],
        ])
        namespace = dict(FULL_RESULT=base, FG_DATA_PATH=path, Path=Path,
            pd=pd, np=np, plt=plt, mdates=mdates, ZoneInfo=ZoneInfo,
            METERS=METERS, UNITS=UNITS, display=lambda *_: None)
        mapping_path = Path(__file__).resolve().parents[1] / 'data/Meter Reading Mapping.csv'
        namespace['DOCUMENTED_UNITS'] = pd.read_csv(mapping_path).set_index('Register Name').Units.to_dict()
        notebook = json.loads((Path(__file__).resolve().parents[1] /
            'notebooks/01_derconnect_data_exploration.ipynb').read_text())
        prior_show = plt.show
        try:
            plt.show = lambda: plt.close('all')
            with contextlib.redirect_stdout(io.StringIO()):
                for cell in notebook['cells']:
                    if cell['cell_type'] == 'code' and cell['id'].startswith('derconnect-hl-'):
                        exec(compile(''.join(cell['source']), '<H-L-empty-scope>', 'exec'), namespace)
        finally:
            plt.show = prior_show
            plt.close('all')
        self.assertTrue(namespace['HL_EXTRA']['daily_peaks'].empty)
        self.assertTrue(namespace['HL_PEAK_COMPARISON'].empty)

    def test_documented_units_match_helpers_and_reject_ambiguous_mapping(self):
        from inspect_derconnect import UNITS
        root = Path(__file__).resolve().parents[1]
        notebook = json.loads((root/'notebooks/01_derconnect_data_exploration.ipynb').read_text())
        source = ''.join(next(c for c in notebook['cells'] if c.get('id') == 'derconnect-03')['source'])
        namespace = {'pd': pd}
        # Load only the documentation reader, never a real archive or notebook scan.
        exec(compile(source.split('MAPPING_PATH =', 1)[0], '<unit-documentation-reader>', 'exec'), namespace)
        load = namespace['load_unit_documentation']
        table, units = load(root/'data/Meter Reading Mapping.csv', UNITS)
        self.assertEqual(set(units), set(UNITS))
        self.assertEqual(units['Active_Power_A'], 'W')
        self.assertEqual(units['Active_Energy_in_Quadrant_I'], 'kWh')
        self.assertEqual(units['Power_Factor_A'], '--')
        self.assertEqual(units['THD_Current_A'], '%')
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)/'mapping.csv'
            table.loc[table['Register Name'].eq('Active_Power_A'), 'Units'] = 'kW'
            table.to_csv(target, index=False)
            with self.assertRaisesRegex(ValueError, 'helper units differ'):
                load(target, UNITS)
            pd.concat([table, table.iloc[:1]]).to_csv(target, index=False)
            with self.assertRaisesRegex(ValueError, 'unique nonempty'):
                load(target, UNITS)

    def test_preliminary_histogram_keeps_counts_separate_from_power_units(self):
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        from inspect_derconnect import inspect, read_member
        path, _ = self.fixture([
            ['2026-01-01T00:00:00Z', 'E2451', 1000, 2000, 3000, 120, 5, 60],
            ['2026-01-01T01:00:00Z', 'E2451', 2000, 3000, 4000, 120, 5, 60],
        ])
        root = Path(__file__).resolve().parents[1]
        notebook = json.loads((root/'notebooks/01_derconnect_data_exploration.ipynb').read_text())
        source = ''.join(next(c for c in notebook['cells'] if c.get('id') == 'derconnect-09')['source'])
        observed = {}
        def capture():
            axes = plt.gcf().axes
            observed['histogram_y'] = axes[1].get_ylabel()
            observed['histogram_x'] = axes[1].get_xlabel()
            observed['trace_y'] = axes[0].get_ylabel()
        prior_show = plt.show
        try:
            plt.show = capture
            with contextlib.redirect_stdout(io.StringIO()):
                exec(compile(source, '<preliminary-unit-plot>', 'exec'), dict(
                    report=inspect(path), DATA_PATH=path, zipfile=zipfile,
                    read_member=read_member, pd=pd, plt=plt,
                    DOCUMENTED_UNITS={'Active_Power_A': 'W'}))
        finally:
            plt.show = prior_show
            plt.close('all')
        self.assertIn('count', observed['histogram_y'].lower())
        self.assertEqual(observed['histogram_x'], 'Active_Power_A (W)')
        self.assertEqual(observed['trace_y'], 'W')


if __name__ == '__main__':
    unittest.main()
