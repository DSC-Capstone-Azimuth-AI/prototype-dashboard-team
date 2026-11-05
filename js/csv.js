/* Meter CSV parsing and validation. No DOM use and no access to the simulated dataset.
   The column format is a provisional checkpoint format, not the agreed DERCONNECT contract. */
(function () {
  "use strict";
  const DC = (window.DC = window.DC || {});
  const REQUIRED = ["timestamp", "meter_id", "kw"];
  const MAX_BYTES = 20 * 1024 * 1024;
  const MISSING = new Set(["", "na", "nan", "null"]);
  const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
  const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/i;

  // RFC 4180 records. `line` is the physical line where each record starts.
  function records(text) {
    const rows = [];
    let fields = [], field = "", quoted = false, line = 1, start = 1, quoteLine = 0;
    const endRecord = () => {
      fields.push(field); field = "";
      if (fields.length > 1 || fields[0].trim() !== "") rows.push({ line: start, fields });
      fields = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else { if (c === "\n") line++; field += c; }
      } else if (c === '"' && field === "") { quoted = true; quoteLine = line; }
      else if (c === ",") { fields.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        endRecord(); line++; start = line;
      } else field += c;
    }
    if (quoted) return { rows, unterminatedLine: quoteLine };
    endRecord();
    return { rows };
  }

  function parseTimestamp(value) {
    const m = TIMESTAMP.exec(value);
    if (!m) return null;
    const [y, mo, d, h, min, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || "0"].map(Number);
    const ms = m[7] ? Math.round(Number(m[7]) * 1000) : 0;
    const wall = Date.UTC(y, mo - 1, d, h, min, s, ms);
    const check = new Date(wall);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== min || check.getUTCSeconds() !== s) return null;
    if (!m[8]) return { ms: wall, zoned: false };
    if (m[8].toUpperCase() === "Z") return { ms: wall, zoned: true };
    const digits = m[8].slice(1).replace(":", ""), offsetHours = Number(digits.slice(0, 2)), offsetMinutes = Number(digits.slice(2));
    if (offsetHours > 14 || offsetMinutes > 59) return null;
    const offset = (offsetHours * 60 + offsetMinutes) * 60000;
    return { ms: wall - (m[8][0] === "-" ? -offset : offset), zoned: true };
  }

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function summarize(id, byTime) {
    const points = Array.from(byTime, ([t, reading]) => ({ t, v: reading.conflict ? null : reading.v })).sort((a, b) => a.t - b.t);
    const t = points.map(p => p.t), kw = points.map(p => p.v);
    const steps = t.slice(1).map((value, i) => value - t[i]);
    const cadenceMs = steps.length ? median(steps) : null;
    const valid = kw.filter(v => v != null);
    const meter = {
      id, t, kw, readings: valid.length, missing: kw.length - valid.length, negative: valid.filter(v => v < 0).length,
      cadenceMs, gaps: 0, offCadence: 0, completeness: null,
      min: valid.length ? valid.reduce((a, b) => Math.min(a, b)) : null,
      max: valid.length ? valid.reduce((a, b) => Math.max(a, b)) : null,
      mean: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
    };
    if (cadenceMs) {
      for (const step of steps) {
        if (step > cadenceMs * 1.5) meter.gaps++;
        else if (Math.abs(step - cadenceMs) > cadenceMs * 0.01) meter.offCadence++;
      }
      const expected = Math.round((t[t.length - 1] - t[0]) / cadenceMs) + 1;
      meter.completeness = Math.min(1, valid.length / expected);
    }
    return meter;
  }

  const plural = (n, word) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

  function warningsFor(r, ignored) {
    const total = key => r.meters.reduce((sum, m) => sum + m[key], 0), w = [];
    const gaps = total("gaps"), offCadence = total("offCadence"), negative = total("negative");
    if (r.rejected) w.push(`${plural(r.rejected, "row")} rejected and left out.`);
    if (r.blank) w.push(`${plural(r.blank, "blank reading")} kept as a gap, not as zero.`);
    if (r.duplicateRows) w.push(`${plural(r.duplicateRows, "duplicate row")} merged. Identical values were kept once.`);
    if (r.conflicts) w.push(`${plural(r.conflicts, "timestamp")} had conflicting values and ${r.conflicts === 1 ? "is" : "are"} shown as a gap, so no value was chosen.`);
    if (r.outOfOrder) w.push(`${plural(r.outOfOrder, "row")} arrived out of time order and ${r.outOfOrder === 1 ? "was" : "were"} sorted.`);
    if (gaps) w.push(`${plural(gaps, "time gap")} longer than the usual interval.`);
    if (offCadence) w.push(`${plural(offCadence, "interval")} off the usual cadence. Readings were not resampled.`);
    if (new Set(r.meters.map(m => m.cadenceMs).filter(Boolean)).size > 1) w.push("Meters use different cadences.");
    if (negative) w.push(`${plural(negative, "negative reading")} kept. The sign convention is not agreed yet, so these may be valid.`);
    if (r.timeBasis === "wall") w.push("Timestamps have no time zone, so times are shown as written.");
    if (ignored.length) w.push(`Ignored extra column${ignored.length === 1 ? "" : "s"}: ${ignored.join(", ")}.`);
    return w;
  }

  function validate(input) {
    const text = String(input).replace(/^﻿/, "");
    const r = {
      status: "rejected", fatal: null, rowsRead: 0, kept: 0, rejected: 0, blank: 0, duplicateRows: 0,
      conflicts: 0, outOfOrder: 0, timeBasis: null, issues: [], meters: [], warnings: [],
    };
    const fail = message => { r.fatal = message; return r; };
    if (!text.trim()) return fail("The file is empty.");
    const parsed = records(text);
    if (parsed.unterminatedLine) return fail(`A quoted value starting on line ${parsed.unterminatedLine} is never closed.`);
    const [head, ...body] = parsed.rows;
    const columns = head.fields.map(name => name.trim().toLowerCase());
    const absent = REQUIRED.filter(name => !columns.includes(name));
    if (absent.length) return fail(`Missing required column${absent.length === 1 ? "" : "s"}: ${absent.join(", ")}.`);
    const repeated = REQUIRED.filter(name => columns.indexOf(name) !== columns.lastIndexOf(name));
    if (repeated.length) return fail(`Repeated column${repeated.length === 1 ? "" : "s"}: ${repeated.join(", ")}.`);
    if (!body.length) return fail("The file has a header but no data rows.");

    const index = Object.fromEntries(REQUIRED.map(name => [name, columns.indexOf(name)]));
    const meters = new Map(), latest = new Map();
    let zoned = 0, unzoned = 0;
    r.rowsRead = body.length;
    const reject = (line, problem) => { r.rejected++; r.issues.push({ line, problem }); };
    for (const { line, fields } of body) {
      if (fields.length !== columns.length) { reject(line, `Expected ${columns.length} columns, found ${fields.length}.`); continue; }
      const rawTime = fields[index.timestamp].trim(), id = fields[index.meter_id].trim(), rawKw = fields[index.kw].trim();
      const time = parseTimestamp(rawTime);
      if (!time) { reject(line, `Invalid timestamp "${rawTime.slice(0, 40)}".`); continue; }
      if (!id) { reject(line, "Missing meter_id."); continue; }
      const blank = MISSING.has(rawKw.toLowerCase()), value = blank ? null : Number(rawKw);
      if (!blank && (!NUMBER.test(rawKw) || !Number.isFinite(value))) { reject(line, `Invalid kw value "${rawKw.slice(0, 40)}".`); continue; }
      if (time.zoned) zoned++; else unzoned++;
      if (!meters.has(id)) meters.set(id, new Map());
      const byTime = meters.get(id), existing = byTime.get(time.ms);
      if (latest.has(id) && time.ms < latest.get(id)) r.outOfOrder++;
      else latest.set(id, time.ms);
      if (!existing) { byTime.set(time.ms, { v: value, conflict: false }); continue; }
      r.duplicateRows++;
      if (existing.v !== value && !existing.conflict) { existing.conflict = true; r.conflicts++; }
    }
    if (zoned && unzoned) return fail("Some timestamps have a time zone and others do not, so they cannot be compared.");
    if (!meters.size) return fail("No usable rows were found.");
    r.timeBasis = zoned ? "utc" : "wall";
    r.meters = Array.from(meters, ([id, byTime]) => summarize(id, byTime)).sort((a, b) => a.id.localeCompare(b.id));
    r.kept = r.meters.reduce((sum, m) => sum + m.t.length, 0);
    r.blank = r.meters.reduce((sum, m) => sum + m.missing, 0) - r.conflicts;
    const ignored = head.fields.map(name => name.trim()).filter(name => !REQUIRED.includes(name.toLowerCase()) && name);
    r.warnings = warningsFor(r, ignored);
    r.status = r.warnings.length ? "warnings" : "ready";
    return r;
  }

  DC.csv = { validate, MAX_BYTES, REQUIRED };
})();
