/* Boot: filters, routing, theme, banner. Sections render themselves from DC.state. */
(function () {
  "use strict";
  const DC = window.DC, D = DC.D, M = DC.META, $ = DC.$;
  const SECTIONS = ["overview", "investigate", "buildings", "models"];

  // ---------- filters ----------
  const fill = (sel, options, value) => {
    DC.clear(sel);
    for (const [v, label] of options) sel.append(DC.el("option", { value: v, text: label }));
    sel.value = options.some(([v]) => v === value) ? value : options[0][0];
    return sel.value;
  };
  function buildFilters() {
    const s = DC.state;
    fill($("#f-subgrid"), [["all", "All sub-grids"], ...D.subgrids.map((g) => [g.id, g.name])], s.subgrid);
    const bOpts = D.buildings.filter((b) => s.subgrid === "all" || b.subgrid === s.subgrid).map((b) => [b.id, b.name]);
    const b = fill($("#f-building"), [["all", "All buildings"], ...bOpts], s.building);
    const mOpts = D.meters.filter((m) => (s.subgrid === "all" || DC.buildingById[m.building].subgrid === s.subgrid) && (b === "all" || m.building === b))
      .map((m) => [m.id, m.id + (m.kind === "pv" ? " (PV)" : " (main)")]);
    const m = fill($("#f-meter"), [["all", "All meters"], ...mOpts], s.meter);
    fill($("#f-type"), [["all", "All types"], ...DC.TYPES.map((t) => [t.id, t.label])], s.type);
    fill($("#f-severity"), [["all", "All severities"], ...DC.SEVERITIES.map((v) => [v.id, v.label])], s.severity);
    fill($("#f-status"), [["all", "All statuses"], ["open", "Open (not dismissed)"], ...DC.STATUSES.map((v) => [v.id, v.label])], s.status);
    fill($("#f-detector"), D.detectors.map((d) => [d.id, d.label]), s.detector);
    $("#f-range").value = s.range;
    const custom = s.range === "custom";
    $("#f-from").hidden = !custom; $("#f-to").hidden = !custom;
    $("#f-from").value = DC.time.isoDate(s.t0); $("#f-to").value = DC.time.isoDate(Math.max(s.t0, s.t1 - 1));
    $("#f-from").min = $("#f-to").min = DC.time.isoDate(0);
    $("#f-from").max = $("#f-to").max = DC.time.isoDate(M.n - 1);
    if (b !== s.building || m !== s.meter) DC.setState({ building: b, meter: m }, { silent: true });
    summary();
  }
  function rangeFor(v) {
    if (v === "7") return [M.n - 7 * 24, M.n];
    if (v === "14") return [M.n - 14 * 24, M.n];
    if (v === "all") return [0, M.n];
    return [M.clean_prefix, M.n];
  }
  function summary() {
    const n = DC.events().length;
    const s = DC.state;
    $("#filter-summary").textContent = `${n} event${n === 1 ? "" : "s"} · ${DC.time.day(s.t0)} – ${DC.time.day(s.t1 - 1)} · ${DC.det().label}`;
  }
  function wireFilters() {
    const on = (id, fn) => $(id).addEventListener("change", (e) => fn(e.target.value));
    on("#f-range", (v) => {
      if (v === "custom") return DC.setState({ range: "custom" });
      const [t0, t1] = rangeFor(v);
      DC.setState({ range: v, t0, t1 });
    });
    const custom = () => {
      let a = DC.time.fromISODate($("#f-from").value), b = DC.time.fromISODate($("#f-to").value) + 24;
      if (!isFinite(a) || !isFinite(b)) return;
      a = Math.max(0, Math.min(a, M.n - 24)); b = Math.min(M.n, Math.max(b, a + 24));
      DC.setState({ range: "custom", t0: a, t1: b });
    };
    $("#f-from").addEventListener("change", custom);
    $("#f-to").addEventListener("change", custom);
    on("#f-subgrid", (v) => DC.setState({ subgrid: v, building: "all", meter: "all" }));
    on("#f-building", (v) => DC.setState({ building: v, meter: "all" }));
    on("#f-meter", (v) => DC.setState({ meter: v }));
    on("#f-type", (v) => DC.setState({ type: v }));
    on("#f-severity", (v) => DC.setState({ severity: v }));
    on("#f-status", (v) => DC.setState({ status: v }));
    on("#f-detector", (v) => DC.setState({ detector: v, selected: null }));
    $("#f-reset").addEventListener("click", () => DC.setState(Object.assign({}, DC.DEFAULT, { section: DC.state.section })));
  }

  // ---------- routing ----------
  function show(section) {
    for (const id of SECTIONS) {
      $("#sec-" + id).classList.toggle("active", id === section);
      const a = document.querySelector(`.tabs a[data-section="${id}"]`);
      if (id === section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
  }
  function render() {
    buildFilters();
    const sec = DC.state.section;
    show(sec);
    try { DC.sections[sec].render($("#sec-" + sec)); } catch (err) { console.error(err); }
  }
  function fromHash() {
    const [sec, id] = location.hash.replace("#", "").split("/");
    const patch = { section: SECTIONS.includes(sec) ? sec : "overview", selected: null };
    if (id && DC.eventById(id)) Object.assign(patch, DC.eventScope(DC.eventById(id)), { selected: id });
    DC.setState(patch);
  }

  // ---------- theme ----------
  function wireTheme() {
    let saved = null;
    try { saved = localStorage.getItem("derconnect.theme"); } catch (e) { /* ignore */ }
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    $("#theme-toggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("derconnect.theme", next); } catch (e) { /* ignore */ }
      render();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  }

  function banner() {
    const el = $("#data-banner");
    el.append(
      DC.el("b", { text: "Synthetic test campus" }),
      DC.el("span", { text: `${D.buildings.length} buildings · ${D.meters.length} meters · hourly · ${DC.time.day(0)} – ${DC.time.day(M.n - 1)}, 2026` }),
      DC.el("span", { text: `Clean history before ${DC.time.day(M.clean_prefix)} · generator ${M.generator_version}, seed ${M.seed}` }),
      DC.el("span", { class: "muted", text: "Simulated readings, meters, feeders and PV. Real UCSD names are demonstration labels; DERCONNECT coverage is not verified." })
    );
  }

  DC.sections = DC.sections || {};
  DC.onChange((patch) => {
    const hash = "#" + DC.state.section + (DC.state.section === "investigate" && DC.state.selected ? "/" + DC.state.selected : "");
    if (location.hash !== hash) history.replaceState(null, "", hash);
    render();
  });
  window.addEventListener("hashchange", fromHash);
  document.querySelectorAll(".tabs a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const hash = "#" + a.dataset.section + (a.dataset.section === "investigate" && DC.state.selected ? "/" + DC.state.selected : "");
    if (location.hash !== hash) history.pushState(null, "", hash);
    DC.setState({ section: a.dataset.section });
    window.scrollTo({ top: 0 });
  }));
  let resizeTimer = null;
  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - lastW) < 8) return;
    lastW = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  wireFilters();
  wireTheme();
  banner();
  fromHash();
})();
