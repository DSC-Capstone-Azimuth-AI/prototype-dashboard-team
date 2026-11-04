/* Shared view pieces: cards, legends, event overlays and tooltips. */
(function () {
  "use strict";
  const DC = window.DC, el = DC.el;

  function card(title, sub, opts = {}) {
    const tools = el("div", { class: "tools" });
    const head = el("div", { class: "card-head" }, el("div", {}, el("h3", { text: title, id: opts.id || null }), sub ? el("div", { class: "sub", text: sub }) : null), tools);
    const body = el("div", { class: "card-body" });
    const c = el("div", { class: "card " + (opts.span ? "span-" + opts.span : "") + (opts.cls ? " " + opts.cls : "") }, head, body);
    if (opts.foot) c.append(el("div", { class: "card-foot", text: opts.foot }));
    return { card: c, body, tools, head };
  }

  function legend(items) {
    const box = el("div", { class: "legend" });
    for (const it of items) {
      let sw;
      if (it.kind === "line") { sw = el("span", { class: "swatch-line" }); sw.style.borderTopColor = it.color; }
      else if (it.kind === "dash") { sw = el("span", { class: "swatch-dash" }); sw.style.borderTopColor = it.color; }
      else if (it.kind === "type") sw = DC.glyph(it.type, 11);
      else { sw = el("span", { class: "swatch-box" }); sw.style.background = it.color; }
      box.append(el("span", {}, sw, it.label));
    }
    return box;
  }

  function segmented(options, value, onChange, label) {
    const box = el("div", { class: "seg", role: "group", "aria-label": label || "" });
    for (const [v, text] of options) {
      box.append(el("button", { type: "button", "data-focus-key": (label || "view") + ":" + v, "aria-pressed": String(v === value), onclick: () => onChange(v) }, text));
    }
    return box;
  }

  // Local controls should keep their focus, disclosure state, draft and scroll position.
  function refresh(root, draw) {
    const active = document.activeElement;
    const identify = node => node.id || node.getAttribute("data-focus-key") || node.getAttribute("aria-label");
    const key = root.contains(active) ? identify(active) : null;
    const disclosures = new Map(Array.from(root.querySelectorAll("details"), node => [node.querySelector("summary")?.textContent, node.open]));
    const drafts = Array.from(root.querySelectorAll("textarea[id]"), node => [node.id, node.value]);
    const x = window.scrollX, y = window.scrollY;
    draw();
    for (const node of root.querySelectorAll("details")) {
      const name = node.querySelector("summary")?.textContent;
      if (disclosures.has(name)) node.open = disclosures.get(name);
    }
    for (const [id, value] of drafts) { const node = document.getElementById(id); if (node && root.contains(node)) node.value = value; }
    if (key) Array.from(root.querySelectorAll("button, select, input, textarea, a")).find(node => identify(node) === key)?.focus({ preventScroll: true });
    window.scrollTo({ left: x, top: y, behavior: "instant" });
  }

  function eventTooltip(ev, extra) {
    const t = DC.typeById[ev.type] || { label: "Unclassified pattern" };
    const rows = [
      { glyph: ev.type, value: t.label, label: DC.CATEGORY_LABEL[ev.category] || "" },
      { color: DC.css("--actual"), value: DC.fmt.kw(ev.peak_actual), label: "measured at peak" },
      { color: DC.css("--expected"), kind: "dash", value: DC.fmt.kw(ev.peak_expected), label: "expected" },
      { value: DC.fmt.signed(ev.peak_dev, " kW"), label: `deviation (${DC.fmt.signed(ev.peak_dev_pct, "%")})` },
      { value: DC.fmt.hours(ev.duration_h), label: "duration" },
      { value: ev.excess_kwh == null ? "n/a" : DC.fmt.signed(ev.excess_kwh, " kWh"), label: "excess energy" },
      { value: ev.novelty.toFixed(2) + "×", label: `${ev.detection.score.replace(/_/g, " ")} / threshold` },
    ];
    return {
      title: `${ev.id} · ${DC.meterName(ev.meter)} · ${DC.time.short(ev.start)}`,
      rows: extra ? rows.concat(extra) : rows,
      note: `${(DC.sevById[ev.severity] || {}).label} priority (${ev.priority.toFixed(0)}) · ${DC.statusById[DC.eventStatus(ev)].label} · click to open record`,
    };
  }

  // Convert events into chart overlays: point events -> markers, others -> shaded intervals.
  function overlays(events, yAt, selectedId) {
    const intervals = [], markers = [];
    for (const ev of events) {
      const color = DC.typeColor(ev.type);
      const shape = (DC.typeById[ev.type] || {}).shape || "circle";
      const peakT = DC.eventFacts(ev).peak?.t ?? ev.deviation_peak_t ?? ev.peak_t;
      if (ev.behavior === "point" && ev.duration_h <= 2) {
        markers.push({ t: peakT, v: yAt(peakT), color, shape, id: ev.id, ev, selected: ev.id === selectedId });
      } else {
        intervals.push({ start: ev.start, end: ev.end, color, id: ev.id, ev, selected: ev.id === selectedId });
        // A marker at the peak keeps shape identity for sustained events too
        markers.push({ t: peakT, v: yAt(peakT), color, shape, id: ev.id, ev, selected: ev.id === selectedId });
      }
    }
    return { intervals, markers };
  }

  // Measured / expected for the current scope (single meter, or sum of main meters).
  function scopeSeries(meters) {
    const det = DC.det();
    const mainsOnly = meters.filter((m) => m.kind === "main");
    if (meters.length === 1 || mainsOnly.length === 1) {
      const m = meters.length === 1 ? meters[0] : mainsOnly[0];
      return {
        single: true, meters: [m],
        label: `${m.id} · ${DC.meterName(m.id)}`,
        actual: (t) => m.actual[t],
        expected: (t) => DC.q(m.id, "q50", t),
        lo: (t) => DC.q(m.id, "q01", t), hi: (t) => DC.q(m.id, "q99", t),
        lo80: (t) => DC.q(m.id, "q10", t), hi80: (t) => DC.q(m.id, "q90", t),
      };
    }
    const mains = meters.filter((m) => m.kind === "main");
    const N = DC.META.n, a = new Float64Array(N), e = new Float64Array(N);
    for (let t = 0; t < N; t++) {
      let sa = 0, se = 0, ok = true;
      for (const m of mains) {
        sa += m.actual[t] || 0;
        const q = DC.q(m.id, "q50", t);
        if (q == null) ok = false; else se += q;
      }
      a[t] = sa; e[t] = ok ? se : NaN;
    }
    return {
      single: false, meters: mains, label: `${mains.length} main meters (sum)`,
      actual: (t) => a[t], expected: (t) => (isFinite(e[t]) ? e[t] : null), detector: det.id,
    };
  }

  DC.ui = { card, legend, segmented, eventTooltip, overlays, scopeSeries, refresh };
})();
