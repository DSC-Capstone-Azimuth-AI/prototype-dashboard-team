/* Boot: filters, routing, theme, banner. Sections render themselves from DC.state. */
(function () {
  "use strict";
  const DC = window.DC, D = DC.D, M = DC.META, $ = DC.$;
  const SECTIONS = ["overview", "investigate", "buildings", "models", "upload", "export", "historical"];

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
    contextualFilters();
    summary();
  }
  function contextualFilters() {
    const s = DC.state, detail = !!s.routeId;
    const primary = s.section === "overview" ? ["range", "building"] : s.section === "investigate" ? ["range", "building", "severity", "status"] : s.section === "models" ? ["detector", "range"] : (s.profile ? ["range", "detector"] : ["range"]);
    const filters = $("#filters");
    filters.hidden = ["upload", "export", "historical"].includes(s.section) || (detail && s.section === "investigate");
    $("#data-banner").hidden = ["upload", "historical"].includes(s.section);
    for (const id of ["range", "subgrid", "building", "meter", "type", "severity", "status", "detector"]) {
      const node = $("#f-" + id).closest(".filter");
      (primary.includes(id) ? filters : $("#advanced-filter-body")).append(node);
    }
    $("#advanced-filters").hidden = !!s.profile;
    filters.append($("#advanced-filters"), $("#f-reset"), $("#filter-summary"));
  }
  function rangeFor(v) {
    if (v === "7") return [M.n - 7 * 24, M.n];
    if (v === "14") return [M.n - 14 * 24, M.n];
    if (v === "all") return [0, M.n];
    return [M.clean_prefix, M.n];
  }
  function summary() {
    const n = DC.state.profile ? DC.allEvents().filter(e => e.building === DC.state.profile && e.start < DC.state.t1 && DC.state.t0 < e.end).length : DC.events().length;
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
    $("#f-reset").addEventListener("click", () => DC.setState(Object.assign({}, DC.DEFAULT, { section: DC.state.section, selected: DC.state.selected, profile: DC.state.profile, routeId: DC.state.routeId })));
  }

  // ---------- routing ----------
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = () => motionPreference.matches;
  let sectionScrollPending = null;
  const tabPressAnimations = new WeakMap();
  let arrivalAnimation = null;
  function syncNavigationIndicator(animate = true) {
    const nav = $(".tabs"), active = nav.querySelector('[aria-current="page"]'), indicator = $("#nav-indicator");
    if (!active) return;
    const immediate = !animate || reducedMotion() || !nav.classList.contains("indicator-ready");
    if (immediate) indicator.style.transition = "none";
    indicator.hidden = false;
    indicator.style.width = active.offsetWidth + "px";
    indicator.style.height = active.offsetHeight + "px";
    indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    nav.classList.add("indicator-ready");
    if (immediate) requestAnimationFrame(() => { indicator.style.transition = ""; });
  }
  function scrollToSelectedSection() {
    if (sectionScrollPending !== DC.state.section || DC.state.routeId) return;
    sectionScrollPending = null;
    const section = $("#sec-" + DC.state.section), header = $(".app-header");
    const filters = $("#filters"), landing = filters.hidden ? section : filters;
    const inset = getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().height : 0;
    const top = Math.max(0, window.scrollY + landing.getBoundingClientRect().top - inset - 16);
    window.scrollTo({ top, behavior: reducedMotion() ? "instant" : "smooth" });
    $("#main-content").focus({ preventScroll: true });
    arrivalAnimation?.cancel();
    if (!reducedMotion() && typeof section.animate === "function") {
      const head = section.querySelector(".section-head");
      if (head) arrivalAnimation = head.animate(
        [{ backgroundColor: DC.css("--accent-wash"), boxShadow: `0 0 0 8px ${DC.css("--accent-wash")}` }, { backgroundColor: "transparent", boxShadow: "0 0 0 8px transparent" }],
        { duration: 650, easing: "ease-out" });
    }
  }
  $(".tabs").addEventListener("click", event => {
    const link = event.target.closest("a[data-section]");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!reducedMotion() && typeof link.animate === "function") {
      tabPressAnimations.get(link)?.cancel();
      tabPressAnimations.set(link, link.animate(
        [{ transform: "scale(1)" }, { transform: "scale(.97)", offset: .25 }, { transform: "scale(1.02)", offset: .65 }, { transform: "scale(1)" }],
        { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" }));
    }
    sectionScrollPending = link.dataset.section;
    if (location.hash === link.getAttribute("href")) scrollToSelectedSection();
    else DC.navigate(link.dataset.section);
  });
  motionPreference.addEventListener("change", event => {
    if (!event.matches) return;
    arrivalAnimation?.cancel();
    for (const link of document.querySelectorAll(".tabs a")) tabPressAnimations.get(link)?.cancel();
    navigationTransition?.skipTransition();
    navigationAnimation?.cancel();
    window.scrollTo({ top: window.scrollY, behavior: "instant" });
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(() => syncNavigationIndicator(false)).observe($(".tabs"));
  function show(section) {
    for (const id of SECTIONS) {
      $("#sec-" + id).classList.toggle("active", id === section);
      const a = document.querySelector(`.tabs a[data-section="${id}"]`);
      if (id === section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    syncNavigationIndicator();
  }
  let lastRenderRoute = null;
  let navigationTransition = null, navigationAnimation = null, routeFocusPending = false;
  function finishRouteNavigation() {
    if (!routeFocusPending) return;
    routeFocusPending = false;
    window.scrollTo({ top: 0, behavior: "instant" });
    $("#main-content").focus({ preventScroll: true });
  }
  function renderContent() {
    buildFilters();
    const sec = DC.state.section;
    show(sec);
    if (DC.state.routeId && ((sec === "investigate" && !DC.eventById(DC.state.routeId)) || (sec === "buildings" && !DC.buildingById[DC.state.routeId]))) {
      DC.clear($("#sec-" + sec)).append(DC.el("h2", { id: "h-" + sec, text: "Record unavailable" }), DC.el("p", { text: "This ID is not in the loaded dataset." }), DC.el("a", { href: "#" + sec, text: "Back to " + (sec === "buildings" ? "buildings" : "anomaly list") }));
      lastRenderRoute = sec + "/" + DC.state.routeId;
      finishRouteNavigation(); return;
    }
    const route = sec + "/" + (DC.state.routeId || "");
    const draw = () => DC.sections[sec].render($("#sec-" + sec));
    try {
      if (lastRenderRoute === route) DC.ui.refresh($("#sec-" + sec), draw); else draw();
      lastRenderRoute = route;
    } catch (err) { console.error(err); }
    finishRouteNavigation();
  }
  function render() {
    const route = DC.state.section + "/" + (DC.state.routeId || "");
    const moving = lastRenderRoute != null && lastRenderRoute !== route;
    navigationTransition?.skipTransition();
    navigationTransition = null;
    navigationAnimation?.cancel();
    navigationAnimation = null;
    if (!moving) sectionScrollPending = null;
    if (!moving || reducedMotion()) {
      renderContent();
      $("#main-content").removeAttribute("aria-busy");
      if (moving) scrollToSelectedSection();
      return;
    }
    if (typeof document.startViewTransition === "function") {
      // Callbacks always read the latest route so rapid clicks cannot restore stale UI.
      const transition = document.startViewTransition(renderContent);
      navigationTransition = transition;
      $("#main-content").setAttribute("aria-busy", "true");
      transition.ready.catch(() => {}); // A superseding navigation may skip this snapshot.
      transition.finished.catch(() => {}).finally(() => {
        if (navigationTransition === transition) {
          navigationTransition = null;
          $("#main-content").removeAttribute("aria-busy");
          scrollToSelectedSection();
        }
      });
    } else {
      renderContent();
      const section = $("#sec-" + DC.state.section);
      if (typeof section.animate === "function") {
        const animation = section.animate(
          [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" });
        navigationAnimation = animation;
        $("#main-content").setAttribute("aria-busy", "true");
        animation.finished.catch(() => {}).finally(() => {
          if (navigationAnimation === animation) {
            navigationAnimation = null;
            $("#main-content").removeAttribute("aria-busy");
            scrollToSelectedSection();
          }
        });
      } else scrollToSelectedSection();
    }
  }
  const scopes = {};
  const scopeKeys = ["range", "t0", "t1", "subgrid", "building", "meter", "type", "severity", "status", "detector"];
  DC.reviewQueue = () => {
    scopes.investigate = Object.assign({}, DC.DEFAULT, Object.fromEntries(scopeKeys.map(key => [key, DC.state[key]])), { status: "open" });
    DC.sections.investigate.sortPriority();
    DC.navigate("investigate");
  };
  DC.reviewBuildingEvents = id => {
    if (!DC.buildingById[id]) return;
    scopes.investigate = Object.assign({}, DC.DEFAULT, {
      range: DC.state.range, t0: DC.state.t0, t1: DC.state.t1,
      building: id, detector: DC.state.detector,
    });
    DC.sections.investigate.sortPriority();
    DC.navigate("investigate");
  };
  function fromHash() {
    const [sec, raw] = location.hash.slice(1).split("/");
    const section = SECTIONS.includes(sec) ? sec : "overview";
    let id = null;
    try { id = raw ? decodeURIComponent(raw) : null; } catch (_) { id = raw; }
    if (sectionScrollPending !== section || id) sectionScrollPending = null;
    const old = DC.state.section;
    if (!DC.state.routeId) scopes[old] = Object.fromEntries(scopeKeys.map(k => [k, DC.state[k]]));
    const patch = Object.assign({}, old !== section || (!id && DC.state.routeId) ? (scopes[section] || DC.DEFAULT) : {}, { section, selected: null, profile: null, routeId: id });
    if (section === "investigate" && id && DC.eventById(id)) {
      Object.assign(patch, DC.eventScope(DC.eventById(id)), { selected: id });
    }
    if (section === "buildings" && id && DC.buildingById[id]) patch.profile = id;
    routeFocusPending = true;
    DC.setState(patch);
  }
  DC.route = fromHash;

  // ---------- theme ----------
  function wireTheme() {
    let saved = null;
    try { saved = localStorage.getItem("derconnect.theme"); } catch (e) { /* ignore */ }
    document.documentElement.setAttribute("data-theme", saved || "light");
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
      DC.el("details", { class: "dataset-details" },
        DC.el("summary", {}, DC.el("b", { text: "Simulated demonstration" }), DC.el("span", { text: `${D.buildings.length} buildings · ${D.meters.length} meters · hourly · ${DC.time.day(0)} – ${DC.time.day(M.n - 1)}, 2026` })),
        DC.el("p", { text: "Simulated readings, meters, feeders and PV. Real UCSD names are demonstration labels; DERCONNECT coverage is not verified." }),
        DC.el("p", { text: `Clean history before ${DC.time.day(M.clean_prefix)} · generator ${M.generator_version}, seed ${M.seed}` }))
    );
  }

  DC.sections = DC.sections || {};
  DC.onChange(() => {
    if (DC.state.section === "investigate" && DC.state.routeId && DC.eventById(DC.state.routeId) && !DC.state.selected) {
      history.replaceState(null, "", "#investigate");
      fromHash(); return;
    }
    render();
  });
  window.addEventListener("hashchange", fromHash);
  let resizeTimer = null;
  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - lastW) < 8) return;
    lastW = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  const advanced = DC.el("details", { id: "advanced-filters" }, DC.el("summary", { text: "Advanced filters" }), DC.el("div", { id: "advanced-filter-body", class: "advanced-filter-body" }));
  $("#filters").append(advanced);
  $(".skip-link").addEventListener("click", event => { event.preventDefault(); $("#main-content").focus(); $("#main-content").scrollIntoView(); });
  wireFilters();
  wireTheme();
  banner();
  fromHash();
})();
