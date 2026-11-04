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
    const selId = DC.state.selected;
    root.append(el("div", { class: "section-head" },
      el("h2", { id: "h-investigate", text: selId ? "Event investigation" : "Anomaly investigation" }),
      el("p", { text: "Find an event to review, then open its evidence and record your investigation." })));

    const grid = el("div", { class: "grid cols-12" });
    root.append(grid);

    if (!selId) {
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

      return;
    }
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
    const secondary = el("details", { class: "disclosure span-12" }, el("summary", { text: "Historical comparison & event distribution" }), el("div", { class: "grid cols-12" }, hist.card, sc.card));
    grid.append(secondary);
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
      ["Severity", "priority"], ["Dev. / typical load", null], ["Status", null],
    ];
    const thead = el("thead", {}, el("tr", {}, cols.map(([label, key], i) => {
      const th = el("th", { class: (key ? "sortable " : "") + ([4, 6, 7, 8].includes(i) ? "num" : ""), scope: "col" }, label);
      if (key) {
        DC.clear(th).append(el("button", { class: "sort-button", type: "button", text: label + (view.sort === key ? " ▼" : ""), onclick: () => { view.sort = key; render(root); } }));
        th.setAttribute("aria-sort", view.sort === key ? "descending" : "none");
      }
      return th;
    })));
    const tbody = el("tbody");
    for (const e of events) {
      tbody.append(el("tr", { class: e.id === selId ? "selected" : "", tabindex: "0", "data-id": e.id, onclick: () => DC.openEvent(e.id, false), onkeydown: (k) => k.key === "Enter" && DC.openEvent(e.id, false) },
        el("td", {}, el("a", { href: "#investigate/" + e.id, text: e.id })),
        el("td", { text: DC.time.short(e.start) }),
        el("td", {}, el("div", { text: DC.buildingById[e.building].name }), el("div", { class: "muted", style: { fontSize: "12px" }, text: `${e.meter} · ${e.subgrid}` })),
        el("td", {}, DC.typeChip(e.type), el("div", { class: "muted", style: { fontSize: "12px", marginTop: "2px" }, text: DC.CATEGORY_LABEL[e.category] })),
        el("td", { class: "num", text: DC.fmt.hours(e.duration_h) }),
        el("td", {}, DC.sevBadge(e.severity), el("span", { class: "muted", style: { marginLeft: "6px" }, text: e.priority.toFixed(0) })),
        el("td", { class: "num", text: DC.fmt.signed(e.peak_dev_pct, "%") }),
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
      el("div", { style: { marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" } }, DC.statusPill(status))));

    body.prepend(el("nav", { class: "breadcrumbs", "aria-label": "Breadcrumbs" }, el("a", { href: "#investigate", text: "← Back to anomaly list" }), el("a", { href: "#buildings/" + b.id, text: "View " + b.name })));
    body.querySelector(".detail-head h3").textContent = DC.CATEGORY_LABEL[ev.category] || DC.typeById[ev.type].label;
    body.querySelector(".ids").textContent = `${b.name} · ${m.id} · ${DC.time.stamp(ev.start)} → ${DC.time.stamp(ev.end)} (end exclusive)`;
    const fact = (k, v, note) => el("div", { class: "fact" }, el("div", { class: "k", text: k }), el("div", { class: "v", text: v }), el("div", { class: "muted", text: note || "" }));
    const facts = DC.eventFacts(ev), peak = facts.peak;
    const deviationT = peak?.t ?? ev.start, deviation = peak?.residual ?? null;
    const value = v => DC.fmt.one(v) + " " + facts.unit;
    body.append(el("div", { class: "facts summary-facts" },
      fact("Duration", DC.fmt.hours(ev.duration_h), "Hourly samples · [start, end)"),
      fact("Peak deviation", DC.fmt.signed(deviation, " " + facts.unit), DC.time.stamp(deviationT)),
      fact("Estimated excess use", facts.excess == null ? "Unavailable" : DC.fmt.signed(facts.excess, " kWh"), "Net hourly residual sum; withheld for missing or suspect readings"),
      fact("Operational priority", ev.priority.toFixed(0) + " / 100", "Dashboard heuristic; not a fault probability")));

    const physical = el("details", { class: "disclosure" }, el("summary", { text: "Physical evidence & review provenance" }),
      el("div", { class: "facts" },
        fact("Highest observed reading", facts.observedPeak ? value(facts.observedPeak.actual) : "Unavailable", facts.observedPeak ? DC.time.stamp(facts.observedPeak.t) : ""),
        fact("Measured at largest deviation", peak ? value(peak.actual) : "Unavailable", peak ? DC.time.stamp(peak.t) + (peak.suspect ? " · suspect meter reading" : "") : "No valid pair"),
        fact("Expected at same timestamp", peak ? value(peak.expected) : "Unavailable"),
        fact("Deviation relative to expected", peak?.percent == null ? "Unavailable" : DC.fmt.signed(peak.percent, "%")),
        fact("Ground-truth assessment", "Not evaluated", "Synthetic research labels are separate from operator review")),
      el("p", { class: "muted", text: "Simulated event. Meter, feeder, equipment and occupancy associations are synthetic. A statistical anomaly does not establish equipment failure, theft or a cyberattack." }));

    const inner = el("div", { class: "grid cols-12" });
    body.append(inner);
    const left = el("div", { class: "span-12 stack" }), right = el("div", { class: "span-12 stack" });
    inner.append(left, right);

    const pad = Math.max(48, Math.min(120, ev.duration_h));
    const t0 = Math.max(DC.META.detector_start, ev.start - pad), t1 = Math.min(DC.META.n, ev.end + pad);
    const mainEl = el("div", { class: "chart" }), scoreEl = el("div", { class: "chart" }), statusEl = el("div", { class: "chart" }), wxEl = el("div", { class: "chart" }), ctxEl = el("div", { class: "chart" });
    const context = el("details", { class: "disclosure" }, el("summary", { text: "Weather, occupancy & meter quality" }));
    const diagnostics = el("details", { class: "disclosure" }, el("summary", { text: "Advanced technical details" }));
    const evidence = el("div", { class: "stack" });
    diagnostics.append(evidence);
    left.append(el("div", { class: "chart-title", text: "Actual vs. expected electricity demand (kW)" }), mainEl,
      ui().legend([{ kind: "line", color: DC.css("--actual"), label: "Actual" }, { kind: "dash", color: DC.css("--expected"), label: "Expected" }, { kind: "box", color: DC.css("--band-inner"), label: "80% / 98% forecast bands" }, { kind: "type", type: ev.type, label: "Selected event" }]),
      el("p", { class: "muted", text: `Highlighted interval: ${DC.time.stamp(ev.start)} → ${DC.time.stamp(ev.end)} (exclusive). Peak deviation ${DC.fmt.signed(deviation, " " + facts.unit)} at ${DC.time.stamp(deviationT)}. Simulated campus wall time; hourly cadence.` }));
    right.append(el("h3", { text: "Why was this flagged?" }), el("p", { text: `Actual demand departed from the median forecast by up to ${DC.fmt.signed(deviation, " " + facts.unit)} during a ${DC.fmt.hours(ev.duration_h)} ${DC.BEHAVIOR_LABEL[ev.behavior].toLowerCase()} pattern. The exported peak normalized score is ${ev.novelty.toFixed(2)}× the detection threshold. Rounded, capped exported scores do not reconstruct every alert decision.` }),
      el("h3", { text: "Understanding this anomaly" }), el("p", { text: DC.typeById[ev.type].desc + ". This describes a detected pattern, not a confirmed cause." }),
      el("p", { text: "Next step: compare operating schedules, meter quality and the available context before recording a review decision." }));
    context.append(el("div", { class: "chart-title", text: "Meter status" }), statusEl, el("div", { class: "chart-title", text: "Outdoor temperature (°C)" }), wxEl, el("div", { class: "chart-title", text: m.kind === "pv" ? "Irradiance (W/m²)" : "Simulated occupancy index" }), ctxEl);
    evidence.append(physical);
    evidence.append(el("div", { class: "chart-title", text: "Normalized anomaly score / threshold (not probability)" }), scoreEl);

    // right column: explanations, detection details, ground truth
    const expl = el("ul", { class: "explain" });
    if (!(ev.explanations || []).length) expl.append(el("li", {}, el("span", { class: "tag", text: "Context" }), "No contextual factor stands out."));
    for (const x of ev.explanations || []) {
      expl.append(el("li", {}, el("span", { class: "tag", text: x.type.replace("_", " ") }), el("span", { text: x.text }),
        el("span", { class: "verdict " + (x.supports ? "" : "muted"), text: x.supports ? "Supports" : "Doesn't explain" })));
    }
    right.append(el("div", { class: "chart-title", text: "Possible explanations" }), expl,
      el("div", { class: "note-box" }, "Explanations are hypotheses from weather, occupancy and schedule context. They are not a confirmed cause."));

    const d = ev.detection, det = DC.detectorById[ev.detector];
    evidence.append(el("div", { class: "chart-title", text: "Detection details" }), el("dl", { class: "kv" },
      el("dt", { text: "Detector" }), el("dd", { text: det.label }),
      el("dt", { text: "Implementation" }), el("dd", { text: det.source }),
      el("dt", { text: "Baseline" }), el("dd", { text: "Median (q0.50) forecast; band q0.01–q0.99" }),
      el("dt", { text: "Score" }), el("dd", { text: d.score.replace(/_/g, " ") }),
      el("dt", { text: "Threshold" }), el("dd", { text: `${d.threshold} (target FPR ${d.target_fpr})` }),
      el("dt", { text: "Calibration" }), el("dd", { text: `Clean data ${DC.time.day(DC.META.calibration_start)} – ${DC.time.day(DC.META.clean_prefix - 1)}` }),
      el("dt", { text: "Event grouping" }), el("dd", { text: `min run ${d.min_run} · merge gap ${d.merge_gap} · release ${d.release_threshold_ratio}` }),
      el("dt", { text: "Peak score" }), el("dd", { text: `${ev.novelty.toFixed(2)}× threshold at ${DC.time.short((ev.score_peak_t ?? ev.peak_t))}` })));

    const scoreT = ev.score_peak_t ?? ev.peak_t;
    const actual = DC.actual(ev.meter, scoreT), expected = DC.q(ev.meter, "q50", scoreT, ev.detector);
    const score = DC.q(ev.meter, "score", scoreT, ev.detector);
    evidence.append(el("div", { class: "chart-title", text: "Why was this flagged?" }),
      el("div", { class: "note-box evidence", text:
        `${det.label} exported this detected interval from ${DC.time.stamp(ev.start)} to ${DC.time.stamp(ev.end)} (${DC.fmt.hours(ev.duration_h)}). ` +
        `At the score peak (${DC.time.stamp(scoreT)}), observed = ${value(actual)}, median expected = ${value(expected)}, residual = ${Number.isFinite(expected) ? DC.fmt.signed(actual - expected) + " " + facts.unit : "unavailable"}. ` +
        `Exported peak score is ${ev.novelty.toFixed(2)}× the raw threshold ${d.threshold} (${d.score.replace(/_/g, " ")}). ` +
        `The displayed sample ratio is ${score == null ? "unavailable" : score.toFixed(2) + "×"}; ${score == null ? "threshold comparison unavailable" : score > 1 ? "above the normalized threshold of 1" : "not above 1 after export rounding"}. ` +
        "Scores are rounded and capped at 99× in the export; exact sample alert flags are unavailable. Grouping may include gaps or readings below threshold. Detection timestamp and operational detection delay are unavailable." }),
      el("div", { class: "note-box", text: "Forecast bands describe prediction uncertainty, not the probability of a fault. Weather and occupancy provide retrospective context; only the context-regression baseline uses them as forecasting inputs. Higher sensitivity may find more issues while increasing alert burden; the appropriate balance depends on operational costs. Review dismissals do not measure precision or recall." }));
    evidence.append(el("div", { class: "chart-title", text: "Other detectors on this meter and interval" }),
      el("ul", {}, DC.detectorOverlap(ev).map(({ detector, events }) => el("li", { text:
        `${detector.label}: ${events.length ? events.map((e) => e.id).join(", ") : "No overlapping detected interval"}` }))),
      el("p", { class: "muted", text: "Overlap compares exported intervals, independent of current filters. Agreement is not fault confirmation; research evaluation is in Detection model evaluation." }));


    const match = DC.matchFor(ev.id);
    const lab = match ? DC.labelById[match.label_id] : null;
    evidence.append(el("div", { class: "chart-title", text: "Synthetic ground truth (evaluation only)" }),
      el("div", { class: "note-box" }, lab
        ? [el("b", { text: `${lab.label_id} · ${DC.LABEL_KIND[lab.kind] || lab.kind}` }), ` injected ${DC.time.short(lab.start)} for ${DC.fmt.hours(lab.end - lab.start)}, magnitude ${DC.fmt.signed(lab.magnitude_kw, " kW")}. Detected after ${match.delay_h} h.`]
        : [el("b", { text: "No matched evaluation label." }), " No matched evaluation label is available for this record. This alone does not establish a false alarm. Labels never feed detection or priority."]));

    const review = el("section", { class: "review-panel", "aria-label": "Operator review" });
    const notes = el("textarea", { id: "review-notes", rows: "4", maxlength: "2000", placeholder: "Record evidence, checks and follow-up actions…" });
    notes.value = DC.notesStore.get(ev.id);
    const feedback = el("span", { role: "status", class: "muted" });
    review.append(el("h3", { text: "Operator review" }), el("label", { for: "review-status", text: "Review decision" }), statusSel,
      el("label", { for: "review-notes", text: "Investigation notes" }), notes,
      el("button", { class: "btn", type: "button", text: "Save notes", onclick: () => { feedback.textContent = DC.notesStore.set(ev.id, notes.value) ? "Saved in this browser." : "Browser storage unavailable; copy your notes before leaving."; } }), feedback,
      el("p", { class: "muted", text: "Decisions and notes are stored only in this browser. They are operator annotations, not verified ground truth or model-training labels." }));
    statusSel.id = "review-status";
    right.append(anomalyGuide(ev), review, context, diagnostics);
    review.append(el("p", { class: "muted", text: DC.statusStore.persistent() ? "" : "Browser storage is unavailable; annotations may be lost on reload." }));
    evidence.append(el("p", { text: "Raw peak score unavailable in this export; normalized scores are rounded and capped at 99×." }), el("p", { text: "Detector overlap: " + DC.D.events.filter(e => e.meter === ev.meter && e.start < ev.end && ev.start < e.end).map(e => e.id + " (" + e.detector + ")").join(", ") }), el("p", { text: "Forecast quantiles at deviation peak: " + ["q01", "q10", "q50", "q90", "q99"].map(k => k + " " + DC.fmt.kw(DC.q(m.id, k, deviationT))).join(" · ") }));

    evidence.append(el("h4", { text: "Baseline configuration & contextual statistics" }),
      el("pre", { class: "technical-json", text: JSON.stringify({ baseline: det.settings, context: ev.context || null, offhours_share: ev.offhours_share }, null, 2) }));

    requestAnimationFrame(() => {
      const ov = ui().overlays([ev], (t) => DC.actual(ev.meter, t), ev.id);
      DC.charts.timeSeries(mainEl, {
        t0, t1, height: 330,
        band: [{ lo: (t) => DC.q(m.id, "q01", t), hi: (t) => DC.q(m.id, "q99", t), color: DC.css("--band") }, { lo: (t) => DC.q(m.id, "q10", t), hi: (t) => DC.q(m.id, "q90", t), color: DC.css("--band-inner") }],
        series: [{ get: (t) => DC.q(m.id, "q50", t), color: DC.css("--expected"), dash: "5 4", width: 1.5 }, { get: (t) => DC.actual(m.id, t), color: DC.css("--actual"), width: 2 }],
        vlines: [{ t: ev.start, label: "Start" }, { t: ev.end, label: "End (exclusive)" }],
        intervals: [{ start: ev.start, end: ev.end, color: DC.typeColor(ev.type), selected: true, ev }], markers: [{ t: deviationT, v: DC.actual(m.id, deviationT), color: DC.typeColor(ev.type), shape: DC.typeById[ev.type].shape, selected: true, ev }],
        tooltip: (t, hit) => {
          if (hit && hit.ev && hit.ev.id !== ev.id) return ui().eventTooltip(hit.ev);
          const a = DC.actual(m.id, t), e = DC.q(m.id, "q50", t);
          return {
            title: DC.time.stamp(t) + (t >= ev.start && t < ev.end ? " · in event" : ""),
            rows: [
              { color: DC.css("--actual"), value: DC.fmt.kw(a), label: "measured" },
              { color: DC.css("--expected"), kind: "dash", value: DC.fmt.kw(e), label: "expected" },
              { value: e == null ? "—" : DC.fmt.signed(a - e, " kW"), label: "deviation" },
              { color: DC.css("--band-inner"), kind: "box", value: `${DC.fmt.one(DC.q(m.id, "q01", t))}–${DC.fmt.one(DC.q(m.id, "q99", t))}`, label: "Nominal 98% band (kW)" },
              { value: DC.q(m.id, "score", t) == null ? "Unavailable" : DC.q(m.id, "score", t).toFixed(2) + "×", label: "score / threshold (boundary 1; export cap 99×)" },
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
        series: [{ get: (t) => sc(t) == null ? null : Math.min(sc(t), 6), color: DC.css("--ink-2"), width: 1.5 }],
        yFormat: (v) => v.toFixed(v < 10 ? 1 : 0) + "×",
        tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--ink-2"), value: sc(t) == null ? "Unavailable" : sc(t).toFixed(2) + "×", label: "score ÷ threshold" + (sc(t) > 6 ? " (clipped at 6×)" : "") }] }),
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
      const temp = DC.D.weather?.temp;
      const tNorm = (t) => { let s = 0, n = 0; for (let k = 1; k <= 14; k++) if (t - 24 * k >= 0) { s += temp[t - 24 * k]; n++; } return n ? s / n : null; };
      if (temp) DC.charts.timeSeries(wxEl, {
        t0, t1, height: 110, zero: false,
        intervals: ov.intervals.map((iv) => ({ ...iv, selected: false })),
        series: [{ get: tNorm, color: DC.css("--expected"), dash: "4 3", width: 1.3 }, { get: (t) => temp[t], color: DC.css("--t-collective"), width: 1.6 }],
        yFormat: (v) => v.toFixed(0) + "°",
        tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--t-collective"), value: DC.fmt.one(temp[t]) + " °C", label: "temperature" }, { color: DC.css("--expected"), kind: "dash", value: DC.fmt.one(tNorm(t)) + " °C", label: "14-day same-hour mean" }, { value: DC.fmt.pct(DC.D.weather?.cloud?.[t]), label: "cloud cover" }] }),
      });
      if (!temp) wxEl.textContent = "Weather context unavailable.";
      if (m.kind === "pv") {
        const ghi = DC.D.weather?.ghi;
        if (!ghi) { ctxEl.textContent = "Irradiance context unavailable."; return; }
        DC.charts.timeSeries(ctxEl, {
          t0, t1, height: 100, intervals: ov.intervals.map((iv) => ({ ...iv, selected: false })),
          series: [{ get: (t) => ghi[t], color: DC.css("--t-seasonal"), width: 1.6 }],
          tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--t-seasonal"), value: DC.fmt.int(ghi[t]) + " W/m²", label: "irradiance" }, { value: DC.fmt.pct(DC.D.weather?.cloud?.[t]), label: "cloud cover" }] }),
        });
      } else {
        const occ = b.occupancy;
        if (!occ) { ctxEl.textContent = "Occupancy context unavailable."; return; }
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

  function anomalyGuide(ev) {
    const rows = [
      ["Point", "One observation differs sharply from expected behavior; for example, a demand spike lasting one sample."],
      ["Collective", "A sequence is unusual as a whole, even if individual readings are not extreme; for example, several hours of elevated demand."],
      ["Contextual", "A reading is unusual in its context; for example, afternoon demand levels occurring overnight."],
      ["Seasonal / pattern", "A recurring shape changes; for example, weekend demand follows a weekday pattern."],
      ["Trend / level shift", "Demand drifts or moves to a different sustained level; for example, rising overnight baseline consumption. This prototype does not separately classify trend events."],
      ["Data integrity", "Readings are missing, stuck or suspect; for example, exactly repeated meter values for many samples. This is a data-quality category."],
    ];
    return el("details", { class: "note-box" }, el("summary", { text: `Understand this classification: ${DC.BEHAVIOR_LABEL[ev.behavior] || ev.behavior} behavior · ${DC.CATEGORY_LABEL[ev.category] || ev.category}` }),
      el("p", { text: "Temporal behavior describes how measurements change over time. Operational categories describe the observed issue, not a proven cause. These teaching examples do not diagnose this event." }),
      el("dl", { class: "kv" }, rows.flatMap(([name, desc]) => [el("dt", { text: name }), el("dd", { text: desc })])),
      el("p", {}, "Terminology: ",
        el("a", { href: "https://doi.org/10.3390/app14031194", text: "Guato Burgos et al. (2024)" }), "; ",
        el("a", { href: "https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/hash/ec5decca5ed3d6b8079e2e7e7bacc9f2-Abstract-round1.html", text: "Lai et al. (2021)" }), ". Operational evaluation: ",
        el("a", { href: "https://arxiv.org/abs/2402.10802", text: "Si et al., TimeSeriesBench" }), "."));
  }

  function anomalyGuide(ev) {
    const rows = [
      ["Point", "One observation differs sharply from expected behavior; for example, a demand spike lasting one sample."],
      ["Collective", "A sequence is unusual as a whole, even if individual readings are not extreme; for example, several hours of elevated demand."],
      ["Contextual", "A reading is unusual in its context; for example, afternoon demand levels occurring overnight."],
      ["Seasonal / pattern", "A recurring shape changes; for example, weekend demand follows a weekday pattern."],
      ["Trend / level shift", "Demand drifts or moves to a different sustained level; for example, rising overnight baseline consumption. This prototype does not separately classify trend events."],
      ["Data integrity", "Readings are missing, stuck or suspect; for example, exactly repeated meter values for many samples. This is a data-quality category."],
    ];
    return el("details", { class: "note-box" }, el("summary", { text: `Understand this classification: ${DC.BEHAVIOR_LABEL[ev.behavior] || ev.behavior} behavior · ${DC.CATEGORY_LABEL[ev.category] || ev.category}` }),
      el("p", { text: "Temporal behavior describes how measurements change over time. Operational categories describe the observed issue, not a proven cause. These teaching examples do not diagnose this event." }),
      el("dl", { class: "kv" }, rows.flatMap(([name, desc]) => [el("dt", { text: name }), el("dd", { text: desc })])),
      el("p", {}, "Terminology: ",
        el("a", { href: "https://doi.org/10.3390/app14031194", text: "Guato Burgos et al. (2024)" }), "; ",
        el("a", { href: "https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/hash/ec5decca5ed3d6b8079e2e7e7bacc9f2-Abstract-round1.html", text: "Lai et al. (2021)" }), ". Operational evaluation: ",
        el("a", { href: "https://arxiv.org/abs/2402.10802", text: "Si et al., TimeSeriesBench" }), "."));
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

  DC.sections.investigate = { render, sortPriority: () => { view.sort = "priority"; } };
})();
