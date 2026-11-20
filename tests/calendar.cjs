const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');

const HOUR = 3600000;
// Values from the vm context have foreign prototypes; compare plain JSON copies.
const plain = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected) => assert.deepEqual(plain(actual), plain(expected));
function context(calendar) {
  const c = { console, URL, Intl, Date, Map, Set, document: { querySelector: () => null } };
  c.window = c;
  vm.createContext(c);
  for (const file of ['js/csv.js', 'js/real-data.js', 'js/chronos2.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  const DC = c.DC;
  DC.el = (tag, attrs = {}, ...children) => ({ tag, attrs, children });
  DC.css = () => '#c3c2b7';
  vm.runInContext(fs.readFileSync('data/campus-calendar.js', 'utf8'), c);
  if (calendar) c.DERCONNECT_CALENDAR = calendar(c.DERCONNECT_CALENDAR);
  vm.runInContext(fs.readFileSync('js/calendar.js', 'utf8'), c);
  return DC;
}
const utc = iso => Date.parse(iso);
const event = (startIso, hours, direction = 'below') => ({ id: 'e', start: utc(startIso), end: utc(startIso) + hours * HOUR, direction });

test('committed calendar validates; holidays outrank the surrounding break', () => {
  const DC = context();
  assert.equal(DC.calendar.available, true, DC.calendar.error);
  assert.ok(DC.calendar.entries.length >= 10);
  same(DC.calendar.onDay('2026-03-27').map(e => e.kind), ['holiday', 'no_instruction']);
  same(DC.calendar.onDay('2026-03-26').map(e => e.id), ['2026-quarter-break']);
  assert.equal(DC.calendar.onDay('2026-03-21')[0].kind, 'finals');
  same(DC.calendar.onDay('2026-04-15'), []);
  same(DC.calendar.onDay('not-a-day'), []);
});

test('event days use campus time, including midnight and the DST change', () => {
  const DC = context();
  // 22:00 PDT Mar 26 → 02:00 PDT Mar 27 crosses into Farmworkers Day.
  const crossing = event('2026-03-27T05:00:00Z', 4);
  same(DC.calendar.daysOf(crossing.start, crossing.end), ['2026-03-26', '2026-03-27']);
  same(DC.calendar.forEvent(crossing).map(e => e.id), ['2026-farmworkers-day', '2026-quarter-break']);
  // 23:00 PST Feb 15 is still Feb 15 on campus (07:00Z Feb 16), so a one-hour event is not on Presidents' Day.
  same(DC.calendar.forEvent(event('2026-02-16T07:00:00Z', 1)), []);
  assert.equal(DC.calendar.forEvent(event('2026-02-16T08:00:00Z', 1))[0].id, '2026-presidents-day');
  // Spring-forward night (Mar 8) stays on one campus day.
  same(DC.calendar.daysOf(utc('2026-03-08T08:00:00Z'), utc('2026-03-08T12:00:00Z')), ['2026-03-08']);
  same(DC.calendar.daysOf(5, 5), []);
});

test('explanations depend on direction and never claim a confirmed cause', () => {
  const DC = context();
  const memorial = '2026-05-25T17:00:00Z';
  const below = DC.calendar.explanation(event(memorial, 2, 'below'));
  assert.equal(below.verdict, 'possible');
  assert.match(below.text, /^Possible explanation \(unverified\)/);
  assert.match(below.text, /Memorial Day observance \(Mon, May 25\)/);
  assert.equal(DC.calendar.explanation(event(memorial, 1, 'above')).verdict, 'contrary');
  assert.equal(DC.calendar.explanation(event(memorial, 1, 'mixed')).verdict, 'context');
  assert.equal(DC.calendar.explanation(event('2026-03-16T18:00:00Z', 1, 'below')).verdict, 'context'); // finals only
  assert.equal(DC.calendar.explanation(event('2026-03-30T18:00:00Z', 1, 'above')).verdict, 'context'); // instruction begins
  assert.equal(DC.calendar.explanation(event('2026-04-15T18:00:00Z', 1)).verdict, 'none');
  for (const e of [event(memorial, 1, 'below'), event(memorial, 1, 'above')]) assert.doesNotMatch(DC.calendar.explanation(e).text, /confirmed|caused by/i);
});

test('filters split holiday/break events from regular days without changing inputs', () => {
  const DC = context();
  const events = [event('2026-05-25T17:00:00Z', 1), event('2026-04-15T18:00:00Z', 1), event('2026-03-16T18:00:00Z', 1)];
  assert.equal(DC.calendar.filterEvents(events).length, 3);
  DC.calendar.setFilter('calendar');
  same(DC.calendar.filterEvents(events), [events[0]]);
  DC.calendar.setFilter('regular');
  same(DC.calendar.filterEvents(events), [events[1], events[2]]); // finals are context, not a break
  assert.throws(() => DC.calendar.setFilter('weekends'), /Unsupported/);
  assert.equal(events.length, 3);
});

test('chart shading follows contiguous campus days and can be hidden', () => {
  const DC = context();
  const start = utc('2026-03-26T07:00:00Z'); // Mar 26 00:00 PDT
  const rows = Array.from({ length: 72 }, (_, i) => ({ time: start + i * HOUR, day: DC.history.localDay(start + i * HOUR) }));
  const offset = time => (time - start) / HOUR;
  const shades = DC.calendar.shades(rows, offset);
  same(shades.map(s => [s.calendar, s.start, s.end]),
    [['2026-quarter-break', 0, 24], ['2026-farmworkers-day', 24, 48], ['2026-quarter-break', 48, 72]]);
  assert.match(shades[0].color, /^rgba\(/);
  // A missing hour breaks a run rather than bridging the gap.
  assert.equal(DC.calendar.shades(rows.filter((_, i) => i !== 5), offset).length, 4);
  same(DC.calendar.legend(rows).map(item => item.label), ['University holiday', 'No classes']);
  assert.equal(DC.calendar.tooltipRow('2026-03-27').value, 'Farmworkers Day (university holiday), Quarter break (no classes)');
  DC.calendar.state.show = false;
  same(DC.calendar.shades(rows, offset), []);
  same(DC.calendar.legend(rows), []);
});

test('invalid calendar files are rejected and the feature degrades to no context', () => {
  for (const mutate of [
    cal => ({ ...cal, version: 2 }),
    cal => ({ ...cal, entries: [{ ...cal.entries[0], end: '2025-01-01' }] }),
    cal => ({ ...cal, entries: [{ ...cal.entries[0], kind: 'party' }] }),
    cal => ({ ...cal, entries: [cal.entries[0], cal.entries[0]] }),
    cal => ({ ...cal, entries: [{ ...cal.entries[0], source: 'unknown' }] }),
    cal => ({ ...cal, entries: [{ ...cal.entries[0], start: '2026-02-30' }] }),
  ]) {
    const DC = context(mutate);
    assert.equal(DC.calendar.available, false);
    assert.match(DC.calendar.error, /academic calendar/i);
    same(DC.calendar.onDay('2026-05-25'), []);
    assert.equal(DC.calendar.explanation(event('2026-05-25T17:00:00Z', 1)).verdict, 'none');
  }
});

test('committed Chronos-2 export: calendar context for real candidate events', () => {
  const DC = context();
  const dir = 'data/anomaly/chronos2-ft-5k/chronos2-ft-5k-';
  const bundle = DC.chronos2.parse(Object.fromEntries(['forecasts', 'predictions', 'events'].map(n => [n, fs.readFileSync(dir + n + '.csv', 'utf8')])));
  const events = bundle.meters.flatMap(m => bundle.select(m).events);
  const verdicts = {};
  for (const e of events) { const v = DC.calendar.explanation(e).verdict; verdicts[v] = (verdicts[v] || 0) + 1; }
  assert.equal(events.length, 106);
  same(verdicts, { none: 84, context: 11, possible: 9, contrary: 2 });
  assert.equal(events.filter(DC.calendar.explains).length, 12);
  const memorial = events.find(e => e.id === 'chronos2-ft-5k-E2451-020');
  assert.equal(DC.calendar.explanation(memorial).verdict, 'possible');
});
