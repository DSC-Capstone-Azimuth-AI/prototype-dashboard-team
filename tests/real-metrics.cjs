const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fixture = require('./fixtures/chronos2.cjs');
function setup(texts = fixture.bundle()) {
  const c = { console, URL, Intl, Date, Map, Set, document: { querySelector: () => null } }; c.window = c; vm.createContext(c);
  for (const file of ['csv', 'real-data', 'chronos2']) vm.runInContext(fs.readFileSync('js/' + file + '.js', 'utf8'), c);
  c.DC.state = { section: 'overview' }; c.DC.setState = () => {}; c.DC.history.session = { source: 'synthetic' };
  vm.runInContext(fs.readFileSync('js/real-events.js', 'utf8'), c);
  return { A: c.DC.chronos2, S: c.DC.chronos2.session, texts };
}
const tables = texts => Object.fromEntries(Object.entries(texts).map(([name, text]) => {
  const [header, ...rows] = text.trim().split(/\r?\n/).map(row => row.split(','));
  return [name, { header, rows: rows.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]]))) }];
}));
const encode = tables => Object.fromEntries(Object.entries(tables).map(([name, { header, rows }]) =>
  [name, [header.join(','), ...rows.map(row => header.map(key => row[key]).join(','))].join('\n') + '\n']));
function modify(change) { const t = tables(fixture.bundle()); change(t); return encode(t); }
const isPeak = row => row.meter === 'E2451' && row.time_utc === '2026-03-01 08:00:00+00:00';
const setActual = (t, select, actual) => { for (const kind of ['forecasts', 'predictions']) for (const row of t[kind].rows.filter(select)) row.actual_kw = actual; };
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, actual + ' != ' + expected);

test('scoped grouped counts, affected fraction, physical deviation and longest exported duration are distinct', async () => {
  const { A, S, texts } = setup(); await S.load(() => A.parse(texts));
  const all = S.overviewMetrics();
  assert.equal(all.count, 4); assert.equal(all.affected, 4); assert.equal(all.selectedMeters, 5);
  assert.equal(all.largest.meter, 'E2451'); near(all.largest.delta, 39); assert.equal(all.longest.duration, 1);
  assert.equal(all.calibrationFlags, 5); assert.equal(all.eligible, 5);
  S.filter({ meter: 'E7085' }); assert.equal(S.overviewMetrics().count, 0);
  assert.equal(S.overviewMetrics().largest.event, null, 'An ungrouped flagged hour still has valid physical evidence');
  assert.match(S.readingHref('E7085', S.overviewMetrics().largest.row.time), /derconnect%3AE7085\?at=/);
  S.filter({ from: '2027-01-01', to: '' });
  const empty = S.overviewMetrics(); assert.equal(empty.count, 0); assert.equal(empty.affected, 0);
  assert.equal(empty.largest, null); assert.equal(empty.longest, null);
});

test('ignores calibration, interpolation and unknown quality; missing actual/q50 and valid zero remain distinct', async () => {
  const texts = modify(t => {
    setActual(t, r => r.meter === 'E2451' && r.period === 'calibration', '99999');
    setActual(t, r => r.meter === 'E2451' && r.time_utc === '2026-03-01 07:00:00+00:00', '99999');
    setActual(t, r => r.meter === 'E2451' && r.time_utc === '2026-03-08 10:00:00+00:00', '9999');
    for (const r of t.predictions.rows.filter(r => r.meter === 'E2451' && r.time_utc === '2026-03-08 10:00:00+00:00')) r.flag = '1';
    setActual(t, isPeak, '0');
  });
  const { A, S } = setup(); await S.load(() => A.parse(texts)); S.filter({ meter: 'E2451' });
  near(S.overviewMetrics().largest.delta, -16); assert.equal(S.overviewMetrics().excludedFlagged, 1);
  const missing = modify(t => { t.forecasts.rows = t.forecasts.rows.filter(r => !isPeak(r)); });
  await S.load(() => A.parse(missing)); assert.equal(S.overviewMetrics().largest, null);
  const unknown = modify(t => { t.predictions.rows.filter(isPeak)[0].filled = ''; });
  await S.load(() => A.parse(unknown)); assert.equal(S.overviewMetrics().largest, null);
  const interpolated = modify(t => { t.predictions.rows.filter(isPeak)[0].filled = 'True'; });
  await S.load(() => A.parse(interpolated)); assert.equal(S.overviewMetrics().largest, null);
  const nullActual = modify(t => setActual(t, isPeak, ''));
  await S.load(() => A.parse(nullActual)); assert.equal(S.overviewMetrics().largest, null);
});

test('score-peak deviation uses its prediction timestamp, not the hour with largest kW difference', async () => {
  const texts = modify(t => {
    const e = t.events.rows.find(e => e.meter === 'E2451');
    Object.assign(e, { end: '2026-03-01 02:00:00', end_utc: '2026-03-01 10:00:00+00:00', duration_h: '2', peak_score: '72' });
    t.predictions.rows.filter(isPeak)[0].score = '9';
    const later = r => r.meter === 'E2451' && r.time_utc === '2026-03-01 09:00:00+00:00';
    setActual(t, later, '100'); Object.assign(t.predictions.rows.find(later), { flag: '1', score: '1' });
  });
  const { A, S } = setup(); await S.load(() => A.parse(texts)); S.filter({ meter: 'E2451' });
  const e = S.scope().events[0], facts = S.eventFacts(e);
  near(S.overviewMetrics().largest.delta, 84); near(facts.delta, 39);
  assert.equal(facts.peak.score, 9); assert.equal(facts.peak.threshold, 0.125); assert.equal(e.score, 72);
  assert.notEqual(facts.peak.time, S.overviewMetrics().largest.row.time);
});

test('negative physical differences use paired observations, never normalized scores or rounded thresholds', async () => {
  const texts = modify(t => {
    setActual(t, isPeak, '104.04');
    for (const row of t.forecasts.rows.filter(isPeak)) for (const key of Object.keys(row).filter(k => /^q\d\d$/.test(k))) row[key] = '120.75';
    Object.assign(t.events.rows.find(r => r.meter === 'E2451'), { peak_actual_kw: '104.04', peak_expected_kw: '120.75', peak_score: '18885080.086' });
    Object.assign(t.predictions.rows.find(isPeak), { score: '0.0189', threshold: '0.0000' });
  });
  const { A, S } = setup(); await S.load(() => A.parse(texts)); S.filter({ meter: 'E2451' });
  const e = S.scope().events[0]; near(S.overviewMetrics().largest.delta, -16.71); near(S.eventFacts(e).delta, -16.71);
  assert.equal(S.eventFacts(e).peak.score, 0.0189); assert.equal(S.eventFacts(e).peak.threshold, 0);
  assert.equal(e.score, 18885080.086);
  e.peakLocal = 'unknown'; assert.equal(S.eventFacts(e).peak, null); assert.equal(S.eventFacts(e).delta, null);
});

test('partial dates retain the full exported duration; incomplete group evidence is unavailable', async () => {
  const texts = modify(t => {
    for (const kind of ['forecasts', 'predictions']) {
      const source = t[kind].rows.find(isPeak);
      for (const [local, utc] of [['2026-03-01 23:00:00', '2026-03-02 07:00:00+00:00'], ['2026-03-02 00:00:00', '2026-03-02 08:00:00+00:00']])
        t[kind].rows.push({ ...source, time_local: local, time_utc: utc });
    }
    Object.assign(t.events.rows.find(r => r.meter === 'E2451'), { start: '2026-03-01 23:00:00', start_utc: '2026-03-02 07:00:00+00:00', end: '2026-03-02 01:00:00', end_utc: '2026-03-02 09:00:00+00:00', duration_h: '2', peak_time: '2026-03-01 23:00:00' });
  });
  const { A, S } = setup(); assert.equal(S.overviewMetrics().count, null);
  await S.load(() => A.parse(texts)); S.filter({ meter: 'E2451', from: '2026-03-02', to: '2026-03-02' });
  const m = S.overviewMetrics(); assert.equal(m.count, 1); assert.equal(m.longest.duration, 2); assert.equal(m.durationExtendsDates, true);
  const invalid = modify(t => { t.events.rows.find(e => e.meter === 'E2451').start_utc = ''; });
  await S.load(() => A.parse(invalid)); S.filter({ from: '', to: '' }); assert.equal(S.overviewMetrics().count, null);
});

test('independently reconciles metrics and all event peak facts against committed CSV fields', { skip: !process.env.CHRONOS_EXPORT_DIR }, async () => {
  const texts = Object.fromEntries(Object.entries(fixture.files).map(([kind, file]) => [kind, fs.readFileSync(path.join(process.env.CHRONOS_EXPORT_DIR, file), 'utf8')]));
  const t = tables(texts), { A, S } = setup(); await S.load(() => A.parse(texts));
  const forecasts = new Map(t.forecasts.rows.map(r => [r.meter + '/' + r.time_utc, r]));
  const eligible = t.predictions.rows.filter(r => r.period === 'detection' && r.flag === '1' && r.filled === 'False' && r.time_utc && r.actual_kw && forecasts.get(r.meter + '/' + r.time_utc)?.q50)
    .map(r => ({ meter: r.meter, time: Date.parse(r.time_utc), delta: Number(r.actual_kw) - Number(forecasts.get(r.meter + '/' + r.time_utc).q50) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const m = S.overviewMetrics(); assert.equal(m.count, t.events.rows.length); assert.equal(m.eligible, eligible.length);
  assert.equal(m.largest.meter, eligible[0].meter); assert.equal(m.largest.row.time, eligible[0].time); near(m.largest.delta, eligible[0].delta);
  assert.equal(m.longest.duration, Math.max(...t.events.rows.map(e => Number(e.duration_h))));
  const predictions = new Map(t.predictions.rows.map(r => [r.meter + '/' + r.time_local, r]));
  for (const e of t.events.rows) {
    const p = predictions.get(e.meter + '/' + e.peak_time), f = S.eventFacts(S.event(e.event_id));
    assert.equal(f.peak.time, Date.parse(p.time_utc)); assert.equal(f.peak.score, Number(p.score)); assert.equal(f.peak.threshold, Number(p.threshold));
    near(f.delta, Number(e.peak_actual_kw) - Number(e.peak_expected_kw));
    // Read-only semantic audit for the committed four-decimal export. Never infer a raw score from a rounded threshold.
    const raw = Number(p.score), threshold = Number(p.threshold), normalized = Number(e.peak_score), half = 0.00005;
    if (threshold > half) {
      const lo = (raw - half) / (threshold + half), hi = (raw + half) / (threshold - half);
      assert(normalized >= lo - half && normalized <= hi + half, e.event_id + ' normalized score is outside CSV rounding bounds');
    }
  }
});
test('ambiguous peak wall times are not guessed; interpolated peaks retain raw details but withhold physical facts', async () => {
  const texts = modify(t => {
    Object.assign(t.events.rows.find(e => e.meter === 'E2451'), { duration_h: '2', end_utc: '2026-03-01 10:00:00+00:00' });
    t.predictions.rows.find(r => r.meter === 'E2451' && r.time_utc === '2026-03-01 09:00:00+00:00').time_local = '2026-03-01 00:00:00';
  });
  const { A, S } = setup(); await S.load(() => A.parse(texts));
  assert.equal(S.eventFacts(S.event('E2451-test-event')).peak, null);
  const event = S.event('E2451-test-event'); event.peakLocal = '';
  S.full('E2451').rows.find(r => r.time === event.start).predictionLocal = '';
  assert.equal(S.eventFacts(event).peak, null, 'Missing peak keys are not treated as matching evidence');
  const interpolated = modify(t => { t.predictions.rows.find(isPeak).filled = 'True'; });
  await S.load(() => A.parse(interpolated));
  const facts = S.eventFacts(S.event('E2451-test-event')); assert.equal(facts.delta, null); assert.equal(facts.peak.score, 2.5);
});
