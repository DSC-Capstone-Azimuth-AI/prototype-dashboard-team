"""Independent validator tested on generated raw data and deliberately corrupt exports."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from export_derconnect_history import export_history
from validate_derconnect_history import reconcile
from test_derconnect_export import csv_text, rows_at

class ReconciliationTests(unittest.TestCase):
    def fixture(self,folder):
        rows=rows_at('2026-01-01T08:00:00Z',450,lambda i:(i-225)*1000)
        rows+=rows_at('2026-01-01T08:15:00Z',450)
        rows.append(rows[-1].copy())
        rows+=rows_at('2026-01-01T08:30:00Z',450,lambda i:'bad')
        rows+=rows_at('2026-01-01T08:45:00Z',100)
        archive=Path(folder)/'synthetic.zip'
        with zipfile.ZipFile(archive,'w') as z:z.writestr('E2451/E2451_2026-01.csv',csv_text(list(reversed(rows))))
        data=export_history(archive,start='2026-01-01T08:00:00Z',end='2026-01-01T10:00:00Z',synthetic_fixture=True)
        output=Path(folder)/'export.json';output.write_text(json.dumps(data))
        return archive,output,data

    def test_all_bins_independent_counts_and_stats(self):
        with tempfile.TemporaryDirectory() as f:
            archive,output,data=self.fixture(f)
            report=reconcile(archive,output)
            self.assertEqual(report['validation'],'PASS',report['discrepancies'])
            self.assertEqual(report['bins_checked'],8)
            self.assertEqual(report['summary']['mean'],-.5)
            self.assertEqual(report['summary']['peak'],224)
            self.assertEqual(report['summary']['support'],450)
            self.assertEqual(report['summary']['coverage'],999/3600)
            self.assertEqual([r['quality'] for r in report['unavailable']],['cadence_collision','invalid','low_coverage','missing','missing','missing','missing'])
            self.assertEqual(report['unavailable'][0]['collision_slots'],1)
            self.assertIn('-08:00',report['unavailable'][0]['campus_timestamp'])

    def test_tampered_statistics_and_provenance_are_reported(self):
        with tempfile.TemporaryDirectory() as f:
            archive,output,data=self.fixture(f)
            data['records'][0]['mean_kw']=999
            data['provenance']['inputs'][0]['sha256']='0'*64
            output.write_text(json.dumps(data))
            report=reconcile(archive,output)
            self.assertEqual(report['validation'],'FAIL')
            self.assertEqual(len(report['discrepancies']),2)
            self.assertEqual(report['discrepancies'][0]['field'],'bin[0].mean_kw')

if __name__=='__main__':unittest.main()
