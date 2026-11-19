/* Timestamp-based history, independent of the synthetic indexed store. */
(function () {
  "use strict";
  const DC = window.DC, H = DC.history, el = DC.el;
  let data = null, error = "", loading = false, started = false, token = 0, from = "", to = "", chartId = 0, comparisonOpen = false, sessionVersion = -1;
  const number = v => v === null ? "Unavailable" : DC.fmt.kw(v);
  const redraw = () => { if (DC.state.section === "historical") DC.setState({}); };
  const svgNode = (tag, attrs, parent) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent?.append(node); return node;
  };
  async function read(task) {
    const mine = ++token;
    loading = true; data = null; error = ""; from = ""; to = ""; redraw();
    try { const next = await task(); if (mine === token) { H.session.add(Array.isArray(next) ? next : [next], "historical loader"); data = H.session.selected; } }
    catch (err) { if (mine === token) { error = err instanceof SyntaxError ? "Historical export is not valid JSON." : err.message || "Could not read the historical export."; H.session.failed(error); } }
    finally { if (mine === token) { loading = false; redraw(); } }
  }

  function chart(node, records, daily = false, product = data) {
    const W = Math.max(240, node.clientWidth || 700), height = 280;
    const m = { l: 52, r: 16, t: 22, b: 48 }, iw = W - m.l - m.r, ih = height - m.t - m.b;
    const means = records.map(r => daily ? r.mean : r.mean_kw).filter(v => v !== null);
    let low = 0, high = 0;
    for (const value of means) { low = Math.min(low, value); high = Math.max(high, value); }
    if (low === high) { low -= 1; high += 1; }
    const pad = (high - low) * 0.08; low -= pad; high += pad;
    const a = daily ? 0 : H.timestamp(records[0].timestamp_utc);
    const b = daily ? 24 : H.timestamp(records[records.length - 1].timestamp_utc) + product.aggregation_minutes * 60000;
    const x = v => m.l + (v - a) / (b - a) * iw, y = v => m.t + ih - (v - low) / (high - low) * ih;
    const svg = svgNode("svg", { viewBox: `0 0 ${W} ${height}`, width: W, height, role: "img",
      "aria-label": daily ? "Mean observed phase power by campus-local hour in kW" : "Observed phase power in kW; shaded intervals are unavailable" });
    node.append(svg);
    const axis = svgNode("g", { class: "ax" }, svg);
    svgNode("text", { x: 8, y: 14 }, axis).textContent = "kW";
    for (let i = 0; i <= 4; i++) {
      const v = low + (high - low) * i / 4;
      svgNode("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "gridline" }, axis);
      svgNode("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, axis).textContent = DC.fmt.one(v);
    }
    const count = iw < 450 ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const t = a + (b - a) * i / (count - 1);
      const label = svgNode("text", { x: x(t), y: height - 28, "text-anchor": i === 0 ? "start" : i === count - 1 ? "end" : "middle" }, axis);
      if (daily) label.textContent = `${Math.round(t)}:00`;
      else H.axisStamp(t).forEach((text, j) => { svgNode("tspan", { x: x(t), dy: j ? 15 : 0 }, label).textContent = text; });
    }
    if (daily) {
      for (const r of records) {
        if (r.mean === null) continue;
        const rect = svgNode("rect", { x: x(r.hour) + 1, y: Math.min(y(0), y(r.mean)), width: Math.max(1, iw / 24 - 2),
          height: Math.max(1, Math.abs(y(0) - y(r.mean))), fill: DC.css("--actual"), "data-history-hour": r.hour }, svg);
        svgNode("title", {}, rect).textContent = `${r.hour}:00 campus time · ${number(r.mean)} · ${r.bins} usable bins · ${r.valid}/${r.expected} supporting slots`;
      }
      return;
    }
    const patternId = "history-gaps-" + ++chartId;
    const defs = svgNode("defs", {}, svg), pattern = svgNode("pattern", { id: patternId, width: 6, height: 6, patternUnits: "userSpaceOnUse" }, defs);
    svgNode("path", { d: "M0 6L6 0", stroke: DC.css("--ink-2"), "stroke-width": 1, opacity: 0.4 }, pattern);
    let path = "", previous = false, run = null;
    const step = product.aggregation_minutes * 60000;
    const endGap = end => {
      if (run === null) return;
      svgNode("rect", { x: x(run), y: m.t, width: Math.max(1, x(end) - x(run)), height: ih,
        fill: `url(#${patternId})`, "data-history-gap": "" }, svg); run = null;
    };
    for (const r of H.catalog.plotRecords(records, Math.ceil(iw))) {
      const t = H.timestamp(r.timestamp_utc);
      if (r.quality !== "ok") { previous = false; if (run === null) run = t; continue; }
      endGap(t);
      path += `${previous ? "L" : "M"}${x(t).toFixed(2)},${y(r.mean_kw).toFixed(2)}`; previous = true;
      const point = svgNode("circle", { cx: x(t), cy: y(r.mean_kw), r: records.length < 200 ? 2.5 : 1,
        fill: DC.css("--actual"), "data-history-point": "" }, svg);
      svgNode("title", {}, point).textContent = `${H.stamp(t)} · ${number(r.mean_kw)} · ${DC.fmt.pct(r.coverage)} coverage`;
    }
    endGap(b);
    svgNode("path", { d: path, fill: "none", stroke: DC.css("--actual"), "stroke-width": 2, "data-history-line": "" }, svg);
    const hit = svgNode("rect", { x: m.l, y: m.t, width: iw, height: ih, class: "hit" }, svg);
    hit.addEventListener("mousemove", evt => {
      const box = svg.getBoundingClientRect(), px = (evt.clientX - box.left) * W / box.width;
      const i = Math.max(0, Math.min(records.length - 1, Math.floor((px - m.l) / iw * (b - a) / step))), r = records[i];
      DC.charts.tip.show(evt, { title: H.stamp(r.timestamp_utc), rows: [
        { label: "Observed bin mean", value: number(r.mean_kw) },
        { label: "Observed sample min / max", value: `${number(r.min_kw)} / ${number(r.max_kw)}` },
        { label: "Valid / expected slots", value: `${r.valid_observations} / ${r.expected_slots}` },
        { label: "Quality", value: `${r.quality} · ${DC.fmt.pct(r.coverage)}` },
      ], note: `${product.aggregation_minutes}-minute bin, end exclusive · America/Los_Angeles` });
    });
    hit.addEventListener("mouseleave", () => DC.charts.tip.hide());
  }

  function periodPatterns(grid, records) {
    const disclosure = el('details', { class: 'disclosure span-12', id: 'history-patterns' }, el('summary', { text: 'Weekly patterns and monthly trends' }));
    grid.append(disclosure);
    for (const [type, title] of [['weekday', 'Weekly pattern'], ['month', 'Monthly observed power']]) {
      const rows = H.catalog.periods(records, type), card = DC.ui.card(title, 'Sample-weighted observed phase power (kW), not energy', { span: 12 });
      disclosure.append(card.card);
      const enough = type === 'month' || records.length * data.aggregation_minutes >= 7 * 24 * 60;
      const label = row => type === 'month' ? row.key : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Number(row.key)];
      const node = el('div', { class: 'chart history-chart', id: 'history-' + type + '-pattern' });
      const shown = rows.filter(r => enough && r.mean !== null);
      if (shown.length) card.body.append(node);
      else card.body.append(el('p', { class: 'empty', text: 'Insufficient support for this pattern. Weekly patterns need seven elapsed days; each group needs 80% supporting slots in usable bins.' }));
      card.body.append(el('p', { class: 'card-foot', text: 'Only the selected dates are summarized; boundary months can be partial. Unloaded months and rejected bins reduce support. No interpolation, phase totals, energy estimates, seasonal baseline or fault inference. Signed values appear in labels; bar lengths show magnitude.' }));
      card.body.append(el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Period', 'Mean kW', 'Usable support', 'Intervals (usable / all)'].map(text => el('th', { text })))),
        el('tbody', {}, rows.map(r => el('tr', {}, [label(r), enough ? number(r.mean) : 'Unavailable', DC.fmt.pct(r.eligibleCoverage, 2), `${r.usable} / ${r.bins}`].map(text => el('td', { text }))))))));
      requestAnimationFrame(() => { if (node.isConnected && shown.length) DC.charts.hbar(node, { ariaLabel: title + ' in kW', labelW: 90, valueW: 90, items: shown.map(r => ({ label: label(r), value: r.mean, display: number(r.mean), color: DC.css('--actual'), tooltip: { title: label(r), rows: [{ label: 'Observed mean', value: number(r.mean) }, { label: 'Usable support', value: `${r.support}/${r.expected} slots` }] } })) }); });
    }
  }
  function fact(label, value) {
    return el("div", { class: "fact" }, el("div", { class: "k", text: label }), el("div", { class: "v", text: value, "data-history-fact": label }));
  }
  function measurements(root) {
    root.append(el("p", { id: "history-kind", class: "csv-status", text: data.measurement_kind === "synthetic_fixture"
      ? "Synthetic test fixture — these are not actual DERConnect measurements."
      : "DERConnect historical measurements — single phase; no detector has run on this export." }));
    const controls = el("div", { class: "history-controls" }, H.session.productControl("history-product", () => { error = ""; redraw(); }));
    for (const [label, value] of [["Meter / facility", `${data.meter_id} · ${data.facility_type || 'Unavailable'}`], ["Channel", `${data.channel} (kW)`], ["Resolution", `${data.aggregation_minutes} minutes`]]) {
      controls.append(el("label", { class: "filter" }, el("span", { text: label }), el("select", { disabled: true, "aria-label": label }, el("option", { text: value }))));
    }
    const first = data.records[0], last = data.records[data.records.length - 1];
    for (const [label, key] of [["From campus date", "from"], ["Through campus date", "to"]]) {
      controls.append(el("label", { class: "filter" }, el("span", { text: label }), el("input", { type: "date", id: "history-" + key,
        value: key === "from" ? from : to, min: first ? H.localDay(first.timestamp_utc) : "", max: last ? H.localDay(last.timestamp_utc) : "",
        onchange: evt => { if (key === "from") from = evt.target.value; else to = evt.target.value; H.session.scope(from, to); redraw(); } })));
    }
    controls.append(el("button", { class: "btn", type: "button", text: "Full export range", onclick: () => { from = ""; to = ""; H.session.scope("", ""); redraw(); } }));
    const month = el("select", { id: "history-month", "aria-label": "Month", onchange: evt => {
      const value = evt.target.value;
      if (value) { const [year, m] = value.split('-').map(Number); H.session.scope(value + '-01', value + '-' + new Date(Date.UTC(year, m, 0)).getUTCDate()); }
      else H.session.scope('', '');
      redraw();
    } }, el('option', { value: '', text: 'All months / custom dates' }), H.catalog.months(data).map(m => el('option', {
      value: m.month, text: m.month + (m.loaded ? ` · ${m.usable} usable bins` : ' · no export loaded') })));
    month.value = from && from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : '';
    controls.append(el('label', { class: 'filter' }, el('span', { text: 'Month' }), month));
    root.append(controls, el('p', { id: 'history-available', text: `Catalog range: ${H.stamp(data.start_utc)} through ${H.stamp(data.end_utc)} (end exclusive). ${data.source_exports.length} source export(s). Building identity unverified.` }));
    if (!data.records.length) { root.append(el("p", { class: "empty", text: "This export contains no historical intervals." })); return; }
    const records = H.select(data, from, to), summary = H.summarize(records);
    if (!records.length) { root.append(el("p", { class: "empty", id: "history-empty-range", text: "No intervals in this campus-date range. Check the date order or choose the full export range." })); return; }
    root.append(el('p', { id: 'history-warning', role: 'status', text: `${summary.unavailable} unavailable intervals in this scope. ${data.catalog.conflicting_bins} conflicting overlap bins in this series are withheld. Missing months are not evidence of zero power.` }));
    root.append(el("div", { class: "facts summary-facts" }, fact("Mean observed power", number(summary.mean)),
      fact("Maximum observed sample in usable bins", number(summary.peak)), fact("Valid-slot coverage", DC.fmt.pct(summary.coverage, 4) + ` (${summary.valid}/${summary.expected} slots)`),
      fact("Usable / unavailable intervals", `${summary.usable} / ${summary.unavailable}`)));
    const grid = el("div", { class: "grid cols-12" }); root.append(grid);
    const line = DC.ui.card("Historical phase power", "Observed bin means · campus-local time (PST/PDT) · kW", { span: 12 });
    const plot = el("div", { class: "chart history-chart", id: "history-chart" });
    line.body.append(plot, el("p", { class: "card-foot", text: "Solid line / points: usable observed means. Hatched intervals: missing or rejected. Lines stop at every unavailable bin. A mean can conceal short events; signed readings are retained." })); grid.append(line.card);
    const profile = H.profile(data, records), daily = DC.ui.card("Daily demand pattern", "Observed-sample-weighted mean phase power by campus-local hour", { span: 12 });
    const dailyPlot = el("div", { class: "chart history-chart", id: "history-profile" });
    if (profile.available) daily.body.append(dailyPlot);
    else daily.body.append(el("p", { class: "empty", text: "Insufficient daily-profile support: select at least 23 elapsed hours with 18 eligible local hour groups. Each displayed hour needs 80% supporting slot coverage." }));
    daily.body.append(el("p", { class: "card-foot", text: `${profile.support.toLocaleString()} observed samples in usable bins support this profile. Repeated DST hours contribute their actual samples; nonexistent hours have no observations. This describes the selected period, not a seasonal baseline.` }));
    daily.body.append(el("details", {}, el("summary", { text: "Hourly coverage and sample support" }), el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Campus hour", "Mean kW", "Supporting samples", "Expected slots", "Coverage", "Usable bins"].map(text => el("th", { text })))),
      el("tbody", {}, profile.hours.map(h => el("tr", { class: "static" }, ...[`${h.hour}:00`, profile.available ? number(h.mean) : "Unavailable", h.valid, h.expected, DC.fmt.pct(h.coverage, 1), h.bins].map(text => el("td", { text: String(text) })))))))));
    grid.append(daily.card);
    periodPatterns(grid, records);
    const quality = DC.ui.card("Data quality and provenance", "Quality diagnostics describe measurements; they do not establish physical faults", { span: 12 });
    quality.body.append(el("p", { text: `${data.source} · ${data.meter_id} (${data.facility_type || 'Unavailable'}) · ${data.channel} · source W ÷ 1,000 = displayed kW. No phase or meter sums; facility type does not establish a building identity.` }),
      el("p", { text: `Export [${data.start_utc}, ${data.end_utc}) · ${data.aggregation_minutes}-minute UTC bins · ${data.cadence_seconds}-second assumed cadence · minimum coverage ${DC.fmt.pct(data.minimum_coverage)}.` }),
      el("p", { id: "history-quality", text: `Selected scope: ${Object.entries(summary.reasons).map(([key, count]) => `${key}: ${count}`).join(" · ")}. Valid-slot coverage includes noncolliding finite observations in rejected bins; power summaries use usable bins only (${summary.support.toLocaleString()} samples).` }),
      el("p", { text: "Any repeated observation in a two-second slot withholds the entire bin, even if values agree. Missing readings remain gaps. Signs, calibration and electrical hierarchy remain unverified. Flatline screening is not included." }),
      el("details", {}, el("summary", { text: "Source hashes and transformation details" }), el("pre", { class: "technical-json", text: JSON.stringify({ series_id: data.series_id, overlaps: data.catalog, provenance: data.provenance }, null, 2) })));
    const qualityDetails = el("details", { class: "disclosure span-12" }, el("summary", { text: "Data quality and source details" }), quality.card);
    grid.append(qualityDetails);
    requestAnimationFrame(() => { if (plot.isConnected) { chart(plot, records); if (profile.available) chart(dailyPlot, profile.hours, true); } });
  }
  function render(root) {
    if (sessionVersion !== H.session.version && !loading) error = "";
    sessionVersion = H.session.version;
    data = H.session.selected; from = H.session.from; to = H.session.to;
    if (H.session.takeComparisonRequest()) comparisonOpen = true;
    DC.clear(root); DC.charts.tip.hide();
    root.append(el("div", { class: "section-head" }, el("div", { class: "section-eyebrow", text: "Observed-channel history" }),
      el("h2", { id: "h-historical", text: "Historical Monitoring" }), el("p", { text: "Explore a validated DERConnect meter/channel export independently of the synthetic anomaly demonstration. Local files are read in your browser and are not uploaded." })));
    const configured = document.querySelector('meta[name="derconnect-history"]')?.content.trim() || "";
    const picker = DC.ui.card("Historical exports", "Add meter/phase JSON exports to the shared catalog (up to 120 files; 10 MB each, 60 MB per selection). Previous meters and dates are retained; conflicting overlap bins are withheld.");
    picker.body.append(el("input", { type: "file", id: "history-file", multiple: true, accept: ".json,application/json", "aria-label": "Choose historical JSON export", onchange: evt => {
      const files = Array.from(evt.target.files);
      if (files.length) read(() => H.catalog.readFiles(files));
    } }));
    if (configured) picker.body.append(el("button", { class: "btn", type: "button", text: "Reload configured export", onclick: () => read(() => H.load(configured)) }));
    picker.body.append(el("button", { class: "btn", type: "button", id: "history-clear", text: "Clear loaded exports", onclick: () => { token++; loading = false; error = ""; H.session.clear(); redraw(); } }));
    root.append(picker.card, el("p", { id: "history-session-notice", role: "status", text: H.session.notice }));
    const comparisons = el("details", { class: "disclosure", open: comparisonOpen, ontoggle: evt => { comparisonOpen = evt.target.open; } }, el("summary", { text: "Compare historical exports" }));
    const comparisonHost = el("div"); comparisons.append(comparisonHost); root.append(comparisons);
    DC.historyComparison.render(comparisonHost);
    comparisons.addEventListener("toggle", () => { if (comparisons.open) DC.historyComparison.render(comparisonHost); });
    if (!started) { started = true; if (configured) { read(() => H.load(configured)); return; } }
    if (loading) root.append(el("p", { role: "status", text: "Loading historical export…" }));
    if (error) root.append(el("p", { class: "csv-status rejected", role: "alert", id: "history-error", text: error }));
    if (!loading && data) measurements(root);
    else if (!loading && !error) root.append(el("p", { class: "empty", id: "history-unconfigured", text: "No real export is currently configured. Generate an E2451 Active_Power_A export locally, then choose the JSON above. To retain it across reloads, configure the derconnect-history metadata path in index.html and serve over HTTP. See README for the exact command. No actual measurements are bundled." }));
  }
  DC.sections = DC.sections || {}; DC.sections.historical = { render, chart };
})();
