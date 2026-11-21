/* Browser-local operator annotations. Model data, synthetic reviews and unsaved drafts stay separate. */
(function () {
  'use strict';
  const DC = window.DC, el = DC.el;
  const statuses = [['not_reviewed', 'Not reviewed'], ['in_review', 'In review'], ['follow_up', 'Follow-up needed'], ['reviewed', 'Reviewed']];
  const assessments = [['uncertain', 'Uncertain'], ['expected_operation', 'Expected operation'], ['possible_operational_issue', 'Possible operational issue'], ['possible_measurement_issue', 'Possible measurement issue']];
  const defaults = () => ({ status: 'not_reviewed', assessment: 'uncertain', notes: '', followUp: '', reviewer: '' });
  const limits = { notes: 4000, followUp: 2000, reviewer: 120 }, drafts = new Map();
  function identityFor(identity, event) {
    if (!identity || ![identity.dataset, identity.run, identity.model, event?.meter, event?.id].every(v => typeof v === 'string' && v.length > 0) || identity.model !== event.model) return null;
    return { dataset: identity.dataset, run: identity.run, model: identity.model, meter: event.meter, event: event.id };
  }
  const keyFor = identity => 'derconnect.real-review.v1.' + encodeURIComponent(JSON.stringify(identity));
  function validFields(fields) {
    return fields && statuses.some(([id]) => id === fields.status) && assessments.some(([id]) => id === fields.assessment) &&
      Object.entries(limits).every(([key, max]) => typeof fields[key] === 'string' && fields[key].length <= max);
  }
  function parseRecord(raw, identity) {
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== 1 || JSON.stringify(record.identity) !== JSON.stringify(identity) || !validFields(record.review) ||
        typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) throw Error('Stored review is invalid; it has not been overwritten.');
    return record;
  }
  function savedStatus(identity, event) {
    const scoped = identityFor(identity, event);
    if (!scoped) return null;
    try {
      return parseRecord(window.localStorage.getItem(keyFor(scoped)), scoped)?.review.status ?? 'not_reviewed';
    } catch (_) { return null; }
  }
  const statusLabel = value => statuses.find(([id]) => id === value)?.[1] ?? 'Unavailable';
  function progress(identity, events) {
    const counts = Object.fromEntries(statuses.map(([id]) => [id, 0]));
    counts.unavailable = 0; counts.total = events.length;
    for (const event of events) {
      const status = savedStatus(identity, event);
      counts[status ?? 'unavailable']++;
    }
    return counts;
  }
  let listStatus = 'all';
  function tableView(identity, events, id, onChange) {
    // Read persisted reviews, never the editable per-event drafts or model records.
    const saved = new Map(events.map(event => [event.id, savedStatus(identity, event)]));
    const select = el('select', { id, class: 'mini-select', onchange: event => {
      listStatus = event.target.value; onChange();
    } }, [['all', 'All statuses'], ...statuses].map(([value, text]) => el('option', { value, text, selected: value === listStatus })));
    const unavailable = [...saved.values()].some(value => value === null);
    return {
      statuses: saved,
      events: listStatus === 'all' ? events : events.filter(event => saved.get(event.id) === listStatus),
      control: el('label', { class: 'filter', for: id }, el('span', { text: 'Status' }), select),
      note: el('p', { class: 'muted', text: 'Review statuses are saved in this browser only. Edit status in the event’s Building Manager / Operator Review section and save the review.' +
        (unavailable ? ' Some saved statuses could not be read; they are shown as Unavailable and excluded from specific status filters.' : '') }),
    };
  }
  function open(identity, event) {
    const scoped = identityFor(identity, event);
    if (!scoped) return null;
    const key = keyFor(scoped);
    if (drafts.has(key)) return drafts.get(key);
    const state = { key, identity: scoped, fields: defaults(), baseline: '', baseRaw: null, savedAt: null, feedback: '', error: false };
    try {
      const raw = window.localStorage.getItem(key), record = parseRecord(raw, scoped);
      state.baseRaw = raw;
      if (record) { state.fields = Object.fromEntries(Object.keys(defaults()).map(key => [key, record.review[key]])); state.savedAt = record.savedAt; }
    } catch (err) {
      state.feedback = err instanceof SyntaxError ? 'Stored review cannot be read; it has not been overwritten.' : err.message === 'Stored review is invalid; it has not been overwritten.' ? err.message : 'Browser storage is unavailable. No saved review could be loaded; drafts stay only in this tab.';
      state.error = true;
    }
    state.baseline = JSON.stringify(state.fields); drafts.set(key, state); return state;
  }
  const dirty = state => Boolean(state && JSON.stringify(state.fields) !== state.baseline);
  function update(state, patch) {
    const fields = { ...state.fields, ...patch };
    if (!validFields(fields) || Object.keys(patch).some(key => !Object.hasOwn(defaults(), key))) throw Error('Review fields are invalid or exceed the displayed length limit.');
    state.fields = fields;
  }
  function save(state) {
    if (!state || !validFields(state.fields)) return false;
    try {
      const current = window.localStorage.getItem(state.key);
      parseRecord(current, state.identity);
      if (current !== state.baseRaw) throw Error('This review changed in another tab. Your draft is retained; copy it before reloading to inspect the saved version.');
      const savedAt = new Date().toISOString();
      const raw = JSON.stringify({ version: 1, identity: state.identity, review: { ...state.fields }, savedAt });
      window.localStorage.setItem(state.key, raw);
      if (window.localStorage.getItem(state.key) !== raw) throw Error('Browser storage did not confirm the save.');
      state.baseRaw = raw; state.baseline = JSON.stringify(state.fields); state.savedAt = savedAt;
      state.error = false; state.feedback = 'Review saved in this browser only.'; return true;
    } catch (err) {
      state.error = true;
      state.feedback = err instanceof SyntaxError ? 'Review not saved: stored review is invalid and has not been overwritten. Copy your draft before repairing browser data.' : /another tab|invalid/.test(err.message) ? err.message : 'Review not saved: browser storage is unavailable or could not confirm the write. Your draft remains in this tab; copy it before leaving.';
      return false;
    }
  }
  const hasUnsaved = () => [...drafts.values()].some(dirty);
  window.addEventListener?.('beforeunload', event => {
    if (hasUnsaved()) { event.preventDefault(); event.returnValue = ''; }
  });
  const savedTime = value => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value));
  function render(identity, event, identityError = '') {
    const state = open(identity, event);
    const section = el('section', { class: 'review-panel real-review', id: 'real-operator-review', 'aria-labelledby': 'real-review-heading' },
      el('h3', { id: 'real-review-heading', text: 'Building Manager / Operator Review' }),
      el('p', { class: 'muted', text: 'Operator annotations are separate from model predictions. A saved assessment is not confirmed ground truth and does not change detections, training or evaluation.' }));
    if (!state) {
      section.append(el('p', { role: 'status', text: identityError || 'Review saving is unavailable: a stable dataset/run/model identity is missing or mismatched.' })); return section;
    }
    section.dataset.reviewKey = state.key;
    const form = el('form', { 'aria-label': 'Real event operator review' });
    const indicator = el('p', { id: 'real-review-dirty', role: 'status', class: 'muted' });
    const feedback = el('p', { id: 'real-review-feedback', role: 'status', 'aria-live': 'polite' });
    const lastSaved = el('p', { id: 'real-review-last-saved', class: 'muted' });
    const refreshFeedback = () => {
      const otherDrafts = [...drafts.values()].filter(draft => draft !== state && dirty(draft)).length;
      indicator.textContent = (dirty(state) ? 'Unsaved changes — draft retained for this event in this tab.' : 'No unsaved changes for this event.') +
        (otherDrafts ? ' ' + otherDrafts + ' other event/run draft(s) remain unsaved in this tab.' : '');
      feedback.textContent = state.feedback; feedback.className = state.error ? 'note-box' : 'muted';
      lastSaved.textContent = 'Last saved: ' + (state.savedAt ? savedTime(state.savedAt) + ' (America/Los_Angeles)' : 'Never saved');
    };
    const fieldId = key => 'real-review-' + key + '-' + encodeURIComponent(state.key);
    const set = (key, value) => { update(state, { [key]: value }); refreshFeedback(); };
    for (const [key, label, options] of [['status', 'Review status', statuses], ['assessment', 'Assessment', assessments]]) {
      const control = el('select', { id: fieldId(key), class: 'mini-select', onchange: evt => set(key, evt.target.value) },
        options.map(([value, text]) => el('option', { value, text, selected: state.fields[key] === value })));
      form.append(el('label', { for: control.id, text: label }), control);
    }
    for (const [key, label, placeholder] of [['notes', 'Review notes', 'What was observed and relevant operating context…'], ['followUp', 'Follow-up action', 'What should be checked or done next…']]) {
      const control = el('textarea', { id: fieldId(key), rows: key === 'notes' ? '4' : '3', maxlength: limits[key], placeholder, oninput: evt => set(key, evt.target.value) });
      control.value = state.fields[key]; form.append(el('label', { for: control.id, text: label }), control);
    }
    const name = el('input', { id: fieldId('reviewer'), type: 'text', maxlength: limits.reviewer, autocomplete: 'off', value: state.fields.reviewer, oninput: evt => set('reviewer', evt.target.value) });
    form.append(el('label', { for: name.id, text: 'Reviewer name (optional)' }), name, indicator,
      el('button', { type: 'submit', class: 'btn primary', text: 'Save review' }), feedback, lastSaved);
    form.addEventListener('submit', evt => {
      evt.preventDefault(); const saved = save(state); refreshFeedback();
      if (saved) DC.setState({});
    });
    section.append(form,
      el('p', { class: 'muted', text: 'Saved reviews stay in this browser’s localStorage for this site only; they are not shared multi-user records. Unsaved drafts stay with their event during dashboard navigation. Save before reloading or closing. This tab requests a browser warning while drafts are unsaved. A run fingerprint of the three loaded CSV files separates re-exported or changed data from earlier reviews.' }));
    refreshFeedback(); return section;
  }
  DC.realReview = { open, update, save, dirty, hasUnsaved, render, keyFor, identityFor, savedStatus, statusLabel, progress, tableView };
})();
