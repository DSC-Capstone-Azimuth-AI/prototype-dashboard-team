/* No dependencies: node tests/csv-upload.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sandbox = {}; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/csv.js'), 'utf8'), sandbox);
const { validate } = sandbox.DC.csv;
const fixture = name => fs.readFileSync(path.join(root, 'tests/fixtures', name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

// File-level failures stop the file and explain why.
for (const [text, pattern] of [
  ['', /empty/], ['  \r\n', /empty/], ['timestamp,meter_id\n', /Missing required column: kw/],
  ['a,b\n', /Missing required columns: timestamp, meter_id, kw/], ['timestamp,meter_id,kw\n', /no data rows/],
  ['timestamp,meter_id,kw,KW\n', /Repeated column: kw/], ['timestamp,meter_id,kw\n"2026-08-10T00:00:00Z,M,1\n', /never closed/],
  ['timestamp,meter_id,kw\n2026-08-10T00:00:00Z,M,1\n2026-08-10T01:00:00,M,1\n', /time zone and others/],
  ['timestamp,meter_id,kw\nbad,M,1\n', /No usable rows/],
]) {
  const r = validate(text);
  assert.equal(r.status, 'rejected'); assert.match(r.fatal, pattern); assert.equal(r.meters.length, 0);
}

// Clean file.
const valid = validate(fixture('meter-upload-valid.csv'));
assert.equal(valid.status, 'ready'); assert.equal(valid.rowsRead, 144); assert.equal(valid.kept, 144);
assert.equal(valid.meters.length, 2); assert.equal(valid.timeBasis, 'utc');
for (const m of valid.meters) { assert.equal(m.cadenceMs, 3600000); assert.equal(m.completeness, 1); assert.equal(m.t.length, 72); }

// Every messy-row rule, with a BOM, CRLF, uppercase headers, an extra column and a quoted comma.
const messy = validate('﻿' + fixture('meter-upload-messy.csv'));
assert.equal(messy.status, 'warnings'); assert.equal(messy.fatal, null); assert.equal(messy.timeBasis, 'wall');
assert.equal(messy.rowsRead, 15); assert.equal(messy.rejected, 4); assert.equal(messy.duplicateRows, 2); assert.equal(messy.kept, 9);
assert.equal(messy.rowsRead, messy.kept + messy.rejected + messy.duplicateRows);
assert.deepEqual(copy(messy.issues.map(i => i.line)), [10, 11, 12, 13]);
assert.match(messy.issues[0].problem, /Invalid timestamp/); assert.match(messy.issues[1].problem, /meter_id/);
assert.match(messy.issues[2].problem, /Invalid kw/); assert.match(messy.issues[3].problem, /Expected 4 columns, found 2/);
assert.equal(messy.outOfOrder, 2); assert.equal(messy.conflicts, 1); assert.equal(messy.blank, 1);
const [m201, m202] = messy.meters;
assert.equal(m201.id, 'M-201'); assert.equal(m202.id, 'M-202, roof');
assert.deepEqual(copy(m201.kw), [100, null, 105.5, 110, null, -12]); // gaps stay null; conflicts choose no value
assert(m201.t.every((t, i) => i === 0 || t > m201.t[i - 1]));
assert.equal(m201.negative, 1); assert.equal(m201.gaps, 1); assert.equal(m201.min, -12); assert.equal(m201.max, 110);
assert.equal(m202.cadenceMs, 1800000);
const warnings = messy.warnings.join(' ');
for (const pattern of [/4 rows rejected/, /gap, not as zero/, /conflicting values/, /sorted/, /time gap/, /different cadences/, /negative/, /no time zone/, /site/]) assert.match(warnings, pattern);

// Timestamp handling.
const ms = text => { const r = validate(`timestamp,meter_id,kw\n${text},M,1\n`); return r.meters[0]?.t[0]; };
assert.equal(ms('2026-08-10T07:00:00-07:00'), Date.UTC(2026, 7, 10, 14)); assert.equal(ms('2026-08-10T07:00:00+0530'), Date.UTC(2026, 7, 10, 1, 30));
assert.equal(ms('2026-08-10 07:00'), Date.UTC(2026, 7, 10, 7)); assert.equal(ms('2026-08-10T00:00:00.500Z'), Date.UTC(2026, 7, 10, 0, 0, 0, 500));
for (const bad of ['2026-02-30T00:00:00Z', '2026-08-10T25:00:00Z', '08/10/2026 01:00', '2026-08-10']) assert.equal(ms(bad), undefined, bad);

// Values and cadence.
for (const blank of ['', 'NA', 'nan', 'NULL']) assert.deepEqual(copy(validate(`timestamp,meter_id,kw\n2026-08-10T00:00:00Z,M,${blank}\n`).meters[0].kw), [null]);
for (const bad of ['1e999', 'Infinity', '0x10', '12kW']) assert.equal(validate(`timestamp,meter_id,kw\n2026-08-10T00:00:00Z,M,${bad}\n`).status, 'rejected', bad);
const single = validate('timestamp,meter_id,kw\n2026-08-10T00:00:00Z,M,1\n').meters[0];
assert.equal(single.cadenceMs, null); assert.equal(single.completeness, null);
const seconds = 'timestamp,meter_id,kw\n' + [0, 2, 4, 7].map(s => `2026-08-10T00:00:0${s}Z,M,1`).join('\n') + '\n';
assert.equal(validate(seconds).meters[0].cadenceMs, 2000); assert.equal(validate(seconds).meters[0].offCadence, 1);
const big = 'timestamp,meter_id,kw\n' + Array.from({ length: 200000 }, (_, i) => `${new Date(Date.UTC(2026, 0, 1) + i * 2000).toISOString()},M,${i % 7}`).join('\n');
assert.equal(validate(big).meters[0].readings, 200000); // No spread-argument stack limit on long meters.
console.log('PASS: CSV file failures, clean and messy fixtures, row accounting, timestamps, gaps, duplicates, conflicts and cadence.');
