/* CSV Upload: checks a meter file in this browser. Results stay in memory, separate from DC.D. */
(function () {
  "use strict";
  const DC = window.DC, el = DC.el, ui = () => DC.ui;
  DC.sections = DC.sections || {};
  const SVG = "http://www.w3.org/2000/svg";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const STATUS = {
    ready: "Ready to review",
    warnings: "Loaded with warnings",
    rejected: "File rejected",
  };
  const UNAVAILABLE = [
    ["Anomaly events", "No detector has been run on this file."],
    ["Expected demand and forecast ranges", "These need a fitted detector or forecaster."],
    ["Weather and occupancy", "These channels are not part of this file."],
    ["Building and sub-grid mapping", "Meter IDs have no agreed mapping yet."],
    ["Detection quality", "This file has no labels. Unlabeled data cannot produce precision or recall."],
  ];

  let result = null, fileName = "", selectedMeter = null, readToken = 0, reading = false;

  const svgNode = (tag, attrs, parent) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.append(node);
    return node;
  };
  const pad = v => String(v).padStart(2, "0");
  function stamp(ms, basis) {
    const d = new Date(ms), seconds = d.getUTCSeconds() ? ":" + pad(d.getUTCSeconds()) : "";
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds}${basis === "utc" ? " UTC" : ""}`;
  }
  function cadence(ms) {
    if (!ms) return "—";
    if (ms % 3600000 === 0) return ms / 3600000 + " h";
    if (ms % 60000 === 0) return ms / 60000 + " min";
    return ms / 1000 + " s";
  }
  function axisLabel(ms, span) {
    const d = new Date(ms), day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    if (span > 14 * 86400000) return day;
    if (span > 86400000) return `${day} ${time}`;
    return span > 600000 ? time : `${time}:${pad(d.getUTCSeconds())}`;
  }

  // Splits a meter into drawn segments. Dense data keeps each pixel's minimum and maximum so spikes survive.
  function segments(meter, xOf, gapMs) {
    const out = [];
    let current = null, bucket = null, previous = null;
    const flush = () => {
      if (!bucket) return;
      const pair = bucket.lowT <= bucket.highT ? [[bucket.lowT, bucket.low], [bucket.highT, bucket.high]] : [[bucket.highT, bucket.high], [bucket.lowT, bucket.low]];
      current.push(...(pair[0][0] === pair[1][0] ? [pair[0]] : pair));
      bucket = null;
    };
    meter.t.forEach((t, i) => {
      const v = meter.kw[i];
      if (v == null || (previous != null && gapMs && t - previous > gapMs)) { flush(); current = null; }
      if (v == null) { previous = t; return; }
      if (!current) out.push(current = []);
      const column = Math.floor(xOf(t));
      if (bucket && bucket.column !== column) flush();
      if (!bucket) bucket = { column, low: v, lowT: t, high: v, highT: t };
      if (v < bucket.low) { bucket.low = v; bucket.lowT = t; }
      if (v > bucket.high) { bucket.high = v; bucket.highT = t; }
      previous = t;
    });
    flush();
    return out;
  }

  function nearest(times, t) {
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < t) lo = mid + 1; else hi = mid; }
    return lo > 0 && t - times[lo - 1] < times[lo] - t ? lo - 1 : lo;
  }

  function drawChart(node, meter, basis) {
    DC.clear(node);
    const valid = meter.kw.filter(v => v != null);
    if (!valid.length) { node.append(el("p", { class: "empty", text: "This meter has no valid readings to plot." })); return; }
    const W = Math.max(240, Math.floor(node.clientWidth || 600)), H = 260, m = { l: 52, r: 14, t: 18, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const t0 = meter.t[0], last = meter.t[meter.t.length - 1], t1 = last > t0 ? last : t0 + 3600000;
    const lo = meter.min, hi = meter.max, ticks = DC.charts.niceTicks(lo, hi, 5);
    if (ticks[0] > lo) ticks.unshift(ticks[0] - (ticks[1] - ticks[0]));
    const y0 = Math.min(ticks[0], lo), y1 = Math.max(ticks[ticks.length - 1], hi);
    const x = t => m.l + (t - t0) / (t1 - t0) * iw, y = v => m.t + ih - (v - y0) / (y1 - y0) * ih;
    const svg = svgNode("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Measured kW for meter ${meter.id}` });
    node.append(svg);
    const axis = svgNode("g", { class: "ax" }, svg);
    svgNode("text", { x: m.l - 6, y: 10, "text-anchor": "end" }, axis).textContent = "kW";
    for (const v of ticks) {
      if (v < y0 || v > y1) continue;
      svgNode("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "gridline" }, axis);
      svgNode("text", { x: m.l - 6, y: y(v) + 3.5, "text-anchor": "end" }, axis).textContent = DC.fmt.compact(v);
    }
    svgNode("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }, axis);
    const count = iw < 420 ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const t = t0 + (t1 - t0) * i / (count - 1), anchor = i === 0 ? "start" : i === count - 1 ? "end" : "middle";
      svgNode("text", { x: x(t), y: m.t + ih + 16, "text-anchor": anchor }, axis).textContent = axisLabel(t, t1 - t0);
    }
    const parts = segments(meter, x, meter.cadenceMs ? meter.cadenceMs * 1.5 : null);
    const d = parts.filter(points => points.length > 1).map(points => "M" + points.map(([t, v]) => x(t).toFixed(1) + "," + y(v).toFixed(1)).join("L")).join("");
    svgNode("path", { d, fill: "none", stroke: DC.css("--actual"), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "data-upload-line": "" }, svg);
    for (const [[t, v]] of parts.filter(points => points.length === 1)) svgNode("circle", { cx: x(t), cy: y(v), r: 3.5, fill: DC.css("--actual"), "data-upload-point": "" }, svg);
    const cross = svgNode("line", { class: "crosshair", y1: m.t, y2: m.t + ih, opacity: 0 }, svg);
    const hit = svgNode("rect", { x: m.l, y: m.t, width: iw, height: ih, class: "hit" }, svg);
    hit.addEventListener("mousemove", evt => {
      const box = svg.getBoundingClientRect();
      const i = nearest(meter.t, t0 + (evt.clientX - box.left - m.l) / iw * (t1 - t0)), px = x(meter.t[i]);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("opacity", 1);
      DC.charts.tip.show(evt, { title: stamp(meter.t[i], basis), rows: [{ color: DC.css("--actual"), value: meter.kw[i] == null ? "No value" : DC.fmt.kw(meter.kw[i]), label: "measured" }] });
    });
    hit.addEventListener("mouseleave", () => { cross.setAttribute("opacity", 0); DC.charts.tip.hide(); });
  }

  function statusBox() {
    if (reading) return el("div", { class: "csv-status", role: "status", text: `Checking ${fileName}…` });
    if (!result) return el("p", { class: "empty", id: "csv-empty", text: "No file loaded yet. Meter readings will appear here after a file passes the checks." });
    const box = el("div", { class: "csv-status " + result.status, role: "status", id: "csv-status" },
      el("b", { text: STATUS[result.status] }), el("span", { class: "mono", text: fileName }));
    if (result.fatal) box.append(el("p", { text: result.fatal }));
    else if (result.status === "ready") box.append(el("p", { text: "No format problems were found. This does not mean the readings are free of anomalies." }));
    if (result.warnings.length) box.append(el("ul", {}, result.warnings.map(text => el("li", { text }))));
    return box;
  }

  function fact(label, value) {
    return el("div", { class: "fact" }, el("div", { class: "k", text: label }), el("div", { class: "v", text: value, "data-upload-fact": label }));
  }

  function meterTable(r) {
    const rows = r.meters.map(m => el("tr", { class: "static" },
      el("td", { class: "mono", text: m.id }),
      el("td", { class: "num", text: DC.fmt.int(m.readings) }),
      el("td", { class: "mono", text: stamp(m.t[0], r.timeBasis) }),
      el("td", { class: "mono", text: stamp(m.t[m.t.length - 1], r.timeBasis) }),
      el("td", { class: "num", text: cadence(m.cadenceMs) }),
      el("td", { class: "num", text: DC.fmt.pct(m.completeness, 1) }),
      el("td", { class: "num", text: DC.fmt.one(m.min) }),
      el("td", { class: "num", text: DC.fmt.one(m.mean) }),
      el("td", { class: "num", text: DC.fmt.one(m.max) })));
    const headers = ["Meter", "Readings", "First", "Last", "Cadence", "Complete", "Min kW", "Mean kW", "Max kW"];
    return el("div", { class: "table-wrap" }, el("table", { "data-upload-meters": "" },
      el("thead", {}, el("tr", {}, headers.map((text, i) => el("th", { class: [1, 4, 5, 6, 7, 8].includes(i) ? "num" : "", text })))), el("tbody", {}, rows)));
  }

  function issueList(r) {
    const shown = r.issues.slice(0, 50);
    return el("details", { class: "disclosure", open: true }, el("summary", { text: `Rejected rows (${DC.fmt.int(r.issues.length)})` }),
      el("div", { class: "table-wrap" }, el("table", { "data-upload-issues": "" },
        el("thead", {}, el("tr", {}, el("th", { class: "num", text: "Line" }), el("th", { text: "Problem" }))),
        el("tbody", {}, shown.map(issue => el("tr", { class: "static" }, el("td", { class: "num", text: DC.fmt.int(issue.line) }), el("td", { text: issue.problem })))))),
      r.issues.length > shown.length ? el("p", { class: "card-foot", text: `Showing the first ${shown.length} rejected rows.` }) : null);
  }

  function results(root, r) {
    if (r.issues.length) root.append(issueList(r));
    if (!r.meters.length) return;
    root.append(el("div", { class: "facts summary-facts" },
      fact("Rows read", DC.fmt.int(r.rowsRead)), fact("Readings kept", DC.fmt.int(r.kept)),
      fact("Rows rejected", DC.fmt.int(r.rejected)), fact("Meters", DC.fmt.int(r.meters.length))));
    const grid = el("div", { class: "grid cols-12" });
    root.append(grid);

    if (!r.meters.some(m => m.id === selectedMeter)) selectedMeter = r.meters[0].id;
    const chartCard = ui().card("Measured readings", r.timeBasis === "utc" ? "Times shown in UTC" : "Times shown as written in the file", { span: 12 });
    const chart = el("div", { class: "chart", id: "upload-chart" });
    const draw = () => drawChart(chart, r.meters.find(m => m.id === selectedMeter), r.timeBasis);
    const select = el("select", { id: "upload-meter", "aria-label": "Meter to plot", onchange: event => { selectedMeter = event.target.value; draw(); } },
      r.meters.map(m => el("option", { value: m.id, text: m.id })));
    select.value = selectedMeter;
    chartCard.tools.append(select);
    chartCard.body.append(chart);
    grid.append(chartCard.card);
    requestAnimationFrame(draw);

    const tableCard = ui().card("Meters in this file", "Complete means valid readings divided by the slots expected at each meter's usual cadence", { span: 12 });
    tableCard.body.append(meterTable(r));
    grid.append(tableCard.card);

    const missing = ui().card("Not available for this file", "These stay blank instead of being estimated or borrowed from the simulated dataset", { span: 12 });
    missing.body.append(el("div", { class: "table-wrap" }, el("table", { "data-upload-unavailable": "" },
      el("tbody", {}, UNAVAILABLE.map(([name, reason]) => el("tr", { class: "static" }, el("td", { text: name }), el("td", { class: "muted", text: reason })))))));
    grid.append(missing.card);
  }

  function load(file) {
    const token = ++readToken;
    DC.charts.tip.hide();
    fileName = file.name; result = null; selectedMeter = null;
    const finish = next => {
      if (token !== readToken) return;
      reading = false; result = next; DC.setState({});
    };
    const failed = message => Object.assign(DC.csv.validate(""), { fatal: message });
    if (file.size > DC.csv.MAX_BYTES) return finish(failed("This file is larger than the 20 MB limit for browser checks."));
    reading = true; DC.setState({});
    file.text().then(text => finish(DC.csv.validate(text)), () => finish(failed("The browser could not read this file.")));
  }

  function render(root) {
    DC.clear(root);
    root.append(el("div", { class: "section-head" },
      el("div", { class: "section-eyebrow", text: "Real-data preparation" }),
      el("h2", { id: "h-upload", text: "CSV Upload" }),
      el("p", { text: "Check a meter file before it is connected to the dashboard. The file is read in this browser, is not sent anywhere, and is cleared when the page reloads. It never changes the simulated dataset or runs through a detector." })));
    const picker = ui().card("Choose a meter file", "Provisional checkpoint format, not the final DERCONNECT data contract");
    picker.body.append(
      el("div", { class: "upload-picker" },
        el("input", { type: "file", id: "csv-file", accept: ".csv,text/csv", onchange: event => { if (event.target.files[0]) load(event.target.files[0]); } }),
        el("label", { class: "btn primary", for: "csv-file", text: fileName ? "Choose another CSV" : "Choose a CSV" }),
        el("span", { class: "mono", text: fileName || "No file selected" })),
      el("details", { class: "disclosure" }, el("summary", { text: "Required format" }),
        el("div", { class: "table-wrap" }, el("table", {},
          el("thead", {}, el("tr", {}, ["Column", "Expected value"].map(text => el("th", { text })))),
          el("tbody", {}, [
            ["timestamp", "ISO 8601 date and time. Include Z or an offset when known."],
            ["meter_id", "Any non-empty ID."],
            ["kw", "Power in kW. Blank, NA, NaN and null count as a gap."],
          ].map(([name, text]) => el("tr", { class: "static" }, el("td", { class: "mono", text: name }), el("td", { text })))))),
        el("pre", { class: "technical-json", text: "timestamp,meter_id,kw\n2026-08-10T00:00:00Z,M-101,412.5\n2026-08-10T01:00:00Z,M-101,398.2" })));
    root.append(picker.card, statusBox());
    if (result && !reading) results(root, result);
  }

  DC.sections.upload = { render };
})();
