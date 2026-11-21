const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const { bundle } = require('./fixtures/chronos2.cjs');
function session() {
  const c = { console, URL, Intl, Date, Map, Set, document: { querySelector: () => null } };
  c.window = c;
  vm.createContext(c);
  for (const file of ['csv', 'real-data', 'chronos2']) vm.runInContext(fs.readFileSync('js/' + file + '.js', 'utf8'), c);
  const DC = c.DC;
  DC.state = { section: 'overview' };
  DC.setState = () => {};
  DC.history.session = { source: 'synthetic', setSource(value) { this.source = value; } };
  DC.navigate = (section, id) => { DC.route = { section, id }; };
  vm.runInContext(fs.readFileSync('js/real-events.js', 'utf8'), c);
  return { DC, S: DC.chronos2.session };
}
test('unloaded/missing/error states never substitute synthetic events; retries resolve exact IDs', async () => {
  const { DC, S } = session();
  assert.equal(S.status, 'idle');
  assert.equal(S.scope().events.length, 0);
  S.start(); assert.equal(S.status, 'unavailable');
  await S.load(() => Promise.reject(Error('Unavailable CSV')));
  assert.equal(S.error, 'Unavailable CSV');
  S.select('missing-event');
  await S.load(() => DC.chronos2.parse(bundle()));
  assert.equal(S.status, 'ready');
  assert.equal(S.state.selected, 'missing-event');
  assert.equal(S.event(S.state.selected), null);
});
test('single in-flight load, canonical event identity, grouped counts, inclusive dates, UTC context and source isolation', async () => {
  const { DC, S } = session();
  let resolve, calls = 0;
  const pending = S.load(() => { calls++; return new Promise(done => { resolve = done; }); });
  const second = S.load(() => { calls++; throw Error('Duplicate load'); });
  assert.equal(S.status, 'loading');
  const data = DC.chronos2.parse(bundle());
  resolve(data); await Promise.all([pending, second]);
  assert.equal(calls, 1);
  assert.equal(S.scope().events.length, 4);
  assert.equal(S.scope().meters.length, 5);
  assert.equal(new Set(S.scope().events.map(e => e.meter)).size, 4);
  S.filter({ meter: 'E2451', from: '2026-03-01', to: '2026-03-01' });
  const [event] = S.scope().events;
  assert.equal(event, S.full('E2451').events[0]);
  assert.equal(event, S.event(event.id));
  assert.equal(event.duration, 1);
  assert.equal(event.end - event.start, DC.chronos2.HOUR);
  assert.equal(event.score, 2.5); assert.equal(event.actual, 55); assert.equal(event.expected, 16);
  const context = S.full(event.meter).context(event);
  assert(context[0].time < event.start); assert(context.at(-1).time >= event.end);
  const peak = context.find(r => r.time === event.start);
  assert.equal(peak.actual, 55); assert.equal(peak.q.q50, 16); assert.equal(peak.flag, true);
  assert.equal(peak.threshold, 0.125);
  S.open(event); assert.equal(DC.route.id, 'real:' + event.id); assert.equal(DC.history.session.source, 'historical');
  DC.history.session.setSource('synthetic'); assert.equal(S.state.selected, event.id);
  assert.equal(S.scope().events.length, 1);
  S.returnToMeter(event); assert.equal(DC.route.id, 'derconnect:E2451'); assert.equal(S.profile('E2451').focused, true);
  S.filter({ meter: 'E3020' });
  const other = S.scope().events[0]; S.open(other); assert.equal(S.state.selected, other.id);
  assert.equal(S.event(other.id).meter, 'E3020');
  S.filter({ from: '2026-03-08', to: '2026-03-08' });
  assert.equal(S.scope().events.length, 0);
  assert.equal(data.select('E3020', S.state.from, S.state.to).rows[1].filled, true);
  S.filter({ from: '2027-01-01', to: '' }); assert.equal(S.scope().scoredHours, 0);
  S.filter({ from: '2026-03-08', to: '2026-03-01' }); assert.equal(S.scope().events.length, 0);
  assert.throws(() => S.filter({ meter: 'unknown' }), /not loaded/);
});
test('preserves prediction-only observations when a forecast hour is absent', () => {
  const { DC } = session(), texts = bundle();
  texts.forecasts = texts.forecasts.split('\n').filter(row => !row.startsWith('E2451,2026-03-01 00')).join('\n');
  const row = DC.chronos2.parse(texts).select('E2451').rows.find(r => r.flag && r.period === 'detection');
  assert.equal(row.actual, 55); assert.equal(row.q, null); assert.equal(row.event.id, 'E2451-test-event');
});
test('counts a cross-midnight grouped event once and retains its complete bounds in partial date scopes', async () => {
  const { DC, S } = session(), texts = bundle();
  const forecast = texts.forecasts.split('\n').find(row => row.startsWith('E2451,2026-03-01 00'));
  const prediction = texts.predictions.split('\n').find(row => row.startsWith('E2451,2026-03-01 00'));
  for (const [local, utc] of [['03-01 23', '03-02 07'], ['03-02 00', '03-02 08'], ['03-02 01', '03-02 09']]) {
    const stamp = row => row.replaceAll('2026-03-01 00:00:00', '2026-' + local + ':00:00').replaceAll('2026-03-01 08:00:00', '2026-' + utc + ':00:00');
    texts.forecasts += stamp(forecast) + '\n'; texts.predictions += stamp(prediction) + '\n';
  }
  texts.events = texts.events.split('\n').map(row => row.startsWith('E2451-test-event,') ?
    row.replace('2026-03-01 08:00:00+00:00,2026-03-01 09:00:00+00:00,1,', '2026-03-02 07:00:00+00:00,2026-03-02 09:00:00+00:00,2,') : row).join('\n');
  await S.load(() => DC.chronos2.parse(texts));
  S.filter({ meter: 'E2451', from: '2026-03-01', to: '2026-03-01' });
  const [event] = S.scope().events;
  assert.equal(S.scope().events.length, 1); assert.equal(event.duration, 2);
  S.filter({ from: '2026-03-02', to: '2026-03-02' });
  assert.equal(S.scope().events[0], event); assert.equal(S.scope().events.length, 1);
  const rows = S.bundle.select('E2451', S.state.from, S.state.to).rows;
  assert.equal(rows[0].event, event); assert.equal(rows[1].time, event.end); assert.equal(rows[1].event, null);
  S.filter({ from: '', to: '' }); assert.equal(S.scope().events.length, 1);
});
test('replacement bundles reset unavailable meter filters and keep unresolved event IDs explicit', async () => {
  const { DC, S } = session();
  await S.load(() => DC.chronos2.parse(bundle()));
  S.filter({ meter: 'E2451' }); S.select('E2451-test-event');
  const replacement = Object.fromEntries(Object.entries(bundle()).map(([key, value]) => [key, value.replaceAll('E2451', 'E9999')]));
  await S.load(() => DC.chronos2.parse(replacement));
  assert.equal(S.state.meter, 'all'); assert.equal(S.state.selected, 'E2451-test-event');
  assert.equal(S.event(S.state.selected), null);
  assert.equal(S.scope().events.length, 4); assert.equal(S.event('E9999-test-event').meter, 'E9999');
});
test('all-meter scope retains separate canonical series and analyzed coverage without summing power', async () => {
  const { DC, S } = session();
  assert.equal(S.state.meter, 'all'); assert.equal(S.state.range, 'all');
  await S.load(() => DC.chronos2.parse(bundle()));
  const scope = S.scope();
  assert.equal(scope.series.length, 5);
  for (const series of scope.series) {
    assert.equal(series.rows[0], S.full(series.meter).rows[0]);
    assert.equal(series.rows[0].actual, 22);
  }
  assert.equal(scope.scoredHours, 30); assert.equal(scope.unscoredHours, 5);
  assert.equal(scope.coverageStart, Date.parse('2026-03-01T08:00:00Z'));
  assert.equal(scope.coverageEnd, Date.parse('2026-03-08T13:00:00Z'));
  S.filter({ meter: 'E3020', from: '2026-03-01', to: '2026-03-01' });
  const single = S.scope(); assert.equal(single.series.length, 1);
  assert.equal(single.series[0].meter, 'E3020'); assert.equal(single.events.length, 1);
  assert.equal(single.scoredHours, 3); assert.equal(single.coverageEnd - single.coverageStart, 3 * DC.chronos2.HOUR);
  S.filter({ from: '2027-01-01', to: '' });
  assert.equal(S.scope().coverageStart, null); assert.equal(S.scope().scoredHours, 0);
});
test('range presets and event/profile navigation preserve independent Overview/list scope', async () => {
  const { DC, S } = session(); await S.load(() => DC.chronos2.parse(bundle()));
  S.setRange('7'); assert.equal(S.state.from, '2026-03-02'); assert.equal(S.state.to, '2026-03-08');
  assert.equal(S.state.range, '7'); assert.equal(S.scope().events.length, 0);
  S.setRange('all'); assert.equal(S.state.from, ''); assert.equal(S.state.range, 'all');
  S.filter({ meter: 'E2451', from: '2026-03-01', to: '2026-03-01' });
  const before = JSON.stringify({ meter: S.state.meter, from: S.state.from, to: S.state.to });
  const other = S.full('E3020').events[0];
  S.open(other); assert.equal(DC.route.id, 'real:' + other.id);
  assert.equal(S.href(other.id), '#investigate/real%3AE3020-test-event');
  S.returnToMeter(other); assert.equal(DC.route.id, 'derconnect:E3020');
  assert.equal(JSON.stringify({ meter: S.state.meter, from: S.state.from, to: S.state.to }), before);
  assert.equal(S.scope().events[0].meter, 'E2451'); assert.equal(S.state.selected, other.id);
});
test('raw score/threshold presentation preserves tiny nonzero values, zero, sign and unavailable states', () => {
  const { DC } = session();
  vm.runInNewContext(fs.readFileSync('js/ui.js', 'utf8'), { window: { DC } });
  const format = DC.ui.rawNumber;
  for (const value of [1e-10, 4.5e-7, -0.00000123]) {
    assert.notEqual(format(value), '0'); assert(Math.abs(Number(format(value)) / value - 1) < 0.0001);
  }
  assert.equal(format(0), '0'); assert.equal(format(0.125), '0.125');
  assert.equal(format(null), 'Unavailable'); assert.equal(format(undefined), 'Unavailable');
});

test('chart inspection preserves canonical hourly evidence, shared scope and metrics across gaps/DST dates', async () => {
  const { DC, S } = session(); await S.load(() => DC.chronos2.parse(bundle()));
  const scope = S.scope(), state = JSON.stringify(S.state), metrics = JSON.stringify(S.overviewMetrics(scope));
  const source = JSON.stringify(scope.series);
  assert.equal(S.inspectionSeries(scope,'full'),scope.series);
  for (const days of ['7','30']) {
    const inspected = S.inspectionSeries(scope,days);
    assert.equal(inspected.length,scope.meters.length);
    for (const series of inspected) {
      const original = scope.series.find(s=>s.meter===series.meter);
      assert(series.rows.every(row=>original.rows.includes(row)), 'retains original row objects/UTC instants, thresholds and flags');
      assert(series.events.every(event=>original.events.includes(event)), 'retains original half-open grouped events');
      if(days==='7') assert(series.rows.every(row=>row.day>='2026-03-02'));
    }
  }
  assert.equal(JSON.stringify(S.state),state);
  assert.equal(JSON.stringify(scope.series),source);
  assert.equal(JSON.stringify(S.overviewMetrics(scope)),metrics);
  S.filter({meter:'E2451',from:'2026-03-01',to:'2026-03-01'});
  assert(S.inspectionSeries(S.scope(),'7')[0].rows.every(row=>row.day==='2026-03-01'));
  S.filter({from:'2030-01-01',to:'2030-01-02'});
  assert.equal(S.inspectionSeries(S.scope(),'7')[0].rows.length,0);
  assert.throws(()=>S.inspectionSeries(scope,'invalid'),/Unsupported/);
});
