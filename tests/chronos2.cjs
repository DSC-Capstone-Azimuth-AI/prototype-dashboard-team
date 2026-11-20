const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { bundle, files, meters } = require('./fixtures/chronos2.cjs');

global.window = global;
for (const module of ['csv', 'real-data', 'chronos2']) require('../js/' + module + '.js');
const { parse, readFiles, HOUR } = DC.chronos2;

test('joins the flat CSVs by meter and UTC hour and scopes by inclusive campus dates', () => {
  const data = parse(bundle());
  assert.deepEqual(data.counts, { forecasts: 45, predictions: 45, events: 4 });
  assert.deepEqual(data.meters, meters);
  assert.equal(data.select('E9999'), null);
  assert.equal(data.select('E3020').events[0].meter, 'E3020');

  const calibration = data.select('E2451', '2026-02-28', '2026-02-28');
  assert.equal(calibration.rows[0].flag, true);
  assert.equal(calibration.scoredHours, 0);
  assert.deepEqual(calibration.events, []);

  const detection = data.select('E2451', '2026-03-01', '2026-03-01');
  assert.equal(detection.rows.length, 3);
  assert.equal(detection.scoredHours, 3);
  const [event] = detection.events;
  assert.equal(event.id, 'E2451-test-event');
  assert.equal(detection.rows[0].actual, 55);
  assert.equal(detection.rows[0].q.q50, 16);
  assert.equal(detection.rows[0].score, 2.5);
  assert.equal(detection.rows[0].event, event);
  assert.equal(detection.rows[1].time, event.end);
  assert.equal(detection.rows[1].event, null);
  assert.equal(detection.context(event)[0].period, 'calibration');
  assert.equal(data.select('E7085').events.length, 0);
  assert.deepEqual(data.select('E2451', '2027-01-01').rows, []);
  assert.deepEqual(data.select('E2451', '2026-03-08', '2026-03-01').rows, []);
});

test('withholds missing or invalid UTC hours and keeps interpolation, blanks and zero distinct', () => {
  const texts = bundle();
  texts.predictions = texts.predictions.replace('2026-03-08 09:00:00+00:00', '2026-03-08 09:00:00');
  const scope = parse(texts).select('E2451', '2026-03-08', '2026-03-08');
  assert.deepEqual(scope.skipped, { forecasts: 1, predictions: 2, events: 0 });
  const [before, after, missing, zero] = scope.rows;
  assert.equal(after.time - before.time, HOUR);
  assert.equal(before.period, null);
  assert.equal(after.filled, true);
  assert.equal(after.actual, 13);
  assert.equal(missing.actual, null);
  assert.equal(missing.score, null);
  assert.equal(missing.flag, null);
  assert.equal(zero.actual, 0);
  assert.equal(scope.scoredHours, 2);
});

test('validates all schemas, identifiers, numeric fields, quantiles and event boundaries', () => {
  for (const [file, original, replacement, match] of [
    ['forecasts', ',q99\n', ',unexpected\n', /column schema/],
    ['predictions', ',score,', ',model,', /column schema/],
    ['events', 'event_id,', 'unknown,', /column schema/],
    ['forecasts', ',chronos2-ft-5k,22,', ',other,22,', /unsupported model/],
    ['predictions', ',chronos2-ft-5k,55,', ',chronos2-ft-5k,0x37,', /Invalid actual_kw/],
    ['predictions', ',chronos2-ft-5k,55,', ',chronos2-ft-5k,56,', /actual power disagree/],
    ['forecasts', ',4,6,8,', ',7,6,8,', /out of order/],
    ['events', '2026-03-01 09:00:00+00:00', '2026-03-01 08:00:00+00:00', /Invalid event/],
  ]) {
    const texts = bundle();
    texts[file] = texts[file].replace(original, replacement);
    assert.throws(() => parse(texts), match);
  }
  const texts = bundle();
  const row = texts.forecasts.split('\n')[1];
  assert.throws(() => parse({ ...texts, forecasts: texts.forecasts + row }), /Duplicate forecasts UTC hour/);
  const invalid = texts.events.replace('2026-03-01 08:00:00+00:00', '');
  const excluded = parse({ ...texts, events: invalid }).select('E2451');
  assert.equal(excluded.skipped.events, 1);
  assert.deepEqual(excluded.events, []);
  const unmatched = texts.events.replace('2026-03-01 08:00:00+00:00,2026-03-01 09:00:00+00:00',
    '2026-03-01 06:00:00+00:00,2026-03-01 08:00:00+00:00');
  assert.equal(parse({ ...texts, events: unmatched }).select('E2451').skipped.events, 1);
});

test('accepts complete local file bundles and rejects incomplete selections', async () => {
  const texts = bundle();
  const local = Object.entries(files).map(([key, name]) => new File([texts[key]], name));
  assert.deepEqual((await readFiles(local)).meters, meters);
  await assert.rejects(readFiles(local.slice(0, 2)), /Select the forecasts/);
});

test('checks authorized export counts and UTC alignment', { skip: !process.env.CHRONOS_EXPORT_DIR }, () => {
  const texts = Object.fromEntries(Object.entries(files).map(([name, file]) =>
    [name, fs.readFileSync(path.join(process.env.CHRONOS_EXPORT_DIR, file), 'utf8')]));
  const data = parse(texts);
  assert.deepEqual(data.counts, { forecasts: 16350, predictions: 16350, events: 106 });
  assert.deepEqual(data.meters, meters);
  assert.deepEqual(meters.map(meter => data.select(meter).events.length), [21, 23, 24, 25, 13]);
  for (const meter of meters) {
    const scope = data.select(meter);
    assert.equal(scope.rows.length, 3269);
    assert.equal(scope.scoredHours, 2207);
    assert.deepEqual(scope.skipped, { forecasts: 1, predictions: 1, events: 0 });
    assert(scope.rows.every(row => row.period && row.q && row.q.q50 !== null));
    const dst = data.select(meter, '2026-03-08', '2026-03-08');
    assert.equal(dst.rows.length, 23);
    assert(dst.rows.every(row => row.day === '2026-03-08'));
  }
  assert.equal(data.select('E2451').rows.filter(row => row.filled).length, 2);
});
