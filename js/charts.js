/* Dependency-free SVG charts: time series (bands, intervals, markers), bars, heatmap,
   scatter, timeline. Marks follow fixed specs: 2px lines, >=8px markers with a 2px surface
   ring, hairline grid, one y-axis per chart, crosshair tooltip on time series. */
(function () {
  "use strict";
  const DC = window.DC;
  const NS = "http://www.w3.org/2000/svg";
  const S = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    if (parent) parent.append(n);
    return n;
  };

  // ---------- tooltip ----------
  const tipEl = DC.el("div", { class: "tooltip", role: "tooltip" });
  document.body.append(tipEl);
  const tip = {
    show(evt, content) {
      DC.clear(tipEl);
      if (content.title) tipEl.append(DC.el("div", { class: "tt-title", text: content.title }));
      for (const r of content.rows || []) {
        const key = DC.el("span", { class: "key" + (r.kind === "dash" ? " dash" : r.kind === "box" ? " box" : "") });
        if (r.kind === "box") key.style.background = r.color; else key.style.borderTopColor = r.color || "transparent";
        if (r.glyph) tipEl.append(DC.el("div", { class: "tt-row" }, DC.glyph(r.glyph, 10), DC.el("b", { text: r.value }), DC.el("span", { text: r.label })));
        else tipEl.append(DC.el("div", { class: "tt-row" }, r.color ? key : null, DC.el("b", { text: r.value }), DC.el("span", { text: r.label })));
      }
      if (content.note) tipEl.append(DC.el("div", { class: "tt-note", text: content.note }));
      tipEl.classList.add("show");
      tip.move(evt);
    },
    move(evt) {
      const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = evt.clientX + pad, y = evt.clientY + pad;
      if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
      tipEl.style.left = Math.max(8, x) + "px";
      tipEl.style.top = Math.max(8, y) + "px";
    },
    hide() { tipEl.classList.remove("show"); },
  };
  window.addEventListener("scroll", () => tip.hide(), { passive: true });

  // ---------- scales & ticks ----------
  function niceTicks(min, max, count = 5) {
    if (!isFinite(min) || !isFinite(max)) return [0, 1];
    if (min === max) { max = min + 1; }
    const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    if (!ticks.length || ticks[ticks.length - 1] < max - step * 1e-9) ticks.push(+((ticks.length ? ticks[ticks.length - 1] : Math.floor(min / step) * step) + step).toFixed(10));
    return ticks;
  }
  const linear = (d0, d1, r0, r1) => {
    const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
    f.invert = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0);
    return f;
  };
  const yFmtDefault = (v) => DC.fmt.compact(v);
  // Each comparison owns its cursor; no global interaction leaks between charts.
  function linkedCursor(initial) {
    let value = initial;
    const listeners = new Set();
    return { get: () => value, set(t) { value = t; listeners.forEach(fn => fn(t)); },
      subscribe(fn) { listeners.add(fn); fn(value); return () => listeners.delete(fn); } };
  }
  const cursorCleanups = new WeakMap();

  function width(el) { return Math.max(240, Math.floor(el.clientWidth || el.getBoundingClientRect().width || 600)); }

  function timeTicks(t0, t1, px) {
    const steps = [1, 2, 3, 6, 12, 24, 48, 72, 168, 336];
    const span = Math.max(1, t1 - t0);
    let step = steps.find((s) => (px / (span / s)) >= 64) || 336;
    const ticks = [];
    let start = Math.ceil(t0 / step) * step;
    if (step >= 24) start = Math.ceil(t0 / 24) * 24;
    if (step === 168 || step === 336) { // align weekly ticks to Mondays
      while (((start / 24) % 7) !== 0 && start < t1) start += 24;
    }
    for (let t = start; t <= t1; t += step) ticks.push(t);
    return { ticks, step };
  }

  // ======================================================================
  // Time series
  // ======================================================================
  function timeSeries(el, o) {
    cursorCleanups.get(el)?.();
    cursorCleanups.delete(el);
    DC.clear(el);
    const W = width(el), H = o.height || 240;
    const m = { l: o.compact ? 4 : 48, r: o.compact ? 4 : 12, t: o.compact ? 4 : 8, b: o.compact ? 4 : 22 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const t0 = o.t0, t1 = Math.max(o.t0 + 1, o.t1);
    const ts = [];
    for (let t = t0; t < t1; t++) ts.push(t);

    // y domain from everything drawn
    let lo = Infinity, hi = -Infinity;
    const take = (v) => { if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
    for (const s of o.series || []) for (const t of ts) take(s.get(t));
    for (const b of o.band || []) for (const t of ts) { take(b.lo(t)); take(b.hi(t)); }
    for (const h of o.hlines || []) take(h.y);
    for (const mk of o.markers || []) if (mk.t >= t0 && mk.t < t1) take(mk.v);
    if (o.yMin != null) lo = Math.min(lo, o.yMin);
    if (o.yMax != null) hi = Math.max(hi, o.yMax);
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (o.zero !== false && lo > 0 && lo < hi * 0.35) lo = 0;
    const padY = (hi - lo) * 0.06 || 1;
    const yt = niceTicks(lo - (lo === 0 ? 0 : padY), hi + padY, o.compact ? 3 : Math.max(3, Math.round(ih / 50)));
    const y0 = Math.min(yt[0], lo), y1 = Math.max(yt[yt.length - 1], hi);
    const x = linear(t0, t1 - 1, m.l, m.l + iw), y = linear(y0, y1, m.t + ih, m.t);
    const svg = S("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.ariaLabel || "Time series chart" });
    el.append(svg);

    // background windows (e.g., normal-control periods, investigation window)
    for (const sh of o.shade || []) {
      const a = Math.max(sh.start, t0), b = Math.min(sh.end, t1);
      if (b <= a) continue;
      S("rect", { x: x(a - 0.5), y: m.t, width: Math.max(1, x(b - 0.5) - x(a - 0.5)), height: ih, fill: sh.color || DC.css("--surface-3"), opacity: sh.opacity || 0.6 }, svg);
      if (sh.label && !o.compact && (iw >= 640 || x(b - 0.5) - x(a - 0.5) >= sh.label.length * 5.5)) {
        const tx = S("text", { x: x(a - 0.5) + 4, y: m.t + 11, fill: DC.css("--muted"), "font-size": 10 }, svg);
        tx.textContent = sh.label;
      }
    }

    if (!o.compact) {
      const gy = S("g", { class: "ax" }, svg);
      const yFmt = o.yFormat || yFmtDefault;
      for (const v of yt) {
        if (v < y0 || v > y1) continue;
        S("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "gridline" }, gy);
        const tx = S("text", { x: m.l - 6, y: y(v) + 3.5, "text-anchor": "end" }, gy);
        tx.textContent = yFmt(v);
      }
      if (o.yLabel) {
        const tx = S("text", { x: m.l - 6, y: m.t - 0 + 1, "text-anchor": "end", "font-size": 10 }, gy);
        tx.textContent = "";
      }
      const gx = S("g", { class: "ax" }, svg);
      S("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }, gx);
      if (o.relativeTo != null) {
        const span = t1 - t0, step = span > 120 ? 24 : span > 48 ? 12 : 6;
        for (let t = o.relativeTo - Math.floor((o.relativeTo - t0) / step) * step; t < t1; t += step) {
          const tx = S("text", { x: x(t), y: m.t + ih + 15, "text-anchor": "middle" }, gx);
          const d = t - o.relativeTo;
          tx.textContent = d === 0 ? "onset" : (d > 0 ? "+" : "−") + Math.abs(d) + " h";
        }
      } else {
        const { ticks, step } = timeTicks(t0, t1 - 1, iw);
        for (const t of ticks) {
          S("line", { x1: x(t), x2: x(t), y1: m.t + ih, y2: m.t + ih + 4 }, gx);
          const tx = S("text", { x: x(t), y: m.t + ih + 15, "text-anchor": "middle" }, gx);
          tx.textContent = step < 24 ? (DC.time.hour(t) === 0 ? DC.time.day(t) : String(DC.time.hour(t)).padStart(2, "0") + ":00") : DC.time.day(t);
        }
      }
    }

    // bands
    for (const b of o.band || []) {
      let d = "", seg = [];
      const flush = () => {
        if (seg.length > 1) {
          d += "M" + seg.map((t) => x(t).toFixed(1) + "," + y(b.hi(t)).toFixed(1)).join("L");
          d += "L" + seg.slice().reverse().map((t) => x(t).toFixed(1) + "," + y(b.lo(t)).toFixed(1)).join("L") + "Z";
        }
        seg = [];
      };
      for (const t of ts) { const a = b.lo(t), c = b.hi(t); if (a == null || c == null || !isFinite(a) || !isFinite(c)) flush(); else seg.push(t); }
      flush();
      if (d) S("path", { d, fill: b.color || DC.css("--band"), stroke: "none" }, svg);
    }

    // anomaly intervals (shaded) under the lines
    const ivG = S("g", {}, svg);
    for (const iv of o.intervals || []) {
      const a = Math.max(iv.start, t0), b = Math.min(iv.end, t1);
      if (b <= a) continue;
      const xa = x(a - 0.5), wa = Math.max(2, x(b - 0.5) - xa);
      S("rect", { x: xa, y: m.t, width: wa, height: ih, fill: iv.color, opacity: iv.selected ? 0.26 : 0.14 }, ivG);
      S("rect", { x: xa, y: m.t, width: wa, height: 3, fill: iv.color, opacity: iv.selected ? 1 : 0.8, rx: 1 }, ivG);
      if (iv.selected && !o.compact) {
        S("rect", { x: xa, y: m.t, width: wa, height: ih, fill: "none", stroke: iv.color, "stroke-width": 1.5 }, ivG);
      }
    }

    for (const h of o.hlines || []) {
      if (h.y < y0 || h.y > y1) continue;
      S("line", { x1: m.l, x2: m.l + iw, y1: y(h.y), y2: y(h.y), stroke: h.color || DC.css("--ink-2"), "stroke-width": 1.5, "stroke-dasharray": h.dash || "5 4" }, svg);
      if (h.label && !o.compact) {
        const tx = S("text", { x: m.l + iw - 4, y: y(h.y) - 4, "text-anchor": "end", fill: DC.css("--ink-2"), "font-size": 11 }, svg);
        tx.textContent = h.label;
      }
    }

    // Explicit half-open event boundaries, independent of point/interval encoding.
    for (const line of o.vlines || []) {
      if (line.t < t0 || line.t >= t1) continue;
      const px = x(line.t);
      S("line", { x1: px, x2: px, y1: m.t, y2: m.t + ih, stroke: DC.css("--ink-2"), "stroke-dasharray": "3 3" }, svg);
      const label = S("text", { x: px + 3, y: m.t + 12, fill: DC.css("--ink-2"), "font-size": 11 }, svg);
      label.textContent = line.label;
    }

    // lines
    for (const s of o.series || []) {
      let d = "", pen = false;
      for (const t of ts) {
        const v = s.get(t);
        if (v == null || !isFinite(v)) { if (!s.connectNulls) pen = false; continue; }
        d += (pen ? "L" : "M") + x(t).toFixed(1) + "," + y(v).toFixed(1);
        pen = true;
      }
      if (d) S("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-dasharray": s.dash || null, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: s.opacity || 1 }, svg);
    }

    // point markers with surface ring
    const surface = DC.css("--surface");
    for (const mk of o.markers || []) {
      if (mk.t < t0 || mk.t >= t1 || mk.v == null) continue;
      const r = mk.selected ? 6 : o.compact ? 4 : 5;
      const p = S("path", { d: DC.shapePath(mk.shape || "circle", r), transform: `translate(${x(mk.t).toFixed(1)},${y(mk.v).toFixed(1)})` }, svg);
      if (mk.shape === "cross") { p.setAttribute("stroke", mk.color); p.setAttribute("stroke-width", 2.6); p.setAttribute("fill", "none"); }
      else { p.setAttribute("fill", mk.color); p.setAttribute("stroke", surface); p.setAttribute("stroke-width", 2); p.setAttribute("paint-order", "stroke"); }
    }

    // interaction
    if (o.tooltip || o.onClick || o.cursor) {
      const cross = S("line", { class: "crosshair", y1: m.t, y2: m.t + ih, opacity: 0 }, svg);
      if (o.cursor) cursorCleanups.set(el, o.cursor.subscribe(t => {
        const visible = Number.isFinite(t) && t >= t0 && t < t1;
        cross.setAttribute("opacity", visible ? 1 : 0);
        if (visible) { cross.setAttribute("x1", x(t)); cross.setAttribute("x2", x(t)); cross.setAttribute("data-time", t); }
      }));
      const overlay = S("rect", { x: m.l, y: m.t, width: iw, height: ih, class: "hit" }, svg);
      overlay.style.cursor = o.onClick ? "pointer" : "crosshair";
      const locate = (evt) => {
        const rect = svg.getBoundingClientRect();
        const px = evt.clientX - rect.left, py = evt.clientY - rect.top;
        const t = Math.max(t0, Math.min(t1 - 1, Math.round(x.invert(px))));
        let hitMarker = null, best = 12;
        for (const mk of o.markers || []) {
          if (mk.t < t0 || mk.t >= t1) continue;
          const dist = Math.hypot(x(mk.t) - px, y(mk.v) - py);
          if (dist < best) { best = dist; hitMarker = mk; }
        }
        const hitIv = (o.intervals || []).find((iv) => t >= iv.start && t < iv.end);
        return { t, px, hit: hitMarker || hitIv || null };
      };
      overlay.addEventListener("mousemove", (evt) => {
        const { t, hit } = locate(evt);
        if (o.cursor) o.cursor.set(t);
        else { cross.setAttribute("x1", x(t)); cross.setAttribute("x2", x(t)); cross.setAttribute("opacity", 1); }
        if (o.tooltip) {
          const c = o.tooltip(t, hit);
          if (c) tip.show(evt, c); else tip.hide();
        }
      });
      overlay.addEventListener("mouseleave", () => { if (!o.cursor) cross.setAttribute("opacity", 0); tip.hide(); });
      if (o.onClick) overlay.addEventListener("click", (evt) => { const { t, hit } = locate(evt); o.onClick(t, hit); });
    }
    return { x, y, svg };
  }

  // ======================================================================
  // Horizontal bars
  // ======================================================================
  function hbar(el, o) {
    DC.clear(el);
    const items = o.items || [];
    if (!items.length) { el.append(DC.el("div", { class: "empty", text: o.empty || "No data in the current filters." })); return; }
    const W = width(el), rowH = o.rowH || 28, barH = Math.min(18, rowH - 8);
    const labelW = o.labelW || Math.min(170, Math.max(90, Math.max(...items.map((i) => i.label.length)) * 7 + (o.glyphs ? 18 : 6)));
    const valueW = o.valueW || 64;
    const H = items.length * rowH + 4;
    const max = o.max || Math.max(1e-9, ...items.map((i) => Math.abs(i.value)));
    const x = linear(0, max, 0, W - labelW - valueW - 8);
    const svg = S("svg", { width: W, height: H, role: "img", "aria-label": o.ariaLabel || "Bar chart" });
    el.append(svg);
    items.forEach((it, i) => {
      const gy = i * rowH + 2;
      const g = S("g", { transform: `translate(0,${gy})` }, svg);
      let lx = 0;
      if (o.glyphs && it.typeId) {
        const p = S("path", { d: DC.shapePath(DC.typeById[it.typeId].shape, 4.5), transform: `translate(7,${rowH / 2})` }, g);
        if (DC.typeById[it.typeId].shape === "cross") { p.setAttribute("stroke", it.color); p.setAttribute("stroke-width", 2.2); p.setAttribute("fill", "none"); } else p.setAttribute("fill", it.color);
        lx = 18;
      }
      const tl = S("text", { x: lx, y: rowH / 2 + 4, fill: DC.css("--ink-2"), "font-size": 12 }, g);
      tl.textContent = it.label;
      const bw = Math.max(it.value ? 2 : 0, x(Math.abs(it.value)));
      const r = Math.min(4, bw / 2);
      const bx = labelW, by = (rowH - barH) / 2;
      if (bw > 0) S("path", { d: `M${bx},${by}h${bw - r}a${r},${r} 0 0 1 ${r},${r}v${barH - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(bw - r)}z`, fill: it.color }, g);
      const tv = S("text", { x: bx + bw + 6, y: rowH / 2 + 4, fill: DC.css("--ink"), "font-size": 12, "font-weight": 560 }, g);
      tv.textContent = it.display != null ? it.display : DC.fmt.int(it.value);
      const hit = S("rect", { x: 0, y: 0, width: W, height: rowH, class: "hit" }, g);
      if (it.tooltip) {
        hit.addEventListener("mousemove", (e) => tip.show(e, it.tooltip));
        hit.addEventListener("mouseleave", () => tip.hide());
      }
      if (it.onClick) hit.addEventListener("click", it.onClick); else hit.style.cursor = "default";
    });
  }

  // ======================================================================
  // Heatmap
  // ======================================================================
  function heatmap(el, o) {
    DC.clear(el);
    const rows = o.rows, cols = o.cols;
    if (!rows.length || !cols.length) { el.append(DC.el("div", { class: "empty", text: "No data in the current filters." })); return; }
    const W = width(el);
    const labelW = o.labelW || 150, top = o.groupLabels ? 4 : 2, bottom = 20;
    const cw = Math.max(2, (W - labelW - 4) / cols.length);
    const ch = o.cellH || 18, gap = cw > 8 ? 2 : 1;
    let groupGaps = 0;
    rows.forEach((r, i) => { if (i && o.groupBy && rows[i - 1][o.groupBy] !== r[o.groupBy]) groupGaps += 8; });
    const H = top + rows.length * ch + groupGaps + bottom;
    const svg = S("svg", { width: W, height: H, role: "img", "aria-label": o.ariaLabel || "Heatmap" });
    el.append(svg);
    let yoff = top;
    rows.forEach((r, ri) => {
      if (ri && o.groupBy && rows[ri - 1][o.groupBy] !== r[o.groupBy]) yoff += 8;
      const labelEvery = Math.max(1, Math.ceil(12 / ch));
      if (ri % labelEvery === 0) {
        const ty = S("text", { x: labelW - 8, y: yoff + ch / 2 + 4, "text-anchor": "end", fill: DC.css(r.strong ? "--ink" : "--ink-2"), "font-size": ch < 12 ? 10.5 : 11.5 }, svg);
        ty.textContent = r.label;
      }
      cols.forEach((c, ci) => {
        const cell = o.cell(r, c, ri, ci);
        const rect = S("rect", { x: labelW + ci * cw, y: yoff, width: Math.max(1, cw - gap), height: ch - gap, rx: cw > 8 ? 3 : 1, fill: cell.fill }, svg);
        if (cell.selected) { rect.setAttribute("stroke", DC.css("--ink")); rect.setAttribute("stroke-width", 1.5); }
        if (cell.mark) {
          const tx = S("text", { x: labelW + ci * cw + (cw - gap) / 2, y: yoff + ch / 2 + 3.5, "text-anchor": "middle", "font-size": 10, fill: cell.markColor || DC.css("--ink"), "pointer-events": "none" }, svg);
          tx.textContent = cell.mark;
        }
        if (cell.tooltip || (o.onClick && cell.clickable !== false)) {
          rect.style.cursor = o.onClick && cell.clickable !== false ? "pointer" : "default";
          if (cell.tooltip) {
            rect.addEventListener("mousemove", (e) => tip.show(e, cell.tooltip));
            rect.addEventListener("mouseleave", () => tip.hide());
          }
          if (o.onClick && cell.clickable !== false) rect.addEventListener("click", () => o.onClick(r, c, cell));
        }
      });
      yoff += ch;
    });
    const every = Math.max(1, Math.ceil(56 / cw));
    cols.forEach((c, ci) => {
      if (ci % every || !c.label) return;
      const tx = S("text", { x: labelW + ci * cw + cw / 2, y: yoff + 14, "text-anchor": "middle", fill: DC.css("--muted"), "font-size": 11 }, svg);
      tx.textContent = c.label;
    });
  }

  // ======================================================================
  // Scatter (magnitude vs duration)
  // ======================================================================
  function scatter(el, o) {
    DC.clear(el);
    const pts = o.points || [];
    const W = width(el), H = o.height || 280;
    const m = { l: 52, r: 14, t: 10, b: 36 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = S("svg", { width: W, height: H, role: "img", "aria-label": o.ariaLabel || "Scatter plot" });
    el.append(svg);
    if (!pts.length) { el.append(DC.el("div", { class: "empty", text: "No events in the current filters." })); svg.remove(); return; }
    const xv = (p) => (o.xLog ? Math.log10(Math.max(1, p.x)) : p.x);
    const xs = pts.map(xv), ys = pts.map((p) => p.y);
    const xmin = o.xLog ? 0 : Math.min(0, ...xs), xmax = Math.max(...xs) * 1.05 || 1;
    const yt = niceTicks(0, Math.max(...ys) * 1.08 || 1, 5);
    const x = linear(xmin, xmax, m.l, m.l + iw), y = linear(0, yt[yt.length - 1], m.t + ih, m.t);
    const ax = S("g", { class: "ax" }, svg);
    for (const v of yt) {
      S("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "gridline" }, ax);
      S("text", { x: m.l - 6, y: y(v) + 3.5, "text-anchor": "end" }, ax).textContent = (o.yFormat || yFmtDefault)(v);
    }
    const xt = o.xLog ? [1, 2, 4, 8, 12, 24, 48, 96, 168].filter((v) => Math.log10(v) <= xmax) : niceTicks(xmin, xmax, 6);
    S("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }, ax);
    for (const v of xt) {
      const px = x(o.xLog ? Math.log10(v) : v);
      S("line", { x1: px, x2: px, y1: m.t + ih, y2: m.t + ih + 4 }, ax);
      S("text", { x: px, y: m.t + ih + 15, "text-anchor": "middle" }, ax).textContent = (o.xFormat || String)(v);
    }
    S("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle" }, ax).textContent = o.xLabel || "";
    const yl = S("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", transform: `rotate(-90 12 ${m.t + ih / 2})` }, ax);
    yl.textContent = o.yLabel || "";
    const surface = DC.css("--surface");
    const sorted = pts.slice().sort((a, b) => (a.selected ? 1 : 0) - (b.selected ? 1 : 0));
    for (const p of sorted) {
      const shape = DC.typeById[p.typeId] ? DC.typeById[p.typeId].shape : "circle";
      const r = p.selected ? 7 : 5;
      const g = S("g", { transform: `translate(${x(xv(p)).toFixed(1)},${y(p.y).toFixed(1)})` }, svg);
      if (p.selected) S("circle", { r: 11, fill: "none", stroke: DC.css("--ink"), "stroke-width": 1.5 }, g);
      const path = S("path", { d: DC.shapePath(shape, r) }, g);
      if (shape === "cross") { path.setAttribute("stroke", p.color); path.setAttribute("stroke-width", 2.6); path.setAttribute("fill", "none"); }
      else { path.setAttribute("fill", p.color); path.setAttribute("stroke", surface); path.setAttribute("stroke-width", 2); path.setAttribute("paint-order", "stroke"); path.setAttribute("opacity", p.dim ? 0.35 : 0.92); }
      const hit = S("circle", { r: 12, class: "hit" }, g);
      if (p.tooltip) {
        hit.addEventListener("mousemove", (e) => tip.show(e, p.tooltip));
        hit.addEventListener("mouseleave", () => tip.hide());
      }
      if (o.onClick) hit.addEventListener("click", () => o.onClick(p));
    }
  }

  // ======================================================================
  // Timeline (ground truth vs detections)
  // ======================================================================
  function timeline(el, o) {
    DC.clear(el);
    const rows = o.rows;
    const W = width(el), labelW = o.labelW || 110, laneH = o.laneH || 26, bottom = 22;
    const H = rows.length * laneH + bottom;
    const t0 = o.t0, t1 = o.t1;
    const x = linear(t0, t1, labelW, W - 8);
    const svg = S("svg", { width: W, height: H, role: "img", "aria-label": o.ariaLabel || "Timeline" });
    el.append(svg);
    const ax = S("g", { class: "ax" }, svg);
    const { ticks } = timeTicks(t0, t1, W - labelW);
    for (const t of ticks) {
      S("line", { x1: x(t), x2: x(t), y1: 0, y2: rows.length * laneH, class: "gridline" }, ax);
      S("text", { x: x(t), y: rows.length * laneH + 15, "text-anchor": "middle" }, ax).textContent = DC.time.day(t);
    }
    rows.forEach((r, i) => {
      const gy = i * laneH;
      S("text", { x: labelW - 8, y: gy + laneH / 2 + 4, "text-anchor": "end", fill: DC.css("--ink-2"), "font-size": 11.5 }, svg).textContent = r.label;
      S("line", { x1: labelW, x2: W - 8, y1: gy + laneH, y2: gy + laneH, class: "gridline" }, svg);
      for (const it of r.items) {
        const a = Math.max(t0, it.start), b = Math.min(t1, it.end);
        if (b <= a) continue;
        const w = Math.max(3, x(b) - x(a));
        const isLabel = it.kind === "label";
        const rect = S("rect", {
          x: x(a), y: gy + (isLabel ? 3 : laneH / 2 + 1), width: w, height: isLabel ? laneH / 2 - 4 : laneH / 2 - 4, rx: 2,
          fill: isLabel ? "none" : it.color, stroke: isLabel ? it.color : "none", "stroke-width": isLabel ? 1.6 : 0,
        }, svg);
        if (it.selected) { rect.setAttribute("stroke", DC.css("--ink")); rect.setAttribute("stroke-width", 2); }
        const hit = S("rect", { x: x(a) - 3, y: gy + (isLabel ? 0 : laneH / 2 - 2), width: w + 6, height: laneH / 2 + 2, class: "hit" }, svg);
        if (it.tooltip) {
          hit.addEventListener("mousemove", (e) => tip.show(e, it.tooltip));
          hit.addEventListener("mouseleave", () => tip.hide());
        }
        if (it.onClick) hit.addEventListener("click", it.onClick); else hit.style.cursor = "default";
      }
    });
  }

  // Hidden disclosures have no layout width. Redraw their charts after opening.
  const renderers = new WeakMap();
  const reusable = (draw) => (node, options) => {
    renderers.set(node, () => draw(node, options));
    draw(node, options);
  };
  document.addEventListener("toggle", (event) => {
    if (event.target.tagName !== "DETAILS" || !event.target.open) return;
    requestAnimationFrame(() => event.target.querySelectorAll(".chart").forEach(node => {
      if (node.getBoundingClientRect().width > 0 && renderers.has(node)) renderers.get(node)();
    }));
  }, true);
  DC.charts = { timeSeries: reusable(timeSeries), hbar: reusable(hbar), heatmap: reusable(heatmap), scatter: reusable(scatter), timeline: reusable(timeline), linkedCursor, tip, niceTicks };
})();
