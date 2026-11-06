"""Synthetic regression fixtures only; never real DERCONNECT measurements."""
import importlib.util
import ast
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('inspect_derconnect', ROOT/'tools/inspect_derconnect.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InspectionTests(unittest.TestCase):
    def test_synthetic_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'synthetic.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('E2451/2026-01.csv', 'timestamp,Active_Power_A,Frequency\n2026-01-01T00:00:00,1,60\n2026-01-01T00:00:00,NA,60\n2026-01-01T00:00:02,-2,bad\n2026-01-01T00:00:08,4,60\n')
                archive.writestr('E3020/2026-02.tsv', 'timestamp\tCurrent_A\n2026-02-01T00:00:00Z\t3\n')
                archive.writestr('../unsupported.bin', 'not extracted')
            report = module.inspect(path)
            first = report['files'][0]
            self.assertEqual(report['file_count'], 3)
            self.assertEqual(first['time']['duplicate_timestamps'], 1)
            self.assertEqual(first['time']['modal_interval_seconds'], 2)
            self.assertEqual(first['time']['large_gaps'], 1)
            self.assertEqual(first['quality']['Active_Power_A']['missing'], 1)
            self.assertEqual(first['quality']['Frequency']['non_numeric'], 1)
            self.assertIn('inspection_error', report['files'][2])
            self.assertEqual(list(Path(directory).iterdir()), [path])
            bounded = module.inspect(path, rows=1)
            self.assertEqual(bounded['files'][0]['sample_rows'], 1)
            byte_limited = module.inspect(path, max_bytes=80)
            self.assertTrue(byte_limited['files'][0]['sample_limited'])
            self.assertLess(byte_limited['files'][0]['sample_rows'], 4)
            json.dumps(report, allow_nan=False)

    def test_time_basis_and_order(self):
        mixed = module.time_summary(['2026-01-01T00:00:00', '2026-01-01T00:00:01Z', 'bad'])
        self.assertEqual(mixed['invalid'], 1)
        self.assertNotIn('modal_interval_seconds', mixed)
        summary = module.time_summary(['2026-01-01T00:00:02Z', '2026-01-01T00:00:00Z'])
        self.assertEqual(summary['backwards'], 1)

    def test_notebook_absent_and_synthetic(self):
        import matplotlib
        matplotlib.use('Agg')
        notebook = json.loads((ROOT/'notebooks/01_derconnect_data_exploration.ipynb').read_text())
        prior = os.environ.get('DERCONNECT_DATA_PATH')
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory)/'synthetic.zip'
                with zipfile.ZipFile(path, 'w') as archive:
                    archive.writestr('E2451/2026-01.csv', '_time,DeviceID,Active_Power_A,Active_Power_B,Active_Power_C\n2026-01-01T00:00:00Z,E2451,1,2,3\n2026-01-01T00:00:02Z,E2451,2,3,4\n')
                for target in [str(Path(directory)/'absent.zip'), str(path)]:
                    os.environ['DERCONNECT_DATA_PATH'] = target
                    namespace = {}
                    with contextlib.redirect_stdout(io.StringIO()):
                        for cell in notebook['cells']:
                            if cell['cell_type'] == 'code':
                                tree = ast.parse(''.join(cell['source']))
                                # The user's preserved setup cell overrides the env path.
                                # Remove only that assignment in this synthetic harness so
                                # tests can NEVER read a locally available real archive.
                                tree.body = [node for node in tree.body if not (
                                    isinstance(node, ast.Assign) and any(
                                        isinstance(t, ast.Subscript) and isinstance(t.value, ast.Attribute)
                                        and isinstance(t.value.value, ast.Name) and t.value.value.id == 'os'
                                        and t.value.attr == 'environ' and isinstance(t.slice, ast.Constant)
                                        and t.slice.value == 'DERCONNECT_DATA_PATH' for t in node.targets))]
                                exec(compile(tree, '<notebook>', 'exec'), namespace)
                                if cell.get('id') == 'derconnect-fg-config':
                                    namespace.update(FG_DEVICES=['E2451'], FG_MONTHS=['2026-01'],
                                                     FG_CALENDAR_TZ='UTC', FG_MIN_VALID_COVERAGE=0,
                                                     FG_CHUNK_ROWS=1)
                    self.assertEqual(namespace['DATA_PATH'], Path(target))
                    if Path(target).is_file():
                        self.assertEqual(namespace['FULL_RESULT']['summary'].iloc[0].rows, 2)
                        self.assertFalse(namespace['FULL_RESULT']['total_enabled'])
                    else:
                        self.assertIsNone(namespace['FULL_RESULT'])
                    import matplotlib.pyplot as plt
                    plt.close('all')
        finally:
            if prior is None: os.environ.pop('DERCONNECT_DATA_PATH', None)
            else: os.environ['DERCONNECT_DATA_PATH'] = prior


if __name__ == '__main__':
    unittest.main()
