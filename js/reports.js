/* Independent report selection and scoped report evidence. Fixture wall time is not real UTC. */
(function () {
  'use strict';
  const DC = window.DC, day = 86400000;
  const iso = t => DC.time.toDate(t).toISOString().slice(0, 16).replace('T', ' ');
  const date = t => iso(t).slice(0, 10);
  const finite = Number.isFinite;
  function preset(days, latest = false, now = new Date()) {
    const end = latest ? date(DC.META.n - 1) : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return { from: new Date(Date.parse(end + 'T00:00:00Z') - (days - 1) * day).toISOString().slice(0, 10), to: end };
  }
  function range(from, to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
    if ([from, to].some(d => !Number.isFinite(Date.parse(d + 'T00:00:00Z')) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d)) return null;
    const start = DC.time.toDate(0).getTime();
    const a = (Date.parse(from + 'T00:00:00Z') - start) / 3600000, b = (Date.parse(to + 'T00:00:00Z') + day - start) / 3600000;
    return [Math.max(0, Math.ceil(a)), Math.min(DC.META.n, Math.ceil(b))];
  }
  function build(s) {
    const customNotes = s.customNotes ?? '';
    if (typeof customNotes !== 'string' || customNotes.length > 5000) return null;
    const ev = s.type === 'anomaly' ? DC.eventById(s.event) : null;
    const bounds = ev ? [ev.start, ev.end] : range(s.from, s.to);
    const detector = ev ? ev.detector : s.detector;
    if (!bounds || bounds[0] >= bounds[1] || !DC.detectorById[detector] || (s.type === 'anomaly' && !ev) || (s.building !== 'all' && !DC.buildingById[s.building])) return null;
    const [a, b] = bounds;
    const meters = DC.D.meters.filter(m => ev ? m.id === ev.meter : (s.building === 'all' || m.building === s.building) && m.kind === 'main');
    if (!meters.length) return null;
    const ids = new Set(meters.map(m => m.id));
    const events = DC.D.events.filter(e => e.detector === detector && ids.has(e.meter) && e.start < b && e.end > a && (!ev || e.id === ev.id));
    const readings = Array.from({ length: b - a }, (_, i) => {
      const t = a + i, actual = meters.map(m => m.actual[t]), expected = meters.map(m => DC.q(m.id, 'q50', t, detector));
      return { t, actual: actual.every(finite) ? actual.reduce((x, y) => x + y, 0) : null, expected: expected.every(finite) ? expected.reduce((x, y) => x + y, 0) : null };
    });
    if (!readings.some(r => finite(r.actual))) return null;
    const rows = meters.map(m => {
      let valid = 0, ok = 0, suspect = 0, energy = 0;
      for (let t = a; t < b; t++) { if (finite(m.actual[t])) valid++; if (finite(m.actual[t]) && m.dq[t] === 0) { ok++; energy += m.actual[t]; } else suspect++; }
      return [m.id, DC.buildingById[m.building].name, `${ok}/${b-a}`, `${valid}/${b-a}`, String(suspect), DC.fmt.one(energy)];
    });
    const sections = [
      ['Scope and availability', ['Field', 'Value'], [
        ['Report', s.type], ['Scope', ev ? ev.id + ' / ' + DC.meterName(ev.meter) : s.building === 'all' ? 'Campus main meters' : DC.buildingById[s.building].name + ' / main meters'],
        ['Requested coverage', ev ? `${iso(a)} to ${iso(b)} (end exclusive)` : `${s.from} through ${s.to} (inclusive dates)`],
        ['Actual coverage', `${iso(a)} to ${iso(b)} (end exclusive)`], ['Detector', DC.detectorById[detector].label],
        ['Forecast availability', `${readings.filter(r => finite(r.expected)).length}/${readings.length} aggregate hours with all medians available`],
        ['Events', `${events.length}; pending ${events.filter(e => DC.statusById[DC.statusStore.get(e.id, e.status)]?.open).length}; high/critical ${events.filter(e => ['high','critical'].includes(e.severity)).length}; affected buildings ${new Set(events.map(e => e.building)).size}`],
        ['Measurement quality', 'See per-meter OK, finite and suspect counts below. Missing or suspect values are not imputed.']]],
      ['Readings and data quality', ['Meter', 'Building', 'OK hours', 'Finite hours', 'Suspect / absent', 'OK signed kWh subtotal'], rows],
      ['Detector output - complete overlapping events', ['ID / meter', 'Detected interval (end exclusive)', 'Classification / priority', 'Browser-local review'], events.map(e => [e.id + ' / ' + e.meter, `${iso(e.start)} to ${iso(e.end)}`, `${e.type} / ${e.category} / ${e.severity} / ${e.priority}`, DC.statusStore.get(e.id, e.status)])]
    ];
    if (ev) {
      sections.push(['Detection details - exported settings and peaks', ['Field', 'Value'], [['Detection settings', JSON.stringify(ev.detection || {})], ['Behavior', ev.behavior || 'Unavailable'], ['Score peak / deviation peak', `${iso(ev.score_peak_t ?? ev.peak_t)} / ${iso(ev.deviation_peak_t ?? ev.peak_t)}`], ['Normalized novelty', String(ev.novelty) + ' (not probability)']]]);
      sections.push(['Explanatory hypotheses - not diagnoses', ['Evidence'], (ev.explanations || []).map(x => [typeof x === 'string' ? x : x.text || JSON.stringify(x)])]);
      const context = [];
      for (const [label, values] of [['Temperature (C)', DC.D.weather?.temp], ['Cloud fraction', DC.D.weather?.cloud], ['Irradiance (W/m2)', DC.D.weather?.ghi], ['Occupancy', DC.buildingById[ev.building]?.occupancy]]) {
        const v = values?.slice(a, b).filter(finite) || [];
        context.push([label, v.length ? `${v.length}/${b-a} samples; mean ${DC.fmt.one(v.reduce((x,y)=>x+y,0)/v.length)}` : 'Unavailable']);
      }
      sections.push(['Available context - association is not cause', ['Channel', 'Coverage'], context]);
      if (s.notes) sections.push(['Operator notes - browser-local assessment, not ground truth', ['Notes'], [[DC.notesStore.get(ev.id) || 'No saved notes.']]]);
      if (s.labels) sections.push(['Research appendix - synthetic ground truth, not detector input', ['Label evidence'], DC.L.labels.filter(l => l.meter === ev.meter && l.start < b && l.end > a).map(l => [JSON.stringify(l)])]);
    }
    sections.push(['Methodology and provenance', ['Field', 'Value'], [
      ['Dataset metadata', JSON.stringify(DC.META)], ['Detector settings', JSON.stringify(DC.detectorById[detector].settings || {})],
      ['Source hashes', 'No source commit/checkpoint hash is asserted unless present in exported metadata.'],
      ['Boundaries', 'Synthetic demonstration readings and relationships; UCSD names do not establish DERCONNECT coverage. Campus wall time is encoded as UTC by the fixture solely to avoid DST shifts. Calendar presets use Los Angeles dates; this does not turn fixture times into true UTC.'],
      ['Energy', 'Hourly kW sums stand in for signed kWh. Only finite, quality-OK readings contribute to the subtotal; missing/suspect hours are excluded, never estimated. PV is excluded from building/campus main-meter totals.'],
      ['Event policy', 'Events overlap the requested range using half-open bounds. Counts and event fields describe complete events, without prorating priority, duration or impact. Overlapping events are not added as energy.'],
      ['Interpretation', 'Forecast medians are predictions, not observations. Scores and priority are not fault probabilities. Operator status is an unverified local assessment. Synthetic performance is not real-world fault-detection evidence.'],
      ['Unavailable', 'No real DERCONNECT measurements, uploaded CSV integration, verified diagnosis or shared review audit trail. Research labels are excluded unless explicitly requested.']]]);
    if (customNotes.trim()) sections.splice(1, 0, ['Custom report notes - user supplied, not verified evidence', ['Notes'], [[customNotes.trim()]]]);
    for (const section of sections) if (!section[2].length) section[2].push(['Unavailable / no records in this scope.']);
    return { sections, readings, a, b, title: `DERCONNECT ${s.type} report`, filename: `DERCONNECT-${s.type}-${ev?.id || s.building}-${date(a)}-${date(b-1)}.pdf` };
  }
  DC.reports = { preset, range, build, iso };
})();
