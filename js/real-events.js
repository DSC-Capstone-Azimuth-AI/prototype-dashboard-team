/* Session-only Chronos evidence and event selection shared by all real-data views. */
(function () {
  'use strict';
  const DC = window.DC, A = DC.chronos2;
  const prefix = 'real:';
  let bundle = null, status = 'idle', error = '', pending = null;
  const scopes = new Map(), profiles = new Map(), events = new Map();
  const state = { range: 'all', meter: 'all', from: '', to: '', selected: null };
  const redraw = () => {
    if (DC.history.session.source === 'historical' && ['overview', 'investigate', 'buildings'].includes(DC.state.section)) DC.setState({});
  };
  function full(meter) {
    if (!bundle) return null;
    if (!scopes.has(meter)) scopes.set(meter, bundle.select(meter));
    return scopes.get(meter);
  }
  async function load(read) {
    if (pending) return pending;
    status = 'loading'; error = '';
    pending = (async () => {
      try {
        const next = await read();
        bundle = next;
        if (state.meter !== 'all' && !bundle.meters.includes(state.meter)) state.meter = 'all';
        scopes.clear(); profiles.clear(); events.clear();
        for (const meter of bundle.meters) for (const event of full(meter).events) events.set(event.id, event);
        status = 'ready';
      } catch (err) { error = err.message; status = 'unavailable'; }
      finally { pending = null; redraw(); }
    })();
    return pending;
  }
  function start() {
    if (status !== 'idle') return pending;
    const path = document.querySelector('meta[name="derconnect-chronos2"]')?.content;
    if (path) return load(() => A.load(path));
    status = 'unavailable';
    return null;
  }
  function scope(meter = state.meter) {
    if (!bundle) return { events: [], meters: [], series: [], scoredHours: 0, unscoredHours: 0, skippedEvents: 0, coverageStart: null, coverageEnd: null };
    const meters = meter === 'all' ? bundle.meters : bundle.meters.filter(id => id === meter);
    const series = meters.map(meter => ({ meter, ...bundle.select(meter, state.from, state.to) }));
    let coverageStart = null, coverageEnd = null;
    for (const s of series) {
      const rows = s.rows.filter(row => row.period === 'detection');
      if (!rows.length) continue;
      coverageStart = coverageStart === null ? rows[0].time : Math.min(coverageStart, rows[0].time);
      coverageEnd = coverageEnd === null ? rows.at(-1).time + A.HOUR : Math.max(coverageEnd, rows.at(-1).time + A.HOUR);
    }
    return { meters, series, coverageStart, coverageEnd, events: series.flatMap(s => s.events).sort((a, b) => b.start - a.start || a.id.localeCompare(b.id)),
      scoredHours: series.reduce((n, s) => n + s.scoredHours, 0),
      unscoredHours: series.reduce((n, s) => n + s.unscoredHours, 0),
      skippedEvents: series.reduce((n, s) => n + s.skipped.events, 0) };
  }
  const measuredPair = row => row && row.period === 'detection' && Number.isFinite(row.time) && row.filled === false &&
    Number.isFinite(row.actual) && Number.isFinite(row.q?.q50) && Number.isFinite(row.actual - row.q.q50);
  function extendsDates(event) {
    return Boolean((state.from && DC.history.localDay(event.start) < state.from) ||
      (state.to && DC.history.localDay(event.end - 1) > state.to));
  }
  function overviewMetrics(selected = scope()) {
    const countKnown = status === 'ready' && selected.skippedEvents === 0 && !(selected.scoredHours === 0 && selected.unscoredHours > 0);
    let largest = null, flagged = 0, eligible = 0, calibrationFlags = 0;
    for (const series of selected.series) for (const row of series.rows) {
      if (row.period === 'calibration' && row.flag === true) calibrationFlags++;
      if (row.period !== 'detection' || row.flag !== true) continue;
      flagged++;
      if (!measuredPair(row)) continue;
      eligible++;
      const delta = row.actual - row.q.q50;
      if (!largest || Math.abs(delta) > Math.abs(largest.delta)) largest = { meter: series.meter, row, delta, event: row.event };
    }
    const longest = selected.events.slice().sort((a, b) => b.duration - a.duration || a.start - b.start || a.id.localeCompare(b.id))[0] || null;
    return { count: countKnown ? selected.events.length : null,
      affected: countKnown ? new Set(selected.events.map(event => event.meter)).size : null, selectedMeters: selected.meters.length,
      largest, longest: countKnown ? longest : null, durationExtendsDates: longest ? extendsDates(longest) : false,
      flagged, eligible, excludedFlagged: flagged - eligible, calibrationFlags };
  }
  function eventFacts(event) {
    // Match the source wall-time key inside the event's UTC bounds. Never guess a DST instant or a raw score.
    const localPeak = DC.csv.parseTimestamp(event.peakLocal);
    const candidates = localPeak && !localPeak.zoned ? (full(event.meter)?.rows || []).filter(row => row.period === 'detection' &&
      row.time >= event.start && row.time < event.end && row.predictionLocal === event.peakLocal) : [];
    const peak = candidates.length === 1 ? candidates[0] : null;
    return { peak, delta: measuredPair(peak) ? peak.actual - peak.q.q50 : null,
      reason: !peak ? 'The exported score-peak time has no unique matching UTC prediction row.' :
        !measuredPair(peak) ? 'A finite, non-interpolated observation and aligned q50 are unavailable at the score peak.' : '',
      extendsDates: extendsDates(event) };
  }
  const readingHref = (meter, time) => '#buildings/' + encodeURIComponent('derconnect:' + meter) + '?at=' + encodeURIComponent(new Date(time).toISOString());
  function filter(patch) {
    for (const key of ['from', 'to']) if (patch[key]) DC.history.timestamp(patch[key] + 'T00:00:00Z');
    if (patch.meter && patch.meter !== 'all' && !bundle?.meters.includes(patch.meter)) throw Error('Model meter is not loaded.');
    Object.assign(state, patch);
    if ('from' in patch || 'to' in patch) state.range = state.from || state.to ? 'custom' : 'all';
  }
  const recentStart = (day, days) => new Date(Date.parse(day + 'T00:00:00Z') - (Number(days) - 1) * 86400000).toISOString().slice(0, 10);
  function setRange(value) {
    if (!['all', '7', '14', '30', 'custom'].includes(value)) throw Error('Unsupported real date range.');
    if (value === 'all') filter({ from: '', to: '' });
    else if (value !== 'custom' && bundle) {
      // Civil-date arithmetic only; observation joins/durations continue to use source UTC instants.
      const from = recentStart(bundle.to, value);
      filter({ from, to: bundle.to });
    }
    state.range = value;
  }
  // Presentation-only chart window inside the retained Overview/list scope.
  // Civil dates select original rows; no resampling, scoring or event regrouping.
  function inspectionSeries(selected, days) {
    if (!['7', '30', 'full'].includes(days)) throw Error('Unsupported chart inspection window.');
    if (days === 'full') return selected.series;
    const last = selected.series.flatMap(s => s.rows.length ? [s.rows.at(-1).day] : []).sort().at(-1);
    if (!last) return selected.series;
    const recent = recentStart(last, days);
    const from = state.from && state.from > recent ? state.from : recent;
    return selected.meters.map(meter => ({ meter, ...bundle.select(meter, from, last) }));
  }
  const href = id => '#investigate/' + encodeURIComponent(prefix + id);
  function profile(meter) {
    if (!profiles.has(meter)) profiles.set(meter, { preset: '7', from: '', to: '', focused: false, list: 'all', order: 'date', logTop: 0 });
    return profiles.get(meter);
  }
  function select(id) { state.selected = id; }
  function open(event) {
    const id = typeof event === 'string' ? event : event.id;
    select(id);
    const eventRecord = events.get(id);
    if (eventRecord) Object.assign(profile(eventRecord.meter), { focused: true });
    DC.history.session.setSource('historical');
    DC.navigate('investigate', prefix + id);
  }
  function returnToMeter(event) {
    select(event.id);
    Object.assign(profile(event.meter), { focused: true });
    DC.navigate('buildings', 'derconnect:' + event.meter);
  }
  A.session = { state, start, load, full, scope, inspectionSeries, overviewMetrics, eventFacts, measuredPair, readingHref, filter, setRange, href, profile, select, open, returnToMeter,
    isRoute: id => typeof id === 'string' && id.startsWith(prefix),
    routeId: id => id.slice(prefix.length), event: id => events.get(id) || null,
    get bundle() { return bundle; }, get status() { return status; }, get error() { return error; } };
})();
