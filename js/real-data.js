/* Versioned historical measurements. Independent of the synthetic indexed store. */
(function () {
  "use strict";
  const DC = window.DC = window.DC || {};
  const METERS = { E2451: "Instructional", E3020: "Mixed", E3510: "Office", E7080: "Office", E7085: "Office" };
  const TZ = "America/Los_Angeles", MAX_BYTES = 10 * 1024 * 1024;
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const hourFormat = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" });
  const stampFormat = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const axisDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });
  const axisTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" });
  const fail = message => { throw new Error("Historical export: " + message); };
  const number = n => typeof n === "number" && Number.isFinite(n);
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  function timestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value)) fail("UTC timestamps must use YYYY-MM-DDTHH:mm:ssZ.");
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().replace(".000Z", "Z") !== value) fail("invalid UTC timestamp.");
    return ms;
  }
  const localDay = value => {
    const parts = Object.fromEntries(dayFormat.formatToParts(new Date(value)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  function validate(data) {
    if (!data || data.schema_version !== "1.0") fail("unsupported schema version (expected 1.0).");
    if (data.dataset_type !== "historical_measurements" || data.source !== "DERConnect") fail("unknown dataset type or source.");
    if (!Object.hasOwn(METERS, data.meter_id) || METERS[data.meter_id] !== data.facility_type) fail("unknown meter or facility classification.");
    if (!["Active_Power_A", "Active_Power_B", "Active_Power_C"].includes(data.channel)) fail("channel must be an individual active-power phase.");
    if (data.source_unit !== "W" || data.display_unit !== "kW" || data.timezone !== TZ) fail("units or campus timezone are unsupported.");
    if (!["actual_measurements", "synthetic_fixture"].includes(data.measurement_kind)) fail("measurement kind must be explicit.");
    if (![5, 15, 60].includes(data.aggregation_minutes) || data.cadence_seconds !== 2) fail("unsupported resolution or cadence.");
    if (!number(data.minimum_coverage) || data.minimum_coverage < 0 || data.minimum_coverage > 1) fail("coverage threshold must be in [0,1].");
    const a = timestamp(data.start_utc), b = timestamp(data.end_utc), step = data.aggregation_minutes * 60000;
    if (b <= a || b - a > 32 * 86400000 || a % step || b % step) fail("range must contain complete UTC bins and span at most 32 days.");
    const p = data.provenance;
    if (!p || p.exporter !== "export_derconnect_history/1.0" || p.duplicate_policy !== "reject_any_cadence_collision_bin" ||
        !["zip", "csv", "csv_directory"].includes(p.input_kind) || !Array.isArray(p.inputs) || !p.inputs.length ||
        !p.inputs.every(s => s && /^[a-f0-9]{64}$/.test(s.sha256) && integer(s.bytes)) ||
        !p.code_sha256 || !["export_derconnect_history.py", "derconnect_full_quality.py", "inspect_derconnect.py"].every(k => /^[a-f0-9]{64}$/.test(p.code_sha256[k])) ||
        !/^[a-f0-9]{64}$/.test(p.mapping_sha256) || typeof p.pandas !== "string" || typeof p.numpy !== "string" || typeof p.assumptions !== "string" ||
        !integer(p.chunksize) || p.chunksize < 1 || !p.diagnostics ||
        !["rows_scanned", "other_meter_rows", "missing_timestamps", "naive_timestamps", "invalid_timestamps", "outside_range_rows",
          "backwards_steps", "missing_values", "invalid_values", "cadence_collision_slots"].every(k => integer(p.diagnostics[k]))) fail("source/transformation provenance is missing or invalid.");
    if (!Array.isArray(data.records) || (data.records.length !== 0 && data.records.length !== (b - a) / step)) fail("records must include every bin, including gaps (or be explicitly empty).");
    data.records.forEach((r, i) => {
      if (!r || timestamp(r.timestamp_utc) !== a + i * step) fail("bins must be ordered, unique and contiguous.");
      const expected = step / 2000;
      if (r.expected_slots !== expected || !integer(r.valid_observations) || !integer(r.observed_slots) || !integer(r.collision_slots) ||
          r.observed_slots > expected || r.collision_slots > r.observed_slots || r.valid_observations > r.observed_slots - r.collision_slots ||
          !number(r.coverage) || r.coverage < 0 || r.coverage > 1 || Math.abs(r.coverage - r.valid_observations / expected) > 1e-12) fail("invalid observation counts or coverage.");
      if (!["ok", "missing", "invalid", "low_coverage", "cadence_collision"].includes(r.quality)) fail("unknown quality status.");
      if (r.collision_slots > 0 ? r.quality !== "cadence_collision" : r.quality === "cadence_collision") fail("collision status contradicts slot counts.");
      if (r.observed_slots === 0 && r.quality !== "missing" || r.quality === "missing" && r.observed_slots !== 0) fail("missing status contradicts observations.");
      if (r.quality === "low_coverage" && (!r.valid_observations || r.coverage >= data.minimum_coverage)) fail("low-coverage status contradicts counts.");
      if (r.quality === "ok") {
        if (!r.valid_observations || r.collision_slots || r.coverage < data.minimum_coverage ||
            ![r.min_kw, r.mean_kw, r.max_kw].every(number) || r.min_kw > r.mean_kw + 1e-10 || r.mean_kw > r.max_kw + 1e-10) fail("usable power summary is invalid.");
      } else if (![r.mean_kw, r.min_kw, r.max_kw].every(v => v === null)) fail("unusable bins must contain null power summaries.");
    });
    return data; // Retain one authoritative dataset; no per-meter copies or synthetic joins.
  }

  async function load(url, fetcher = window.fetch.bind(window)) {
    if (!url) fail("no real export is configured. Choose a local export or configure the page metadata.");
    const base = window.location.href;
    if (window.location.protocol === "file:") fail("serve the dashboard with the documented local HTTP server.");
    const target = new URL(url, base);
    if (target.origin !== window.location.origin || !["http:", "https:"].includes(target.protocol)) fail("export URL must use the dashboard's own HTTP origin.");
    const response = await fetcher(target.href, { cache: "no-store", redirect: "error" });
    if (!response.ok) fail(`configured export unavailable (HTTP ${response.status}). Generate it locally and check the configured path.`);
    if (Number(response.headers?.get("content-length")) > MAX_BYTES) fail("export exceeds the 10 MB pilot limit.");
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_BYTES) fail("export exceeds the 10 MB pilot limit.");
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { fail("configured export is not valid JSON."); }
    return validate(parsed);
  }

  function select(data, from = "", to = "") {
    // Date inputs represent inclusive campus dates; no fixed 24-hour UTC shortcut.
    if (from && to && from > to) return [];
    return data.records.filter(r => { const day = localDay(r.timestamp_utc); return (!from || day >= from) && (!to || day <= to); });
  }

  function summarize(records) {
    let valid = 0, expected = 0, usable = 0, weighted = 0, support = 0, peak = null;
    const reasons = {};
    for (const r of records) {
      valid += r.valid_observations; expected += r.expected_slots;
      reasons[r.quality] = (reasons[r.quality] || 0) + 1;
      if (r.quality !== "ok") continue;
      usable++; support += r.valid_observations; weighted += r.mean_kw * r.valid_observations;
      peak = peak === null ? r.max_kw : Math.max(peak, r.max_kw);
    }
    return { mean: support ? weighted / support : null, peak, coverage: expected ? valid / expected : null,
      usable, unavailable: records.length - usable, support, valid, expected, reasons };
  }

  function profile(data, records) {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sum: 0, valid: 0, expected: 0, bins: 0 }));
    for (const r of records) {
      const h = hours[Number(hourFormat.format(new Date(r.timestamp_utc)))];
      h.expected += r.expected_slots;
      if (r.quality === "ok") { h.sum += r.mean_kw * r.valid_observations; h.valid += r.valid_observations; h.bins++; }
    }
    const values = hours.map(h => ({ hour: h.hour, mean: h.valid && h.valid / h.expected >= 0.8 ? h.sum / h.valid : null,
      valid: h.valid, expected: h.expected, bins: h.bins, coverage: h.expected ? h.valid / h.expected : null }));
    const span = records.length * data.aggregation_minutes * 60000;
    return { available: span >= 23 * 3600000 && values.filter(h => h.mean !== null).length >= 18,
      hours: values, support: hours.reduce((n, h) => n + h.valid, 0) };
  }

  DC.history = { validate, load, select, summarize, profile, localDay, timestamp,
    stamp: value => stampFormat.format(new Date(value)),
    axisStamp: value => [axisDay.format(new Date(value)), axisTime.format(new Date(value))], MAX_BYTES };
})();
