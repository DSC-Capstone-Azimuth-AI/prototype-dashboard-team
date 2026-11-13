/* Adapter and exporter contract interoperability; no browser dependency. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'history-contract-'));
const fixturePath = process.env.HISTORY_FIXTURE;
const fixture = fixturePath || execFileSync('python3', ['tests/test_derconnect_export.py', '--fixture', folder], {
  cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8'
}).trim();
const ctx = { Intl, Date, URL, TextEncoder, console, DC: {}, location: { href: 'http://localhost:8000/', origin: 'http://localhost:8000', protocol: 'http:' }, fetch: async () => {} };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/real-data.js'), 'utf8'), ctx);
const h = ctx.DC.history;
const data = JSON.parse(fs.readFileSync(fixture, 'utf8'));
const clone = () => structuredClone(data);
function rejects(edit, pattern) { const next = clone(); edit(next); assert.throws(() => h.validate(next), pattern); }
(async () => {
  assert.equal(h.validate(data), data);
  assert.equal(data.records.length, 192);
  assert.equal(data.measurement_kind, 'synthetic_fixture');
  assert.equal(h.localDay('2026-01-01T07:59:59Z'), '2025-12-31');
  assert.equal(h.localDay('2026-01-01T08:00:00Z'), '2026-01-01');
  const selected = h.select(data, '2026-01-01', '2026-01-01');
  assert.equal(selected.length, 96);
  assert.equal(h.select(data, '2026-01-02', '2026-01-01').length, 0);
  assert.equal(h.select(data, '2027-01-01').length, 0);
  const totals = h.summarize(data.records);
  assert.equal(totals.usable, 187); assert.equal(totals.unavailable, 5);
  assert.equal(totals.peak, 17); assert(totals.coverage > .97);
  assert(data.records.some(r => r.mean_kw === 0));
  assert(data.records.some(r => r.mean_kw < 0));
  assert(data.records.filter(r => r.quality !== 'ok').every(r => r.mean_kw === null));
  // Synthetic counterexample: rounded slot coverage is not usable-bin fraction.
  const almostComplete = Array.from({ length: 672 }, (_, i) => ({ quality: i ? 'ok' : 'cadence_collision',
    mean_kw: i ? 1 : null, max_kw: i ? 1 : null, valid_observations: i ? 450 : 449, expected_slots: 450 }));
  const rounded = h.summarize(almostComplete);
  assert.equal(rounded.unavailable, 1);
  assert.equal((rounded.coverage * 100).toFixed(1), '100.0');
  assert(rounded.coverage < 1);
  const profile = h.profile(data, data.records);
  assert.equal(profile.available, true);
  assert.equal(profile.hours[0].mean, -6);
  assert.equal(profile.hours[6].mean, 0);
  assert.equal(profile.hours[1].mean, null); // half the support missing, below 80%
  assert.equal(h.profile(data, data.records.slice(0, 20)).available, false);
  assert.equal(h.summarize([]).mean, null);
  assert.equal(h.summarize([]).coverage, null);
  const empty = clone(); empty.records = []; h.validate(empty);
  for (const [key, value] of [['schema_version', '2.0'], ['meter_id', 'LIB'], ['meter_id', '__proto__'], ['channel', 'P_total_mean'],
    ['display_unit', 'kWh'], ['source_unit', 'kW'], ['timezone', 'UTC'], ['facility_type', 'Office'], ['aggregation_minutes', 10],
    ['cadence_seconds', 1], ['minimum_coverage', NaN], ['measurement_kind', undefined]]) rejects(d => d[key] = value, /Historical export/);
  rejects(d => d.records.reverse(), /ordered/);
  rejects(d => d.records.pop(), /every bin/);
  rejects(d => d.records[1].timestamp_utc = d.records[0].timestamp_utc, /ordered/);
  rejects(d => d.records[0].timestamp_utc = '2026-02-30T00:00:00Z', /invalid UTC/);
  rejects(d => d.records[0].timestamp_utc = '2026-01-01T00:00:00', /UTC timestamps/);
  rejects(d => d.records[0].mean_kw = Infinity, /summary/);
  rejects(d => d.records[0].mean_kw = '3', /summary/);
  rejects(d => d.records[0].min_kw = 20, /summary/);
  rejects(d => d.records[0].valid_observations = 451, /counts/);
  rejects(d => d.records[0].coverage = 1.1, /counts/);
  rejects(d => d.records[0].quality = 'anomaly', /quality/);
  rejects(d => d.records[4].mean_kw = 0, /null/);
  rejects(d => d.provenance.inputs = [], /provenance/);
  rejects(d => d.provenance = null, /provenance/);
  rejects(d => d.provenance.diagnostics = {}, /provenance/);
  rejects(d => d.provenance.chunksize = 0, /provenance/);
  // Uneven support is weighted, never an unweighted average of means.
  const weighted = h.summarize([{ quality: 'ok', mean_kw: 2, max_kw: 2, valid_observations: 450, expected_slots: 450 },
    { quality: 'ok', mean_kw: 10, max_kw: 10, valid_observations: 360, expected_slots: 450 }]);
  assert.equal(weighted.mean, (2*450+10*360)/810);
  // DST: real elapsed bins, not 24 fixed local-hour bins. Spring skips 02:00;
  // fall's two 01:00 hours contribute twice the support of a single hour.
  function dst(start, hours) {
    return Array.from({ length: hours * 4 }, (_, i) => ({ timestamp_utc: new Date(Date.parse(start) + i*900000).toISOString().replace('.000Z', 'Z'),
      mean_kw: i, quality: 'ok', valid_observations: 450, expected_slots: 450 }));
  }
  const spring = h.profile(data, dst('2026-03-08T08:00:00Z', 23));
  assert.equal(spring.available, true); assert.equal(spring.hours[2].expected, 0); assert.equal(spring.hours[2].mean, null);
  const fall = h.profile(data, dst('2026-11-01T07:00:00Z', 25));
  assert.equal(fall.available, true); assert.equal(fall.hours[1].bins, 8); assert.equal(fall.hours[1].expected, 3600);
  assert.equal(h.select({ records: dst('2026-03-08T08:00:00Z', 23) }, '2026-03-08', '2026-03-08').length, 92);
  let requested = '';
  const loaded = await h.load('local-data/history.json', async url => {
    requested = url; return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(data) };
  });
  assert.equal(requested, 'http://localhost:8000/local-data/history.json'); assert.equal(loaded.meter_id, 'E2451');
  await assert.rejects(h.load('missing.json', async () => ({ ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(h.load('', async () => {}), /no real export/);
  await assert.rejects(h.load('https://example.com/private.json'), /own HTTP origin/);
  await assert.rejects(h.load('x', async () => { throw Error('Network unavailable'); }), /Network unavailable/);
  await assert.rejects(h.load('x', async () => ({ ok: true, headers: { get: () => String(h.MAX_BYTES + 1) } })), /10 MB/);
  ctx.location.protocol = 'file:';
  await assert.rejects(h.load('x'), /HTTP server/);
  assert.equal(ctx.DERCONNECT_DATA, undefined);
  console.log('PASS historical exporter→adapter contract, validation, counts, zero/negative/null, date scopes, weighted profiles, DST, HTTP/errors, synthetic isolation');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(folder, { recursive: true, force: true }));
