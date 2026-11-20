/* Shared real-event controls and evidence in the existing Overview/Investigation shells. */
(function () {
  'use strict';
  const DC = window.DC, el = DC.el, A = DC.chronos2, S = A.session, H = DC.history;
  const redraw = () => DC.setState({});
  const kw = v => v == null ? 'Unavailable' : DC.fmt.kw(v);
  const score = DC.ui.rawNumber;
  const meterHref = meter => '#buildings/' + encodeURIComponent('derconnect:' + meter);
  const number2 = value => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Unavailable';
  const power = value => Number.isFinite(value) ? number2(value) + ' kW' : 'Unavailable';
  const signedPower = value => !Number.isFinite(value) ? 'Unavailable' : (value > 0 ? '+' : '') +
    (value !== 0 && Math.abs(value) < 0.005 ? value.toExponential(2) : number2(value)) + ' kW';
  const directionText = delta => delta > 0 ? 'Above expected' : delta < 0 ? 'Below expected' : 'Matches expected';
  const fact = (label, value, fullValue = value, note = '') => el('div', { class: 'fact', 'data-fact': label },
    el('div', { class: 'k', text: label }), el('div', { class: 'v', text: value, title: String(fullValue) }),
    note ? el('div', { class: 'muted', text: note }) : null);
  function detectionDetails(event) {
    const { peak } = S.eventFacts(event);
    return el('details', { class: 'disclosure', 'data-detection-details': event.id }, el('summary', { text: 'Detection details' }),
      el('div', { class: 'facts' }, fact('Raw prediction score', score(peak?.score), peak?.score ?? 'Unavailable'),
        fact('Prediction threshold', score(peak?.threshold), peak?.threshold ?? 'Unavailable'),
        fact('Exported normalized event peak score', score(event.score), event.score), fact('Model', event.model)),
      el('p', { class: 'muted', text: peak ? 'Corresponding prediction row: ' + H.stamp(peak.time) + '. Exported score-peak campus time: ' + event.peakLocal + '.' :
        'No unique UTC prediction row matches the exported score-peak campus time; raw score and threshold are unavailable.' }),
      el('p', { class: 'muted', text: 'The model scores forecast-interval exceedance. The event peak score is normalized; near-zero thresholds, including thresholds rounded to zero in the CSV, can produce normalized scores in the millions. Raw prediction scores and normalized event scores are separate quantities, not probabilities, severity or kW. Raw scores are read directly, never reconstructed from rounded thresholds.' }));
  }
  function sourceControl() {
    const select = el('select', { id: 'investigate-source', 'aria-label': 'Investigation data source', onchange: evt => {
      H.session.setSource(evt.target.value);
      if (DC.state.routeId) DC.navigate('investigate'); else redraw();
    } }, el('option', { value: 'synthetic', text: 'Synthetic Demo' }), el('option', { value: 'historical', text: 'Real DERCONNECT' }));
    select.value = H.session.source;
    return el('label', { class: 'overview-source' }, el('span', { text: 'Investigation data source' }), select);
  }
  // Meter profiles retain a local chart window; these dates edit the shared list scope.
  function filters(id) {
    const controls = el('div', { class: 'history-controls', 'aria-label': 'Shared candidate dates' });
    const update = patch => { S.filter(patch); redraw(); };
    for (const [key, label] of [['from', 'From campus date'], ['to', 'Through campus date']]) controls.append(el('label', { class: 'filter' }, el('span', { text: label }),
      el('input', { id: id + '-' + key, type: 'date', value: S.state[key], onchange: evt => update({ [key]: evt.target.value }) })));
    controls.append(el('button', { type: 'button', class: 'btn', text: 'All candidate dates', onclick: () => update({ from: '', to: '' }) }),
      el('p', { class: 'muted', text: 'Candidate dates are shared with the Overview and event list, in America/Los_Angeles. This profile uses its own meter. Model chart presets and phase dates are separate; Selected dates additionally limits the table to the chart window.' }));
    return controls;
  }
  function ready(root) {
    S.start();
    if (S.status === 'ready') return true;
    DC.chronosBuildings.notice(root); DC.chronosBuildings.fallback(root);
    root.append(el('p', { class: 'empty', id: 'real-' + DC.state.section + '-empty', text: 'No real model events are available to display. Synthetic values are not substituted. Phase-only measurements can be loaded in Buildings or Historical Monitoring.' }));
    return false;
  }
  function eventLink(event, content = event.id) {
    return el('a', { class: 'mono', href: S.href(event.id), onclick: click => {
      if (click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
      click.preventDefault(); S.open(event);
    } }, content);
  }
  function table(events, id) {
    return el('div', { class: 'table-wrap tall' }, el('table', { id },
      el('thead', {}, el('tr', {}, ['Event / meter', 'Start (campus time)', 'Duration', 'Usage difference (kW)', 'Action'].map(text => el('th', { scope: 'col', text,
        title: text === 'Usage difference (kW)' ? DC.chronosBuildings.usageHelp : null })))),
      el('tbody', {}, events.map(event => DC.ui.eventRow(event.id, event.id === S.state.selected, () => S.open(event),
        el('td', {}, eventLink(event), el('div', { class: 'muted', text: event.meter })),
        el('td', {}, el('time', { datetime: new Date(event.start).toISOString(), text: H.stamp(event.start) })),
        el('td', { text: event.duration + ' h' }), el('td', { text: DC.chronosBuildings.usageLabel(event) }),
        el('td', {}, el('button', { type: 'button', class: 'btn', text: 'Inspect', 'data-event-id': event.id,
          'aria-label': 'Inspect ' + event.id, onclick: () => S.open(event) })))))));
  }
  const eventLogView = { logTop: 0 };
  function eventList(root, scope, id, limited = false) {
    const c = DC.ui.card(limited ? 'Recent candidate event activity' : 'Candidate event log',
      'Grouped historical detections · unverified potential anomalies', { span: 12 });
    c.card.id = id;
    const review = limited ? null : DC.realReview.tableView(S.bundle.reviewIdentity, scope.events, 'real-investigate-review-filter', () => { eventLogView.logTop = 0; redraw(); });
    const events = review ? review.events : scope.events;
    if (review) {
      c.tools.append(review.control);
      c.body.append(review.note, el('p', { class: 'muted', text: events.length + ' of ' + scope.events.length + ' candidate events match review status.' }));
    }
    c.body.append(el('p', { class: 'muted', id: limited ? 'real-overview-usage-help' : 'real-event-usage-help', text: DC.chronosBuildings.usageHelp }));
    if (events.length) c.body.append(limited ? table(events.slice(0, 5), id + '-table') :
      DC.chronosBuildings.eventTable(events, S.event(S.state.selected), eventLogView, { compact: true, id: id + '-table', statuses: review.statuses }));
    else c.body.append(el('p', { class: 'empty', text: limited ? 'No grouped candidate events match these meter and campus dates.' : 'No grouped candidate events match these meters, campus dates and review status.' }));
    if (scope.skippedEvents) c.body.append(el('p', { class: 'note-box', text: scope.skippedEvents + ' exported intervals lack usable UTC bounds or matching detection hours; only matched events are shown.' }));
    if (scope.unscoredHours && !limited) c.body.append(el('p', { class: 'muted', text: scope.unscoredHours + ' detection hours have incomplete scores, thresholds or flags.' }));
    if (limited) c.tools.append(el('a', { class: 'btn', href: '#investigate', text: 'Review all candidate events →' }));
    root.append(c.card);
  }
  function phaseOverview(root) {
    if (S.status !== 'ready') { DC.historicalOverview.render(root, true); return; }
    const body = el('div');
    root.append(el('details', { class: 'disclosure', id: 'overview-phase-measurements' }, el('summary', { text: 'Additional phase measurement overview' }), body));
    DC.historicalOverview.render(body, true);
  }
  function overview(root) {
    root.append(el('div', { class: 'section-head' }, el('div', { class: 'section-eyebrow', text: 'Historical candidate activity' }),
      el('h2', { id: 'h-overview', text: 'Real DERCONNECT Overview' }),
      el('p', { text: 'Chronos-2 hourly total active power (A+B+C) in source-reported kW. These historical model detections need facilities verification.' })));
    if (!ready(root)) { phaseOverview(root); return; }
    const scope = S.scope();
    const metrics = S.overviewMetrics(scope), kpis = el('div', { class: 'kpis' });
    const largest = metrics.largest, longest = metrics.longest;
    const largestHref = largest ? (largest.event && S.event(largest.event.id) ? S.href(largest.event.id) : S.readingHref(largest.meter, largest.row.time)) : '#investigate';
    for (const [key, label, value, note, icon, href] of [
      ['events', 'Candidate Events', metrics.count === null ? 'Unavailable' : DC.fmt.int(metrics.count),
        metrics.count === null ? 'Grouped-event evidence is incomplete; review available events.' : 'Grouped events matching selected meters and dates', 'review', '#investigate'],
      ['affected', 'Meters with Candidates', metrics.affected === null ? 'Unavailable' : metrics.affected + ' of ' + metrics.selectedMeters,
        'Selected model meters with matching grouped candidates', 'meters', '#investigate'],
      ['deviation', 'Largest Deviation from Expected', largest ? signedPower(largest.delta) : 'Unavailable',
        largest ? directionText(largest.delta) + ' · ' + largest.meter + ' · ' + H.stamp(largest.row.time) :
          metrics.flagged ? 'No finite, non-interpolated actual/q50 pair is available for the flagged readings.' : 'No eligible flagged detection readings in scope.', 'deviation', largestHref],
      ['duration', 'Longest Candidate Event', longest ? longest.duration + ' h' : 'Unavailable',
        longest ? longest.meter + ' · ' + H.stamp(longest.start) + (metrics.durationExtendsDates ? ' · Full event duration extends outside selected dates.' : ' · Full exported event duration.') :
          metrics.count === 0 ? 'No matching grouped candidate events.' : 'Grouped-event duration evidence is unavailable.', 'duration', longest ? S.href(longest.id) : '#investigate'],
    ]) {
      const card = DC.ui.kpi(label, value, null, note, icon, { href, label: label + ': ' + value + '. ' + note });
      card.dataset.realMetric = key; kpis.append(card);
    }
    root.append(kpis);
    const quality = el('details', { class: 'disclosure', id: 'real-overview-quality' }, el('summary', { text: 'Analyzed coverage & data quality' }),
      el('p', { id: 'real-analysis-coverage', text: scope.coverageStart === null ? 'Analyzed coverage: no detection records match the list filters.' :
        'Analyzed coverage: ' + H.stamp(scope.coverageStart) + ' → ' + H.stamp(scope.coverageEnd) + ' (end exclusive).' }),
      el('p', { text: scope.meters.length + ' selected / ' + S.bundle.meters.length + ' loaded model meters · ' + DC.fmt.int(scope.scoredHours) +
        ' scored detection meter-hours · ' + DC.fmt.int(scope.unscoredHours) + ' loaded detection records with incomplete outputs.' }),
      el('p', { text: metrics.flagged + ' flagged detection readings · ' + metrics.eligible + ' eligible measured actual/q50 pairs · ' + metrics.excludedFlagged +
        ' flagged readings excluded for missing, interpolated or unknown-quality measurements/forecasts. Calibration flags (' + metrics.calibrationFlags + ') are separate and excluded from candidate metrics.' }),
      el('p', { text: scope.skippedEvents + ' exported events have invalid UTC bounds or no matching detection hours. Coverage counts supplied records, not completeness across missing UTC hours.' }));
    root.append(quality);
    const grid = el('div', { class: 'grid cols-12' }); root.append(grid);
    eventList(grid, scope, 'real-overview-queue', true);
    const c = DC.ui.card('Actual vs. expected total active power',
      'Selected meter comparison · hourly kW · America/Los_Angeles · independent vertical scales · no summed campus total', { span: 12 });
    const charts = el('div', { id: 'real-overview-chart', class: 'grid cols-12' }); c.body.append(charts);
    for (const series of scope.series) {
      const comparison = el('section', { class: scope.meters.length > 1 ? 'span-6' : 'span-12', 'data-overview-chart-meter': series.meter,
        'aria-label': series.meter + ' power comparison' }, el('h4', { text: series.meter }));
      charts.append(comparison);
      if (series.rows.length) DC.chronosBuildings.appendChart(comparison, 'real-overview-chart-' + series.meter,
        series.rows, series.events, S.event(S.state.selected), event => S.open(event));
      else comparison.append(el('p', { class: 'empty', text: 'No hourly measurements match these campus dates.' }));
    }
    c.body.append(DC.ui.legend([{ kind: 'line', color: DC.css('--actual'), label: 'Observed power' },
      { kind: 'dash', color: DC.css('--seq-5'), label: 'Expected median' },
      ...(DC.chronosBuildings.showBand ? [{ kind: 'box', color: DC.css('--band-inner'), label: 'Nominal 80% forecast interval' }] : []),
      { kind: 'box', color: DC.css('--accent'), label: 'Candidate interval' }]));
    grid.append(c.card);
    const cards = el('div', { class: 'building-directory span-12' }); grid.append(cards);
    for (const id of scope.meters) {
      const data = S.bundle.select(id, S.state.from, S.state.to);
      const card = DC.ui.buildingCard({ eyebrow: 'DERCONNECT METER', name: id, href: meterHref(id), value: data.events.length,
        label: 'candidate events in scope', status: el('span', { class: 'ink2', text: 'Unverified · ' + A.MODEL }),
        measurement: data.scoredHours + ' scored detection hours', completeness: data.rows.length + ' loaded hourly records in scope', action: 'Open meter profile →' });
      card.dataset.overviewMeter = id; cards.append(card);
    }
    const diagnostics = el('details', { class: 'disclosure span-12' }, el('summary', { text: 'Model context & unavailable classifications' }),
      el('p', { text: 'Anomaly type, severity, operational priority, calibrated confidence, verified building/sub-grid names, weather/occupancy explanations and real detection-quality labels are unavailable. Raw detector scores are not probabilities or operational risk.' }));
    grid.append(diagnostics);
    phaseOverview(root);
  }
  function investigate(root) {
    root.append(el('div', { class: 'section-head' }, el('div', { class: 'section-eyebrow', text: 'Real DERCONNECT · historical model evidence' }),
      el('h2', { id: 'h-investigate', text: DC.state.routeId ? 'Event investigation' : 'Anomaly investigation' }),
      el('p', { text: (DC.state.routeId ? '' : A.MODEL + ' · ') + 'unverified candidate anomalies · hourly total power in kW · America/Los_Angeles (PST/PDT)' })));
    if (!ready(root)) return;
    const id = S.isRoute(DC.state.routeId) ? S.routeId(DC.state.routeId) : null;
    if (!id) {
      eventList(root, S.scope(), 'real-investigate-log');
      return;
    }
    S.select(id);
    const event = S.event(id);
    if (!event) {
      root.append(el('p', { class: 'empty', id: 'real-event-unavailable', text: 'Event unavailable: ' + id + '. It could not be resolved in the loaded model bundle.' }),
        el('a', { class: 'btn', href: '#investigate', text: 'Back to candidate events' }));
      return;
    }
    const all = S.full(event.meter), rows = all.context(event);
    root.append(el('nav', { class: 'breadcrumbs', 'aria-label': 'Breadcrumbs' }, el('a', { href: '#investigate', text: '← Back to candidate events' }),
      el('a', { class: 'action-link', href: meterHref(event.meter), id: 'real-return-meter', text: 'View ' + event.meter + ' chart', onclick: evt => { evt.preventDefault(); S.returnToMeter(event); } })));
    const detail = DC.ui.card('Unclassified candidate anomaly', event.meter + ' · ' + event.id, { span: 12 });
    detail.card.id = 'real-event-detail'; detail.head.remove(); root.append(detail.card);
    detail.body.append(el('div', { class: 'detail-head' }, el('div', {}, el('h3', { text: 'Unclassified candidate anomaly' }),
      el('p', { class: 'ids', text: event.meter + ' · ' + event.id }))));
    const facts = S.eventFacts(event), peak = facts.peak;
    const periodText = H.stamp(event.start) + ' → ' + H.stamp(event.end) + ' (end exclusive)';
    const periodFact = fact('Event period', periodText, periodText, 'America/Los_Angeles');
    periodFact.classList.add('event-period-fact'); periodFact.querySelector('.v').id = 'real-event-interval';
    const support = 'Actual: ' + power(peak?.actual) + ' · Expected: ' + power(peak?.q?.q50);
    const deviation = fact('Deviation at Score Peak (kW)', facts.delta === null ? 'Unavailable' :
      power(Math.abs(facts.delta)) + ' ' + directionText(facts.delta).toLowerCase(), facts.delta ?? 'Unavailable', support);
    const deviationHeading = deviation.querySelector('.k');
    deviationHeading.classList.add('real-fact-heading'); deviationHeading.append(DC.ui.metricIcon('deviation'));
    detail.body.append(el('div', { class: 'facts summary-facts' },
      fact('Meter', event.meter), periodFact,
      fact('Duration', event.duration + ' h', event.duration, facts.extendsDates ? 'Full exported duration; extends outside selected list dates.' : 'Full exported event duration.'),
      deviation),
      ...(facts.reason ? [el('p', { class: 'note-box', text: facts.reason })] : []),
      el('p', { class: 'muted', text: 'Direction (exported): ' + event.direction + '. Score peak and largest power deviation can occur at different hours. The chart includes up to 24 hours on either side, limited by available records; missing hours remain gaps. Interpolated observations are identified in hover and the hourly table. Classification, severity and diagnosis are unavailable; facilities verification is needed.' }));
    detail.body.append(detectionDetails(event));
    if (rows.length) DC.chronosBuildings.appendChart(detail.body, 'real-event-chart', rows, [event], event, null, true);
    detail.body.append(DC.ui.legend([{ kind: 'line', color: DC.css('--actual'), label: 'Observed power' },
      { kind: 'dash', color: DC.css('--seq-5'), label: 'Expected median' },
      ...(DC.chronosBuildings.showBand ? [{ kind: 'box', color: DC.css('--band-inner'), label: 'Nominal 80% forecast interval' }] : []),
      { kind: 'box', color: DC.css('--accent'), label: 'Selected event interval' }]));
    const ordered = S.scope().events, index = ordered.findIndex(e => e.id === id);
    const actions = el('div', { class: 'chronos-event-actions' });
    for (const [delta, label] of [[-1, 'Previous'], [1, 'Next']]) actions.append(el('button', { type: 'button', class: 'btn', text: label,
      disabled: index < 0 || !ordered[index + delta], onclick: () => S.open(ordered[index + delta]) }));
    detail.body.append(actions, el('p', { id: 'real-detail-scope', class: 'muted', text: index < 0 ? 'This event is outside the retained Overview / list filters (' + S.state.meter + ', ' + (S.state.from || 'loaded start') + ' through ' + (S.state.to || 'loaded end') + '). Showing the exact event with its own historical context; list filters are unchanged.' : 'Event context is the full selected event plus surrounding hours. Overview / list filters are retained separately. Previous / Next follows the filtered event log, newest first.' }));
    detail.body.append(DC.realReview.render(S.bundle.reviewIdentity, event, S.bundle.reviewIdentityError));
    const hourly = el('details', { class: 'disclosure' }, el('summary', { text: 'Supporting hourly measurements and model outputs' }));
    hourly.append(el('div', { class: 'table-wrap tall' }, el('table', { id: 'real-event-hours' },
      el('thead', {}, el('tr', {}, ['Campus timestamp', 'Observed kW', 'Expected kW', 'Raw score', 'Threshold', 'Flag', 'Observation', 'Period'].map(text => el('th', { scope: 'col', text })))),
      el('tbody', {}, rows.map(row => el('tr', { class: row.time >= event.start && row.time < event.end ? 'selected static' : 'static', 'data-utc': new Date(row.time).toISOString() },
        ...[H.stamp(row.time), kw(row.actual), kw(row.q?.q50), score(row.score), score(row.threshold),
          row.flag === null ? 'Unavailable' : row.flag ? (row.period === 'detection' ? 'Flagged' : 'Calibration flag (not a candidate)') : 'Not flagged',
          row.filled === true ? 'Interpolated' : row.actual === null ? 'Unavailable' : row.filled === false ? 'Measured' : 'Interpolation status unavailable',
          row.period || 'Unavailable'].map(text => el('td', { text }))))))));
    const unscoredHours = rows.filter(row => row.period === 'detection' && [row.score, row.threshold, row.flag].includes(null)).length;
    detail.body.append(hourly, DC.chronosBuildings.provenance({ ...all, rows, unscoredHours }));
  }
  DC.realAnomalies = { detectionDetails, eventLink, sourceControl, filters, overview, investigate };
})();
