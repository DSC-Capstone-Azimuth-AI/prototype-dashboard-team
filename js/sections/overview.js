/* Section 1 - Overview and system health */
(function () {
  "use strict";
  const DC = window.DC, el = DC.el, ui = () => DC.ui;
  DC.sections = DC.sections || {};

  let showEvents = false, diagnosticsOpen = false;

  function metricIcon(kind) {
    const paths = {
      review: ["M9 5H5v16h14V5h-4", "M9 3h6v4H9z", "M8 12h8M8 16h5"],
      priority: ["m12 3 10 18H2L12 3Z", "M12 9v5M12 17h.01"],
      buildings: ["M3 21h18M5 21V4h10v17M15 10h4v11M8 8h4M8 12h4M8 16h4"],
      completeness: ["M4 5h16v14H4z", "m8 12 3 3 5-6"],
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "metric-icon");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    for (const d of paths[kind]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d); svg.append(path);
    }
    return svg;
  }
  function kpi(label, value, unit, note, icon) {
    return el("div", { class: "card kpi" },
      el("span", { class: "kpi-heading" }, el("span", { class: "label", text: label }), el("span", { class: "kpi-symbol" }, metricIcon(icon))),
      el("div", { class: "value" }, value, unit ? el("small", { text: unit }) : null),
      note ? el("div", { class: "note", text: note }) : null);
  }

  function render(root) {
    DC.clear(root);
    const source = el("select", { id: "overview-source", "aria-label": "Overview data source", onchange: evt => { DC.history.session.setSource(evt.target.value); DC.setState({}); document.querySelector('#overview-source')?.focus({preventScroll:true}); } }, el("option", { value: "synthetic", text: "Synthetic Demo" }), el("option", { value: "historical", text: "Historical DERCONNECT" }));
    source.value = DC.history.session.source;
    root.append(el("label", { class: "overview-source" }, el("span", { text: "Overview data source" }), source));
    if (DC.history.session.source === "historical") { DC.historicalOverview.render(root); return; }
    const s = DC.state, [t0, t1] = DC.range();
    const events = DC.events();
    const open = events.filter(DC.isOpen);
    const meters = DC.scopeMeters();
    const buildings = DC.scopeBuildings();

    root.append(el("div", { class: "section-head" },
      el("div", { class: "section-eyebrow", text: "Campus health" }),
      el("h2", { id: "h-overview", text: "Overview" }),
      el("p", { text: "See which buildings need attention, then choose an event to investigate." })));

    // ---------- KPIs ----------
    const high = open.filter((e) => e.severity === "critical" || e.severity === "high");
    const affected = new Set(open.map((e) => e.building));
    const comp = DC.completeness(meters, t0, t1);
    let missing = 0, stuck = 0;
    for (const m of meters) for (let t = t0; t < t1; t++) { if (m.dq[t] === 1) missing++; else if (m.dq[t] === 2) stuck++; }
    const excess = DC.sum(open.filter((e) => e.excess_kwh > 0).map((e) => e.excess_kwh));
    const mains = meters.filter(m => m.kind === "main");
    const aggregate = ui().scopeSeries(mains);
    let peak = 0;
    for (let t = t0; t < t1; t++) peak = Math.max(peak, aggregate.actual(t));
    root.append(el("div", { class: "kpis" },
      kpi("Events requiring review", DC.fmt.int(open.length), null, `${high.length} high or critical priority`, "review"),
      kpi("High / critical events", high.length, null, "Pending events in this scope", "priority"),
      kpi("Affected buildings", affected.size, null, "Buildings with pending events", "buildings"),
      kpi("Meter data completeness", meters.length ? DC.fmt.pct(comp, 1) : "Unavailable", null, `${missing} missing / zero · ${stuck} stuck samples`, "completeness")));
    const reviewAction = el("a", { class: "btn primary action-link", href: "#investigate", text: "Review priority events →", onclick: event => { event.preventDefault(); DC.reviewQueue(); } });

    const grid = el("div", { class: "grid cols-12" });
    root.append(grid);

    // ---------- Actual vs expected ----------
    const series = ui().scopeSeries(meters);
    const ts = ui().card("Actual vs. expected consumption", `${series.label} · expected = ${DC.det().label} median forecast`, { span: 12 });
    grid.append(ts.card);
    ts.tools.append(el("label", { class: "muted" }, el("input", { type: "checkbox", "data-focus-key": "overview-overlays", checked: showEvents, onchange: event => { showEvents = event.target.checked; ui().refresh(root, () => render(root)); } }), " Show anomaly overlays"));
    const chartEl = el("div", { class: "chart" });
    ts.body.append(chartEl);
    const typesPresent = DC.TYPES.filter((t) => showEvents && events.some((e) => e.type === t.id));
    const leg = [
      { kind: "line", color: DC.css("--actual"), label: "Measured" },
      { kind: "dash", color: DC.css("--expected"), label: "Expected" },
    ];
    if (series.single) leg.push({ kind: "box", color: DC.css("--band-inner"), label: "80% / 98% forecast band" });
    ts.body.append(ui().legend(leg.concat(typesPresent.map((t) => ({ kind: "type", type: t.id, label: t.label })))));
    ts.body.append(el("div", { class: "card-foot", text: showEvents ? "Shaded intervals mark sustained events; symbols mark score peaks. Grey windows are synthetic negative controls. Click an event to open it." : "Hourly simulated electricity demand in kW. Enable anomaly overlays for additional context, or choose a priority event from the queue." }));

    // ---------- Type distribution ----------
    const dist = ui().card("Anomaly type distribution", "Events in the current filters, by primary type", { span: 4 });
    const diagnostics = el("details", { class: "disclosure span-12", open: diagnosticsOpen }, el("summary", { text: "System diagnostics: anomaly types & meter heatmap" }), el("div", { class: "grid cols-12" }, dist.card));
    grid.append(diagnostics);
    diagnostics.addEventListener("toggle", () => { if (diagnostics.isConnected) diagnosticsOpen = diagnostics.open; });
    diagnostics.append(el("p", { class: "muted", text: `Meter completeness: ${DC.fmt.pct(comp, 1)} · ${missing} missing / zero samples · ${stuck} stuck samples. Open-event positive excess: ${DC.fmt.kwh(excess)} (whole detected intervals; overlapping detections may double count).` }));
    const distEl = el("div", { class: "chart" });
    dist.body.append(distEl);
    const sevEl = el("div", { class: "chart", style: { marginTop: "10px" } });
    dist.body.append(el("div", { class: "chart-title", text: "By severity" }), sevEl);

    // ---------- Heatmap ----------
    const hm = ui().card("Building / meter anomaly heatmap", "Highest severity per meter and day · grouped by sub-grid · click a cell to open its top event", { span: 12 });
    diagnostics.querySelector(".grid").append(hm.card);
    const hmEl = el("div", { class: "chart" });
    hm.body.append(hmEl);
    hm.body.append(ui().legend(DC.SEVERITIES.slice().reverse().map((v) => ({ kind: "box", color: DC.sevColor(v.id), label: v.label })).concat([{ kind: "box", color: DC.css("--surface-3"), label: "No event" }])));

    // ---------- Queue ----------
    const q = ui().card("Prioritized anomaly queue", "Open events ranked by priority (deviation, duration, energy impact)", { span: 12 });
    q.tools.append(reviewAction);
    grid.prepend(q.card);
    ts.body.prepend(el("p", { class: "demand-summary", text: mains.length ? `${DC.fmt.kwh(DC.sum(mains.map(m => DC.energy(m, t0, t1))))} main-meter use · ${DC.fmt.kw(peak)} simultaneous peak · hourly simulated readings` : "Main-meter demand summary unavailable." }));

    // draw charts now that containers are attached
    const sel = s.selected;
    const ov = ui().overlays(events.filter((e) => series.meters.some((m) => m.id === e.meter)), series.actual, sel);
    const controls = DC.D.normal_controls.map((c) => ({ start: c.start, end: c.end, label: c.name }));
    DC.charts.timeSeries(chartEl, {
      t0, t1, height: 300,
      shade: showEvents ? controls : [],
      band: series.single ? [{ lo: series.lo, hi: series.hi, color: DC.css("--band") }, { lo: series.lo80, hi: series.hi80, color: DC.css("--band-inner") }] : [],
      series: [
        { get: series.expected, color: DC.css("--expected"), dash: "5 4", width: 1.5 },
        { get: series.actual, color: DC.css("--actual"), width: 1.6 },
      ],
      intervals: showEvents ? ov.intervals : [], markers: showEvents ? ov.markers : [],
      yFormat: (v) => DC.fmt.compact(v) + "",
      ariaLabel: "Measured and expected kW over time with anomaly overlays",
      tooltip: (t, hit) => {
        if (hit && hit.ev) return ui().eventTooltip(hit.ev);
        const a = series.actual(t), e = series.expected(t);
        const rows = [
          { color: DC.css("--actual"), value: DC.fmt.kw(a), label: "measured" },
          { color: DC.css("--expected"), kind: "dash", value: DC.fmt.kw(e), label: "expected" },
          { value: e == null ? "—" : DC.fmt.signed(a - e, " kW"), label: "deviation" },
        ];
        if (series.single) rows.push({ color: DC.css("--band-inner"), kind: "box", value: `${DC.fmt.one(series.lo(t))}–${DC.fmt.one(series.hi(t))}`, label: "98% band" });
        const ctrl = DC.D.normal_controls.find((c) => t >= c.start && t < c.end);
        return { title: DC.time.stamp(t), rows, note: ctrl ? `${ctrl.name}: ${ctrl.note}` : null };
      },
      onClick: (t, hit) => { if (hit && hit.ev) DC.openEvent(hit.ev.id); },
    });

    // type distribution
    const counts = DC.TYPES.map((t) => ({ t, n: events.filter((e) => e.type === t.id).length }));
    DC.charts.hbar(distEl, {
      glyphs: true,
      items: counts.map(({ t, n }) => ({
        label: t.label, value: n, color: DC.typeColor(t.id), typeId: t.id,
        tooltip: { title: t.label, rows: [{ value: String(n), label: "events" }], note: `${t.desc}. Recommended view: ${t.viz}. Click to filter.` },
        onClick: () => DC.setState({ type: DC.state.type === t.id ? "all" : t.id }),
      })),
      ariaLabel: "Events by anomaly type",
    });
    DC.charts.hbar(sevEl, {
      items: DC.SEVERITIES.map((v) => ({
        label: v.label, value: events.filter((e) => e.severity === v.id).length, color: DC.sevColor(v.id),
        onClick: () => DC.setState({ severity: DC.state.severity === v.id ? "all" : v.id }),
        tooltip: { title: v.label + " severity", rows: [{ value: String(events.filter((e) => e.severity === v.id).length), label: "events" }], note: "Click to filter" },
      })),
      ariaLabel: "Events by severity",
    });

    // heatmap meters x days
    const d0 = Math.floor(t0 / 24), d1 = Math.ceil(t1 / 24);
    const cols = [];
    for (let d = d0; d < d1; d++) cols.push({ d, label: DC.time.day(d * 24) });
    const rows = meters.slice().sort((a, b) => DC.buildingById[a.building].subgrid.localeCompare(DC.buildingById[b.building].subgrid) || a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, label: `${DC.buildingById[m.building].subgrid} · ${m.id}`, group: DC.buildingById[m.building].subgrid }));
    const byCell = {};
    for (const e of events) for (let d = Math.floor(e.start / 24); d <= Math.floor((e.end - 1) / 24); d++) (byCell[e.meter + ":" + d] = byCell[e.meter + ":" + d] || []).push(e);
    DC.charts.heatmap(hmEl, {
      rows, cols, groupBy: "group", labelW: 118, cellH: 20,
      cell: (r, c) => {
        const list = byCell[r.id + ":" + c.d] || [];
        if (!list.length) {
          const dqBad = DC.meterById[r.id].dq.slice(c.d * 24, c.d * 24 + 24).some(Boolean);
          return { fill: DC.css("--surface-3"), clickable: false, tooltip: { title: `${r.id} · ${c.label}`, rows: [], note: dqBad ? "Data-quality flags but no event" : "No events" } };
        }
        const top = list.slice().sort((a, b) => b.priority - a.priority)[0];
        return {
          fill: DC.sevColor(top.severity), selected: list.some((e) => e.id === sel), mark: list.length > 1 ? String(list.length) : "",
          markColor: top.severity === "medium" ? "#0b0b0b" : "#ffffff",
          tooltip: { title: `${r.id} · ${c.label}`, rows: list.map((e) => ({ glyph: e.type, value: e.id, label: `${DC.typeById[e.type].label} · ${DC.sevById[e.severity].label}` })), note: "Click to open the top event" },
          top,
        };
      },
      onClick: (r, c, cell) => cell.top && DC.openEvent(cell.top.id),
      ariaLabel: "Heatmap of anomaly severity by meter and day",
    });

    const breakdown = ui().card("Electricity use by building", "Main meters · selected period", { span: 12 });
    grid.append(breakdown.card);
    for (const b of buildings) {
      const m = DC.mainMeter(b.id);
      breakdown.body.append(el("a", { class: "building-summary", href: "#buildings/" + b.id }, el("span", { text: b.name }), el("b", { text: m ? DC.fmt.kwh(DC.energy(m, t0, t1)) : "No measurements" })));
    }
    // queue
    const queue = DC.sortEvents(open, "priority").slice(0, 5);
    if (!queue.length) q.body.append(el("div", { class: "empty", text: "No open events in the current filters." }));
    else {
      const tbody = el("tbody");
      for (const e of queue) {
        tbody.append(el("tr", { class: e.id === sel ? "selected" : "", tabindex: "0", onclick: () => DC.openEvent(e.id), onkeydown: (k) => k.key === "Enter" && DC.openEvent(e.id) },
          el("td", {}, DC.sevBadge(e.severity)),
          el("td", { class: "num", text: e.priority.toFixed(0) }),
          el("td", {}, el("div", { class: "mono", text: e.id }), el("div", { class: "muted", style: { fontSize: "12px" }, text: DC.meterName(e.meter) })),
          el("td", {}, DC.typeChip(e.type)),
          el("td", { text: DC.time.short(e.start) }),
          el("td", { class: "num", text: DC.fmt.hours(e.duration_h) }),
          el("td", { class: "num", text: e.excess_kwh == null ? "n/a" : DC.fmt.int(e.excess_kwh) }),
          el("td", {}, DC.statusPill(DC.eventStatus(e)))));
      }
      q.body.append(el("div", { class: "table-wrap" }, el("table", {},
        el("thead", {}, el("tr", {}, ["Severity", "Priority", "Event", "Type", "Start", "Duration", "Excess kWh", "Status"].map((h, i) => el("th", { class: [1, 5, 6].includes(i) ? "num" : "", text: h })))), tbody)));
      q.body.append(el("div", { class: "card-foot", text: `Showing ${queue.length} of ${open.length} open events. Priority is operational (deviation, duration, energy); novelty score is kept separate in the event record.` }));
    }
  }

  DC.sections.overview = { render };
})();
