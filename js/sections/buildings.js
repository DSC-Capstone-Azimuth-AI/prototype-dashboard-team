/* Section 3 - Building and sub-grid analysis */
(function () {
  "use strict";
  const DC = window.DC, el = DC.el, ui = () => DC.ui;
  DC.sections = DC.sections || {};
  let focusLocal = null, researchOpen = false, buildingSearch = "";

  function renderResearch(root) {
    DC.clear(root);
    const [t0, t1] = DC.range();
    const events = DC.events();
    const buildings = DC.scopeBuildings();

    root.append(el("div", { class: "section-head" },
      el("h2", { id: "h-buildings", text: "Building & sub-grid analysis" }),
      el("p", { text: "Compare buildings, find where anomalies cluster, and look at a building's load patterns, peaks, components and solar output." })));
    const grid = el("div", { class: "grid cols-12" });
    root.append(grid);

    // ---------- comparison (small multiples, one measure each) ----------
    const stats = buildings.map((b) => {
      const main = DC.mainMeter(b.id);
      const evs = events.filter((e) => e.building === b.id);
      return {
        b, energy: main ? DC.energy(main, t0, t1) / 1000 : 0, n: evs.length,
        excess: DC.sum(evs.filter((e) => e.excess_kwh > 0).map((e) => e.excess_kwh)),
        crit: evs.filter((e) => e.severity === "critical" || e.severity === "high").length,
      };
    });
    const pick = (b) => DC.setState({ building: DC.state.building === b.id ? "all" : b.id, meter: "all" });
    const cmp = [
      ["Electricity consumption", "MWh, main meters, selected range", (s) => s.energy, (v) => DC.fmt.one(v) + " MWh", "--seq-4"],
      ["Anomaly frequency", "Detected events", (s) => s.n, (v) => DC.fmt.int(v), "--seq-4"],
      ["Estimated excess energy", "kWh above expected, all events", (s) => s.excess, (v) => DC.fmt.int(v) + " kWh", "--seq-4"],
    ];
    for (const [title, sub, get, fmt, color] of cmp) {
      const c = ui().card(title, sub, { span: 4 });
      grid.append(c.card);
      const ch = el("div", { class: "chart" });
      c.body.append(ch);
      requestAnimationFrame(() => DC.charts.hbar(ch, {
        labelW: 150, valueW: 78,
        items: stats.map((s) => ({
          label: s.b.name, value: get(s), display: fmt(get(s)), color: DC.state.building === s.b.id ? DC.css("--seq-6") : DC.css(color),
          tooltip: { title: s.b.name, rows: [{ value: DC.fmt.one(s.energy) + " MWh", label: "consumption" }, { value: String(s.n), label: `events (${s.crit} high/critical)` }, { value: DC.fmt.int(s.excess) + " kWh", label: "excess energy" }], note: "Click to focus this building" },
          onClick: () => pick(s.b),
        })),
      }));
    }

    // ---------- frequency x severity heatmap (building x week) ----------
    const fh = ui().card("Building-level anomaly frequency & severity", "Events per building and week · number = count, ring = includes a critical event", { span: 6 });
    grid.append(fh.card);
    const fhEl = el("div", { class: "chart" });
    fh.body.append(fhEl);
    const w0 = Math.floor(t0 / 168), w1 = Math.ceil(t1 / 168);
    const weekCols = [];
    for (let w = w0; w < w1; w++) weekCols.push({ w, label: "wk of " + DC.time.day(w * 168) });
    const maxN = Math.max(1, ...buildings.flatMap((b) => weekCols.map((c) => events.filter((e) => e.building === b.id && Math.floor(e.start / 168) === c.w).length)));
    requestAnimationFrame(() => DC.charts.heatmap(fhEl, {
      rows: buildings.map((b) => ({ id: b.id, label: b.name, group: b.subgrid, strong: DC.state.building === b.id })), cols: weekCols, groupBy: "group", labelW: 150, cellH: 26,
      cell: (r, c) => {
        const list = events.filter((e) => e.building === r.id && Math.floor(e.start / 168) === c.w);
        const n = list.length;
        const sev = DC.SEVERITIES.map((s) => [s, list.filter((e) => e.severity === s.id).length]).filter(([, k]) => k);
        return {
          fill: DC.seq(n / maxN), mark: n ? String(n) : "", markColor: n / maxN > 0.5 ? "#ffffff" : DC.css("--ink"),
          selected: list.some((e) => e.severity === "critical"),
          tooltip: { title: `${DC.buildingById[r.id].name} · ${c.label}`, rows: sev.map(([s, k]) => ({ kind: "box", color: DC.sevColor(s.id), value: String(k), label: s.label })), note: n ? "Click to focus this building" : "No events" },
          clickable: n > 0,
        };
      },
      onClick: (r) => pick(DC.buildingById[r.id]),
    }));
    fh.body.append(ui().legend([1, 0.5, 0.2].map((v) => ({ kind: "box", color: DC.seq(v), label: v === 1 ? `${maxN} events` : `${Math.max(1, Math.round(v * maxN))}` }))));

    // ---------- sub-grid summary ----------
    const sg = ui().card("Sub-grid health", "Feeder-level totals for the selected range", { span: 6 });
    grid.append(sg.card);
    const tbody = el("tbody");
    for (const g of DC.D.subgrids) {
      const bs = buildings.filter((b) => b.subgrid === g.id);
      if (!bs.length) continue;
      let peak = 0, peakT = t0;
      for (let t = t0; t < t1; t++) { const v = DC.sum(bs.map((b) => DC.mainMeter(b.id).actual[t])); if (v > peak) { peak = v; peakT = t; } }
      const evs = events.filter((e) => e.subgrid === g.id);
      const meters = DC.D.meters.filter((m) => bs.some((b) => b.id === m.building));
      tbody.append(el("tr", { class: DC.state.subgrid === g.id ? "selected" : "", onclick: () => DC.setState({ subgrid: DC.state.subgrid === g.id ? "all" : g.id, building: "all", meter: "all" }) },
        el("td", {}, el("b", { text: g.id }), el("div", { class: "muted", style: { fontSize: "12px" }, text: bs.map((b) => b.id).join(", ") })),
        el("td", { class: "num", text: DC.fmt.one(DC.sum(bs.map((b) => DC.energy(DC.mainMeter(b.id), t0, t1))) / 1000) }),
        el("td", { class: "num" }, DC.fmt.int(peak), el("div", { class: "muted", style: { fontSize: "11px" }, text: DC.time.short(peakT) })),
        el("td", { class: "num", text: String(evs.length) }),
        el("td", { class: "num", text: String(evs.filter((e) => e.severity === "critical" || e.severity === "high").length) }),
        el("td", { class: "num", text: (DC.completeness(meters, t0, t1) * 100).toFixed(1) + "%" })));
    }
    sg.body.append(el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Sub-grid", "Energy (MWh)", "Peak (kW)", "Events", "High+", "Data complete"].map((h, i) => el("th", { class: i ? "num" : "", text: h })))), tbody)));
    sg.body.append(el("div", { class: "card-foot", text: "Click a feeder to filter the whole dashboard." }));

    // ---------- focus building ----------
    const focusId = DC.state.building !== "all" ? DC.state.building : (focusLocal && buildings.some((b) => b.id === focusLocal) ? focusLocal : (buildings[0] || {}).id);
    if (!focusId) return;
    const fb = DC.buildingById[focusId], main = DC.mainMeter(focusId);
    const focusBar = el("div", { class: "span-12 banner", style: { marginBottom: 0 } },
      el("b", { text: "Focus building" }),
      el("select", { class: "mini-select", "aria-label": "Focus building", onchange: (e) => { focusLocal = e.target.value; if (DC.state.building !== "all") DC.setState({ building: e.target.value }); else render(root); } },
        buildings.map((b) => el("option", { value: b.id, text: b.name, selected: b.id === focusId ? true : null }))),
      el("span", { text: `${fb.subgrid} · ${fb.profile} profile · ${fb.pv_kw ? fb.pv_kw + " kW rooftop PV" : "no PV"}` }));
    grid.append(focusBar);

    if (!main) { grid.append(el("p", { class: "span-12 empty", text: "No main-meter measurements available." })); return; }
    const evFocus = events.filter((e) => e.meter === main.id);

    // deviation heatmap (date x hour)
    const dh = ui().card("Historical demand pattern: deviation from expected", `${main.id} · measured − expected, by day and hour · red above, blue below`, { span: 6 });
    grid.append(dh.card);
    const dhEl = el("div", { class: "chart" });
    dh.body.append(dhEl);
    const d0 = Math.floor(Math.max(t0, DC.META.detector_start) / 24), d1 = Math.ceil(t1 / 24);
    const typical = DC.percentile(main.actual.slice(0, DC.META.clean_prefix), 0.5);
    const hourCols = Array.from({ length: 24 }, (_, h) => ({ h, label: h % 3 ? "" : String(h).padStart(2, "0") }));
    const dayRows = [];
    for (let d = d0; d < d1; d++) dayRows.push({ id: d, label: `${DC.time.dow(d * 24)} ${DC.time.day(d * 24)}` });
    requestAnimationFrame(() => DC.charts.heatmap(dhEl, {
      rows: dayRows, cols: hourCols, labelW: 92, cellH: Math.max(7, Math.min(14, Math.floor(420 / dayRows.length))),
      cell: (r, c) => {
        const t = r.id * 24 + c.h, a = main.actual[t], e = DC.q(main.id, "q50", t);
        const dev = e == null ? NaN : a - e;
        const ev = evFocus.find((x) => t >= x.start && t < x.end);
        return {
          fill: DC.diverge(dev / (typical * 0.35)), selected: !!ev && ev.id === DC.state.selected,
          tooltip: { title: DC.time.stamp(t), rows: [{ value: DC.fmt.kw(a), label: "measured" }, { value: DC.fmt.kw(e), label: "expected" }, { value: DC.fmt.signed(dev, " kW"), label: "deviation" }], note: ev ? `${ev.id} · click to open` : null },
          clickable: !!ev, ev,
        };
      },
      onClick: (r, c, cell) => cell.ev && DC.openEvent(cell.ev.id),
    }));
    dh.body.append(ui().legend([{ kind: "box", color: DC.diverge(-1), label: `−${DC.fmt.int(typical * 0.35)} kW or less` }, { kind: "box", color: DC.diverge(0), label: "as expected" }, { kind: "box", color: DC.diverge(1), label: `+${DC.fmt.int(typical * 0.35)} kW or more` }]));

    // typical profile
    const tp = ui().card("Typical daily profile", `${main.id} · mean kW by hour, selected range vs. clean history`, { span: 6 });
    grid.append(tp.card);
    const tpEl = el("div", { class: "chart" });
    tp.body.append(tpEl);
    const prof = (a, b, weekend) => Array.from({ length: 24 }, (_, h) => {
      const v = [];
      for (let t = a; t < b; t++) if (DC.time.hour(t) === h && (((Math.floor(t / 24) % 7) >= 5) === weekend)) v.push(main.actual[t]);
      return DC.mean(v);
    });
    const P = { wkNow: prof(t0, t1, false), weNow: prof(t0, t1, true), wkHist: prof(0, DC.META.clean_prefix, false), weHist: prof(0, DC.META.clean_prefix, true) };
    const profSeries = [
      { get: (h) => P.wkHist[h], color: DC.css("--expected"), dash: "5 4", width: 1.5, label: "Weekday · clean history" },
      { get: (h) => P.weHist[h], color: DC.css("--axis"), dash: "5 4", width: 1.5, label: "Weekend · clean history" },
      { get: (h) => P.wkNow[h], color: DC.css("--t-point"), width: 2, label: "Weekday · selected range" },
      { get: (h) => P.weNow[h], color: DC.css("--t-collective"), width: 2, label: "Weekend · selected range" },
    ];
    requestAnimationFrame(() => {
      DC.charts.timeSeries(tpEl, {
        t0: 0, t1: 24, height: 260, series: profSeries, relativeTo: 0,
        tooltip: (h) => ({ title: `${String(h).padStart(2, "0")}:00`, rows: profSeries.slice().reverse().map((s) => ({ color: s.color, kind: s.dash ? "dash" : "line", value: DC.fmt.kw(s.get(h)), label: s.label })) }),
      });
      // relabel x axis as hours of day
      DC.$$("text", tpEl).forEach((tx) => { const m = tx.textContent.match(/^\+(\d+) h$/); if (m) tx.textContent = String(m[1]).padStart(2, "0") + ":00"; else if (tx.textContent === "onset") tx.textContent = "00:00"; });
    });
    tp.body.append(ui().legend(profSeries.map((s) => ({ kind: s.dash ? "dash" : "line", color: s.color, label: s.label }))));

    // peak demand
    const pk = ui().card("Peak demand analysis", `${main.id} · daily peak vs. normal operating peak (99.5th pct of clean history)`, { span: 6 });
    grid.append(pk.card);
    const pkEl = el("div", { class: "chart" });
    pk.body.append(pkEl);
    const thr = DC.peakThreshold(main.id);
    const days = [];
    for (let d = Math.floor(t0 / 24); d < Math.ceil(t1 / 24); d++) {
      let best = -Infinity, bt = d * 24, exp = null;
      for (let t = d * 24; t < d * 24 + 24; t++) if (main.actual[t] > best) { best = main.actual[t]; bt = t; exp = DC.q(main.id, "q50", t); }
      days.push({ d, t: bt, v: best, exp });
    }
    const peakAt = (t) => { const r = days.find((x) => x.d === Math.floor(t / 24)); return r ? r.v : null; };
    const over = days.filter((x) => x.v > thr);
    requestAnimationFrame(() => DC.charts.timeSeries(pkEl, {
      t0: Math.floor(t0 / 24) * 24, t1: Math.ceil(t1 / 24) * 24, height: 240,
      series: [{ get: (t) => (days.some((x) => x.t === t) ? peakAt(t) : null), color: DC.css("--actual"), width: 1.8, connectNulls: true }],
      hlines: [{ y: thr, label: `normal peak ${DC.fmt.int(thr)} kW`, color: DC.css("--sev-critical") }],
      markers: over.map((x) => ({ t: x.t, v: x.v, color: DC.css("--t-peak"), shape: "star", ev: evFocus.find((e) => x.t >= e.start && x.t < e.end) })),
      tooltip: (t, hit) => {
        if (hit && hit.ev) return ui().eventTooltip(hit.ev);
        const r = days.find((x) => x.d === Math.floor(t / 24));
        return r && { title: `${DC.time.dow(r.t)} ${DC.time.day(r.t)}`, rows: [{ color: DC.css("--actual"), value: DC.fmt.kw(r.v), label: `daily peak at ${String(DC.time.hour(r.t)).padStart(2, "0")}:00` }, { color: DC.css("--expected"), kind: "dash", value: DC.fmt.kw(r.exp), label: "expected at that hour" }, { color: DC.css("--sev-critical"), kind: "dash", value: DC.fmt.kw(thr), label: "normal operating peak" }], note: r.v > thr ? "Above normal peak" : null };
      },
      onClick: (t, hit) => hit && hit.ev && DC.openEvent(hit.ev.id),
    }));
    pk.body.append(ui().legend([{ kind: "line", color: DC.css("--actual"), label: "Daily peak" }, { kind: "dash", color: DC.css("--sev-critical"), label: "Normal operating peak" }, { kind: "type", type: "peak", label: `Exceedance (${over.length} day${over.length === 1 ? "" : "s"})` }]));

    // load decomposition
    const dc = ui().card("Load decomposition", `${main.id} · trend (7-day mean) + repeating weekly pattern + residual`, { span: 6 });
    grid.append(dc.card);
    const trendEl = el("div", { class: "chart" }), seasEl = el("div", { class: "chart" }), resEl = el("div", { class: "chart" });
    dc.body.append(el("div", { class: "chart-title", text: "Trend (kW)" }), trendEl, el("div", { class: "chart-title", text: "Weekly pattern (kW, from clean history)" }), seasEl, el("div", { class: "chart-title", text: "Residual (kW) · what trend and pattern don't explain" }), resEl);
    const x = main.actual, N = DC.META.n;
    const trend = new Float64Array(N);
    const half = 84;
    const cum = new Float64Array(N + 1);
    for (let t = 0; t < N; t++) cum[t + 1] = cum[t] + x[t];
    for (let t = 0; t < N; t++) { const a = Math.max(0, t - half), b = Math.min(N, t + half); trend[t] = (cum[b] - cum[a]) / (b - a); }
    const how = new Float64Array(168), cnt = new Float64Array(168);
    for (let t = 0; t < DC.META.clean_prefix; t++) { how[t % 168] += x[t] - trend[t]; cnt[t % 168]++; }
    for (let k = 0; k < 168; k++) how[k] /= cnt[k] || 1;
    const ivs = ui().overlays(evFocus, () => 0, DC.state.selected).intervals;
    requestAnimationFrame(() => {
      DC.charts.timeSeries(trendEl, { t0, t1, height: 90, zero: false, series: [{ get: (t) => trend[t], color: DC.css("--actual"), width: 1.8 }], tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--actual"), value: DC.fmt.kw(trend[t]), label: "trend" }] }) });
      DC.charts.timeSeries(seasEl, { t0, t1, height: 90, zero: false, series: [{ get: (t) => how[t % 168], color: DC.css("--expected"), width: 1.3 }], tooltip: (t) => ({ title: DC.time.stamp(t), rows: [{ color: DC.css("--expected"), value: DC.fmt.signed(how[t % 168], " kW"), label: "weekly pattern" }] }) });
      DC.charts.timeSeries(resEl, { t0, t1, height: 100, zero: false, intervals: ivs, hlines: [{ y: 0, color: DC.css("--axis"), dash: "0" }], series: [{ get: (t) => x[t] - trend[t] - how[t % 168], color: DC.css("--ink-2"), width: 1.3 }], tooltip: (t, hit) => (hit && hit.ev ? ui().eventTooltip(hit.ev) : { title: DC.time.stamp(t), rows: [{ color: DC.css("--ink-2"), value: DC.fmt.signed(x[t] - trend[t] - how[t % 168], " kW"), label: "residual" }] }), onClick: (t, hit) => hit && hit.ev && DC.openEvent(hit.ev.id) });
    });

    // solar
    const pvM = DC.pvMeter(focusId);
    const sol = ui().card("Solar generation context", pvM ? `${pvM.id} · daily energy, measured vs. weather-informed expectation` : "", { span: 6 });
    grid.append(sol.card);
    if (pvM) {
      const solEl = el("div", { class: "chart" }), irrEl = el("div", { class: "chart" });
      if (pvM.building !== focusId) sol.body.append(el("div", { class: "note-box", style: { marginBottom: "8px" }, text: `${fb.name} has no PV meter; showing ${DC.buildingById[pvM.building].name}.` }));
      sol.body.append(solEl, el("div", { class: "chart-title", text: "Daily irradiation (kWh/m²)" }), irrEl);
      const dd0 = Math.floor(t0 / 24), dd1 = Math.ceil(t1 / 24);
      const daily = [];
      for (let d = dd0; d < dd1; d++) {
        let a = 0, e = 0, g = 0;
        for (let t = d * 24; t < d * 24 + 24; t++) { a += pvM.actual[t]; e += DC.q(pvM.id, "q50", t, "context_regression") || 0; g += DC.D.weather.ghi[t] / 1000; }
        daily.push({ d, a, e, g });
      }
      const at = (t) => daily.find((r) => r.d === Math.floor(t / 24));
      const pvEvents = DC.allEvents().filter((e) => e.meter === pvM.id && e.start < t1 && t0 < e.end);
      const pvOv = ui().overlays(pvEvents, (t) => (at(t) || {}).a, DC.state.selected);
      requestAnimationFrame(() => {
        DC.charts.timeSeries(solEl, {
          t0: dd0 * 24, t1: dd1 * 24, height: 200,
          series: [{ get: (t) => (DC.time.hour(t) === 12 ? (at(t) || {}).e : null), color: DC.css("--expected"), dash: "5 4", width: 1.5, connectNulls: true }, { get: (t) => (DC.time.hour(t) === 12 ? (at(t) || {}).a : null), color: DC.css("--t-seasonal"), width: 2, connectNulls: true }],
          intervals: pvOv.intervals, markers: [],
          tooltip: (t, hit) => { if (hit && hit.ev) return ui().eventTooltip(hit.ev); const r = at(t); return r && { title: `${DC.time.dow(t)} ${DC.time.day(t)}`, rows: [{ color: DC.css("--t-seasonal"), value: DC.fmt.int(r.a) + " kWh", label: "measured PV" }, { color: DC.css("--expected"), kind: "dash", value: DC.fmt.int(r.e) + " kWh", label: "expected from weather" }, { value: DC.fmt.pct(r.e ? r.a / r.e : NaN), label: "performance ratio" }] }; },
          onClick: (t, hit) => hit && hit.ev && DC.openEvent(hit.ev.id),
        });
        DC.charts.timeSeries(irrEl, { t0: dd0 * 24, t1: dd1 * 24, height: 80, series: [{ get: (t) => (DC.time.hour(t) === 12 ? (at(t) || {}).g : null), color: DC.css("--muted"), width: 1.5, connectNulls: true }], yFormat: (v) => v.toFixed(1), tooltip: (t) => { const r = at(t); return r && { title: DC.time.day(t), rows: [{ color: DC.css("--muted"), value: r.g.toFixed(2), label: "kWh/m²" }] }; } });
      });
      sol.body.append(ui().legend([{ kind: "line", color: DC.css("--t-seasonal"), label: "Measured PV" }, { kind: "dash", color: DC.css("--expected"), label: "Expected (context-aware model, irradiance + temperature)" }]));
      sol.body.append(el("div", { class: "card-foot" }, "Forecast-based expectations could later come from cloud and solar nowcasting such as ", el("a", { href: "https://www.openclimatefix.org", target: "_blank", rel: "noopener", text: "Open Climate Fix" }), "."));
    }

    if (!pvM) sol.body.append(el("p", { class: "empty", text: "No simulated PV meter is associated with this building." }));

    // power quality - only with measurements
    const pq = ui().card("Power quality", "Voltage and frequency against operating ranges", { span: 6 });
    grid.append(pq.card);
    pq.body.append(el("div", { class: "empty" }, el("b", { text: "No electrical measurements yet." }), el("div", { text: "This panel activates when DERCONNECT provides voltage / frequency channels (e.g. ±5% of 480 V, 60 ± 0.05 Hz). Until then power-quality anomalies are out of scope." })));
  }

  function render(root) {
    DC.clear(root);
    const id = DC.state.profile, b = DC.buildingById[id], [t0, t1] = DC.range();
    const heading = el("div", { class: "section-head" }, el("h2", { id: "h-buildings", text: b ? b.name : "Buildings" }), el("p", { text: b ? `${b.subgrid} · ${b.profile} simulated profile · ${b.id}` : "Browse buildings and open a focused electricity profile." }));
    root.append(heading);
    if (b) root.append(el("p", { class: "muted" }, "Verified UCSD demonstration name · DERCONNECT coverage: " + (b.derconnect_coverage || "Not verified") + ". All profiles and meter relationships are simulated. ", b.name_source ? el("a", { href: b.name_source, target: "_blank", rel: "noopener", text: "Official building-name source" }) : "Name source unavailable."));
    const eventsFor = (bid) => DC.allEvents().filter(e => e.building === bid && e.start < t1 && t0 < e.end);
    if (!b) {
      const list = el("div", { class: "building-directory" });
      const search = el("input", { type: "search", placeholder: "Search buildings…", "aria-label": "Search buildings" });
      const draw = () => {
        DC.clear(list);
        for (const building of DC.D.buildings.filter(x => x.name.toLowerCase().includes(search.value.toLowerCase()))) {
          const meters = DC.D.meters.filter(m => m.building === building.id), main = DC.mainMeter(building.id), events = eventsFor(building.id), pending = DC.sortEvents(events.filter(DC.isOpen), "priority");
          list.append(el("article", { class: "card building-card" }, el("div", { class: "eyebrow", text: building.subgrid + " · " + building.id }),
            el("h3", {}, el("a", { href: "#buildings/" + building.id, text: building.name })),
            el("div", { class: "building-energy", text: main && main.actual.slice(t0, t1).some(Number.isFinite) ? DC.fmt.kwh(DC.energy(main, t0, t1)) : "No simulated measurements" }),
            el("p", { text: `${events.length} detected events · ${pending.length} requiring review` }), pending.length ? DC.sevBadge(pending[0].severity) : el("span", { class: "muted", text: meters.length ? "No pending events in this period" : "Status unavailable" }),
            el("p", { class: "muted", text: `${meters.length} simulated meters · ${meters.length ? DC.fmt.pct(DC.completeness(meters, t0, t1), 1) + " data completeness" : "Completeness unavailable"}` }),
            el("a", { class: "action-link", href: "#buildings/" + building.id, text: "Open building profile →" })));
        }
        if (!list.children.length) list.append(el("p", { class: "empty", text: "No buildings match your search." }));
      };
      search.value = buildingSearch;
      search.addEventListener("input", () => { buildingSearch = search.value; draw(); });
      root.append(search, list);
      const research = el("details", { class: "disclosure", open: researchOpen }, el("summary", { text: "Advanced building & sub-grid analysis" }), el("div"));
      research.addEventListener("toggle", () => { if (!research.isConnected) return; researchOpen = research.open; if (research.open) renderResearch(research.lastChild); });
      root.append(research); draw(); return;
    }
    root.prepend(el("nav", { class: "breadcrumbs", "aria-label": "Breadcrumbs" }, el("a", { href: "#buildings", text: "← All buildings" })));
    const meters = DC.D.meters.filter(m => m.building === id), main = DC.mainMeter(id), events = eventsFor(id);
    if (!meters.length || !main || !main.actual.slice(t0, t1).some(Number.isFinite)) { root.append(el("div", { class: "empty", text: "No simulated main-meter measurements available. Consumption and operating status cannot be assessed." })); return; }
    const stats = el("div", { class: "kpis" });
    for (const [label, value] of [["Electricity use", DC.fmt.kwh(DC.energy(main, t0, t1))], ["Peak demand", DC.fmt.kw(Math.max(...main.actual.slice(t0, t1)))], ["Detected events", events.length], ["Data completeness", DC.fmt.pct(DC.completeness(meters, t0, t1), 1)]]) stats.append(el("div", { class: "card kpi" }, el("div", { class: "label", text: label }), el("div", { class: "value", text: value })));
    root.append(stats);
    const chart = ui().card("Actual vs. expected electricity demand", `${main.id} · ${DC.det().label} · kW · hourly simulated measurements`);
    const chartEl = el("div", { class: "chart" }); chart.body.append(chartEl, ui().legend([{ kind: "line", color: DC.css("--actual"), label: "Actual" }, { kind: "dash", color: DC.css("--expected"), label: "Expected" }, { kind: "box", color: DC.css("--band-inner"), label: "80% forecast band" }])); root.append(chart.card);
    const ov = ui().overlays(events.filter(e => e.meter === main.id), t => main.actual[t]);
    DC.charts.timeSeries(chartEl, { t0, t1, height: 300, band: [{ lo: t => DC.q(main.id, "q10", t), hi: t => DC.q(main.id, "q90", t), color: DC.css("--band-inner") }], series: [{ get: t => main.actual[t], color: DC.css("--actual") }, { get: t => DC.q(main.id, "q50", t), dash: "5 4", color: DC.css("--expected") }], ...ov, onClick: (t, hit) => hit && hit.ev && DC.openEvent(hit.ev.id), tooltip: t => ({ title: DC.time.stamp(t), rows: [{ value: DC.fmt.kw(main.actual[t]), label: "actual" }, { value: DC.fmt.kw(DC.q(main.id, "q50", t)), label: "expected" }] }) });
    const history = ui().card("Historical comparison", "Mean demand in the selected period against the clean-history mean");
    const current = DC.energy(main, t0, t1) / (t1 - t0), previous = DC.energy(main, 0, DC.META.clean_prefix) / DC.META.clean_prefix;
    history.body.append(el("p", { text: `${DC.fmt.kw(current)} selected-period mean · ${DC.fmt.kw(previous)} clean-history mean. Different weather and schedules may affect this comparison.` })); root.append(history.card);
    const meterCard = ui().card("Available meters", "Simulated channel associations; real DERCONNECT coverage is unconfirmed");
    for (const m of meters) meterCard.body.append(el("p", { text: `${m.id} · ${m.kind === "main" ? "Main electricity meter" : "PV generation"} · ${m.unit}` })); root.append(meterCard.card);
    const recent = ui().card("Building anomalies", "Selected period · ranked by operational priority");
    for (const e of DC.sortEvents(events, "priority")) recent.body.append(el("a", { class: "building-summary", href: "#investigate/" + e.id }, el("span", { text: `${e.id} · ${DC.CATEGORY_LABEL[e.category]} · ${DC.time.short(e.start)}` }), DC.sevBadge(e.severity), DC.statusPill(DC.eventStatus(e))));
    if (!events.length) recent.body.append(el("p", { class: "empty", text: "No detected events for this building in the selected period. This does not establish normal operation." })); root.append(recent.card);
  }

  DC.sections.buildings = { render };
})();
