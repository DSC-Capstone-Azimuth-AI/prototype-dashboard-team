/* Section 2 - Anomaly investigation: event log, SarSim0-style gallery, event record. */
(function () {
  "use strict";
  const DC = window.DC, el = DC.el, ui = () => DC.ui;
  DC.sections = DC.sections || {};
  const view = { mode: "log", sort: "priority", scale: "kw" };

  const SORTS = [["priority", "Severity / priority"], ["impact", "Estimated impact (kWh)"], ["time", "Most recent"], ["duration", "Duration"], ["novelty", "Novelty score"]];

  function render(root) {
    DC.clear(root);
    const events = DC.sortEvents(DC.events(), view.sort);
    let selId = DC.state.selected;
    if (!selId || !DC.eventById(selId) || DC.eventById(selId).detector !== DC.state.detector) {
      selId = events.length ? events[0].id : null;
      if (selId) DC.setState({ selected: selId }, { silent: true });
    }

    root.append(el("div", { class: "section-head" },
      el("h2", { id: "h-investigate", text: "Anomaly investigation" }),
      el("p", { text: "Pick an event from the log or the gallery (both open the same record), then compare it against expected behaviour, history, weather and occupancy." })));

    const grid = el("div", { class: "grid cols-12" });
    root.append(grid);

    // ---------- Log / gallery ----------
    const lg = ui().card(view.mode === "log" ? "Anomaly event log" : "Anomaly event gallery",
      view.mode === "log" ? `${events.length} events · click a row to open its record`
        : "Event-centred panels aligned to onset (after SarSim0 Fig. 8) · measured line, dashed expected baseline, shaded event window", { span: 12 });
    grid.append(lg.card);
    const sortSel = el("select", { class: "mini-select", "aria-label": "Sort events", onchange: (e) => { view.sort = e.target.value; render(root); } },
      SORTS.map(([v, t]) => el("option", { value: v, text: "Sort: " + t, selected: v === view.sort ? true : null })));
    lg.tools.append(sortSel, ui().segmented([["log", "Log"], ["gallery", "Gallery"]], view.mode, (v) => { view.mode = v; render(root); }, "Event view"));
    if (view.mode === "gallery") lg.tools.prepend(ui().segmented([["kw", "kW"], ["norm", "Normalized"]], view.scale, (v) => { view.scale = v; render(root); }, "Gallery scale"));
    if (!events.length) lg.body.append(el("div", { class: "empty", text: "No events match the current filters." }));
    else if (view.mode === "log") lg.body.append(logTable(events, selId, root));
    else lg.body.append(gallery(events, selId));

    // ---------- Detail ----------
    const ev = selId ? DC.eventById(selId) : null;
    const detail = ui().card("Event record", ev ? "" : "Select an event", { span: 12, id: "h-detail" });
    detail.card.id = "event-detail";
    grid.append(detail.card);
    if (!ev) { detail.body.append(el("div", { class: "detail-empty", text: "No event selected." })); return; }
    detail.head.remove();
    buildDetail(detail.body, ev, root);

    // ---------- Historical comparison + scatter ----------
    const hist = ui().card("Historical comparison", `Same window in the previous three weeks · ${DC.meterName(ev.meter)}`, { span: 6 });
    const sc = ui().card("Magnitude vs. duration", "Short, sharp spikes vs. long sustained events · all events in filters", { span: 6 });
    grid.append(hist.card, sc.card);
    const histEl = el("div", { class: "chart" }), scEl = el("div", { class: "chart" });
    hist.body.append(histEl); sc.body.append(scEl);
    drawHistory(histEl, hist.body, ev);
    sc.body.append(ui().legend(DC.TYPES.filter((t) => events.some((e) => e.type === t.id)).map((t) => ({ kind: "type", type: t.id, label: t.label }))));
    DC.charts.scatter(scEl, {
      height: 300, xLog: true, xLabel: "Duration (hours, log scale)", yLabel: "Peak deviation (% of typical load)",
      xFormat: (v) => (v >= 24 ? v / 24 + "d" : v + "h"), yFormat: (v) => v + "%",
      points: events.map((e) => ({ x: e.duration_h, y: Math.abs(e.peak_dev_pct), typeId: e.type, color: DC.typeColor(e.type), id: e.id, selected: e.id === ev.id, tooltip: ui().eventTooltip(e) })),
      onClick: (p) => DC.openEvent(p.id, false),
      ariaLabel: "Scatter of event duration against peak deviation",
    });
  }

  // ---------------------------------------------------------------------
  function logTable(events, selId, root) {
    const cols = [
      ["Event", null], ["Start", "time"], ["Location", null], ["Type", null], ["Duration", "duration"],
      ["Severity", "priority"], ["Peak dev.", null], ["Excess kWh", "impact"], ["Novelty", "novelty"], ["Status", null],
    ];
    const thead = el("thead", {}, el("tr", {}, cols.map(([label, key], i) => {
      const th = el("th", { class: (key ? "sortable " : "") + ([4, 6, 7, 8].includes(i) ? "num" : ""), scope: "col" }, label);
      if (key) {
        if (view.sort === key) th.append(el("span", { class: "arrow", text: "▼" }));
        th.addEventListener("click", () => { view.sort = key; render(root); });
      }
      return th;
    })));
    const tbody = el("tbody");
    for (const e of events) {
      tbody.append(el("tr", { class: e.id === selId ? "selected" : "", tabindex: "0", "data-id": e.id, onclick: () => DC.openEvent(e.id, false), onkeydown: (k) => k.key === "Enter" && DC.openEvent(e.id, false) },
        el("td", { class: "mono", text: e.id }),
        el("td", { text: DC.time.short(e.start) }),
        el("td", {}, el("div", { text: DC.buildingById[e.building].name }), el("div", { class: "muted", style: { fontSize: "12px" }, text: `${e.meter} · ${e.subgrid}` })),
        el("td", {}, DC.typeChip(e.type), el("div", { class: "muted", style: { fontSize: "12px", marginTop: "2px" }, text: DC.CATEGORY_LABEL[e.category] })),
        el("td", { class: "num", text: DC.fmt.hours(e.duration_h) }),
        el("td", {}, DC.sevBadge(e.severity), el("span", { class: "muted", style: { marginLeft: "6px" }, text: e.priority.toFixed(0) })),
        el("td", { class: "num", text: DC.fmt.signed(e.peak_dev_pct, "%") }),
        el("td", { class: "num", text: e.excess_kwh == null ? "n/a" : DC.fmt.int(e.excess_kwh) }),
        el("td", { class: "num", text: e.novelty.toFixed(1) + "×" }),
        el("td", {}, DC.statusPill(DC.eventStatus(e)))));
    }
    return el("div", { class: "table-wrap tall" }, el("table", {}, thead, tbody));
  }

  // ---------------------------------------------------------------------
  function gallery(events, selId) {
    const box = el("div", { class: "gallery", role: "list" });
    const panels = [];
    for (const e of events) {
      const chart = el("div", { class: "chart" });
      const t0 = Math.max(0, e.start - 24), t1 = Math.min(DC.META.n, e.start + Math.min(168, Math.max(48, e.duration_h + 24)));
      const m = DC.meterById[e.meter];
      let lo = Infinity, hi = -Infinity;
      for (let t = t0; t < t1; t++) { lo = Math.min(lo, m.actual[t]); hi = Math.max(hi, m.actual[t]); }
      const btn = el("button", { class: "panel" + (e.id === selId ? " selected" : ""), type: "button", role: "listitem", "aria-label": `Open ${e.id}`, onclick: () => DC.openEvent(e.id, false) },
        el("div", { class: "p-top" }, el("span", {}, DC.typeChip(e.type)), DC.sevBadge(e.severity)),
        el("div", { class: "p-loc", text: `${DC.buildingById[e.building].name} · ${e.meter.endsWith("PV") ? "PV" : "main"}` }),
        chart,
        el("div", { class: "p-meta" },
          el("span", { text: DC.time.short(e.start) }),
          el("span", { text: DC.fmt.hours(e.duration_h) }),
          el("span", { text: e.excess_kwh == null ? "excess n/a" : DC.fmt.signed(e.excess_kwh, " kWh") })),
        el("div", { class: "p-meta" },
          el("span", { class: "p-id", text: e.id }),
          el("span", { class: "muted", text: view.scale === "norm" ? "measured ÷ expected" : `kW ${DC.fmt.int(lo)}–${DC.fmt.int(hi)}` })));
      box.append(btn);
      panels.push({ chart, e, t0, t1 });
    }
    // render after attach (needs width)
    requestAnimationFrame(() => {
      for (const p of panels) {
        const { e, t0, t1 } = p;
        const m = e.meter;
        const exp = (t) => DC.q(m, "q50", t);
        const act = (t) => DC.actual(m, t);
        const norm = view.scale === "norm";
        const get = norm ? (t) => { const x = exp(t); return x > 1 ? act(t) / x : null; } : act;
        const getE = norm ? (t) => (exp(t) > 1 ? 1 : null) : exp;
        const ov = ui().overlays([e], get, null);
        DC.charts.timeSeries(p.chart, {
          t0, t1, height: 78, compact: true, zero: !norm,
          series: [{ get: getE, color: DC.css("--expected"), dash: "4 3", width: 1.3 }, { get, color: DC.css("--actual"), width: 1.5 }],
          intervals: ov.intervals, markers: ov.markers.filter((mk) => e.behavior === "point" || mk),
        });
      }
    });
    return box;
  }

  // ---------------------------------------------------------------------
  function buildDetail(body, ev, root) {
    const b = DC.buildingById[ev.building], m = DC.meterById[ev.meter];
    const status = DC.eventStatus(ev);
    const statusSel = el("select", { class: "mini-select", "aria-label": "Investigation status", onchange: (e) => { DC.statusStore.set(ev.id, e.target.value); DC.setState({}); } },
      DC.STATUSES.map((s) => el("option", { value: s.id, text: s.label, selected: s.id === status ? true : null })));
    body.append(el("div", { class: "detail-head" },
      el("div", {},
        el("div", { class: "ids", text: `${ev.id} · ${DC.det().label}` }),
        el("h3", { text: `${DC.CATEGORY_LABEL[ev.category]} · ${b.name}` }),
        el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" } },
          DC.typeChip(ev.type),
          el("span", { class: "chip", text: "Behaviour: " + DC.BEHAVIOR_LABEL[ev.behavior] }),
          el("span", { class: "chip", text: "Operational: " + DC.CATEGORY_LABEL[ev.category] }),
          DC.sevBadge(ev.severity))),
      el("div", { style: { marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" } }, el("label", { class: "muted", text: "Status" }), statusSel)));

    const hasExpl = ev.explanations.some((x) => x.supports);
    body.append(el("div", { class: "tier", "aria-label": "Evidence level" },
      el("div", { class: "on" }, el("b", { text: "Detected event" }), `Flagged by ${DC.det().label}; ${ev.detection.score.replace(/_/g, " ")} above threshold.`),
      el("div", { class: hasExpl || status === "explained" ? "on" : "" }, el("b", { text: "Possible explanation" }), hasExpl ? "Context offers a plausible cause (see below)." : "No supporting context found yet."),
      el("div", { class: status === "confirmed" ? "on" : "" }, el("b", { text: "Confirmed fault" }), status === "confirmed" ? "Confirmed by an engineer." : "Requires on-site or engineer confirmation.")));

    const fact = (k, v, small) => el("div", { class: "fact" }, el("div", { class: "k", text: k }), el("div", { class: "v" }, v, small ? el("small", { text: " " + small }) : null));
    body.append(el("div", { class: "facts" },
      fact("Location", ev.meter, `${b.subgrid}`),
      fact("Start", DC.time.short(ev.start)),
      fact("End", DC.time.short(ev.end)),
      fact("Duration", DC.fmt.hours(ev.duration_h)),
      fact("Peak measured", DC.fmt.kw(ev.peak_actual), `at ${DC.time.short(ev.peak_t)}`),
      fact("Peak expected", DC.fmt.kw(ev.peak_expected)),
      fact("Peak deviation", DC.fmt.signed(ev.peak_dev, " kW"), `(${DC.fmt.signed(ev.peak_dev_pct, "%")})`),
      fact("Est. excess energy", ev.excess_kwh == null ? "n/a" : DC.fmt.signed(ev.excess_kwh, " kWh"), ev.excess_kwh == null ? "baseline not valid for bad data" : "vs expected"),
      fact("Priority score", ev.priority.toFixed(0), "/ 100"),
      fact("Novelty score", ev.novelty.toFixed(2) + "×", "of threshold"),
      fact("Off-hours share", DC.fmt.pct(ev.offhours_share)),
      fact("Mean temperature", DC.fmt.one(ev.context.temp_mean) + " °C", `${DC.fmt.signed(ev.context.temp_delta)} vs norm`)));

    const inner = el("div", { class: "grid cols-12" });
    body.append(inner);
    const left = el("div", { class: "span-8 stack" }), right = el("div", { class: "span-4 stack" });
    inner.append(left, right);

    const pad = Math.max(48, Math.min(120, ev.duration_h));
    const t0 = Math.max(DC.META.detector_start, ev.start - pad), t1 = Math.min(DC.META.n, ev.end + pad);
    const mainEl = el("div", { class: "chart" }), scoreEl = el("div", { class: "chart" }), statusEl = el("div", { class: "chart" }), wxEl = el("div", { class: "chart" }), ctxEl = el("div", { class: "chart" });
    left.append(
      el("div", { class: "chart-title", text: `Measured vs. expected (kW) · before, during and after` }), mainEl,
      ui().legend([{ kind: "line", color: DC.css("--actual"), label: "Measured" }, { kind: "dash", color: DC.css("--expected"), label: "Expected (median forecast)" }, { kind: "box", color: DC.css("--band-inner"), label: "80% / 98% band" }, { kind: "type", type: ev.type, label: "This event" }, { kind: "box", color: DC.css("--surface-3"), label: "Other events" }]),
      el("div", { class: "chart-title", text: `Anomaly score ÷ threshold (${ev.detection.score.replace(/_/g, " ")}) · flagged above 1` }), scoreEl,
      el("div", { class: "chart-title", text: "Meter status" }), statusEl,
      el("div", { class: "chart-title", text: "Outdoor temperature (°C)" }), wxEl,
      el("div", { class: "chart-title", text: m.kind === "pv" ? "Irradiance (W/m²)" : `Occupancy index · ${b.name}` }), ctxEl);

    // right column: explanations, detection details, ground truth
    const expl = el("ul", { class: "explain" });
    if (!ev.explanations.length) expl.append(el("li", {}, el("span", { class: "tag", text: "Context" }), "No contextual factor stands out."));
    for (const x of ev.explanations) {
      expl.append(el("li", {}, el("span", { class: "tag", text: x.type.replace("_", " ") }), el("span", { text: x.text }),
        el("span", { class: "verdict " + (x.supports ? "" : "muted"), text: x.supports ? "Supports" : "Doesn't explain" })));
    }
    right.append(el("div", { class: "chart-title", text: "Possible explanations" }), expl,
      el("div", { class: "note-box" }, "Explanations are hypotheses from weather, occupancy and schedule context. They are not a confirmed cause."));

    const d = ev.detection, det = DC.det();
    right.append(el("div", { class: "chart-title", text: "Detection details" }), el("dl", { class: "kv" },
      el("dt", { text: "Detector" }), el("dd", { text: det.label }),
      el("dt", { text: "Implementation" }), el("dd", { text: det.source }),
      el("dt", { text: "Baseline" }), el("dd", { text: "Median (q0.50) forecast; band q0.01–q0.99" }),
      el("dt", { text: "Score" }), el("dd", { text: d.score.replace(/_/g, " ") }),
      el("dt", { text: "Threshold" }), el("dd", { text: `${d.threshold} (target FPR ${d.target_fpr})` }),
      el("dt", { text: "Calibration" }), el("dd", { text: `Clean data ${DC.time.day(DC.META.calibration_start)} – ${DC.time.day(DC.META.clean_prefix - 1)}` }),
      el("dt", { text: "Event grouping" }), el("dd", { text: `min run ${d.min_run} · merge gap ${d.merge_gap} · release ${d.release_threshold_ratio}` }),
      el("dt", { text: "Peak score" }), el("dd", { text: `${ev.novelty.toFixed(2)}× threshold at ${DC.time.short(ev.peak_t)}` })));

    const match = DC.matchFor(ev.id);
    const lab = match ? DC.labelById[match.label_id] : null;
    right.append(el("div", { class: "chart-title", text: "Synthetic ground truth (evaluation only)" }),
      el("div", { class: "note-box" }, lab
        ? [el("b", { text: `${lab.label_id} · ${DC.LABEL_KIND[lab.kind] || lab.kind}` }), ` injected ${DC.time.short(lab.start)} for ${DC.fmt.hours(lab.end - lab.start)}, magnitude ${DC.fmt.signed(lab.magnitude_kw, " kW")}. Detected after ${match.delay_h} h.`]
        : [el("b", { text: "No injected label overlaps." }), " In the synthetic test this detection counts as a false positive. Labels never feed detection or priority."]));

    requestAnimationFrame(() => {
      const others = DC.allEvents().filter((e) => e.meter === ev.meter && e.id !== ev.id && e.start < t1 && t0 < e.end);
      const ov = ui().overlays([ev], (t) => DC.actual(ev.meter, t), ev.id);
      const otherIv = others.map((e) => ({ start: e.start, end: e.end, color: DC.css("--muted"), ev: e }));
      DC.charts.timeSeries(mainEl, {
        t0, t1, height: 250,
        band: [{ lo: (t) => DC.q(m.id, "q01", t), hi: (t) => DC.q(m.id, "q99", t), color: DC.css("--band") }, { lo: (t) => DC.q(m.id, "q10", t), hi: (t) => DC.q(m.id, "q90", t), color: DC.css("--band-inner") }],
        series: [{ get: (t) => DC.q(m.id, "q50", t), color: DC.css("--expected"), dash: "5 4", width: 1.5 }, { get: (t) => DC.actual(m.id, t), color: DC.css("--actual"), width: 2 }],
        intervals: otherIv.concat(ov.intervals), markers: ov.markers,
        tooltip: (t, hit) => {
          if (hit && hit.ev && hit.ev.id !== ev.id) return ui().eventTooltip(hit.ev);
          const a = DC.actual(m.id, t), e = DC.q(m.id, "q50", t);
          return {
            title: DC.time.stamp(t) + (t >= ev.start && t < ev.end ? " · in event" : ""),
            rows: [
              { color: DC.css("--actual"), value: DC.fmt.kw(a), label: "measured" },
              { color: DC.css("--expected"), kind: "dash", value: DC.fmt.kw(e), label: "expected" },
              { value: e == null ? "—" : DC.fmt.signed(a - e, " kW"), label: "deviation" },
              { color: DC.css("--band-inner"), kind: "box", value: `${DC.fmt.one(DC.q(m.id, "q01", t))}–${DC.fmt.one(DC.q(m.id, "q99", t))}`, label: "98% band" },
              { value: (DC.q(m.id, "score", t) ?? 0).toFixed(2) + "×", label: "score / threshold" },
            ],
          };
        },
        onClick: (t, hit) => { if (hit && hit.ev && hit.ev.id !== ev.id) DC.openEvent(hit.ev.id, false); },
      });
      const sc = (t) => DC.q(m.id, "score", t);
      DC.charts.timeSeries(scoreEl, {
        t0, t1, height: 110, yMin: 0,
        intervals: ov.intervals.map((iv) => ({ ...iv, selected: false })),
        hlines: [{ y: 1, label: "threshold", color: DC.css("--sev-critical") }],
        series: [{ get: (t) => Math.min(sc(t), 6), color: DC.css("--ink-2"), width: 1.5 }],
        yFormat: (v) => v.toFixed(v < 10 ? 1 : 0) + "×",
        tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--ink-2"), value: (sc(t) ?? 0).toFixed(2) + "×", label: "score ÷ threshold" + (sc(t) > 6 ? " (clipped at 6×)" : "") }] }),
      });
      const cols = [];
      for (let t = t0; t < t1; t++) cols.push({ t, label: DC.time.hour(t) === 0 ? DC.time.day(t) : "" });
      DC.charts.heatmap(statusEl, {
        rows: [{ id: m.id, label: m.id }], cols, labelW: 48, cellH: 14,
        cell: (r, c) => {
          const v = m.dq[c.t];
          const fill = v === 1 ? DC.css("--sev-critical") : v === 2 ? DC.css("--sev-medium") : DC.css("--surface-3");
          return { fill, clickable: false, tooltip: { title: DC.time.stamp(c.t), rows: [{ kind: "box", color: fill, value: v === 1 ? "Missing / zero" : v === 2 ? "Stuck value" : "OK", label: "meter status" }] } };
        },
      });
      statusEl.append(ui().legend([{ kind: "box", color: DC.css("--surface-3"), label: "OK" }, { kind: "box", color: DC.css("--sev-critical"), label: "Missing / zero" }, { kind: "box", color: DC.css("--sev-medium"), label: "Stuck value" }]));
      const temp = DC.D.weather.temp;
      const tNorm = (t) => { let s = 0, n = 0; for (let k = 1; k <= 14; k++) if (t - 24 * k >= 0) { s += temp[t - 24 * k]; n++; } return n ? s / n : null; };
      DC.charts.timeSeries(wxEl, {
        t0, t1, height: 110, zero: false,
        intervals: ov.intervals.map((iv) => ({ ...iv, selected: false })),
        series: [{ get: tNorm, color: DC.css("--expected"), dash: "4 3", width: 1.3 }, { get: (t) => temp[t], color: DC.css("--t-collective"), width: 1.6 }],
        yFormat: (v) => v.toFixed(0) + "°",
        tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--t-collective"), value: DC.fmt.one(temp[t]) + " °C", label: "temperature" }, { color: DC.css("--expected"), kind: "dash", value: DC.fmt.one(tNorm(t)) + " °C", label: "14-day same-hour mean" }, { value: DC.fmt.pct(DC.D.weather.cloud[t]), label: "cloud cover" }] }),
      });
      if (m.kind === "pv") {
        const ghi = DC.D.weather.ghi;
        DC.charts.timeSeries(ctxEl, {
          t0, t1, height: 100, intervals: ov.intervals.map((iv) => ({ ...iv, selected: false })),
          series: [{ get: (t) => ghi[t], color: DC.css("--t-seasonal"), width: 1.6 }],
          tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--t-seasonal"), value: DC.fmt.int(ghi[t]) + " W/m²", label: "irradiance" }, { value: DC.fmt.pct(DC.D.weather.cloud[t]), label: "cloud cover" }] }),
        });
      } else {
        const occ = b.occupancy;
        const occNorm = (t) => { let s = 0, n = 0; for (let k = 1; k <= 3; k++) if (t - 168 * k >= 0) { s += occ[t - 168 * k]; n++; } return n ? s / n : null; };
        DC.charts.timeSeries(ctxEl, {
          t0, t1, height: 100, intervals: ov.intervals.map((iv) => ({ ...iv, selected: false })),
          series: [{ get: occNorm, color: DC.css("--expected"), dash: "4 3", width: 1.3 }, { get: (t) => occ[t], color: DC.css("--t-contextual"), width: 1.6 }],
          yFormat: (v) => v.toFixed(1),
          tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--t-contextual"), value: occ[t].toFixed(2), label: "occupancy index" }, { color: DC.css("--expected"), kind: "dash", value: (occNorm(t) ?? 0).toFixed(2), label: "same hour, prior 3 weeks" }] }),
        });
      }
    });
  }

  function drawHistory(chartEl, body, ev) {
    const m = ev.meter;
    const pad = 24, span = Math.min(168, Math.max(48, ev.duration_h + 2 * pad));
    const t0 = Math.max(0, ev.start - pad), t1 = Math.min(DC.META.n, t0 + span);
    const weeks = [3, 2, 1].filter((k) => t0 - 168 * k >= 0);
    const shades = ["--axis", "--muted", "--ink-2"];
    const series = weeks.map((k, i) => ({ get: (t) => DC.actual(m, t - 168 * k), color: DC.css(shades[i + (3 - weeks.length)]), width: 1.3, label: `${k} week${k > 1 ? "s" : ""} earlier` }));
    series.push({ get: (t) => DC.actual(m, t), color: DC.css("--actual"), width: 2.2, label: "This week" });
    const ov = ui().overlays([ev], (t) => DC.actual(m, t), null);
    requestAnimationFrame(() => DC.charts.timeSeries(chartEl, {
      t0, t1, height: 270, series, intervals: ov.intervals, relativeTo: ev.start,
      tooltip: (t) => ({ title: DC.time.stamp(t), rows: series.slice().reverse().map((s) => ({ color: s.color, value: DC.fmt.kw(s.get(t)), label: s.label })) }),
    }));
    body.append(ui().legend(series.slice().reverse().map((s) => ({ kind: "line", color: s.color, label: s.label }))));
    body.append(el("div", { class: "card-foot", text: "A seasonal/pattern anomaly shows as a shape that departs from the earlier weeks; a weather-driven change usually shifts all hours together." }));
  }

  DC.sections.investigate = { render };
})();
