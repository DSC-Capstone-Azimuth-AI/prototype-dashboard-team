/* Shared helpers: time, formatting, taxonomy, DOM. Everything hangs off window.DC. */
(function () {
  "use strict";
  const DC = (window.DC = window.DC || {});
  const D = window.DERCONNECT_DATA;
  if (!D) {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:system-ui">Missing <code>data/derconnect-data.js</code>. Run <code>python tools/build_data.py --repo ../chronos2-sarsim0-anomaly-team</code>.</p>';
    throw new Error("DERCONNECT_DATA missing");
  }

  // ---------- time ----------
  const START_MS = Date.parse(D.meta.start + ":00Z"); // timestamps are campus-local wall time; treat as UTC to avoid DST shifts
  const HOUR = 3600 * 1000;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  DC.time = {
    N: D.meta.n,
    toDate: (t) => new Date(START_MS + t * HOUR),
    fromDate: (d) => Math.round((d.getTime() - START_MS) / HOUR),
    fromISODate: (s) => Math.round((Date.parse(s + "T00:00:00Z") - START_MS) / HOUR),
    isoDate: (t) => DC.time.toDate(t).toISOString().slice(0, 10),
    day: (t) => MONTHS[DC.time.toDate(t).getUTCMonth()] + " " + DC.time.toDate(t).getUTCDate(),
    dow: (t) => DOW[DC.time.toDate(t).getUTCDay()],
    hour: (t) => DC.time.toDate(t).getUTCHours(),
    stamp: (t) => {
      const d = DC.time.toDate(t);
      return `${DOW[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${String(d.getUTCHours()).padStart(2, "0")}:00`;
    },
    short: (t) => {
      const d = DC.time.toDate(t);
      return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:00`;
    },
  };

  // ---------- formatting ----------
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  DC.fmt = {
    int: (v) => (v == null || !isFinite(v) ? "—" : nf0.format(v)),
    one: (v) => (v == null || !isFinite(v) ? "—" : nf1.format(v)),
    kw: (v) => (v == null || !isFinite(v) ? "—" : nf1.format(v) + " kW"),
    kwh: (v) => (v == null || !isFinite(v) ? "n/a" : nf0.format(v) + " kWh"),
    compact: (v) => {
      if (v == null || !isFinite(v)) return "—";
      const a = Math.abs(v);
      if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
      if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + "K";
      return nf0.format(v);
    },
    pct: (v, d = 0) => (v == null || !isFinite(v) ? "—" : (v * 100).toFixed(d) + "%"),
    signed: (v, unit = "") => (v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + nf1.format(v) + unit),
    hours: (h) => (h < 48 ? `${h} h` : `${(h / 24).toFixed(h % 24 ? 1 : 0)} d`),
  };

  // ---------- taxonomy (doc section 4) ----------
  DC.TYPES = [
    { id: "point", label: "Point", shape: "circle", desc: "Sudden isolated spike or drop", viz: "Line chart with highlighted points" },
    { id: "collective", label: "Collective", shape: "square", desc: "Sustained abnormal demand", viz: "Shaded anomaly intervals" },
    { id: "contextual", label: "Contextual", shape: "diamond", desc: "Electricity use that is unusual for the circumstances, even if that demand would be normal at another time", viz: "Actual vs expected with weather" },
    { id: "seasonal", label: "Seasonal / pattern", shape: "triangle", desc: "Unusual overnight, weekend or shape change", viz: "Historical comparison and heatmap" },
    { id: "peak", label: "Peak demand", shape: "star", desc: "Demand above normal operating peak", viz: "Peak chart with thresholds" },
    { id: "data_integrity", label: "Data integrity", shape: "cross", desc: "Missing, stuck or suspicious readings", viz: "Meter status timeline" },
  ];
  DC.typeById = Object.fromEntries(DC.TYPES.map((t) => [t.id, t]));
  DC.typeVar = { point: "--t-point", collective: "--t-collective", contextual: "--t-contextual", seasonal: "--t-seasonal", peak: "--t-peak", data_integrity: "--t-data" };
  DC.CATEGORY_LABEL = {
    data_integrity: "Data integrity", peak_demand: "Peak demand", seasonal_pattern: "Seasonal / pattern",
    excess_consumption: "Excess consumption", load_drop: "Load drop",
    generation_deficit: "Generation deficit", generation_excess: "Generation above expected",
  };
  DC.BEHAVIOR_LABEL = { point: "Point", collective: "Collective", contextual: "Contextual" };
  DC.SEVERITIES = [
    { id: "critical", label: "Critical", var: "--sev-critical", rank: 3 },
    { id: "high", label: "High", var: "--sev-high", rank: 2 },
    { id: "medium", label: "Medium", var: "--sev-medium", rank: 1 },
    { id: "low", label: "Low", var: "--sev-low", rank: 0 },
  ];
  DC.sevById = Object.fromEntries(DC.SEVERITIES.map((s) => [s.id, s]));
  DC.STATUSES = [
    { id: "new", label: "Unreviewed", open: true },
    { id: "investigating", label: "Investigating", open: true },
    { id: "explained", label: "Expected or explained behavior", open: false },
    { id: "confirmed", label: "Confirmed operational issue", open: true },
    { id: "false_alarm", label: "False alarm", open: false },
    { id: "insufficient", label: "Insufficient evidence", open: true },
    { id: "resolved", label: "Resolved (legacy review)", open: false },
  ];
  DC.statusById = Object.fromEntries(DC.STATUSES.map((s) => [s.id, s]));
  DC.LABEL_KIND = {
    spike: "Spike", dip: "Dip", level_shift: "Level shift", variance_burst: "Variance burst",
    trend_change: "Gradual increase", seasonal_disruption: "Seasonal disruption", dropout: "Dropout (missing)",
    stuck_sensor: "Stuck sensor", reversed_segment: "Reversed segment", time_warp: "Time warp",
    overnight_load: "Overnight load", hvac_contextual: "HVAC on mild day", pv_underperformance: "PV underperformance",
  };

  // ---------- colours (read from CSS so dark mode follows) ----------
  DC.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  DC.typeColor = (id) => DC.css(DC.typeVar[id] || "--muted");
  DC.sevColor = (id) => DC.css((DC.sevById[id] || DC.sevById.low).var);
  DC.seq = (v) => {
    // v in [0,1] -> 7-step blue ramp
    if (v == null || !isFinite(v) || v <= 0) return DC.css("--seq-0");
    const i = Math.min(6, 1 + Math.floor(v * 5.999));
    return DC.css("--seq-" + i);
  };
  DC.diverge = (v) => {
    // v in [-1,1], gray midpoint
    const mix = (a, b, t) => {
      const pa = hex(a), pb = hex(b);
      return `rgb(${pa.map((x, i) => Math.round(x + (pb[i] - x) * t)).join(",")})`;
    };
    const mid = DC.css("--div-mid");
    if (!isFinite(v)) return mid;
    const t = Math.min(1, Math.abs(v));
    return v < 0 ? mix(mid, DC.css("--div-neg"), t) : mix(mid, DC.css("--div-pos"), t);
  };
  function hex(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }

  // ---------- DOM ----------
  DC.$ = (sel, root = document) => root.querySelector(sel);
  DC.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  DC.el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
    return node;
  };
  DC.clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  // Shape glyph as an inline SVG (type identity never relies on colour alone)
  DC.glyph = (typeId, size = 10) => {
    const t = DC.typeById[typeId];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size); svg.setAttribute("height", size); svg.setAttribute("viewBox", "-6 -6 12 12");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", DC.shapePath(t ? t.shape : "circle", 5));
    p.setAttribute("fill", DC.typeColor(typeId));
    if (t && t.shape === "cross") { p.setAttribute("stroke", DC.typeColor(typeId)); p.setAttribute("stroke-width", "2.4"); p.setAttribute("fill", "none"); }
    svg.append(p);
    return svg;
  };
  DC.shapePath = (shape, r) => {
    switch (shape) {
      case "square": return `M${-r * 0.85},${-r * 0.85}h${r * 1.7}v${r * 1.7}h${-r * 1.7}z`;
      case "diamond": return `M0,${-r * 1.1}L${r * 1.05},0L0,${r * 1.1}L${-r * 1.05},0z`;
      case "triangle": return `M0,${-r * 1.1}L${r * 1.05},${r * 0.85}L${-r * 1.05},${r * 0.85}z`;
      case "star": {
        let d = "";
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.5 : r * 1.15;
          d += (i ? "L" : "M") + (Math.cos(a) * rr).toFixed(2) + "," + (Math.sin(a) * rr).toFixed(2);
        }
        return d + "z";
      }
      case "cross": return `M${-r * 0.8},${-r * 0.8}L${r * 0.8},${r * 0.8}M${r * 0.8},${-r * 0.8}L${-r * 0.8},${r * 0.8}`;
      default: return `M${r},0A${r},${r} 0 1,1 ${-r},0A${r},${r} 0 1,1 ${r},0z`;
    }
  };
  DC.typeChip = (typeId) => DC.el("span", { class: "chip" }, DC.glyph(typeId), DC.typeById[typeId] ? DC.typeById[typeId].label : typeId);
  DC.sevBadge = (sevId) => {
    const s = DC.sevById[sevId] || DC.sevById.low;
    const icon = { critical: "▲", high: "▲", medium: "●", low: "○" }[s.id];
    return DC.el("span", { class: "sev", title: `Severity: ${s.label}` },
      DC.el("span", { class: "dot", style: { background: DC.sevColor(s.id) } }), DC.el("span", { "aria-hidden": "true", class: "muted", style: { fontSize: "9px" } }, icon), s.label);
  };
  DC.statusPill = (id) => DC.el("span", { class: "status " + id }, (DC.statusById[id] || { label: id }).label);

  // ---------- local persistence for investigation status (per viewer) ----------
  const KEY = "derconnect.review.v2." + (D.meta.dataset_id || `${D.meta.generator_version}:${D.meta.seed}:${D.meta.start}`);
  let store = {}, persistent = true;
  try {
    store = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    if (typeof store !== "object" || Array.isArray(store)) store = {};
    // v1 held only explicit browser annotations, never detector-inferred statuses.
    const legacy = JSON.parse(localStorage.getItem("derconnect.status.v1") || "{}");
    for (const [id, status] of Object.entries(D.meta.dataset_id === "campus-test-seed-4200000" ? legacy || {} : {})) if (D.events.some((e) => e.id === id) && !store[id] && DC.statusById[status]) store[id] = { status, note: "" };
  } catch (e) { persistent = false; }
  DC.statusStore = {
    get: (id, fallback = "new") => DC.statusById[store[id]?.status] ? store[id].status : fallback,
    note: (id) => typeof store[id]?.note === "string" ? store[id].note : "",
    persistent: () => persistent,
    set: (id, status, note) => {
      if (!DC.statusById[status]) return false;
      store[id] = { status, note: note === undefined ? DC.statusStore.note(id) : String(note).slice(0, 2000) };
      try { localStorage.setItem(KEY, JSON.stringify(store)); persistent = true; } catch (e) { persistent = false; }
      return persistent;
    },
    clear: () => { store = {}; try { localStorage.removeItem(KEY); localStorage.removeItem("derconnect.status.v1"); } catch (e) { persistent = false; } },
  };

  // Preserve the UX note API while retaining PR #2's dataset-scoped review storage.
  DC.notesStore = {
    get: (id) => {
      const note = DC.statusStore.note(id);
      if (note) return note;
      try {
        const legacy = D.meta.dataset_id === "campus-test-seed-4200000" ? localStorage.getItem("derconnect.notes.v1." + id) : null;
        if (legacy != null) {
          if (DC.statusStore.set(id, DC.statusStore.get(id), legacy)) localStorage.removeItem("derconnect.notes.v1." + id);
          return DC.statusStore.note(id);
        }
      } catch (_) { /* Keep in-memory review if storage is unavailable. */ }
      return note;
    },
    set: (id, value) => DC.statusStore.set(id, DC.statusStore.get(id), value),
  };

  DC.sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
  DC.mean = (a) => (a.length ? DC.sum(a) / a.length : NaN);
  DC.percentile = (a, p) => {
    const s = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y);
    if (!s.length) return NaN;
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
})();
