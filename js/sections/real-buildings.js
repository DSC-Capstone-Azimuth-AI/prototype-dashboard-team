/* Real measurements in the original Buildings directory/profile components. */
(function () {
  'use strict';
  const DC = window.DC, H = DC.history, S = H.session, el = DC.el;
  const fmt = v => v === null ? 'Unavailable' : DC.fmt.kw(v);
  const redraw = () => DC.setState({});
  const prefix = 'derconnect:';
  let loading = false, error = '', token = 0, searchText = '', researchOpen = false;
  const isRoute = id => typeof id === 'string' && id.startsWith(prefix) && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(id.slice(prefix.length));
  const href = meter => '#buildings/' + encodeURIComponent(prefix + meter);
  function entries() {
    // Schema 1.0 contains facility types, not verified building identities/topology.
    // Group phases/months by stable meter ID; never infer buildings or sum channels.
    const groups = new Map();
    for (const d of S.products) {
      if (!groups.has(d.meter_id)) groups.set(d.meter_id, []);
      groups.get(d.meter_id).push(d);
    }
    return Array.from(groups, ([id, products]) => ({ id, name: id, products }));
  }
  function product(entry) {
    return entry.products.find(d => d.channel === S.selected?.channel) || entry.products[0];
  }
  const rowsFor = d => H.select(d, S.from, S.to);
  function panel(title, sub, id, span) {
    const c = DC.ui.card(title, sub, span ? { span } : {});
    if (id) c.card.id = id;
    return c;
  }
  function unavailable(c, text) { c.body.append(el('p', { class: 'empty', text })); return c; }
  function powerChart(node, records, d, options = {}) {
    if (!records.length) { node.append(el('p', { class: 'empty', text: 'No intervals match these campus dates.' })); return; }
    const origin = H.timestamp(records[0].timestamp_utc), step = d.aggregation_minutes * 60000;
    const reduced = options.daily ? records : H.catalog.plotRecords(records, Math.ceil(node.clientWidth || 700));
    const tickCount = Math.min(records.length, (node.clientWidth || 700) < 450 ? 3 : 5);
    DC.charts.timeSeries(node, {
      t0: 0, t1: records.length, height: options.height || 300,
      samples: reduced.map((r, i) => options.daily ? i : (H.timestamp(r.timestamp_utc) - origin) / step),
      xTicks: Array.from({ length: tickCount }, (_, i) => Math.round((records.length - 1) * i / Math.max(1, tickCount - 1))),
      series: [{ get: i => records[i]?.quality === 'ok' ? records[i][options.field || 'mean_kw'] : null, color: DC.css('--actual'), width: 2 }],
      xFormat: i => H.axisStamp(records[Math.min(i, records.length - 1)].timestamp_utc)[options.daily || records.length * d.aggregation_minutes > 1440 ? 0 : 1],
      tooltip: i => { const r = records[i]; return r && { title: H.stamp(r.timestamp_utc), rows: [
        { label: options.field === 'max_kw' ? 'Observed sample maximum' : 'Observed phase mean', value: fmt(r[options.field || 'mean_kw']), color: DC.css('--actual') },
        { label: 'Quality / valid slots', value: `${r.quality} · ${r.valid_observations}/${r.expected_slots}` },
      ], note: `${d.channel} · kW · ${d.aggregation_minutes}-minute UTC bins · America/Los_Angeles` }; },
    });
  }
  function dailyChart(c, d, rows) {
    const profile = H.profile(d, rows), node = el('div', { class: 'chart', id: 'buildings-history-profile' });
    if (!profile.available) { unavailable(c, 'Insufficient daily-profile support: at least 23 elapsed hours and 18 local hours with 80% supporting slots are required.'); return; }
    c.body.append(node);
    requestAnimationFrame(() => { if (!node.isConnected) return;
      DC.charts.timeSeries(node, { t0: 0, t1: 24, relativeTo: 0, height: 260,
        series: [{ get: h => profile.hours[h].mean, color: DC.css('--actual'), width: 2 }],
        tooltip: h => ({ title: `${h}:00 campus time`, rows: [{ label: 'Observed mean', value: fmt(profile.hours[h].mean) }, { label: 'Supporting slots', value: `${profile.hours[h].valid}/${profile.hours[h].expected}` }] }),
      });
      DC.$$('text', node).forEach(tx => { const match = tx.textContent.match(/^\+(\d+) h$/); if (match) tx.textContent = match[1].padStart(2, '0') + ':00'; else if (tx.textContent === 'onset') tx.textContent = '00:00'; });
    });
  }
  function controls(root) {
    const sources = S.products.flatMap(d => d.source_exports).filter(d => d.records.length);
    const first = sources.length ? sources.reduce((a, d) => a < d.start_utc ? a : d.start_utc, sources[0].start_utc) : '';
    const last = sources.length ? sources.reduce((a, d) => a > d.records.at(-1).timestamp_utc ? a : d.records.at(-1).timestamp_utc, sources[0].records.at(-1).timestamp_utc) : '';
    if (first && !S.from && !S.to) S.scope(H.localDay(first), H.localDay(last));
    const upload = el('div', { class: 'buildings-export-upload' });
    upload.append(el('label', { for: 'buildings-history-files', text: 'DERCONNECT exports' }),
      el('div', { class: 'buildings-control-actions' },
      el('input', { type: 'file', multiple: true, accept: '.json,application/json', id: 'buildings-history-files', 'aria-label': 'Add DERCONNECT JSON exports', onchange: async evt => {
        const files = Array.from(evt.target.files); if (!files.length) return;
        const mine = ++token; loading = true; error = ''; redraw();
        try { const exports = await H.catalog.readFiles(files); if (mine === token) S.add(exports, 'Buildings loader'); }
        catch (err) { if (mine === token) { error = err.message; S.failed(error); } }
        finally { if (mine === token) { loading = false; redraw(); } }
      } }), el('button', { type: 'button', class: 'btn', id: 'buildings-history-clear', text: 'Clear loaded exports', disabled: !S.products.length && !loading, onclick: () => { token++; loading = false; error = ''; S.clear(); redraw(); } })),
      el('p', { class: 'muted', id: 'buildings-loaded-meters', text: S.products.length ? 'Loaded meters: ' + entries().map(e => e.id).join(', ') + ` · ${S.products.reduce((n, d) => n + d.source_exports.length, 0)} export(s)` : 'No DERCONNECT exports loaded.' }));
    root.append(upload);
    const dates = el('div', { class: 'buildings-date-range' });
    for (const [label, key, value] of [['From', 'from', S.from], ['To', 'to', S.to]]) dates.append(el('label', { class: 'filter' }, el('span', { text: label }), el('input', { type: 'date', id: 'buildings-history-' + key, value, disabled: !first,
      onchange: evt => { S.scope(key === 'from' ? evt.target.value : S.from, key === 'to' ? evt.target.value : S.to); redraw(); } })));
    root.append(dates, el('div', { class: 'buildings-control-actions' }, el('button', { type: 'button', class: 'btn', text: 'Full available range', disabled: !first, onclick: () => { S.scope('', ''); redraw(); } })),
      el('p', { role: 'status', class: 'muted', id: 'buildings-history-notice', text: loading ? 'Loading DERCONNECT exports…' : S.notice }));
    if (error) root.append(el('p', { role: 'alert', class: 'csv-status rejected', id: 'buildings-history-error', text: error }));
  }
  function research(root, list) {
    const grid = el('div', { class: 'grid cols-12' }); root.append(grid);
    const all = list.map(entry => ({ entry, d: product(entry) }));
    const d = S.selected || all[0]?.d;
    const mean = panel('Electricity consumption', 'Energy unavailable; compare observed mean phase power in kW', null, 4);
    const chart = el('div', { class: 'chart', id: 'buildings-history-comparison' }); mean.body.append(chart);
    const peers = all.filter(p => p.d.channel === d?.channel).map(p => ({ ...p, summary: H.summarize(rowsFor(p.d)) })).filter(p => p.summary.mean !== null);
    requestAnimationFrame(() => { if (chart.isConnected) DC.charts.hbar(chart, { labelW: 150, valueW: 78, items: peers.map(p => ({ label: p.entry.name, value: Math.abs(p.summary.mean), display: fmt(p.summary.mean), color: DC.css('--seq-4'), onClick: () => DC.navigate('buildings', prefix + p.entry.id) })) }); });
    mean.body.append(el('p', { class: 'card-foot', text: 'Same phase only; each meter uses its own available support. Bars show magnitude and labels retain signs. No energy or combined total is inferred.' }));
    const missing = (title, span, text = 'Unavailable — anomaly detection is not connected for these measurements.') => unavailable(panel(title, '', null, span), text).card;
    const historical = missing('Historical demand pattern: deviation from expected', 6, 'Unavailable — no forecast or expected-demand baseline is supplied.');
    const daily = panel('Typical daily profile', 'Observed mean phase power by campus hour; no clean-history baseline', null, 6);
    const peak = panel('Peak demand analysis', 'Daily maximum observed sample in usable bins; no operating threshold', null, 6);
    if (d) {
      const rows = rowsFor(d); dailyChart(daily, d, rows);
      const days = new Map();
      for (const r of rows) { const day = H.localDay(r.timestamp_utc); if (!days.has(day)) days.set(day, { ...r, max_kw: null, quality: 'missing' }); if (r.quality === 'ok' && (days.get(day).max_kw === null || r.max_kw > days.get(day).max_kw)) days.set(day, r); }
      const node = el('div', { class: 'chart' }); peak.body.append(node);
      requestAnimationFrame(() => { if (node.isConnected) powerChart(node, Array.from(days.values()), d, { daily: true, field: 'max_kw', height: 240 }); });
    } else { unavailable(daily, 'No exports loaded.'); unavailable(peak, 'No exports loaded.'); }
    for (const [title, cards, open] of [
      ['Building comparisons & sub-grid health', [mean.card, missing('Anomaly frequency', 4), missing('Estimated excess energy', 4), missing('Building-level anomaly frequency & severity', 6), missing('Sub-grid health', 6, 'Unavailable — verified building and feeder relationships are not supplied; no meter totals are inferred.')], true],
      ['Historical patterns', [historical, daily.card], false], ['Peak demand', [peak.card], false],
      ['Load decomposition', [missing('Load decomposition', 6, 'Unavailable — no validated decomposition or clean-history reference is supplied.')], false],
      ['Solar & measurement availability', [missing('Solar generation context', 6, 'Unavailable — no verified PV association, weather or irradiance context is supplied.'), missing('Power quality', 6, 'Unavailable — these exports contain active power, not voltage or frequency.')], false],
    ]) grid.append(el('details', { class: 'disclosure span-12 analysis-group', open }, el('summary', { text: title }), el('div', { class: 'grid cols-12' }, cards)));
  }
  function directory(root, list) {
    const grid = el('div', { class: 'building-directory' });
    const search = el('input', { type: 'search', placeholder: 'Search buildings…', 'aria-label': 'Search buildings', value: searchText });
    function draw() {
      DC.clear(grid);
      for (const entry of list.filter(e => e.name.toLowerCase().includes(search.value.toLowerCase()))) {
        const d = product(entry), summary = H.summarize(rowsFor(d));
        const card = DC.ui.buildingCard({ eyebrow: (d.measurement_kind === 'synthetic_fixture' ? 'Synthetic fixture · ' : 'Meter · ') + entry.id, name: entry.name, href: href(entry.id),
          value: fmt(summary.mean), label: 'average observed power', status: el('span', { class: 'muted', text: 'Anomaly detection unavailable' }),
          measurement: `Peak sample: ${fmt(summary.peak)} · ${d.channel}`,
          completeness: `${entry.products.length} loaded phase${entry.products.length === 1 ? '' : 's'} · ${DC.fmt.pct(summary.coverage, 1)} data coverage`, action: 'Open meter profile →' });
        card.dataset.realMeter = entry.id; grid.append(card);
      }
      if (!grid.children.length) grid.append(el('p', { class: 'empty', id: list.length ? 'buildings-history-search-empty' : 'buildings-history-empty', text: list.length ? 'No meters match your search.' : 'No DERCONNECT exports have been loaded. Add JSON exports below; available meter cards will appear automatically.' }));
    }
    search.addEventListener('input', () => { searchText = search.value; draw(); }); root.append(search, grid); draw();
    const details = el('details', { class: 'disclosure', open: researchOpen }, el('summary', { text: 'Advanced building & sub-grid analysis' }), el('div'));
    details.addEventListener('toggle', () => { if (!details.isConnected) return; researchOpen = details.open; if (details.open && !details.lastChild.children.length) research(details.lastChild, list); });
    root.append(details); if (researchOpen) research(details.lastChild, list);
  }
  function profile(root, entry) {
    const d = product(entry); if (S.selected !== d) S.select(d.meter_id + '/' + d.channel);
    const rows = rowsFor(d), summary = H.summarize(rows);
    root.prepend(el('nav', { class: 'breadcrumbs', 'aria-label': 'Breadcrumbs' }, el('a', { href: '#buildings', text: '← All buildings' })));
    root.append(el('p', { class: 'muted', id: 'buildings-history-kind', text: d.measurement_kind === 'synthetic_fixture' ? 'Synthetic test fixtures — not actual DERCONNECT measurements.' : 'Real DERCONNECT historical measurements — signs and calibration remain unverified.' }),
      el('p', { class: 'muted', id: 'buildings-history-available', text: `${d.meter_id} · ${d.channel} · kW · ${d.aggregation_minutes}-minute bins · America/Los_Angeles (PST/PDT). Facility classification: ${d.facility_type || 'unavailable'}. Building and sub-grid identity unavailable.` }));
    const stats = el('div', { class: 'kpis' });
    for (const [label, value] of [['Events requiring review', 'Unavailable'], ['High / critical events', 'Unavailable'], ['Data completeness', DC.fmt.pct(summary.coverage, 4)], ['Electricity use', 'Unavailable']]) stats.append(el('div', { class: 'card kpi' }, el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value })));
    root.append(stats);
    const anomalies = unavailable(panel('Building anomalies', 'Detector outputs unavailable', 'building-anomalies'), 'Anomaly detection is not connected for these measurements. Counts, severity and event review are unavailable.');
    anomalies.body.firstChild.id = 'buildings-detector-unavailable'; root.append(anomalies.card);
    const demand = panel('Actual vs. expected electricity demand', `${d.meter_id} · ${d.channel} · observed kW; expected demand unavailable`, 'building-demand');
    demand.body.append(el('p', { class: 'demand-summary' }, 'Average observed power: ', el('span', { 'data-buildings-history-fact': 'Average observed power', text: fmt(summary.mean) }), ` · Peak observed sample: ${fmt(summary.peak)}.`));
    const node = el('div', { class: 'chart', id: 'buildings-history-chart' }); demand.body.append(node, DC.ui.legend([{ kind: 'line', color: DC.css('--actual'), label: 'Actual' }])); root.append(demand.card);
    if (!rows.length) node.append(el('p', { class: 'empty', id: 'buildings-history-empty-range', text: 'No intervals match these campus dates. Check date order or select Full available range.' }));
    else requestAnimationFrame(() => { if (node.isConnected) powerChart(node, rows, d); });
    const history = panel('Historical comparison', 'Daily demand profile from observed power; clean-history comparison unavailable');
    dailyChart(history, d, rows); history.body.append(el('p', { class: 'card-foot', text: 'Sample-weighted mean by campus hour; repeated DST hours retain their support. Missing/rejected bins remain gaps. No clean-history baseline is inferred.' })); root.append(history.card);
    const meters = panel('Available meters', 'Loaded phases for this meter; no phase totals or building mapping inferred');
    meters.body.append(DC.ui.segmented(entry.products.map(p => [p.channel, p.channel]), d.channel, channel => { S.select(entry.id + '/' + channel); redraw(); }, 'Measurement channel'));
    meters.body.append(el('p', { id: 'buildings-history-quality', text: `${summary.usable} usable / ${summary.unavailable} unavailable intervals · ${summary.valid}/${summary.expected} valid slots. ` + Object.entries(summary.reasons).map(([reason, n]) => `${reason}: ${n}`).join(' · ') }),
      el('p', { text: `${d.catalog.conflicting_bins} conflicting overlap bins withheld; identical bins count once. No energy calculation. Peak is the maximum sample in usable bins, not billing demand.` }),
      el('p', { text: 'Loaded ranges (end exclusive): ' + d.source_exports.map(s => `[${H.stamp(s.start_utc)}, ${H.stamp(s.end_utc)})`).join('; ') }));
    if (S.products.filter(p => p.channel === d.channel).length > 1) meters.tools.append(el('button', { type: 'button', class: 'btn action-link', id: 'buildings-history-compare', text: 'Compare synchronized measurements', onclick: () => { DC.historyComparison.useSharedSelection('meters'); S.requestComparison(); DC.navigate('historical'); } }));
    meters.body.append(el('a', { class: 'action-link', href: '#historical', text: 'Open Historical Monitoring →' }), el('details', { class: 'disclosure' }, el('summary', { text: 'Source and transformation provenance' }), el('pre', { class: 'technical-json', text: JSON.stringify(d.provenance, null, 2) })));
    root.append(meters.card);
  }
  function render(root) {
    const list = entries(), id = isRoute(DC.state.routeId) ? DC.state.routeId.slice(prefix.length) : null, entry = list.find(e => e.id === id);
    root.append(el('div', { class: 'section-head' }, el('div', { class: 'section-eyebrow', text: entry ? 'Meter profile' : 'Location analysis' }), el('h2', { id: 'h-buildings', text: entry ? entry.name : 'Buildings' }), el('p', { text: entry ? `DERCONNECT · ${entry.id} · historical measured power` : 'Find a meter, check its electricity profile and review available measurements.' })));
    if (entry) profile(root, entry); else directory(root, list);
  }
  DC.realBuildings = { render, controls, entries, isRoute };
})();
