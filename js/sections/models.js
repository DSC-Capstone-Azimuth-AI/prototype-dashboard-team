/* Section 4 - Detection model evaluation (synthetic ground truth lives in synthetic-labels.js). */
(function () {
  "use strict";
  const DC = window.DC, el = DC.el, ui = () => DC.ui;
  DC.sections = DC.sections || {};

  function render(root) {
    DC.clear(root);
    const D = DC.D, L = DC.L, E = D.evaluation, cur = DC.state.detector;
    if (!E || D.detectors.some(d => !E[d.id]) || !L.labels.length) {
      root.append(el("h2", { id: "h-models", text: "Detection Quality" }), el("p", { class: "empty", text: "Synthetic evaluation evidence is unavailable for this dataset. An unlabeled detection cannot be classified as a false positive." })); return;
    }
    const [t0, t1] = DC.range();
    root.append(el("div", { class: "section-head" },
      el("h2", { id: "h-models", text: "Detection Quality" }),
      el("p", { text: "How well each detector finds the injected synthetic events, how often it raises false alarms on normal behaviour, and the evidence behind each threshold. Settings were chosen on a separate development campus and locked before this test." })));
    root.append(el("p", { class: "note-box", text: "Research view: detector comparison metrics describe the full synthetic evaluation run. Time and scope filters affect diagnostic panels, not the comparison denominators. Unmatched detections are evaluation outcomes, not verified operational false alarms." }));
    const grid = el("div", { class: "grid cols-12" });
    root.append(grid);

    // ---------- comparison table ----------
    const ct = ui().card("Detector comparison", `Synthetic test campus · ${L.labels.length} injected events · click a row to switch the dashboard's detector`, { span: 12 });
    grid.append(ct.card);
    const tbody = el("tbody");
    for (const d of D.detectors) {
      const e = E[d.id], s = e.selection;
      tbody.append(el("tr", { class: d.id === cur ? "selected" : "", tabindex: "0", onkeydown: k => { if (k.key === "Enter") DC.setState({ detector: d.id, selected: null }); }, onclick: () => DC.setState({ detector: d.id, selected: null }) },
        el("td", {}, el("b", { text: d.label }), el("div", { class: "muted", style: { fontSize: "12px" }, text: d.source })),
        el("td", { class: "mono", text: `${s.score} · FPR ${s.target_fpr} · run ${s.events.min_run} · gap ${s.events.merge_gap} · rel ${s.events.release_threshold_ratio}` }),
        el("td", { class: "num", text: e.test.event_precision.toFixed(2) }),
        el("td", { class: "num", text: e.test.event_recall.toFixed(2) }),
        el("td", { class: "num" }, el("b", { text: e.test.event_f1.toFixed(2) })),
        el("td", { class: "num", text: `${e.test.event_tp} / ${e.test.event_fp} / ${e.test.event_fn}` }),
        el("td", { class: "num", text: e.test.detection_delay == null ? "—" : e.test.detection_delay.toFixed(1) + " h" }),
        el("td", { class: "num", text: e.false_alerts_per_1000.toFixed(1) }),
        el("td", { class: "num", text: `${e.normal.false_alerts_per_1000.toFixed(1)}`, title: `target ${(s.target_fpr * 1000).toFixed(0)} per 1,000` }),
        el("td", { class: "num", text: e.auprc == null ? "—" : e.auprc.toFixed(2) }),
        el("td", { class: "num", text: `${e.coverage_80.toFixed(2)} / ${e.coverage_98.toFixed(2)}` })));
    }
    ct.body.append(el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Detector", "Locked settings (chosen on campus-dev)", "Precision", "Recall", "F1", "TP / FP / FN", "Delay", "False alerts /1k", "Normal campus /1k", "AUPRC", "Cov 80 / 98"].map((h, i) => el("th", { class: i > 1 ? "num" : "", text: h })))), tbody)));
    ct.body.append(el("div", { class: "card-foot", text: "Event metrics follow the repo: a detection is correct if it overlaps a label, one detection per label, delay = first overlapping hour − label start. False alerts count raw flagged hours per 1,000 normal hours. 'Normal campus' is a third simulation with no injected events. Coverage should be near 0.80 / 0.98 for a calibrated band." }));

    // ---------- P / R / F1 small multiples ----------
    for (const [key, label] of [["event_precision", "Precision"], ["event_recall", "Recall"], ["event_f1", "F1"]]) {
      const c = ui().card(label, "Event-level, synthetic test", { span: 4 });
      grid.append(c.card);
      const ch = el("div", { class: "chart" });
      c.body.append(ch);
      requestAnimationFrame(() => DC.charts.hbar(ch, {
        max: 1, labelW: 170, items: D.detectors.map((d) => ({
          label: d.label, value: E[d.id].test[key], display: E[d.id].test[key].toFixed(2), color: d.id === cur ? DC.css("--seq-6") : DC.css("--seq-3"),
          onClick: () => DC.setState({ detector: d.id, selected: null }),
          tooltip: { title: d.label, rows: [{ value: E[d.id].test[key].toFixed(3), label }], note: "Click to use this detector" },
        })),
      }));
    }

    // ---------- per-kind recall ----------
    const pk = ui().card("Detection by injected event type", "Detected / injected, per detector · spikes vs sustained load vs shifts vs drops vs data faults", { span: 6 });
    grid.append(pk.card);
    const pkEl = el("div", { class: "chart" });
    pk.body.append(pkEl);
    const kinds = Object.keys(E[cur].per_kind).sort((a, b) => (DC.LABEL_KIND[a] || a).localeCompare(DC.LABEL_KIND[b] || b));
    requestAnimationFrame(() => DC.charts.heatmap(pkEl, {
      rows: kinds.map((k) => ({ id: k, label: DC.LABEL_KIND[k] || k })), cols: D.detectors.map((d) => ({ id: d.id, label: d.label.replace("Seasonal naive", "Seas. naive").replace("Context-aware regression", "Context-aware").replace("Rolling median / MAD", "Rolling MAD") })),
      labelW: 140, cellH: 24,
      cell: (r, c) => {
        const v = E[c.id].per_kind[r.id] || { n: 0, detected: 0 };
        const f = v.n ? v.detected / v.n : 0;
        return { fill: DC.seq(f), mark: `${v.detected}/${v.n}`, markColor: f > 0.6 ? "#ffffff" : DC.css("--ink"), selected: c.id === cur, clickable: false,
          tooltip: { title: `${r.label} · ${c.label}`, rows: [{ value: `${v.detected} of ${v.n}`, label: "labels detected" }] } };
      },
    }));
    pk.body.append(el("div", { class: "card-foot", text: "Kinds from the repo's inject_anomaly, plus overnight load, HVAC on a mild day and PV underperformance added for building energy." }));

    // ---------- negative controls ----------
    const nc = ui().card("False alarms on normal changes", "Seasonal and scheduled variation should not be called a fault", { span: 6 });
    grid.append(nc.card);
    const nb = el("tbody");
    for (const d of D.detectors) {
      const e = E[d.id];
      nb.append(el("tr", { class: d.id === cur ? "selected static" : "static" },
        el("td", { text: d.label }),
        ...D.normal_controls.map((c) => el("td", { class: "num", text: String(e.control_window_events[c.id] || 0) })),
        el("td", { class: "num", text: String(e.normal.events) }),
        el("td", { class: "num" }, e.normal.false_alerts_per_1000.toFixed(1), el("span", { class: "muted", text: ` / ${(e.selection.target_fpr * 1000).toFixed(0)}` }))));
    }
    nc.body.append(el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Detector", ...D.normal_controls.map((c) => c.name), "Events on normal campus", "Normal alerts /1k vs target"].map((h, i) => el("th", { class: i ? "num" : "", text: h })))), nb)));
    nc.body.append(el("div", { class: "note-box", style: { marginTop: "10px" } },
      ...D.normal_controls.map((c) => el("div", {}, el("b", { text: c.name + ": " }), `${DC.time.day(c.start)} – ${DC.time.day(c.end - 1)}. ${c.note}`))));

    // ---------- ground truth vs predicted ----------
    const gt = ui().card("Predicted intervals vs. synthetic ground truth", `${DC.det().label} · outlined = injected label, filled = detection · selected range`, { span: 12 });
    grid.append(gt.card);
    const gtEl = el("div", { class: "chart" });
    gt.body.append(gtEl);
    const matches = L.matches[cur] || {};
    const hitLabels = new Set(Object.values(matches).filter(Boolean).map((m) => m.label_id));
    const scope = DC.scopeMeters();
    const evs = DC.allEvents().filter((e) => scope.some((m) => m.id === e.meter));
    const rows = scope.map((m) => ({
      label: m.id,
      items: [
        ...L.labels.filter((l) => l.meter === m.id).map((l) => ({
          kind: "label", start: l.start, end: l.end, color: hitLabels.has(l.label_id) ? DC.css("--ink-2") : DC.css("--sev-critical"),
          tooltip: { title: `${l.label_id} · ${DC.LABEL_KIND[l.kind] || l.kind}`, rows: [{ value: DC.time.short(l.start), label: "onset" }, { value: DC.fmt.hours(l.end - l.start), label: "duration" }, { value: DC.fmt.signed(l.magnitude_kw, " kW"), label: "magnitude" }, { value: `${l.severity_param}`, label: "severity parameter (× local MAD)" }], note: hitLabels.has(l.label_id) ? "Detected" : "Missed by this detector" },
        })),
        ...evs.filter((e) => e.meter === m.id).map((e) => ({
          kind: "det", start: e.start, end: e.end, color: matches[e.id] ? DC.css("--t-point") : DC.css("--sev-high"), selected: e.id === DC.state.selected,
          tooltip: ui().eventTooltip(e, [{ value: matches[e.id] ? matches[e.id].label_id : "none", label: "matched label" }]),
          onClick: () => DC.openEvent(e.id),
        })),
      ],
    }));
    requestAnimationFrame(() => DC.charts.timeline(gtEl, { rows, t0, t1, labelW: 90 }));
    gt.body.append(ui().legend([
      { kind: "box", color: DC.css("--t-point"), label: "Detection matched to a label" },
      { kind: "box", color: DC.css("--sev-high"), label: "False positive" },
      { kind: "line", color: DC.css("--ink-2"), label: "Label detected (outline)" },
      { kind: "line", color: DC.css("--sev-critical"), label: "Label missed (outline)" },
    ]));

    // ---------- missed + false positives ----------
    const ms = ui().card("Missed anomalies", `${E[cur].missed.length} of ${L.labels.length} injected events not detected`, { span: 6 });
    grid.append(ms.card);
    const mb = el("tbody");
    for (const id of E[cur].missed) {
      const l = DC.labelById[id];
      mb.append(el("tr", { class: "static" }, el("td", { class: "mono", text: id }), el("td", { text: DC.LABEL_KIND[l.kind] || l.kind }), el("td", { text: l.meter }), el("td", { text: DC.time.short(l.start) }), el("td", { class: "num", text: DC.fmt.hours(l.end - l.start) }), el("td", { class: "num", text: DC.fmt.signed(l.magnitude_kw, " kW") })));
    }
    ms.body.append(E[cur].missed.length ? el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Label", "Kind", "Meter", "Onset", "Duration", "Magnitude"].map((h, i) => el("th", { class: i > 3 ? "num" : "", text: h })))), mb)) : el("div", { class: "empty", text: "Every injected event was detected." }));
    const sel = E[cur].selection;
    if (sel.events.min_run > 1) ms.body.append(el("div", { class: "card-foot", text: `Note: the locked setting min_run = ${sel.events.min_run} discards flag runs shorter than ${sel.events.min_run} h, so 1-hour spikes can be missed by design.` }));

    const fp = ui().card("False-positive analysis", `${E[cur].false_positives.length} detections with no overlapping label, by assigned type`, { span: 6 });
    grid.append(fp.card);
    const fpEl = el("div", { class: "chart" });
    fp.body.append(fpEl);
    const fpEvents = E[cur].false_positives.map(DC.eventById).filter(Boolean);
    requestAnimationFrame(() => DC.charts.hbar(fpEl, {
      glyphs: true,
      items: DC.TYPES.map((t) => {
        const list = fpEvents.filter((e) => e.type === t.id);
        return { label: t.label, value: list.length, color: DC.typeColor(t.id), typeId: t.id,
          tooltip: { title: `${t.label} false positives`, rows: [{ value: String(list.length), label: "events" }, { value: String(list.filter((e) => e.severity === "low").length), label: "of them low severity" }] } };
      }),
    }));
    const lowShare = fpEvents.length ? fpEvents.filter((e) => e.severity === "low" || e.severity === "medium").length / fpEvents.length : 0;
    fp.body.append(el("div", { class: "card-foot", text: `${DC.fmt.pct(lowShare)} of false positives are low or medium priority, so ranking keeps most of them out of the top of the queue.` }));

    // ---------- transparency ----------
    const focus = DC.state.meter !== "all" ? DC.meterById[DC.state.meter] : scope[0];
    const tr = ui().card("Detection transparency", focus ? `${focus.id} · ${sel.score.replace(/_/g, " ")} ÷ threshold (${DC.det().threshold}) · choose a meter in the filters` : "", { span: 6 });
    grid.append(tr.card);
    if (focus) {
      const trEl = el("div", { class: "chart" });
      tr.body.append(trEl);
      const labs = L.labels.filter((l) => l.meter === focus.id).map((l) => ({ start: l.start, end: l.end, color: DC.css("--muted") }));
      requestAnimationFrame(() => DC.charts.timeSeries(trEl, {
        t0, t1, height: 220, yMin: 0, intervals: labs,
        shade: [{ start: DC.META.calibration_start, end: DC.META.clean_prefix, label: "threshold calibration", color: DC.css("--surface-3") }],
        hlines: [{ y: 1, label: "threshold", color: DC.css("--sev-critical") }],
        series: [{ get: (t) => { const v = DC.q(focus.id, "score", t); return v == null ? null : Math.min(v, 8); }, color: DC.css("--ink-2"), width: 1.3 }],
        yFormat: (v) => v + "×",
        tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--ink-2"), value: (DC.q(focus.id, "score", t) ?? 0).toFixed(2) + "×", label: "score ÷ threshold" }], note: labs.some((l) => t >= l.start && t < l.end) ? "Inside an injected label" : null }),
      }));
      tr.body.append(ui().legend([{ kind: "line", color: DC.css("--ink-2"), label: "Score ÷ threshold (clipped at 8×)" }, { kind: "dash", color: DC.css("--sev-critical"), label: "Threshold" }, { kind: "box", color: DC.css("--muted"), label: "Injected label window" }]));
    }

    // ---------- forecasting backbone ----------
    const fb = ui().card("Forecasting backbone (SarSim0 training)", "From docs/results.md · forecast accuracy, not anomaly detection · lower MASE is better", { span: 6 });
    grid.append(fb.card);
    const fbEl = el("div", { class: "chart" });
    fb.body.append(el("div", { class: "chart-title", text: "M4 Monthly MASE (zero-shot real data)" }), fbEl);
    requestAnimationFrame(() => DC.charts.hbar(fbEl, {
      labelW: 190, items: D.forecasting_results.map((r) => ({
        label: r.model, value: r.m4_mase, display: r.m4_mase.toFixed(3), color: r.model === "chronos2-ft-500" ? DC.css("--seq-6") : DC.css("--seq-3"),
        tooltip: { title: r.model, rows: [{ value: r.sim_iid_mase.toFixed(3), label: "sim_iid MASE" }, { value: r.sim_ood_mase.toFixed(3), label: "sim_ood_season MASE" }, { value: r.m4_smape.toFixed(2) + "%", label: "M4 sMAPE" }, { value: r.m4_cov98.toFixed(3), label: "M4 98% coverage" }] },
      })),
    }));
    fb.body.append(el("div", { class: "card-foot", text: "chronos2-ft-500 is the best real-data forecaster. Running it as a detector needs the team's GPU environment: tools/build_data.py --model chronos2:<checkpoint> adds it here without UI changes." }));

    // ---------- synthetic label gallery ----------
    const sg = ui().card("Synthetic scenario gallery", "Every injected test event with the current detector's outcome · panels aligned to onset", { span: 12 });
    grid.append(sg.card);
    const gal = el("div", { class: "gallery" });
    sg.body.append(gal);
    const labelToEvent = {};
    for (const [evId, m] of Object.entries(matches)) if (m) labelToEvent[m.label_id] = evId;
    const panels = [];
    for (const l of L.labels.filter((x) => scope.some((m) => m.id === x.meter))) {
      const evId = labelToEvent[l.label_id];
      const chart = el("div", { class: "chart" });
      const p = el("button", { class: "panel", type: "button", onclick: () => evId && DC.openEvent(evId), "aria-label": `${l.label_id} ${l.kind}`, style: { cursor: evId ? "pointer" : "default" } },
        el("div", { class: "p-top" }, el("b", { text: DC.LABEL_KIND[l.kind] || l.kind }), el("span", { class: "sev" }, el("span", { class: "dot", style: { background: evId ? DC.css("--t-point") : DC.css("--sev-critical") } }), evId ? "Detected" : "Missed")),
        el("div", { class: "p-loc", text: `${l.meter} · ${DC.time.short(l.start)}` }), chart,
        el("div", { class: "p-meta" }, el("span", { class: "p-id", text: l.label_id }), el("span", { text: DC.fmt.hours(l.end - l.start) }), el("span", { text: DC.fmt.signed(l.magnitude_kw, " kW") }), el("span", { class: "muted", text: evId ? "→ " + evId : l.source })));
      gal.append(p);
      panels.push({ chart, l });
    }
    requestAnimationFrame(() => {
      for (const { chart, l } of panels) {
        const a = Math.max(DC.META.detector_start, l.start - 24), b = Math.min(DC.META.n, l.start + Math.min(168, Math.max(48, l.end - l.start + 24)));
        DC.charts.timeSeries(chart, {
          t0: a, t1: b, height: 72, compact: true,
          intervals: [{ start: l.start, end: l.end, color: DC.css("--muted") }],
          series: [{ get: (t) => DC.q(l.meter, "q50", t), color: DC.css("--expected"), dash: "4 3", width: 1.2 }, { get: (t) => DC.actual(l.meter, t), color: DC.css("--actual"), width: 1.4 }],
        });
      }
    });

    // ---------- scenario metadata ----------
    const md = ui().card("Synthetic scenario record", "Stored with every build so results are reproducible", { span: 12 });
    grid.append(md.card);
    const M = DC.META;
    md.body.append(el("dl", { class: "kv" },
      el("dt", { text: "Generator" }), el("dd", { text: M.generator_version }),
      el("dt", { text: "Seeds" }), el("dd", { text: Object.entries(M.seeds).map(([k, v]) => `${k} ${v}`).join(" · ") }),
      el("dt", { text: "Sampling interval" }), el("dd", { text: M.sampling_interval }),
      el("dt", { text: "Labels" }), el("dd", { text: `${L.labels.length} events, ${L.meta.index_convention}, stored separately in data/synthetic-labels.js` }),
      el("dt", { text: "Splits" }), el("dd", { text: `history ${DC.time.day(0)} · residual scale ${DC.time.day(M.detector_start)} · threshold calibration ${DC.time.day(M.calibration_start)} · evaluation from ${DC.time.day(M.clean_prefix)}` }),
      el("dt", { text: "Selection" }), el("dd", { text: "162 candidates (3 scores × 3 target FPRs × min_run × merge_gap × release) on campus-dev; best event F1 with normal FPR ≤ 2× target" }),
      el("dt", { text: "Built" }), el("dd", { text: `${M.built_at} from ${M.source_repo}` })));
  }

  DC.sections.models = { render };
})();
