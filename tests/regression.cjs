/* No dependencies: node tests/regression.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const storage = new Map();
function load({ labels = true, blocked = false } = {}) {
  const sandbox = { console, Intl, Date, localStorage: {
    getItem: k => { if (blocked) throw Error('blocked'); return storage.get(k) || null; },
    setItem: (k, v) => { if (blocked) throw Error('blocked'); storage.set(k, v); },
    removeItem: k => storage.delete(k),
  }, location: { hash: '' }, history: { pushState: (_, __, hash) => sandbox.location.hash = hash }, requestAnimationFrame: () => {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['data/derconnect-data.js', ...(labels ? ['data/synthetic-labels.js'] : []), 'js/util.js', 'js/store.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  return sandbox;
}
let ctx = load(), dc = ctx.DC, d = dc.D;
const ids = new Set();
for (const b of d.buildings) {
  assert(!ids.has(b.id)); ids.add(b.id);
  assert(b.name_source.startsWith('https://')); assert.equal(b.derconnect_coverage, 'Not verified');
  dc.setState({ ...dc.DEFAULT, building: b.id });
  assert(dc.scopeMeters().length > 0);
  assert(dc.scopeMeters().every(m => m.building === b.id));
  assert(dc.events().every(e => e.building === b.id));
}
for (const m of d.meters) {
  assert(ids.has(m.building)); assert.equal(m.actual.length, d.meta.n); assert.equal(m.dq.length, d.meta.n);
  for (const det of d.detectors) {
    const series = det.series[m.id];
    for (const key of ['q01', 'q10', 'q50', 'q90', 'q99', 'score']) assert.equal(series[key].length, d.meta.n - d.meta.detector_start);
    for (let i = 0; i < series.q50.length; i++) {
      const q = ['q01', 'q10', 'q50', 'q90', 'q99'].map(k => series[k][i]);
      assert(q.every(Number.isFinite)); assert(q.every((v, j) => j === 0 || v >= q[j - 1]));
    }
  }
}
let distinctPeaks = 0;
for (const e of d.events) {
  assert.equal(dc.meterById[e.meter].building, e.building);
  assert.equal(dc.buildingById[e.building].subgrid, e.subgrid);
  assert(e.start >= d.meta.detector_start && e.end <= d.meta.n && e.start < e.end);
  assert.equal(e.duration_h, e.end - e.start);
  assert(e.score_peak_t >= e.start && e.score_peak_t < e.end);
  assert(e.deviation_peak_t >= e.start && e.deviation_peak_t < e.end);
  assert.equal(e.peak_t, e.score_peak_t);
  const a = dc.actual(e.meter, e.deviation_peak_t), expected = dc.q(e.meter, 'q50', e.deviation_peak_t, e.detector);
  assert(Math.abs(a - e.peak_actual) <= 0.101);
  assert(Math.abs(expected - e.peak_expected) <= 0.101);
  assert(Math.abs((a - expected) - e.peak_dev) <= 0.151);
  const max = Math.max(...Array.from({ length: e.end - e.start }, (_, i) => Math.abs(dc.actual(e.meter, e.start + i) - dc.q(e.meter, 'q50', e.start + i, e.detector))));
  assert(Math.abs(Math.abs(a - expected) - max) <= 0.201, e.id);
  if (e.score_peak_t !== e.deviation_peak_t) distinctPeaks++;
  dc.setState({ ...dc.DEFAULT, ...dc.eventScope(e), selected: e.id });
  assert.equal(dc.state.selected, e.id);
  dc.openEvent(e.id, false); assert.equal(ctx.location.hash, '#investigate/' + e.id);
  for (const patch of [{ building: d.buildings.find(b => b.id !== e.building).id }, { meter: d.meters.find(m => m.id !== e.meter).id }, { t0: e.end, t1: d.meta.n }, { severity: e.severity === 'low' ? 'high' : 'low' }, { type: 'nonexistent' }, { status: 'false_alarm' }, { detector: d.detectors.find(det => det.id !== e.detector).id }]) {
    dc.setState({ ...dc.DEFAULT, ...dc.eventScope(e), selected: e.id }); dc.setState(patch); assert.equal(dc.state.selected, null, e.id + JSON.stringify(patch));
  }
  const facts = dc.eventFacts(e);
  assert(facts.peak); assert(Math.abs(Math.abs(facts.peak.residual) - max) < 0.001);
  assert.equal(dc.eventStatus(e), 'new');
}
assert(distinctPeaks > 0);
const event = dc.eventById('CR-030');
dc.setState({ ...dc.DEFAULT, ...dc.eventScope(event), selected: event.id });
dc.statusStore.set(event.id, 'investigating', '<script>literal note</script>');
ctx = load(); dc = ctx.DC;
assert.equal(dc.eventStatus(dc.eventById(event.id)), 'investigating');
assert.equal(dc.statusStore.note(event.id), '<script>literal note</script>');
ctx = load({ labels: false }); assert.equal(ctx.DC.matchFor('CR-030'), null);
const meter = ctx.DC.meterById[event.meter];
meter.unit = 'normalized'; assert.equal(ctx.DC.eventFacts(event).excess, null);
meter.actual[event.start] = null; assert.equal(ctx.DC.eventFacts(event).excess, null);
ctx = load({ blocked: true }); assert.equal(ctx.DC.statusStore.set('CR-030', 'insufficient', 'kept in memory'), false);
assert.equal(ctx.DC.statusStore.note('CR-030'), 'kept in memory');
console.log(`PASS: ${d.buildings.length} buildings, ${d.meters.length} meters, ${d.events.length} events; ${distinctPeaks} distinct score/deviation peak timestamps; filters, units, missing labels, persistence and blocked storage.`);
