"""Synthetic regression fixtures only; never real DERCONNECT measurements."""
import importlib.util
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
                    archive.writestr('E2451/2026-01.csv', 'timestamp,Active_Power_A\n2026-01-01T00:00:00,1\n2026-01-01T00:00:02,2\n')
                for target in [str(Path(directory)/'absent.zip'), str(path)]:
                    os.environ['DERCONNECT_DATA_PATH'] = target
                    namespace = {}
                    for cell in notebook['cells']:
                        if cell['cell_type'] == 'code':
                            exec(compile(''.join(cell['source']), '<notebook>', 'exec'), namespace)
        finally:
            if prior is None: os.environ.pop('DERCONNECT_DATA_PATH', None)
            else: os.environ['DERCONNECT_DATA_PATH'] = prior


if __name__ == '__main__':
    unittest.main()
