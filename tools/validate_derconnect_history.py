#!/usr/bin/env python3
"""Independent raw-ZIP reconciliation; stdlib only, private report kept local.

Does not import the exporter, pandas or EDA aggregation functions. All selected
bins are checked, not a sample. SQLite bounds RAM; the temporary database is deleted.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import zipfile
from zoneinfo import ZoneInfo

TZ = ZoneInfo('America/Los_Angeles')
ABS_TOL = 1e-8
REL_TOL = 1e-9


def instant(text):
    text = text.strip()
    if not re.search(r'(Z|[+-]\d\d:?\d\d)$', text, re.I):
        raise ValueError('Offset-aware source time required')
    value = datetime.fromisoformat(text.replace('Z', '+00:00'))
    if value.tzinfo is None:
        raise ValueError('Missing offset')
    return value.astimezone(timezone.utc)


def finite(text):
    try:
        value = float(text)
        return value / 1000 if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


def reconcile(archive_path, export_path):
    data = json.loads(Path(export_path).read_text(), parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
    required = dict(schema_version='1.0', dataset_type='historical_measurements', source='DERConnect',
                    meter_id='E2451', facility_type='Instructional', channel='Active_Power_A',
                    source_unit='W', display_unit='kW', timezone='America/Los_Angeles',
                    aggregation_minutes=15, cadence_seconds=2)
    if any(data.get(k) != v for k, v in required.items()):
        raise ValueError('Expected schema 1.0 E2451 phase-A 15-minute product')
    start, end = instant(data['start_utc']), instant(data['end_utc'])
    if not (0 < (end-start).total_seconds() <= 32*86400):
        raise ValueError('Expected nonempty range <=32 days')
    if start.timestamp() % 900 or end.timestamp() % 900:
        raise ValueError('Incomplete UTC bins')
    threshold = data['minimum_coverage']
    if not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or not 0 <= threshold <= 1:
        raise ValueError('Invalid coverage threshold')
    count = int((end-start).total_seconds()/900)
    if len(data['records']) != count:
        raise ValueError('Export does not contain the complete bin grid')
    discrepancies, hashes = [], []
    def compare(label, actual, expected):
        if isinstance(expected, float):
            ok = isinstance(actual, (int,float)) and not isinstance(actual,bool) and math.isfinite(actual) and math.isclose(actual, expected, rel_tol=REL_TOL, abs_tol=ABS_TOL)
        else:
            ok = type(actual) is type(expected) and actual == expected
        if not ok:
            discrepancies.append(dict(field=label, exported=actual, independently_computed=expected))
    with tempfile.TemporaryDirectory(prefix='derconnect-reconcile-') as temp:
        db = sqlite3.connect(str(Path(temp)/'slots.sqlite'))
        try:
            db.execute('CREATE TABLE slots (slot INTEGER PRIMARY KEY, n INTEGER, value REAL, finite_rows INTEGER)')
            with zipfile.ZipFile(Path(archive_path).expanduser()) as z:
                members = sorted((i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith('.csv') and
                    ('E2451' in Path(i.filename).parts or re.match(r'E2451(?:[_\-.]|$)',Path(i.filename).stem))), key=lambda i:i.filename)
                if not members:
                    raise ValueError('No E2451 raw CSV members found')
                for index, info in enumerate(members):
                    print(f'Scanning E2451 input {index+1}/{len(members)}',file=sys.stderr)
                    # Separate full-byte hash pass, independent of CSV interpretation.
                    with z.open(info) as raw:
                        digest = hashlib.file_digest(raw, 'sha256').hexdigest()
                    hashes.append(dict(sha256=digest, bytes=info.file_size))
                    with z.open(info) as raw:
                        reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
                        if not {'_time','DeviceID','Active_Power_A'}.issubset(reader.fieldnames or []):
                            raise ValueError('Missing required raw columns')
                        batch = []
                        for row in reader:
                            if row['DeviceID'].strip() != 'E2451':
                                continue
                            try:
                                time = instant(row['_time'])
                            except (ValueError, OverflowError):
                                continue
                            if not start <= time < end:
                                continue
                            delta = time-start
                            # Integer elapsed seconds avoid floating epoch rounding at slot edges.
                            slot = (delta.days*86400+delta.seconds)//2
                            value=finite(row['Active_Power_A'])
                            batch.append((slot,value,int(value is not None)))
                            if len(batch) == 10000:
                                db.executemany('INSERT INTO slots VALUES (?,1,?,?) ON CONFLICT(slot) DO UPDATE SET n=n+1, finite_rows=finite_rows+excluded.finite_rows',batch)
                                db.commit(); batch=[]
                        db.executemany('INSERT INTO slots VALUES (?,1,?,?) ON CONFLICT(slot) DO UPDATE SET n=n+1, finite_rows=finite_rows+excluded.finite_rows',batch)
                        db.commit()
            rows = {r[0]:r[1:] for r in db.execute('SELECT slot/450, COUNT(*), SUM(n>1), SUM(n=1 AND value IS NOT NULL), AVG(CASE WHEN n=1 THEN value END), MIN(CASE WHEN n=1 THEN value END), MAX(CASE WHEN n=1 THEN value END), SUM(finite_rows), SUM(n) FROM slots GROUP BY slot/450')}
        finally:
            db.close()
    expected_records=[]
    for i in range(count):
        observed, collisions, valid, mean, low, high, finite_rows, raw_rows = rows.get(i,(0,0,0,None,None,None,0,0))
        coverage = valid/450
        quality = 'cadence_collision' if collisions else 'missing' if not observed else 'invalid' if not valid else 'low_coverage' if coverage < threshold else 'ok'
        stamp = datetime.fromtimestamp(start.timestamp()+i*900,timezone.utc)
        r=dict(timestamp_utc=stamp.isoformat().replace('+00:00','Z'), expected_slots=450, observed_slots=observed,
               collision_slots=collisions, valid_observations=valid, coverage=coverage, quality=quality,
               mean_kw=mean if quality=='ok' else None,min_kw=low if quality=='ok' else None,max_kw=high if quality=='ok' else None)
        for k,v in r.items(): compare(f'bin[{i}].{k}',data['records'][i].get(k),v)
        r.update(finite_readings_including_collisions=finite_rows,raw_rows=raw_rows,campus_timestamp=stamp.astimezone(TZ).isoformat())
        expected_records.append(r)
    p=data.get('provenance',{})
    compare('provenance.exporter',p.get('exporter'),'export_derconnect_history/1.0')
    if data.get('measurement_kind') not in ('actual_measurements','synthetic_fixture'):
        raise ValueError('Explicit measurement origin required')
    compare('provenance.inputs',p.get('inputs'),hashes)
    compare('provenance.input_kind',p.get('input_kind'),'zip')
    compare('provenance.duplicate_policy',p.get('duplicate_policy'),'reject_any_cadence_collision_bin')
    root=Path(__file__).resolve().parents[1]
    for name in ('export_derconnect_history.py','derconnect_full_quality.py','inspect_derconnect.py'):
        compare('provenance.code_sha256.'+name,p.get('code_sha256',{}).get(name),hashlib.sha256((root/'tools'/name).read_bytes()).hexdigest())
    compare('provenance.mapping_sha256',p.get('mapping_sha256'),hashlib.sha256((root/'data/Meter Reading Mapping.csv').read_bytes()).hexdigest())
    usable=[r for r in expected_records if r['quality']=='ok']
    support=sum(r['valid_observations'] for r in usable)
    total_valid=sum(r['valid_observations'] for r in expected_records)
    hours=[]
    for hour in range(24):
        group=[r for r in expected_records if instant(r['timestamp_utc']).astimezone(TZ).hour==hour]
        good=[r for r in group if r['quality']=='ok']
        n=sum(r['valid_observations'] for r in good); expected=len(group)*450
        hours.append(dict(hour=hour,valid=n,expected=expected,bins=len(good),coverage=n/expected if expected else None,
                          mean=math.fsum(r['mean_kw']*r['valid_observations'] for r in good)/n if n and n/expected>=.8 else None))
    unavailable=[]
    reasons=dict(cadence_collision='At least one two-second slot contains multiple rows; entire bin withheld.',missing='No matching observed slots.',invalid='No finite noncolliding observations.',low_coverage='Valid-slot coverage below the configured minimum.')
    for r in expected_records:
        if r['quality']!='ok':
            unavailable.append(dict(r,campus_timestamp=instant(r['timestamp_utc']).astimezone(TZ).isoformat(),reason=reasons[r['quality']]))
    return dict(validation='PASS' if not discrepancies else 'FAIL',export_sha256=hashlib.sha256(Path(export_path).read_bytes()).hexdigest(),
        measurement_kind=data.get('measurement_kind'),metadata={k:data[k] for k in required},start_utc=data['start_utc'],end_utc=data['end_utc'],
        bins_checked=count,tolerance=dict(absolute=ABS_TOL,relative=REL_TOL),discrepancies=discrepancies,
        summary=dict(mean=math.fsum(r['mean_kw']*r['valid_observations'] for r in usable)/support if support else None,
                     peak=max((r['max_kw'] for r in usable),default=None),usable=len(usable),unavailable=len(unavailable),support=support,
                     valid=total_valid,expected=count*450,coverage=total_valid/(count*450)),
        profile=dict(available=count>=92 and sum(h['mean'] is not None for h in hours)>=18,hours=hours,support=support),
        bins=expected_records,unavailable=unavailable,coverage_explanation='Coverage credits finite noncolliding slots even inside withheld bins; usable-bin count applies whole-bin rejection. Rounded coverage can hide a small deficit. Consult exact numerator/denominator.',
        source_inputs=hashes)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',required=True,type=Path)
    p.add_argument('--export',required=True,type=Path)
    p.add_argument('--report',type=Path,default=Path('local-results/historical-validation.json'))
    args=p.parse_args()
    try:
        result=reconcile(args.archive,args.export)
        args.report.parent.mkdir(parents=True,exist_ok=True)
        with args.report.open('x') as f: json.dump(result,f,allow_nan=False,indent=2)
        print(json.dumps({k:result[k] for k in ('validation','bins_checked','summary')},indent=2))
        print('Private report includes all withheld timestamps and all discrepancies; keep it Git-ignored.')
        return 0 if result['validation']=='PASS' else 1
    except (OSError,ValueError,zipfile.BadZipFile) as e:
        print('Validation unavailable:',type(e).__name__,str(e));return 2


if __name__=='__main__':
    raise SystemExit(main())
