/* State, indexes and derived data. All views read from here, so filters stay synchronized. */
(function () {
  "use strict";
  const DC = window.DC;
  const D = window.DERCONNECT_DATA;
  const L = window.DERCONNECT_LABELS || { labels: [], matches: {}, meta: {} };
  DC.D = D; DC.L = L;
  const M = D.meta;
  DC.META = M;

  DC.meterById = Object.fromEntries(D.meters.map((m) => [m.id, m]));
  DC.buildingById = Object.fromEntries(D.buildings.map((b) => [b.id, b]));
  DC.subgridById = Object.fromEntries(D.subgrids.map((s) => [s.id, s]));
  DC.detectorById = Object.fromEntries(D.detectors.map((d) => [d.id, d]));
  DC.labelById = Object.fromEntries(L.labels.map((l) => [l.label_id, l]));
  DC.mainMeter = (bId) => D.meters.find((m) => m.building === bId && m.kind === "main");
  DC.pvMeter = (bId) => D.meters.find((m) => m.building === bId && m.kind === "pv");
  DC.meterName = (id) => {
    const m = DC.meterById[id];
    if (!m) return id;
    return DC.buildingById[m.building].name + (m.kind === "pv" ? " · PV" : "");
  };

  const DEFAULT = {
    section: "overview", range: "monitor", t0: M.clean_prefix, t1: M.n,
    subgrid: "all", building: "all", meter: "all", type: "all", severity: "all", status: "all",
    detector: D.detectors[0].id, selected: null, profile: null, routeId: null,
  };
  DC.DEFAULT = DEFAULT;
  DC.state = Object.assign({}, DEFAULT);
  const listeners = [];
  DC.onChange = (fn) => listeners.push(fn);
  DC.setState = (patch, opts = {}) => {
    Object.assign(DC.state, patch);
    if (DC.state.selected && !DC.events().some((e) => e.id === DC.state.selected)) DC.state.selected = null;
    if (!opts.silent) listeners.forEach((fn) => fn(patch));
  };

  // ---------- detector series ----------
  DC.det = () => DC.detectorById[DC.state.detector];
  const off = M.detector_start;
  DC.q = (meterId, key, t, detId) => {
    const det = detId ? DC.detectorById[detId] : DC.det();
    const s = det.series[meterId];
    if (!s || t < off) return null;
    return s[key]?.[t - off] ?? null;
  };
  DC.actual = (meterId, t) => DC.meterById[meterId].actual[t];

  // ---------- scope ----------
  DC.scopeMeters = (opts = {}) => {
    const s = DC.state;
    return D.meters.filter((m) => {
      const b = DC.buildingById[m.building];
      if (s.subgrid !== "all" && b.subgrid !== s.subgrid) return false;
      if (s.building !== "all" && m.building !== s.building) return false;
      if (s.meter !== "all" && m.id !== s.meter) return false;
      if (opts.kind && m.kind !== opts.kind) return false;
      return true;
    });
  };
  DC.scopeBuildings = () => {
    const ids = new Set(DC.scopeMeters().map((m) => m.building));
    return D.buildings.filter((b) => ids.has(b.id));
  };

  // ---------- events ----------
  const CAT_TO_TYPE = { peak_demand: "peak", seasonal_pattern: "seasonal", data_integrity: "data_integrity" };
  DC.eventStatus = (ev) => DC.statusStore.get(ev.id, "new");
  DC.matchesType = (ev, type) => type === "all" || ev.type === type || ev.behavior === type || CAT_TO_TYPE[ev.category] === type;
  DC.allEvents = (detId) => D.events.filter((e) => e.detector === (detId || DC.state.detector));
  DC.eventById = (id) => D.events.find((e) => e.id === id) || null;
  DC.events = (opts = {}) => {
    const s = DC.state;
    const meters = new Set(DC.scopeMeters().map((m) => m.id));
    return DC.allEvents(opts.detector).filter((e) => {
      if (!meters.has(e.meter)) return false;
      if (!opts.ignoreRange && !(e.start < s.t1 && s.t0 < e.end)) return false;
      if (!opts.ignoreType && !DC.matchesType(e, s.type)) return false;
      if (s.severity !== "all" && e.severity !== s.severity) return false;
      const st = DC.eventStatus(e);
      if (s.status === "open" && !DC.statusById[st].open) return false;
      if (s.status !== "all" && s.status !== "open" && st !== s.status) return false;
      return true;
    });
  };
  DC.isOpen = (ev) => DC.statusById[DC.eventStatus(ev)].open;
  DC.sortEvents = (list, key) => {
    const by = {
      priority: (a, b) => b.priority - a.priority || a.start - b.start,
      impact: (a, b) => Math.abs(b.excess_kwh || 0) - Math.abs(a.excess_kwh || 0) || b.priority - a.priority,
      novelty: (a, b) => b.novelty - a.novelty,
      time: (a, b) => b.start - a.start,
      duration: (a, b) => b.duration_h - a.duration_h,
    }[key] || ((a, b) => b.priority - a.priority);
    return list.slice().sort(by);
  };
  // Direct links explicitly restore an event scope; filter edits clear excluded selections.
  DC.eventScope = (ev) => ({
    subgrid: "all", building: "all", meter: "all", type: "all", severity: "all", status: "all",
    range: "custom", t0: Math.min(M.clean_prefix, ev.start), t1: Math.max(M.n, ev.end), detector: ev.detector,
  });
  DC.navigate = (section, id) => {
    const hash = "#" + section + (id ? "/" + encodeURIComponent(id) : "");
    if (location.hash === hash) DC.route(); else location.hash = hash;
  };
  DC.openEvent = (id) => { if (DC.eventById(id)) DC.navigate("investigate", id); };
  DC.openBuilding = (id) => { if (DC.buildingById[id]) DC.navigate("buildings", id); };
  // Maximum absolute residual is distinct from maximum detector score.
  DC.eventFacts = (ev) => {
    const m = DC.meterById[ev.meter];
    let peak = null, observedPeak = null, excess = 0, valid = m.unit === "kW" && M.sampling_interval === "1h";
    for (let t = ev.start; t < ev.end; t++) {
      const actual = m.actual[t], expected = DC.q(m.id, "q50", t, ev.detector);
      if (Number.isFinite(actual) && (!observedPeak || actual > observedPeak.actual)) observedPeak = { t, actual };
      if (m.dq?.[t]) valid = false;
      if (!Number.isFinite(actual) || !Number.isFinite(expected)) { valid = false; continue; }
      const residual = actual - expected;
      excess += residual;
      if (!peak || Math.abs(residual) > Math.abs(peak.residual)) peak = { t, actual, expected, residual,
        suspect: !!m.dq?.[t], percent: expected > 0 ? residual / expected * 100 : null };
    }
    return { peak, observedPeak, excess: valid ? excess : null, unit: m.unit || "unit unavailable" };
  };
  DC.detectorOverlap = (ev) => D.detectors.map((det) => ({ detector: det,
    events: D.events.filter((e) => e.detector === det.id && e.meter === ev.meter && e.start < ev.end && ev.start < e.end),
  }));

  // ---------- ground truth (evaluation only) ----------
  DC.matchFor = (evId, detId) => ((L.matches[detId || DC.state.detector] || {})[evId]) || null;

  // ---------- aggregates ----------
  DC.range = () => [DC.state.t0, DC.state.t1];
  DC.completeness = (meters, t0, t1) => {
    let ok = 0, n = 0;
    for (const m of meters) for (let t = t0; t < t1; t++) { n++; if (!m.dq[t]) ok++; }
    return n ? ok / n : NaN;
  };
  DC.energy = (meter, t0, t1) => { let s = 0; for (let t = t0; t < t1; t++) s += meter.actual[t] || 0; return s; };
  // Clean-period reference values (first 6 weeks), e.g. peak threshold used by the classifier.
  const peakCache = {};
  DC.peakThreshold = (meterId) => {
    if (peakCache[meterId] == null) peakCache[meterId] = DC.percentile(DC.meterById[meterId].actual.slice(0, M.clean_prefix), 0.995);
    return peakCache[meterId];
  };
})();
