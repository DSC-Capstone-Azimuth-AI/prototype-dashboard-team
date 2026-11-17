/* Derived session series; original 1.0 exports remain independently validated. */
(function () {
  'use strict';
  const H = window.DC.history, derived = new WeakSet();
  const MAX_FILES = 120, MAX_BYTES = 60 * 1024 * 1024, MAX_BINS = 500000;
  const key = d => d.meter_id + '/' + d.channel;
  const seriesId = d => ['DERConnect', d.measurement_kind, d.meter_id, d.channel, d.display_unit,
    d.aggregation_minutes + 'min', d.cadence_seconds + 's'].join(':');
  const fields = ['mean_kw', 'min_kw', 'max_kw', 'expected_slots', 'observed_slots',
    'collision_slots', 'valid_observations', 'coverage', 'quality'];
  function gap(t, step, quality = 'missing', status = 'no_export') {
    return { timestamp_utc: new Date(t).toISOString().replace('.000Z', 'Z'), mean_kw: null,
      min_kw: null, max_kw: null, expected_slots: step / 2000, observed_slots: 0,
      collision_slots: 0, valid_observations: 0, coverage: 0, quality, catalog_status: status };
  }
  function build(exports) {
    if (!Array.isArray(exports) || !exports.length || exports.length > MAX_FILES) throw Error('Choose 1–120 historical exports.');
    exports.forEach(H.validate);
    const first = exports[0], groups = new Map();
    const signature = d => JSON.stringify([d.source_unit, d.display_unit, d.timezone, d.aggregation_minutes,
      d.cadence_seconds, d.measurement_kind, d.minimum_coverage, d.provenance.mapping_sha256,
      ...Object.keys(d.provenance.code_sha256).sort().map(k => [k, d.provenance.code_sha256[k]]),
      d.provenance.pandas, d.provenance.numpy, d.provenance.duplicate_policy, d.provenance.assumptions]);
    for (const d of exports) {
      if (signature(d) !== signature(first)) throw Error('Catalog exports need matching units, resolution, cadence, measurement kind, coverage policy and transformation provenance.');
      if (!groups.has(key(d))) groups.set(key(d), []);
      groups.get(key(d)).push(d);
    }
    const start = Math.min(...exports.map(d => H.timestamp(d.start_utc)));
    const end = Math.max(...exports.map(d => H.timestamp(d.end_utc)));
    const step = first.aggregation_minutes * 60000, bins = (end - start) / step;
    if (end - start > 3 * 366 * 86400000 || bins * groups.size > MAX_BINS) throw Error('Catalog is too large: maximum three elapsed years and 500,000 derived bins. Load a smaller selection.');
    return Array.from(groups.values(), sources => {
      const base = sources[0], index = new Map(), conflicts = new Map();
      let duplicates = 0;
      sources.forEach((d, source) => d.records.forEach(r => {
        const t = H.timestamp(r.timestamp_utc), previous = index.get(t);
        if (!previous) { index.set(t, { record: r, source }); return; }
        if (!conflicts.has(t) && fields.every(k => previous.record[k] === r[k])) { duplicates++; return; }
        if (!conflicts.has(t)) conflicts.set(t, [previous.source]);
        conflicts.get(t).push(source);
      }));
      const records = [];
      // Explicitly empty exports stay unavailable. Nonempty series include unloaded months.
      if (index.size) for (let t = start; t < end; t += step) records.push(conflicts.has(t)
        ? gap(t, step, 'export_conflict', 'conflicting_exports') : index.get(t)?.record || gap(t, step));
      const product = { ...base, schema_version: 'catalog/1.0', series_id: seriesId(base),
        start_utc: new Date(start).toISOString().replace('.000Z', 'Z'),
        end_utc: new Date(end).toISOString().replace('.000Z', 'Z'), records,
        source_exports: sources, catalog: { identical_overlap_bins: duplicates,
          conflicting_bins: conflicts.size, conflicts: Array.from(conflicts, ([t, source_indices]) =>
            ({ timestamp_utc: new Date(t).toISOString(), source_indices })) },
        provenance: { catalog_policy: 'identical_aggregates_once_conflicts_withheld_no_imputation',
          sources: sources.map(d => ({ start_utc: d.start_utc, end_utc: d.end_utc, provenance: d.provenance })) } };
      derived.add(product); return product;
    });
  }
  async function readFiles(files) {
    files = Array.from(files);
    if (!files.length || files.length > MAX_FILES || files.some(f => f.size > H.MAX_BYTES) ||
        files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) throw Error('Choose 1–120 files, each ≤10 MB and ≤60 MB combined.');
    const exports = [];
    // Sequential parsing limits transient memory and preserves input order for provenance.
    for (const file of files) exports.push(H.validate(JSON.parse(await file.text())));
    return exports;
  }
  function months(product) {
    const result = new Map();
    for (const r of product.records) {
      const month = H.localDay(r.timestamp_utc).slice(0, 7);
      if (!result.has(month)) result.set(month, { month, loaded: 0, usable: 0 });
      const value = result.get(month);
      if (!r.catalog_status || r.catalog_status !== 'no_export') value.loaded++;
      if (r.quality === 'ok') value.usable++;
    }
    return Array.from(result.values());
  }
  // Bound SVG work by horizontal resolution, retaining extrema and every quality break.
  function plotRecords(records, pixels = 1000) {
    if (records.length <= pixels * 2) return records;
    const result = [], size = Math.ceil(records.length / pixels);
    for (let i = 0; i < records.length; i += size) {
      const chunk = records.slice(i, i + size), keep = new Set([0, chunk.length - 1]);
      let min = -1, max = -1;
      chunk.forEach((r, j) => {
        if (j && (r.quality === 'ok') !== (chunk[j - 1].quality === 'ok')) { keep.add(j - 1); keep.add(j); }
        if (r.quality === 'ok') {
          if (min < 0 || r.mean_kw < chunk[min].mean_kw) min = j;
          if (max < 0 || r.mean_kw > chunk[max].mean_kw) max = j;
        }
      });
      if (min >= 0) { keep.add(min); keep.add(max); }
      for (const j of Array.from(keep).sort((a, b) => a - b)) result.push(chunk[j]);
    }
    return result;
  }
  function periods(records, type) {
    const groups = new Map();
    for (const r of records) {
      const day = H.localDay(r.timestamp_utc);
      const key = type === 'month' ? day.slice(0, 7) : String((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    return Array.from(groups, ([key, rows]) => {
      const summary = H.summarize(rows), eligibleCoverage = summary.support / summary.expected;
      return { key, ...summary, mean: eligibleCoverage >= .8 ? summary.mean : null, eligibleCoverage, bins: rows.length };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }
  H.catalog = { periods, build, readFiles, months, seriesId, plotRecords, MAX_FILES, MAX_BYTES,
    validateProduct: d => derived.has(d) ? d : H.validate(d) };
})();
