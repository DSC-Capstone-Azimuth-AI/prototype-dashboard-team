const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const { webcrypto } = require('node:crypto');
const fixture = require('./fixtures/chronos2.cjs');
const identity = { dataset: 'derconnect-hourly-total-active-power/v1', run: 'sha256:example-a', model: 'chronos2-ft-5k' };
const event = { meter: 'E2451', id: 'example-event', model: identity.model };
function setup(values = new Map(), storage = null) {
  const listeners = new Map();
  const localStorage = storage || { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const c = { DC: {}, localStorage, addEventListener: (name, callback) => listeners.set(name, callback) }; c.window = c;
  vm.runInNewContext(fs.readFileSync('js/real-review.js', 'utf8'), c);
  return { R: c.DC.realReview, values, listeners };
}
test('saves/restores all review fields and timestamp with a model/run/meter/event key', () => {
  const { R, values } = setup(); const state = R.open(identity, event);
  assert.equal(state.fields.status, 'not_reviewed'); assert.equal(state.fields.assessment, 'uncertain'); assert.equal(state.savedAt, null);
  R.update(state, { status: 'follow_up', assessment: 'possible_measurement_issue', notes: '<b>literal evidence</b>', followUp: 'Check source telemetry.', reviewer: 'Example operator' });
  assert(R.dirty(state)); assert(R.save(state)); assert(!R.dirty(state)); assert(Number.isFinite(Date.parse(state.savedAt)));
  const restored = setup(values).R.open(identity, event);
  assert.equal(JSON.stringify(restored.fields), JSON.stringify(state.fields)); assert.equal(restored.savedAt, state.savedAt);
  const raw = JSON.parse(values.get(state.key)); assert.equal(raw.version, 1); assert.equal(raw.identity.meter, 'E2451');
});
test('isolates events, meters, models, dataset versions, runs and synthetic storage', () => {
  const values = new Map([['derconnect.review.v2.synthetic', 'existing synthetic review']]);
  const { R } = setup(values); const first = R.open(identity, event); R.update(first, { notes: 'Only this event.' }); R.save(first);
  for (const [id, ev] of [
    [identity, { ...event, id: 'second' }], [identity, { ...event, meter: 'E3020' }],
    [{ ...identity, run: 'sha256:example-b' }, event], [{ ...identity, dataset: 'other-data/v1' }, event],
    [{ ...identity, model: 'other-model' }, { ...event, model: 'other-model' }],
  ]) { const next = R.open(id, ev); assert.notEqual(next.key, first.key); assert.equal(next.fields.notes, ''); }
  assert.equal(R.open({ ...identity, model: 'wrong-model' }, event), null);
  assert.equal(values.get('derconnect.review.v2.synthetic'), 'existing synthetic review');
});
test('retains unsaved per-event drafts in memory and requests a browser unload warning', () => {
  const { R, values, listeners } = setup(); const first = R.open(identity, event);
  R.update(first, { notes: 'Unsaved in this tab.' });
  const other = R.open(identity, { ...event, id: 'second' }); assert.equal(other.fields.notes, '');
  assert.equal(R.open(identity, event).fields.notes, 'Unsaved in this tab.'); assert.equal(values.size, 0);
  const unloading = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners.get('beforeunload')(unloading); assert.equal(unloading.prevented, true); assert.equal(unloading.returnValue, '');
  R.save(first); assert.equal(R.hasUnsaved(), false);
  const clean = { preventDefault() { throw Error('Saved reviews do not block navigation'); } }; listeners.get('beforeunload')(clean);
});
test('blocked/quota/ignored writes never claim save success or discard drafts', () => {
  for (const storage of [
    { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } },
    { getItem() { return null; }, setItem() { throw Error('quota'); } },
    { getItem() { return null; }, setItem() {} },
  ]) {
    const { R } = setup(new Map(), storage); const state = R.open(identity, event); R.update(state, { notes: 'Keep this draft.' });
    assert.equal(R.save(state), false); assert.equal(state.savedAt, null); assert(R.dirty(state)); assert(state.error); assert.match(state.feedback, /not saved/);
    assert.equal(state.fields.notes, 'Keep this draft.');
  }
});
test('rejects invalid fields/corrupt records and detects concurrent-tab writes without clobbering them', () => {
  const { R, values } = setup(); const state = R.open(identity, event);
  assert.throws(() => R.update(state, { status: 'confirmed_fault' }), /invalid/);
  assert.throws(() => R.update(state, { notes: 'x'.repeat(4001) }), /invalid/);
  assert.throws(() => R.update(state, { groundTruth: true }), /invalid/);
  assert.throws(() => R.update(state, { toString: 'not a field' }), /invalid/);
  R.update(state, { notes: 'First save.' }); assert(R.save(state));
  const other = setup(values); const changed = other.R.open(identity, event); other.R.update(changed, { notes: 'Other tab version.' }); assert(other.R.save(changed));
  R.update(state, { notes: 'Retained conflicting draft.' }); assert.equal(R.save(state), false); assert.match(state.feedback, /another tab/);
  assert.equal(JSON.parse(values.get(state.key)).review.notes, 'Other tab version.');
  values.set(state.key, '{bad json'); const corrupted = setup(values); const bad = corrupted.R.open(identity, event);
  assert(bad.error); corrupted.R.update(bad, { notes: 'Cannot overwrite invalid evidence.' }); assert.equal(corrupted.R.save(bad), false); assert.equal(values.get(state.key), '{bad json');
});
test('SHA-256 bundle identity is stable across reloads and separates changed source files', async () => {
  const c = { crypto: webcrypto, TextEncoder, console }; c.window = c; vm.createContext(c);
  for (const file of ['csv', 'real-data', 'chronos2']) vm.runInContext(fs.readFileSync('js/' + file + '.js', 'utf8'), c);
  const A = c.DC.chronos2, texts = fixture.bundle();
  const one = await A.withReviewIdentity(A.parse(texts), texts), two = await A.withReviewIdentity(A.parse(texts), texts);
  assert.match(one.reviewIdentity.run, /^sha256:[a-f0-9]{64}$/); assert.equal(one.reviewIdentity.run, two.reviewIdentity.run);
  const changed = { ...texts, events: texts.events + '\n' };
  const next = await A.withReviewIdentity(A.parse(changed), changed); assert.notEqual(one.reviewIdentity.run, next.reviewIdentity.run);
  c.crypto = null; const missing = await A.withReviewIdentity(A.parse(texts), texts); assert.equal(missing.reviewIdentity, null); assert.match(missing.reviewIdentityError, /unavailable/);
});

test('comparison progress uses saved source-specific statuses, excludes drafts and reports unreadable records', () => {
  const { R, values } = setup();
  const events = ['a', 'b', 'c', 'd', 'e'].map(id => ({ ...event, id }));
  const draft = R.open(identity, events[0]); R.update(draft, { status: 'reviewed' });
  const follow = R.open(identity, events[1]); R.update(follow, { status: 'follow_up' }); assert(R.save(follow));
  const reviewed = R.open(identity, events[2]); R.update(reviewed, { status: 'reviewed' }); assert(R.save(reviewed));
  values.set(R.keyFor(R.identityFor(identity, events[3])), '{invalid');
  const before = JSON.stringify([...values]);
  assert.deepEqual(JSON.parse(JSON.stringify(R.progress(identity, events))), {
    not_reviewed: 2, in_review: 0, follow_up: 1, reviewed: 1, unavailable: 1, total: 5,
  });
  assert.equal(JSON.stringify([...values]), before, 'comparison cannot overwrite review records');
  assert.equal(R.progress({ ...identity, run: 'other-run' }, events).not_reviewed, 5);
  assert.equal(R.dirty(draft), true, 'unsaved review remains an independent draft');
});
