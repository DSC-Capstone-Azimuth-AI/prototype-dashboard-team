/* Chronos-2 evidence inside the Real DERCONNECT meter profile. */
(function () {
  'use strict';
  const DC = window.DC, el = DC.el, H = DC.history, A = DC.chronos2;
  let bundle = null, status = 'idle', error = '', showBand = true;
  const fullScopes = new Map(), profiles = new Map();

  const redraw = () => {
    if (DC.state.section === 'buildings' && H.session.source === 'historical') DC.setState({});
  };
  async function load(read) {
    status = 'loading'; error = '';
    try {
      bundle = await read();
      fullScopes.clear(); profiles.clear(); status = 'ready';
    }
    catch (err) { error = err.message; status = 'unavailable'; }
    redraw();
  }

  function start() {
    if (status !== 'idle') return;
    const path = document.querySelector('meta[name="derconnect-chronos2"]')?.content;
    if (path) load(() => A.load(path));
    else status = 'unavailable';
  }
  function notice(root) {
    if (status === 'ready') return;
    root.append(el('p', { id: 'chronos-load-status', role: 'status', class: 'muted',
      text: status === 'loading' ? 'Loading Chronos-2 hourly outputs…' : 'Chronos-2 unavailable. See Advanced data management.' }));
  }
  function fallback(root) {
    if (status !== 'unavailable') return;
    root.append(el('p', { id: 'chronos-load-error', role: 'status', class: 'muted', text: error || 'No Chronos-2 export folder is configured.' }),
      el('label', { class: 'chronos-file' }, el('span', { text: 'Choose the three Chronos-2 CSVs' }),
      el('input', { type: 'file', multiple: true, accept: '.csv,text/csv', id: 'chronos-files',
        onchange: evt => {
          const files = Array.from(evt.target.files);
          if (!files.length) return;
          load(() => A.readFiles(files));
          redraw();
        } })));
  }

  const kw = value => value == null ? 'Unavailable' : DC.fmt.kw(value);
  const score = value => value == null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const direction = { above: 'Above expected', below: 'Below expected', mixed: 'Mixed' };
  const range = rows => H.stamp(rows[0].time) + ' to ' + H.stamp(rows.at(-1).time + A.HOUR);
  const expectedColor = () => DC.css('--seq-5');
  const candidate = () => DC.css('--accent');
  const fact = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', { text: value }));
  const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  const dayLabel = value => dateFormat.format(new Date(value));
  const period = scope => dayLabel(scope.rows[0].day) + ' – ' + dayLabel(scope.rows.at(-1).day);
  const presets = [['7', '7 days'], ['30', '30 days'], ['full', 'Full range'], ['custom', 'Custom dates']];

  function full(meter) {
    if (!bundle) return null;
    if (!fullScopes.has(meter)) fullScopes.set(meter, bundle.select(meter));
    return fullScopes.get(meter);
  }

  function profileState(meter) {
    if (!profiles.has(meter)) profiles.set(meter, { preset: '7', from: '', to: '', event: null, focused: false, list: 'all', order: 'date', logTop: 0 });
    return profiles.get(meter);
  }

  function bounds(scope, view) {
    if (view.preset === 'custom') return [view.from, view.to];
    const last = scope.rows.at(-1).day;
    if (view.preset === 'full') return [scope.rows[0].day, last];
    const first = scope.rows.find(row => row.period === 'detection')?.day || scope.rows[0].day;
    const end = new Date(Date.parse(first) + (Number(view.preset) - 1) * 24 * A.HOUR).toISOString().slice(0, 10);
    return [first, end < last ? end : last];
  }

  function setEvent(view, event, focusId = 'chronos-event-title') {
    const previous = view.event;
    view.event = event?.id ?? null;
    view.focused = Boolean(event);
    DC.charts.tip.hide();
    redraw();
    requestAnimationFrame(() => {
      const target = event ? document.getElementById(focusId) : DC.$('#chronos-event-list button[data-focus-key="' + previous + '"]');
      (target?.disabled ? DC.$('#chronos-event-title') : target)?.focus();
    });
  }

  function chart(node, rows, events, selected, onEvent, isContext) {
    const origin = rows[0].time, offset = time => (time - origin) / A.HOUR;
    const last = offset(rows.at(-1).time), byHour = new Map(rows.map(row => [offset(row.time), row]));
    // Add one empty sample per UTC gap so neither lines nor bands bridge missing hours.
    const samples = [];
    for (const i of byHour.keys()) {
      if (samples.length && i > samples.at(-1) + 1) samples.push(samples.at(-1) + 1);
      samples.push(i);
    }
    const tickCount = Math.min(last + 1, node.clientWidth < 480 ? 3 : 5);
    const xTicks = Array.from({ length: tickCount }, (_, i) => Math.round(last * i / Math.max(1, tickCount - 1)));
    const actual = DC.css('--actual'), expected = expectedColor(), eventColor = candidate();
    const eventIds = new Set(events.map(event => event.id));
    const series = [{ get: i => byHour.get(i)?.actual, color: actual },
      { get: i => byHour.get(i)?.q?.q50, color: expected, dash: '5 4', width: 1.7 }];
    const markers = series.flatMap(s => samples.filter(i => s.get(i) != null && s.get(i - 1) == null && s.get(i + 1) == null)
      .map(i => ({ t: i, v: s.get(i), color: s.color })));
    DC.charts.timeSeries(node, {
      t0: 0, t1: last + 1, centerBins: true, height: isContext ? 235 : 300, samples, xTicks,
      ariaLabel: isContext ? 'Hourly total power around the selected candidate anomaly' : 'Observed and expected hourly total active power in kW',
      xFormat: i => {
        const [day, time] = H.axisStamp(origin + i * A.HOUR);
        if (last < 24) return time;
        return last < 72 ? day + ' ' + time.split(' ')[0] : day;
      },
      series, markers,
      band: showBand ? [{ lo: i => byHour.get(i)?.q?.q10, hi: i => byHour.get(i)?.q?.q90, color: DC.css('--band-inner') }] : [],
      intervals: events.map(ev => ({ start: offset(ev.start), end: offset(ev.end), color: eventColor, selected: ev.id === selected?.id, event: ev })),
      onClick: !onEvent || !events.length ? undefined : (i, hit) => {
        const ev = hit?.event || byHour.get(i)?.event;
        if (eventIds.has(ev?.id)) onEvent(ev);
      },
      tooltip: i => {
        const row = byHour.get(i);
        if (!row) return { title: H.stamp(origin + i * A.HOUR), rows: [], note: 'No model output for this UTC hour.' };
        const detection = row.period === 'detection';
        const details = [{ label: 'Observed total', value: kw(row.actual), color: actual },
          { label: 'Expected total (median)', value: kw(row.q?.q50), color: expected, kind: 'dash' }];
        if (showBand && row.q?.q10 != null && row.q?.q90 != null) details.push({ label: 'Nominal 80% interval', value: kw(row.q.q10) + ' to ' + kw(row.q.q90) });
        if (detection) details.push({ label: 'Raw score / threshold', value: score(row.score) + ' / ' + score(row.threshold) });
        if (detection && row.flag) details.push({ label: 'Detector flag', value: 'Flagged hour' });
        if (eventIds.has(row.event?.id)) details.push({ label: 'Candidate event', value: row.event.id });
        const observation = row.filled ? 'Interpolated observation' : row.actual === null ? 'Observation unavailable' : row.filled === null ? 'Interpolation status unavailable' : 'Measured observation';
        const period = detection ? 'Detection' : row.period === 'calibration' ? 'Assumed-normal calibration' : 'Detector output unavailable';
        return { title: H.stamp(row.time), rows: details, note: period + ' · ' + observation };
      },
    });
  }

  function appendChart(parent, id, rows, events, selected, onEvent, isContext = false) {
    const node = el('div', { class: 'chart', id });
    parent.append(node);
    requestAnimationFrame(() => { if (node.isConnected) chart(node, rows, events, selected, onEvent, isContext); });
  }

  function rangeControls(view, from, to) {
    const update = change => {
      Object.assign(view, change, { event: null, focused: false });
      redraw();
    };
    const controls = el('div', { class: 'chronos-range-controls' },
      DC.ui.segmented(presets, view.preset, preset => update({ preset, from, to }), 'Model chart range'));
    if (view.preset === 'custom') {
      const dates = el('div', { class: 'buildings-date-range' });
      for (const [key, label] of [['from', 'From'], ['to', 'To']]) {
        dates.append(el('label', { class: 'filter' }, el('span', { text: label }),
          el('input', { id: 'chronos-' + key, type: 'date', value: view[key], onchange: event => update({ [key]: event.target.value }) })));
      }
      controls.append(dates);
    }
    return controls;
  }

  function eventCount(scope) {
    if (!scope.scoredHours || scope.skipped.events) return '—';
    return DC.fmt.int(scope.events.length);
  }

  function metrics(scope, from, to) {
    const measured = scope.rows.filter(row => row.filled === false && row.actual !== null);
    const mean = measured.length ? DC.sum(measured.map(row => row.actual)) / measured.length : null;
    const peak = measured.length ? Math.max(...measured.map(row => row.actual)) : null;
    const kpis = el('div', { class: 'kpis' });
    for (const [key, label, value] of [
      ['events', 'Candidate events', eventCount(scope)],
      ['hours', 'Scored detection hours', DC.fmt.int(scope.scoredHours)],
      ['mean', 'Mean observed power', mean === null ? '—' : kw(mean)],
      ['peak', 'Peak observed power', peak === null ? '—' : kw(peak)],
    ]) {
      kpis.append(el('div', { class: 'card kpi', 'data-chronos-metric': key },
        el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value })));
    }
    const dates = from && to && from <= to ? dayLabel(from) + ' – ' + dayLabel(to) : from && to ? 'Check date order' :
      from ? 'From ' + dayLabel(from) : to ? 'Through ' + dayLabel(to) : 'All dates';
    return el('section', { class: 'chronos-summary', 'aria-labelledby': 'chronos-summary-title' },
      el('div', { class: 'chronos-summary-heading' }, el('h3', { id: 'chronos-summary-title', text: 'Window summary' }),
        el('span', { class: 'ink2', text: dates })), kpis);
  }

  function analysis(view, windowScope, all, selected, from, to) {
    const c = DC.ui.card('Observed vs. expected total active power', 'Hourly power in kW · America/Los_Angeles');
    c.card.id = 'chronos-analysis';
    c.tools.append(el('label', { class: 'chronos-band' }, el('input', { type: 'checkbox', id: 'chronos-band', checked: showBand,
      onchange: event => { showBand = event.target.checked; redraw(); } }), '80% forecast interval'));
    c.body.append(rangeControls(view, from, to));
    const focused = view.focused && selected;
    const rows = focused ? all.context(selected) : windowScope.rows;
    const events = focused ? all.events : windowScope.events;
    if (focused) c.body.append(el('div', { class: 'chronos-focus-bar' },
      el('span', { text: 'Focused on the selected event' }),
      el('button', { type: 'button', class: 'btn', id: 'chronos-restore-range', text: 'Return to chart range', onclick: () => {
        view.focused = false; redraw();
        requestAnimationFrame(() => DC.$('.chronos-range-controls button[aria-pressed="true"]')?.focus({ preventScroll: true }));
      } })));
    if (!rows.length) {
      c.body.append(el('p', { class: 'empty', text: 'No Chronos-2 hours match these campus dates.' }));
      return c.card;
    }
    c.body.append(el('p', { class: 'muted', id: 'chronos-range', text: range(rows) + ' (end exclusive)' }));
    if (rows.some(row => row.actual !== null || row.q?.q50 != null)) {
      appendChart(c.body, 'chronos-chart', rows, events, selected, event => setEvent(view, event));
      c.body.append(DC.ui.legend([
        { kind: 'line', color: DC.css('--actual'), label: 'Observed power' },
        { kind: 'dash', color: expectedColor(), label: 'Expected median' },
        ...(showBand ? [{ kind: 'box', color: DC.css('--band-inner'), label: 'Nominal 80% forecast interval' }] : []),
        { kind: 'box', color: candidate(), label: 'Candidate event interval' },
      ]));
    } else {
      c.body.append(el('p', { class: 'empty', text: 'Observed and expected power are unavailable for these hours.' }));
    }
    return c.card;
  }

  function investigation(ev, all, events, view) {
    const node = el('section', { class: 'chronos-investigation', id: 'chronos-event', 'aria-labelledby': 'chronos-event-title' });
    const index = events.findIndex(event => event.id === ev.id);
    const step = (offset, label, id) => el('button', { type: 'button', class: 'btn', id, text: label,
      disabled: index === -1 || !events[index + offset], onclick: () => setEvent(view, events[index + offset], id) });
    const actual = ev.actual, expected = ev.expected;
    const interpretation = actual === null || expected === null ? '' : actual === expected ?
      'Observed power matched the expected median at the peak detector score.' :
      'Observed power was ' + kw(Math.abs(actual - expected)) + (actual < expected ? ' below' : ' above') + ' the expected median at the peak detector score.';
    node.append(el('div', { class: 'chronos-investigation-head' },
      el('div', {},
        el('h4', { id: 'chronos-event-title', tabindex: '-1', text: 'Unclassified candidate anomaly' }),
        el('p', { class: 'ink2', text: H.stamp(ev.start) + ' · ' + ev.duration + ' h · ' + direction[ev.direction] })),
      el('div', { class: 'chronos-event-actions' },
        step(-1, 'Previous', 'chronos-prev-event'), step(1, 'Next', 'chronos-next-event'),
        el('button', { type: 'button', class: 'btn', text: 'Close event', onclick: () => setEvent(view, null) }))),
    el('dl', { class: 'chronos-peak' }, fact('Observed at peak', kw(actual)), fact('Expected at peak', kw(expected))),
    interpretation && el('p', { class: 'ink2', text: interpretation }),
    el('dl', { class: 'chronos-facts' }, fact('Event ID', ev.id), fact('End (exclusive)', H.stamp(ev.end)), fact('Peak raw score', score(ev.score))),
    el('p', { class: 'muted', text: 'Facilities verification is needed to interpret this candidate event.' }));
    const rows = all.context(ev);
    if (rows.length) {
      node.append(el('p', { class: 'ink2', text: 'Hourly context · up to 24 hours on either side · kW' }));
      appendChart(node, 'chronos-context-chart', rows, [ev], ev, null, true);
    }
    return node;
  }

  function eventTable(events, selected, view) {
    const headings = ['Start (campus time)', 'Duration', 'Peak detector score', 'Direction', 'Action'];
    const head = el('thead', {}, el('tr', {}, headings.map(text => el('th', { scope: 'col', text }))));
    const body = el('tbody', {}, events.map(event => {
      const active = event.id === selected?.id;
      return el('tr', { class: active ? 'selected static' : 'static' },
        el('td', {}, el('time', { datetime: new Date(event.start).toISOString(), title: H.stamp(event.start), text: H.axisStamp(event.start).join(' · ') })),
        el('td', { text: event.duration + ' h' }), el('td', { text: score(event.score) }), el('td', { text: direction[event.direction] }),
        el('td', {}, el('button', { type: 'button', class: 'btn', 'aria-pressed': String(active), 'aria-label': 'Inspect event on ' + H.stamp(event.start),
          'data-focus-key': event.id, text: active ? 'Selected' : 'Inspect', onclick: () => setEvent(view, event) })));
    }));
    const wrapper = el('div', { class: 'table-wrap chronos-event-table', tabindex: '0', role: 'region', 'aria-label': 'Candidate event table',
      onscroll: event => { view.logTop = event.currentTarget.scrollTop; } },
      el('table', { id: 'chronos-event-list' }, head, body));
    requestAnimationFrame(() => { if (wrapper.isConnected) wrapper.scrollTop = view.logTop; });
    return wrapper;
  }

  function anomalies(windowScope, all, selected, view) {
    const c = DC.ui.card('Candidate events', 'Grouped Chronos-2 detections');
    c.card.id = 'building-anomalies';
    const scope = view.list === 'window' ? windowScope : all;
    const order = { date: (a, b) => a.start - b.start, newest: (a, b) => b.start - a.start,
      duration: (a, b) => b.duration - a.duration, score: (a, b) => b.score - a.score };
    const events = scope.events.slice().sort(order[view.order]);
    c.tools.append(el('select', { class: 'mini-select', id: 'chronos-event-sort', 'aria-label': 'Sort candidate events',
      onchange: event => { view.order = event.target.value; view.logTop = 0; redraw(); } },
    [['date', 'Oldest first'], ['newest', 'Newest first'], ['duration', 'Longest duration'], ['score', 'Highest detector score']].map(([value, text]) =>
      el('option', { value, selected: value === view.order, text }))));
    if (selected) c.body.append(investigation(selected, all, events, view));
    c.body.append(el('div', { class: 'chronos-log-controls' },
      DC.ui.segmented([['all', 'All detection dates'], ['window', 'Selected dates']], view.list, list => {
        view.list = list; view.logTop = 0; redraw();
      }, 'Event list dates'),
      el('p', { class: 'ink2', id: 'chronos-event-count', text: scope.scoredHours ?
        scope.events.length + (scope.events.length === 1 ? ' candidate event' : ' candidate events') +
          (scope.skipped.events ? ' matched · total unavailable' : ' · ' + DC.fmt.int(scope.scoredHours) + ' scored detection hours') :
        'No scored detection hours in this range.' })));
    if (view.order === 'score') c.body.append(el('p', { class: 'muted', text: 'Detector score ranks forecast interval exceedance within this model. Operational severity is unverified.' }));
    if (events.length) c.body.append(eventTable(events, selected, view));
    return c.card;
  }

  function provenance(scope) {
    const filled = scope.rows.filter(row => row.filled).length;
    const unjoined = scope.skipped.forecasts + scope.skipped.predictions;
    return el('details', { class: 'disclosure chronos-method' },
      el('summary', { text: 'Model provenance and data quality' }),
      el('p', { text: A.MODEL + ' · committed DERCONNECT CSV exports · hourly mean total active power (A+B+C) in kW. Source measurement calibration is unverified.' }),
      el('p', { text: 'The detector uses an assumed-normal calibration period. Candidate counts use detection-period events. Mean and peak use readings explicitly marked as measured. Interpolated hours can appear in the chart and are identified in hover details.' }),
      el('p', { text: 'Interpolated observations in the selected dates · ' + filled + '. Forecast and prediction rows excluded for missing or invalid UTC hours across this meter’s export · ' + unjoined + '.' }),
      scope.skipped.events ? el('p', { text: 'Some event intervals have invalid UTC bounds or no matching detection hours.' }) : null,
      scope.unscoredHours ? el('p', { text: 'Detection hours with incomplete scores or flags in the selected dates · ' + scope.unscoredHours + '.' }) : null);
  }

  function append(root, meter) {
    const all = full(meter);
    if (!all?.rows.length) {
      const c = DC.ui.card('Candidate events', '');
      c.card.id = 'building-anomalies';
      c.body.append(el('p', { class: 'empty', id: 'buildings-detector-unavailable', text: 'No Chronos-2 outputs are available for this meter.' }));
      root.append(c.card);
      return;
    }
    const view = profileState(meter);
    const [from, to] = bounds(all, view);
    const scope = view.preset === 'full' ? all : bundle.select(meter, from, to);
    const selected = all.events.find(event => event.id === view.event);
    root.append(metrics(scope, from, to), analysis(view, scope, all, selected, from, to), anomalies(scope, all, selected, view));
    return provenance(scope);
  }

  DC.chronosBuildings = { start, notice, fallback, append, full, eventCount, period, get bundle() { return bundle; } };
})();
