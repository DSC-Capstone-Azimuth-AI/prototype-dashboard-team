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

// Combined-feature regressions: UX notes use PR #2's dataset-scoped store, including migration.
ctx = load(); dc = ctx.DC;
storage.set('derconnect.notes.v1.CR-001', 'Note from the uncommitted UX preview');
assert.equal(dc.notesStore.get('CR-001'), 'Note from the uncommitted UX preview');
assert.equal(dc.statusStore.note('CR-001'), 'Note from the uncommitted UX preview');
assert(!storage.has('derconnect.notes.v1.CR-001'));
assert.equal(dc.notesStore.set('CR-001', ''), true);
assert.equal(load().DC.notesStore.get('CR-001'), '');
ctx = load({ blocked: true });
assert.equal(ctx.DC.notesStore.set('CR-001', 'Memory-only note'), false);
assert.equal(ctx.DC.notesStore.get('CR-001'), 'Memory-only note');
const names = JSON.parse(fs.readFileSync(path.join(root, 'tools/building_metadata.json'), 'utf8'));
for (const b of d.buildings) assert.equal(b.name, names[b.id].name);
console.log('PASS: verified demonstration labels and combined dataset-scoped review-note migration/fallback.');

// Anomaly-specific evidence uses exported behavior/category, never evaluation labels.
ctx = load(); dc = ctx.DC;
for (const [id, lens] of [['CR-005', 'point'], ['CR-014', 'sustained'], ['CR-001', 'context'], ['CR-004', 'pattern'], ['CR-010', 'quality']]) {
  const event = dc.eventById(id), before = JSON.stringify(event);
  assert.equal(dc.investigationEvidence(event).lens, lens, id);
  assert.equal(JSON.stringify(event), before, 'presentation must not rewrite detection');
  assert.equal(load({ labels: false }).DC.investigationEvidence(event).lens, lens, 'labels do not select the view');
}
const point = dc.eventById('CR-005'), pointMeter = dc.meterById[point.meter];
pointMeter.dq[point.start] = 2;
assert.equal(dc.investigationEvidence(point).lens, 'quality', 'quality precedes point classification');
assert.equal(dc.investigationEvidence(point).quality.stuck, 1);
assert.equal(dc.investigationEvidence(point).facts.excess, null);
pointMeter.dq[point.start] = 0; pointMeter.actual[point.start] = null;
assert.equal(dc.investigationEvidence(point).lens, 'quality', 'unflagged nulls still need quality review');
assert.equal(dc.investigationEvidence(point).quality.unavailable, 1);
assert.equal(dc.investigationEvidence(point).facts.excess, null);
ctx = load(); dc = ctx.DC;
const contextual = dc.eventById('CR-001'), series = dc.detectorById[contextual.detector].series[contextual.meter];
for (let t = contextual.start; t < contextual.end; t++) series.q50[t - dc.META.detector_start] = null;
assert.equal(dc.investigationEvidence(contextual).forecastPairs, 0);
assert.equal(dc.investigationEvidence(contextual).facts.peak, null);
assert.equal(dc.investigationEvidence(contextual).facts.excess, null);
assert.equal(dc.investigationEvidence(contextual).lens, 'context', 'absent forecasts do not fabricate meter faults');
assert.equal(dc.investigationEvidence({ ...contextual, type: 'peak', category: 'unknown', behavior: 'unknown' }).lens, 'general');
console.log('PASS: five evidence views, category precedence, label independence, unchanged detections, suspect/null readings, absent forecasts and generic fallback.');

// Related-meter comparison isolates data scope, detector, intervals and reliability.
ctx = load(); dc = ctx.DC;
const reference = dc.eventById('CR-030');
let comparison = dc.meterComparison(reference);
assert.deepEqual(Array.from(comparison.rows, r => r.meter.id), ['LIB-MAIN', 'ENG-MAIN']);
assert.equal(comparison.t0, reference.start - 24);
assert.equal(comparison.t1, reference.end + 24);
assert(comparison.rows.every(row => row.meter.kind === 'main' && row.meter.unit === 'kW'));
assert(comparison.rows.every(row => row.events.every(e => e.detector === reference.detector && e.start < reference.end && reference.start < e.end)));
const expected = JSON.stringify(comparison.rows.map(row => ({ id: row.meter.id, excess: row.excess, valid: row.valid, events: row.events.map(e => e.id) })));
dc.setState({ ...dc.DEFAULT, detector: dc.D.detectors[1].id, building: 'REC', status: 'false_alarm' });
assert.equal(JSON.stringify(dc.meterComparison(reference).rows.map(row => ({ id: row.meter.id, excess: row.excess, valid: row.valid, events: row.events.map(e => e.id) }))), expected, 'list filters do not leak into selected-event comparisons');
const noLabels = load({ labels: false }).DC;
assert.equal(JSON.stringify(noLabels.meterComparison(noLabels.eventById(reference.id)).rows.map(row => ({ id: row.meter.id, excess: row.excess, valid: row.valid, events: row.events.map(e => e.id) }))), expected, 'evaluation labels do not feed comparisons');
comparison = dc.meterComparison(reference, { scope: 'campus', meterIds: ['ENG-PV', 'missing', 'REC-MAIN', 'REC-MAIN', 'LAB-MAIN', 'ADM-MAIN'], window: 'event' });
assert.deepEqual(Array.from(comparison.rows, r => r.meter.id), ['LIB-MAIN', 'REC-MAIN', 'LAB-MAIN'], 'reject incompatible, duplicate and invalid IDs; cap at three');
assert.equal(comparison.t0, reference.start); assert.equal(comparison.t1, reference.end);
const peer = dc.meterById['ENG-MAIN'];
peer.dq[reference.start] = 2;
let row = dc.meterComparison(reference).rows[1];
assert.equal(row.excess, null); assert(row.valid < row.total);
assert.equal(row.reading(reference.start).quality, 'Stuck');
peer.actual[reference.start] = null;
assert.equal(dc.meterComparison(reference).rows[1].reading(reference.start).actual, null);
assert.equal(dc.meterComparison(reference).rows[1].reading(reference.start).residual, null, 'absent readings are gaps, not zeros');
peer.unit = 'W'; assert.equal(dc.meterComparison(reference).rows.length, 1, 'unit mismatch excluded');
assert.deepEqual(Array.from(dc.meterComparison(reference, { meterIds: [] }).rows, r => r.meter.id), ['LIB-MAIN']);
const pvEvent = dc.D.events.find(e => dc.meterById[e.meter].kind === 'pv');
const pv = dc.meterComparison(pvEvent, { scope: 'campus' });
assert(pv.rows.every(r => r.meter.kind === 'pv'));
const touching = { ...reference, id: 'TEST-TOUCHING', meter: 'LIB-MAIN', start: reference.end, end: reference.end + 1 };
dc.D.events.push(touching);
assert(!dc.meterComparison(reference).rows[0].events.some(e => e.id === touching.id), 'half-open touching intervals do not overlap');
for (const mode of ['demand', 'residual']) assert(dc.comparisonScale(pv, mode).every(Number.isFinite));
assert.equal(dc.meterComparison({ ...reference, start: 1, end: 2 }).t0, 0);
assert.equal(dc.meterComparison({ ...reference, start: dc.META.n - 2, end: dc.META.n }).t1, dc.META.n);
console.log('PASS: related-meter bounds, comparable channels, ID validation/cap, detector/filter/label independence, quality withholding, null gaps, PV separation and half-open overlap.');
