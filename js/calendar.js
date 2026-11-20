/* Academic-calendar context for real DERCONNECT views: chart shading, event tags, filters and
   "possible explanation" text. Uses campus (America/Los_Angeles) days from DC.history.localDay.
   Calendar context is a hypothesis for review, never a confirmed cause or a detector change. */
(function () {
  'use strict';
  const DC = window.DC, el = DC.el, HOUR = 3600000;
  const KINDS = {
    holiday: { label: 'University holiday', tag: 'Holiday', rank: 3, explains: true, shade: true, token: '--axis', alpha: 0.32 },
    no_instruction: { label: 'No classes', tag: 'No classes', rank: 2, explains: true, shade: true, token: '--axis', alpha: 0.2 },
    finals: { label: 'Final exams', tag: 'Finals', rank: 1, explains: false, shade: true, token: '--axis', alpha: 0.1 },
    term_start: { label: 'Instruction begins', tag: 'Term start', rank: 0, explains: false, shade: false },
  };
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const state = { filter: 'all', show: true };

  function validate(raw) {
    if (!raw || raw.version !== 1 || raw.timezone !== 'America/Los_Angeles' || !Array.isArray(raw.entries) || !Array.isArray(raw.sources)) {
      throw new Error('Unsupported academic calendar file.');
    }
    const sources = new Map(raw.sources.map(s => [s.id, s]));
    const ids = new Set();
    const entries = raw.entries.map(entry => {
      const ok = entry && typeof entry.id === 'string' && !ids.has(entry.id) && KINDS[entry.kind] &&
        typeof entry.name === 'string' && typeof entry.short === 'string' && DAY.test(entry.start) && DAY.test(entry.end) &&
        entry.start <= entry.end && sources.has(entry.source) &&
        !Number.isNaN(Date.parse(entry.start + 'T00:00:00Z')) && !Number.isNaN(Date.parse(entry.end + 'T00:00:00Z'));
      if (!ok) throw new Error('Invalid academic calendar entry: ' + (entry?.id || 'unknown') + '.');
      ids.add(entry.id);
      return Object.freeze({ ...entry, kindInfo: KINDS[entry.kind], sourceInfo: sources.get(entry.source) });
    });
    return { entries, sources: raw.sources };
  }

  let data = null, error = '';
  try { data = validate(window.DERCONNECT_CALENDAR); } catch (err) { error = err.message; }

  const byRank = (a, b) => b.kindInfo.rank - a.kindInfo.rank || a.start.localeCompare(b.start);
  function onDay(day) {
    if (!data || !DAY.test(day || '')) return [];
    return data.entries.filter(e => e.start <= day && day <= e.end).sort(byRank);
  }
  function daysOf(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const days = new Set();
    for (let t = start; t < end; t += HOUR) days.add(DC.history.localDay(t));
    days.add(DC.history.localDay(end - 1));
    return Array.from(days).sort();
  }
  function forEvent(event) {
    const found = new Map();
    for (const day of daysOf(event?.start, event?.end)) for (const entry of onDay(day)) found.set(entry.id, entry);
    return Array.from(found.values()).sort(byRank);
  }
  const explains = event => forEvent(event).some(e => e.kindInfo.explains);

  const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  const fmtDay = day => dayFormat.format(new Date(day + 'T00:00:00Z'));
  const span = entry => entry.start === entry.end ? fmtDay(entry.start) : fmtDay(entry.start) + ' – ' + fmtDay(entry.end);
  const names = entries => entries.map(e => e.name + ' (' + span(e) + ')').join('; ');

  /* verdict: 'possible' (calendar may explain lower use), 'contrary' (calendar would predict lower use,
     but use was higher), 'context' (schedule differs; direction unclear), 'none'. */
  function explanation(event) {
    const entries = forEvent(event);
    const reducing = entries.filter(e => e.kindInfo.explains);
    if (!entries.length) return { verdict: 'none', entries, text: 'No university holiday, break, finals week or term start overlaps this event.' };
    if (reducing.length && event.direction === 'below') {
      return { verdict: 'possible', entries, text: 'Possible explanation (unverified): this event overlaps ' + names(reducing) +
        '. Lower occupancy and reduced building schedules on these days commonly lower power use. Confirm with facilities before dismissing it.' };
    }
    if (reducing.length && event.direction === 'above') {
      return { verdict: 'contrary', entries, text: 'This event overlaps ' + names(reducing) + ', when lower occupancy would normally reduce power use. ' +
        'Higher-than-expected use on these days is not explained by the calendar and may be worth checking (for example schedules or equipment left on).' };
    }
    return { verdict: 'context', entries, text: 'Calendar context: this event overlaps ' + names(entries) +
      '. Academic schedules differ on these days, which can change typical power use. Direction alone does not show whether this explains the event.' };
  }

  function tag(event) {
    const entries = forEvent(event);
    if (!entries.length) return null;
    const top = entries[0];
    return el('span', { class: 'calendar-tag calendar-' + top.kind, 'data-calendar-tag': top.kind,
      title: 'Academic calendar: ' + names(entries) }, top.kindInfo.tag + ' · ' + top.short);
  }

  function context(event) {
    const result = explanation(event);
    const box = el('section', { class: 'calendar-context calendar-' + result.verdict, 'data-calendar-verdict': result.verdict,
      'aria-label': 'Academic calendar context' }, el('h4', { text: 'Academic calendar context' }), el('p', { text: result.text }));
    if (!data) box.append(el('p', { class: 'muted', text: 'Academic calendar unavailable: ' + error }));
    else if (result.entries.length) box.append(sourceNote(result.entries));
    return box;
  }
  function sourceNote(entries) {
    const used = new Map(entries.map(e => [e.sourceInfo.id, e.sourceInfo]));
    const p = el('p', { class: 'muted' }, 'Source: ');
    Array.from(used.values()).forEach((s, i) => {
      if (i) p.append('; ');
      p.append(el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.title }));
    });
    return p;
  }

  const FILTERS = [['all', 'All days'], ['calendar', 'Holidays & breaks'], ['regular', 'Excluding holidays & breaks']];
  function filterEvents(events) {
    if (state.filter === 'calendar') return events.filter(explains);
    if (state.filter === 'regular') return events.filter(event => !explains(event));
    return events;
  }
  function filterControl(id, onChange) {
    const select = el('select', { id, class: 'mini-select', onchange: evt => { state.filter = evt.target.value; onChange(); } },
      FILTERS.map(([value, text]) => el('option', { value, text, selected: value === state.filter })));
    return el('label', { class: 'filter', for: id, title: 'Holidays & breaks: university holidays and days without instruction (UC San Diego calendar).' },
      el('span', { text: 'Calendar' }), select);
  }
  function setFilter(value) {
    if (!FILTERS.some(([v]) => v === value)) throw new Error('Unsupported calendar filter.');
    state.filter = value;
  }

  function tint(token, alpha) {
    const value = DC.css(token);
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (!hex) return value;
    const n = parseInt(hex[1], 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }
  const shadeColor = kind => tint(KINDS[kind].token, KINDS[kind].alpha);

  /* Chart shading: rows carry .time (UTC ms) and .day (campus day); offset maps time to chart units. */
  function shades(rows, offset) {
    if (!state.show || !data) return [];
    const runs = [];
    for (const row of rows) {
      const top = onDay(row.day).find(e => e.kindInfo.shade);
      const prev = runs.at(-1);
      if (top && prev && prev.entry.id === top.id && prev.lastTime + HOUR === row.time) {
        prev.end = offset(row.time) + 1; prev.lastTime = row.time;
      } else if (top) {
        runs.push({ entry: top, start: offset(row.time), end: offset(row.time) + 1, lastTime: row.time });
      }
    }
    return runs.map(run => ({ start: run.start, end: run.end, color: shadeColor(run.entry.kind), opacity: 1, label: run.entry.short, calendar: run.entry.id }));
  }
  function tooltipRow(day) {
    const entries = onDay(day);
    return entries.length ? { label: 'Academic calendar', value: entries.map(e => e.short + ' (' + e.kindInfo.label.toLowerCase() + ')').join(', ') } : null;
  }
  function legend(rows) {
    if (!state.show || !data) return [];
    const kinds = new Set();
    for (const row of rows) for (const e of onDay(row.day)) if (e.kindInfo.shade) kinds.add(e.kind);
    return Object.keys(KINDS).filter(k => kinds.has(k)).map(k => ({ kind: 'box', color: shadeColor(k), label: KINDS[k].label }));
  }
  function toggle(onChange) {
    return el('label', { class: 'chronos-band calendar-toggle' }, el('input', { type: 'checkbox', checked: state.show, 'data-calendar-toggle': '',
      onchange: evt => { state.show = evt.target.checked; onChange(); } }), 'Academic calendar');
  }

  function overviewNote(events, onShow) {
    if (!data) return el('p', { class: 'muted', id: 'real-calendar-summary', text: 'Academic calendar unavailable: ' + error });
    const matched = events.filter(explains);
    const p = el('p', { class: 'note-box calendar-summary', id: 'real-calendar-summary' },
      matched.length + ' of ' + events.length + ' candidate events overlap a university holiday or a day without classes, where the academic calendar may explain lower use. ');
    if (matched.length) p.append(el('button', { type: 'button', class: 'btn', text: 'Show these events', onclick: onShow }));
    return p;
  }

  DC.calendar = { KINDS, state, validate, onDay, daysOf, forEvent, explains, explanation, tag, context, filterEvents, filterControl,
    setFilter, shades, tooltipRow, legend, toggle, overviewNote,
    get available() { return Boolean(data); }, get error() { return error; }, get entries() { return data ? data.entries : []; } };
})();
