/* Chronos-2 evidence inside the Real DERCONNECT meter profile. */
(function () {
  'use strict';
  const DC = window.DC, el = DC.el, H = DC.history, A = DC.chronos2;
  let bundle = null, status = 'idle', error = '', selectedId = null, showBand = true;

  const redraw = () => {
    if (DC.state.section === 'buildings' && H.session.source === 'historical') DC.setState({});
  };
  async function load(read) {
    status = 'loading'; error = '';
    try { bundle = await read(); status = 'ready'; }
    catch (err) { error = err.message; status = 'unavailable'; }
    redraw();
  }

  function controls(root) {
    if (status === 'idle') {
      const path = document.querySelector('meta[name="derconnect-chronos2"]')?.content;
      if (path) load(() => A.load(path));
      else status = 'unavailable';
    }
    if (status === 'ready') return;
    if (status === 'loading') {
      root.append(el('p', { id: 'chronos-load-status', role: 'status', class: 'muted', text: 'Loading Chronos-2 hourly outputs…' }));
      return;
    }
    root.append(el('p', { id: 'chronos-load-status', role: 'status', class: 'muted',
      text: error ? 'Chronos-2 unavailable. ' + error : 'No Chronos-2 export folder is configured.' }),
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
  const range = rows => H.stamp(rows[0].time) + ' to ' + H.stamp(rows.at(-1).time + A.HOUR) + ' (end exclusive)';
  const timeRange = ev => H.stamp(ev.start) + ' to ' + H.stamp(ev.end);
  const candidate = () => DC.css('--seq-5');
  const fact = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', { text: value }));

  function setEvent(event) {
    const previous = selectedId;
    selectedId = event?.id ?? null;
    DC.charts.tip.hide();
    redraw();
    requestAnimationFrame(() => {
      const target = event ? DC.$('#chronos-event-title') : DC.$('#chronos-event-list button[data-focus-key="' + previous + '"]');
      target?.focus();
    });
  }

  function chart(node, rows, events, selected, isContext = false) {
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
    const actual = DC.css('--actual'), expected = DC.css('--expected'), eventColor = candidate();
    const eventIds = new Set(events.map(event => event.id));
    const series = [{ get: i => byHour.get(i)?.actual, color: actual },
      { get: i => byHour.get(i)?.q?.q50, color: expected, dash: '5 4' }];
    const markers = series.flatMap(s => samples.filter(i => s.get(i) != null && s.get(i - 1) == null && s.get(i + 1) == null)
      .map(i => ({ t: i, v: s.get(i), color: s.color })));
    DC.charts.timeSeries(node, {
      t0: 0, t1: last + 1, centerBins: true, height: isContext ? 235 : 300, samples, xTicks,
      ariaLabel: isContext ? 'Hourly total power around the selected candidate anomaly' : 'Observed and expected hourly total active power in kW',
      xFormat: i => H.axisStamp(origin + i * A.HOUR)[last < 24 ? 1 : 0],
      series, markers,
      band: showBand ? [{ lo: i => byHour.get(i)?.q?.q10, hi: i => byHour.get(i)?.q?.q90, color: DC.css('--band-inner') }] : [],
      intervals: events.map(ev => ({ start: offset(ev.start), end: offset(ev.end), color: eventColor, selected: ev.id === selected?.id, event: ev })),
      onClick: isContext || !events.length ? undefined : (i, hit) => {
        const ev = hit?.event || byHour.get(i)?.event;
        if (eventIds.has(ev?.id)) setEvent(ev);
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

  function appendChart(parent, id, rows, events, selected, isContext = false) {
    const node = el('div', { class: 'chart', id });
    parent.append(node);
    requestAnimationFrame(() => { if (node.isConnected) chart(node, rows, events, selected, isContext); });
  }

  function analysis(meter, scope, selected) {
    const c = DC.ui.card('Chronos-2 Anomaly Detection — Total Active Power', meter + ' · ' + A.MODEL + ' · hourly · America/Los_Angeles');
    c.card.id = 'chronos-analysis';
    if (!scope?.rows.length) {
      const message = scope ? 'No Chronos-2 hours match these campus dates.' : bundle ? 'No Chronos-2 outputs are available for this meter.' :
        status === 'loading' ? 'Loading Chronos-2 outputs…' : 'Chronos-2 outputs are unavailable. Choose the CSVs in Buildings controls.';
      c.body.append(el('p', { class: 'empty', text: message }));
      return c.card;
    }
    c.tools.append(el('label', { class: 'chronos-band' }, el('input', { type: 'checkbox', id: 'chronos-band', checked: showBand,
      onchange: evt => { showBand = evt.target.checked; redraw(); } }), '80% forecast interval'));
    c.body.append(el('p', { class: 'muted', id: 'chronos-range', text: range(scope.rows) }));
    if (scope.rows.some(row => row.actual !== null || row.q?.q50 != null)) {
      appendChart(c.body, 'chronos-chart', scope.rows, scope.events, selected);
      c.body.append(DC.ui.legend([
        { kind: 'line', color: DC.css('--actual'), label: 'Observed total power (kW)' },
        { kind: 'dash', color: DC.css('--expected'), label: 'Expected median (kW)' },
        ...(showBand ? [{ kind: 'box', color: DC.css('--band-inner'), label: 'Nominal 80% forecast interval' }] : []),
        { kind: 'box', color: candidate(), label: 'Candidate anomaly interval' },
      ]));
    } else {
      c.body.append(el('p', { class: 'empty', text: 'Observed and expected total power are unavailable for these hours.' }));
    }
    const filled = scope.rows.filter(row => row.filled).length;
    const unjoined = scope.skipped.forecasts + scope.skipped.predictions;
    c.body.append(el('p', { class: 'card-foot',
      text: 'The DERCONNECT hourly Chronos-2 CSV export reports mean total active power (A+B+C) in kW. The dashboard team has not independently verified source measurement calibration.' }));
    if (filled || unjoined) c.body.append(el('p', { class: 'card-foot', text: [
      filled ? filled + ' interpolated observation' + (filled === 1 ? '' : 's') + ' in this range.' : '',
      unjoined ? 'CSV rows excluded for this meter due to missing or invalid UTC hours · ' + unjoined + '.' : '',
    ].filter(Boolean).join(' ') }));
    return c.card;
  }

  function investigation(ev, scope) {
    const node = el('section', { class: 'chronos-investigation', id: 'chronos-event', 'aria-labelledby': 'chronos-event-title' });
    node.append(el('div', { class: 'chronos-investigation-head' },
      el('h4', { id: 'chronos-event-title', tabindex: '-1', text: 'Unclassified candidate anomaly' }),
      el('button', { type: 'button', class: 'btn', text: 'Close event', onclick: () => setEvent(null) })),
    el('dl', { class: 'chronos-facts' },
      fact('Event ID', ev.id), fact('Meter and model', ev.meter + ' · ' + ev.model),
      fact('Start', H.stamp(ev.start)), fact('End (exclusive)', H.stamp(ev.end)), fact('Duration', ev.duration + ' h'),
      fact('Peak raw score', score(ev.score)), fact('Observed at peak', kw(ev.actual)), fact('Expected at peak', kw(ev.expected)),
      fact('Direction', direction[ev.direction])),
      el('p', { class: 'muted', text: 'The raw score measures forecast interval exceedance. Facilities evidence is needed to establish the cause.' }));
    const rows = scope.context(ev);
    if (rows.length) {
      node.append(el('p', { class: 'muted', text: 'Total power around the event, with up to 24 hours on each side. Context can extend beyond the selected dates.' }));
      appendChart(node, 'chronos-context-chart', rows, [ev], ev, true);
    }
    return node;
  }

  function anomalies(scope, selected) {
    const c = DC.ui.card('Building anomalies', scope ? 'Chronos-2 candidate events during scored detection hours' : 'Detector outputs unavailable');
    c.card.id = 'building-anomalies';
    if (!scope || !scope.scoredHours) {
      const message = !scope ? 'Chronos-2 anomaly detection is not connected for this meter.' : !scope.rows.length ?
        'No model output in the selected campus dates.' : 'No scored detection hours in this range. Use Full available range or select dates with detection output.';
      c.body.append(el('p', { class: 'empty', id: 'buildings-detector-unavailable', text: message }));
      return c.card;
    }
    const { events, scoredHours } = scope;
    const count = events.length + ' candidate event' + (events.length === 1 ? '' : 's');
    c.body.append(el('p', { id: 'chronos-event-count', text: scope.skipped.events ?
      count + ' matched · total unavailable' : count + ' · ' + DC.fmt.int(scoredHours) + ' scored detection hours' }));
    if (scope.skipped.events) c.body.append(el('p', { class: 'muted', text: 'Some event intervals have invalid UTC bounds or no matching detection hours.' }));
    if (scope.unscoredHours) c.body.append(el('p', { class: 'muted', text: 'Detection hours with incomplete scores or flags · ' + DC.fmt.int(scope.unscoredHours) + '.' }));
    if (selected) c.body.append(investigation(selected, scope));
    if (events.length) {
      c.body.append(el('ul', { class: 'chronos-event-list', id: 'chronos-event-list' }, events.map(event => el('li', {},
        el('button', { type: 'button', class: 'btn', 'aria-pressed': String(event.id === selected?.id), 'data-focus-key': event.id,
          onclick: () => setEvent(event) }, el('strong', { text: timeRange(event) }),
          el('span', { text: event.duration + ' h · Peak raw score ' + score(event.score) + ' · ' + direction[event.direction] }))))));
    }
    return c.card;
  }

  function append(root, meter) {
    const scope = bundle?.select(meter, H.session.from, H.session.to);
    const selected = scope?.events.find(event => event.id === selectedId);
    root.append(analysis(meter, scope, selected), anomalies(scope, selected));
  }

  DC.chronosBuildings = { controls, append, get bundle() { return bundle; } };
})();
