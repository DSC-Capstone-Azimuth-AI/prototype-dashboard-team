(function () {
  'use strict';
  const DC = window.DC, el = DC.el, R = DC.reports;
  const types = { snapshot: 'General snapshot', building: 'Building report', anomaly: 'Anomaly report' };
  const s = { type: 'snapshot', building: 'all', meter: 'all', detector: DC.D.detectors[0].id, event: DC.D.events[0]?.id, preset: '1', ...R.preset(1), notes: false, labels: false, customNotes: '' };
  const datesByType = {}, notesByType = {};
  let helpOpen = false, notice = '';
  const lastDate = () => R.iso(DC.META.n - 1).slice(0, 10);
  const meterLabel = m => `${DC.buildingById[m.building].name} — ${m.kind === 'pv' ? 'Solar generation (PV)' : 'Main demand'}`;
  const categoryLabel = e => DC.CATEGORY_LABEL[e.category] || DC.typeById[e.type]?.label || e.category || 'Unclassified';
  function applyPreset() {
    if (s.preset === 'all') { s.from = R.iso(0).slice(0, 10); s.to = lastDate(); }
    else if (s.preset !== 'custom') Object.assign(s, R.preset(Number(s.preset.replace('latest-', '')), s.preset.startsWith('latest-')));
  }
  function change(key, value) {
    notice = '';
    if (key === 'type') {
      datesByType[s.type] = { preset: s.preset, from: s.from, to: s.to };
      const previous = s.type;
      notesByType[previous] = s.customNotes;
      s.customNotes = notesByType[value] || '';
      s.type = value;
      if (datesByType[value]) { Object.assign(s, datesByType[value]); notice = `Restored ${types[value]} dates. Building and detector are retained where compatible.`; }
      else if (value === 'anomaly') { s.preset = 'all'; applyPreset(); notice = 'Anomaly dates start at All available dates. Building and detector are retained.'; }
      else if (value === 'building') { s.preset = 'custom'; notice = `Using the dates from ${types[previous]}. Building reports show editable date fields.`; }
      else if (s.preset === 'all') { s.preset = 'custom'; notice = 'Using the previous dates as a Custom range.'; }
    } else {
      s[key] = value;
      if (key === 'preset') applyPreset();
      if (key === 'from' || key === 'to') s.preset = 'custom';
    }
    if (s.type === 'building' && s.building === 'all') { s.building = DC.D.buildings[0].id; notice += ` Building report requires one building; selected ${DC.buildingById[s.building].name}.`; }
    const meter = DC.meterById[s.meter];
    if (s.meter !== 'all' && (!meter || (s.building !== 'all' && meter.building !== s.building))) { s.meter = 'all'; notice += ' Meter reset to All meters for this building.'; }
  }
  function help() {
    const box = el('details', { class: 'disclosure report-help', id: 'report-help', open: helpOpen }, el('summary', { text: 'Need Help?' }));
    box.addEventListener('toggle', () => { helpOpen = box.open; });
    box.append(
      el('h3', { text: 'Choose the report you need' }),
      el('p', { text: 'Anomaly report covers one detected event. Building report summarizes one building over your dates. General snapshot summarizes all buildings or one selected building. Reports use the synthetic demonstration dataset, not files in CSV Upload.' }),
      el('h3', { text: 'Export an anomaly in six steps' }),
      el('ol', {}, ...[
        'Choose Anomaly report, then the building you want (or All buildings).',
        'Choose a detector. Each detector looks for unusual readings differently and has its own event list; changing it may change the available anomalies.',
        'Start with All available dates, or choose Custom range to reveal date fields.',
        'Choose All meters or a specific meter. Main demand measures building electricity demand; solar generation (PV) measures photovoltaic production.',
        'Select the anomaly ID and check its category, meter, dates and detector in the preview.',
        'Optionally write Custom report notes or include saved operator notes, then choose Download PDF. Find the saved file in browser Downloads.'
      ].map(text => el('li', { text }))),
      el('h3', { text: 'If no events appear' }),
      el('p', { text: 'Building, detector, meter and dates all restrict the list together. All buildings does not clear a specific meter. Try All buildings, All meters and All available dates, then another detector. No matching detections does not prove the readings are normal.' }),
      el('h3', { text: 'Understand the dates' }),
      el('p', { text: `Today and Last N days use the current calendar date in America/Los_Angeles, including today. The loaded demonstration runs from ${R.iso(0).slice(0, 10)} through ${lastDate()}. Use latest available data explicitly anchors the window to ${lastDate()}; it does not fetch data or rerun detectors. Latest windows are labeled with that anchor.` }),
      el('p', { text: 'Custom From and Through dates include both days for building and snapshot summaries. Anomaly dates find events overlapping that range; the anomaly PDF covers the entire selected event. Date selections are remembered separately for each report type during this session. Building and detector carry over where compatible; any required reset is announced. Check the preview after switching.' }),
      el('h3', { text: 'Read the evidence and protect your notes' }),
      el('p', { text: 'Measured readings are observations; the predicted median is a model estimate of expected demand. Differences and explanatory hypotheses are not confirmed equipment faults. Saved notes and review status are local to this browser; status records a human assessment, not verified ground truth. Saved operator notes are included only when checked. Custom report notes are a separate draft for each report type, included when nonblank. They are not saved to investigations or browser storage; reload clears them. Check the draft before downloading.' }),
      el('p', { text: 'Leave the synthetic ground-truth appendix off for routine reports. It contains injected simulation labels used for research, not confirmed real-world faults. The preview checks report content, not exact PDF page layout. Closing preview disclosures does not remove their content from the PDF.' }),
      el('details', { class: 'disclosure' }, el('summary', { text: 'Optional glossary' }), el('dl', {}, ...[
        ['End exclusive', 'The final timestamp is outside the interval. A 10:00–12:00 hourly event includes the 10:00 and 11:00 samples.'],
        ['Data completeness', 'OK hours pass the fixture quality flags; finite hours have numeric readings and may still be suspect. Missing or suspect values are not filled in.'],
        ['Energy subtotal', 'The signed sum of quality-OK hourly kW readings, treated as kWh in this fixture. It excludes missing/suspect hours and is not a verified waste or savings estimate. Building/campus totals use main meters, excluding PV.'],
        ['Novelty score', 'A normalized detector score indicating how unusual an event is under that detector. It is not the probability of a fault.'],
        ['Provenance', 'Information about where the dataset, detector and settings came from.'],
        ['Fixture time', 'The demonstration encodes campus wall time as UTC to avoid clock shifts. This is not a real-data timezone conversion.']
      ].flatMap(([term, text]) => [el('dt', { text: term }), el('dd', { text })])))
    );
    return box;
  }
  function render(root, focusId) {
    DC.clear(root);
    root.append(el('div', { class: 'section-head' }, el('h2', { id: 'h-export', text: 'Export Reports' }), el('p', { text: 'Build a scoped, searchable PDF. Selection is independent of dashboard filters. Uploaded CSVs are not included.' })), help());
    const controls = el('div', { class: 'report-controls' }); root.append(controls);
    function select(label, key, options) {
      const input = el('select', { id: 'report-' + key, onchange: e => { change(key, e.target.value); render(root, input.id); } }, options.map(([value, text]) => el('option', { value, text })));
      input.value = s[key]; controls.append(el('label', { for: input.id }, el('span', { text: label }), input));
    }
    select('Report type', 'type', Object.entries(types));
    select('Building', 'building', [...(s.type !== 'building' ? [['all', 'All buildings']] : []), ...DC.D.buildings.map(b => [b.id, b.name])]);
    select('Detector', 'detector', DC.D.detectors.map(d => [d.id, d.label]));
    const detectorHint = el('p', { class: 'muted', id: 'report-detector-help', text: 'Each detector produces its own list of events. Changing it may change which anomalies are available.' });
    controls.querySelector('#report-detector').setAttribute('aria-describedby', 'report-detector-help');
    controls.querySelector('#report-detector').parentElement.append(detectorHint);
    if (s.type !== 'building') {
      const options = [...(s.type === 'anomaly' ? [['all', 'All available dates']] : []), ['1', 'Today'], ['3', 'Last 3 days'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['custom', 'Custom range']];
      if (s.preset.startsWith('latest-')) options.push([s.preset, `Latest ${s.preset.slice(7)} day(s) ending ${lastDate()}`]);
      select('Date preset', 'preset', options);
    }
    if (s.type === 'building' || s.preset === 'custom') for (const [key, label] of [['from', 'From (inclusive)'], ['to', 'Through (inclusive)']]) {
      const input = el('input', { type: 'date', id: 'report-' + key, value: s[key], onchange: e => { change(key, e.target.value); render(root, input.id); } });
      controls.append(el('label', { for: input.id }, el('span', { text: label }), input));
    }
    if (s.type === 'anomaly') {
      select('Meter', 'meter', [['all', 'All meters'], ...DC.D.meters.filter(m => s.building === 'all' || m.building === s.building).map(m => [m.id, meterLabel(m)])]);
      controls.append(el('p', { class: 'muted', text: s.meter === 'all' ? 'All meters within the selected building scope.' : `Meter restriction remains active: ${meterLabel(DC.meterById[s.meter])}. All buildings retains this meter selection.` }));
      const bounds = R.range(s.from, s.to);
      const events = DC.D.events.filter(e => e.detector === s.detector && (s.building === 'all' || e.building === s.building) && (s.meter === 'all' || e.meter === s.meter) && bounds && e.start < bounds[1] && e.end > bounds[0]);
      if (!events.some(e => e.id === s.event)) s.event = events[0]?.id || '';
      select('Anomaly ID / category / meter / date', 'event', events.length ? events.map(e => [e.id, `${e.id} / ${categoryLabel(e)} / ${e.meter} / ${R.iso(e.start)}`]) : [['', 'No anomalies match these filters']]);
      controls.querySelector('#report-event').disabled = !events.length;
      if (!events.length) controls.append(el('p', { id: 'report-no-events', role: 'status', text: `No anomalies match these filters: ${DC.detectorById[s.detector].label}, ${s.building === 'all' ? 'all buildings' : DC.buildingById[s.building].name}, ${s.meter === 'all' ? 'all meters' : meterLabel(DC.meterById[s.meter])}, ${s.from} through ${s.to}. Try broader building/meter/date filters or another detector. No matching detections does not prove normal operation.` }));
      for (const [key, label] of [['notes', 'Include saved operator notes'], ['labels', 'Include synthetic ground-truth research appendix']]) controls.append(el('label', {}, el('input', { type: 'checkbox', id: 'report-' + key, checked: s[key], onchange: e => { s[key] = e.target.checked; render(root, 'report-' + key); } }), el('span', { text: label })));
    }
    root.append(el('p', { role: 'status', id: 'report-selection-notice', text: notice }), el('p', { class: 'muted', id: 'report-date-scope', text: `${s.preset.startsWith('latest-') ? 'Historical latest-data anchor: ' + lastDate() + '. ' : ''}Selected dates: ${s.from} through ${s.to} (inclusive). ${s.type === 'anomaly' ? 'Dates find overlapping events; the PDF covers the complete selected event.' : 'Summary coverage is clipped to available readings.'}` }));
    if (s.preset !== 'all' && !s.preset.startsWith('latest-')) root.append(el('button', { class: 'btn', type: 'button', text: 'Use latest available data', onclick: () => { s.preset = 'latest-' + (s.preset === 'custom' ? 7 : s.preset); applyPreset(); notice = `Using historical data ending ${lastDate()}. No new data was fetched.`; render(root, 'report-download'); } }));
    const notePreview = el('section', { id: 'report-custom-notes-preview', hidden: !s.customNotes.trim() }, el('h3', { text: 'Custom report notes — user supplied, not verified evidence' }));
    const noteText = el('p', { class: 'report-note-text', text: s.customNotes.trim() }); notePreview.append(noteText);
    const counter = el('span', { id: 'report-notes-count', text: `${s.customNotes.length}/5000 characters` });
    const noteInput = el('textarea', { id: 'report-custom-notes', rows: 5, maxlength: 5000, value: s.customNotes, 'aria-describedby': 'report-custom-notes-hint report-notes-count', oninput: e => {
      s.customNotes = e.target.value;
      notePreview.hidden = !s.customNotes.trim(); noteText.textContent = s.customNotes.trim();
      counter.textContent = `${s.customNotes.length}/5000 characters`;
    } });
    noteInput.value = s.customNotes;
    root.append(el('div', { class: 'report-note-editor' }, el('label', { for: 'report-custom-notes', text: 'Custom report notes (optional)' }), el('p', { id: 'report-custom-notes-hint', class: 'muted', text: 'Nonblank text is included in this PDF as your comments, separate from saved investigation notes and detector evidence. Drafts are kept separately for each report type until reload; they are not saved to investigations. Review or clear before downloading.' }), noteInput, counter,
      el('button', { type: 'button', class: 'btn', text: 'Clear custom notes', onclick: () => { s.customNotes = ''; noteInput.value = ''; noteText.textContent = ''; notePreview.hidden = true; counter.textContent = '0/5000 characters'; noteInput.focus(); } })));
    const report = R.build(s), status = el('p', { role: 'status', id: 'report-status' });
    const download = el('button', { type: 'button', class: 'btn primary', id: 'report-download', disabled: !report, text: 'Download PDF', onclick: () => {
      try { const current = R.build(s); if (!current) return; R.pdf(current).save(current.filename); status.textContent = 'PDF generated; download requested. Check your browser downloads.'; }
      catch (e) { status.textContent = 'PDF could not be generated: ' + e.message; }
    } });
    root.append(download, status);
    const preview = el('div', { id: 'report-preview' }); root.append(preview);
    if (!report) preview.append(el('p', { class: 'empty', text: 'No reportable data in this scope. Check dates and selection. For historical demonstration data, choose a matching range or use the latest-data action when available. Export is disabled.' }));
    else {
      preview.append(el('h3', { text: 'Report preview' }), el('p', { text: 'Synthetic demonstration. Preview checks content, not exact PDF pagination. Closed sections remain included in the PDF.' }));
      const scope = report.sections[0][2];
      const selectedEvent = s.type === 'anomaly' ? DC.eventById(s.event) : null;
      if (selectedEvent) preview.append(el('p', { id: 'report-selected-event', text: `${selectedEvent.id} / ${categoryLabel(selectedEvent)} / ${meterLabel(DC.meterById[selectedEvent.meter])}` }));
      preview.append(el('dl', { class: 'report-scope', id: 'report-scope-summary' }, ...scope.filter(([key]) => ['Report', 'Scope', 'Requested coverage', 'Actual coverage', 'Detector'].includes(key)).flatMap(([key, value]) => [el('dt', { text: key }), el('dd', { text: key === 'Report' ? types[value] : value })])));
      preview.append(el('p', { id: 'report-chart-legend', text: 'Solid line: measured readings (kW). Dashed line: predicted median, an estimate of expected demand (kW).' }));
      preview.append(notePreview);
      const chart = el('div', { class: 'chart' }); preview.append(chart);
      requestAnimationFrame(() => { if (chart.isConnected) DC.charts.timeSeries(chart, { t0: report.a, t1: report.b, height: 230, series: [{ get: t => report.readings[t - report.a]?.actual, color: DC.css('--actual') }, { get: t => report.readings[t - report.a]?.expected, color: DC.css('--expected'), dash: '4 3' }] }); });
      for (const [title, head, body] of report.sections) {
        if (title.startsWith('Custom report notes')) continue;
        const technical = title.startsWith('Methodology') || title.startsWith('Detection details');
        let rows = body;
        if (title.startsWith('Detector output')) rows = body.map(row => {
          const e = DC.eventById(row[0].split(' / ')[0]);
          return e ? [row[0], row[1], `${DC.typeById[e.type]?.label || e.type} / ${categoryLabel(e)} / ${DC.sevById[e.severity]?.label || e.severity} / ${e.priority}`, DC.statusById[DC.eventStatus(e)]?.label || row[3]] : row;
        });
        preview.append(el('details', { class: 'disclosure', open: !technical }, el('summary', { text: technical ? 'Technical details: ' + title : title }), el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, head.map(text => el('th', { text })))), el('tbody', {}, rows.map(row => el('tr', {}, row.map(text => el('td', { text })))))))));
      }
    }
    if (focusId) root.querySelector('#' + focusId)?.focus({ preventScroll: true });
  }
  DC.sections.export = { render };
})();
