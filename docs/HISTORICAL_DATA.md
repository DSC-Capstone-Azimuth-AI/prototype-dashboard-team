# Historical measurements contract 1.0

This pilot displays individual DERConnect active-power phases, independently of
the synthetic hourly anomaly store. No actual archive or cache was available for
this implementation. Automated validation uses generated synthetic raw CSVs only.
The default page has no configured export and never substitutes synthetic data.

## Generate and open an export

Run from the repository root with NumPy and pandas (the existing
`requirements-derconnect.txt` supplies the EDA dependencies). Input may be a local
ZIP, an extracted directory tree such as `E2451/E2451_2026-01.csv`, or a single raw
CSV. Required columns: `_time`, `DeviceID`, and the selected `Active_Power_A/B/C`.
Timestamps must carry offsets; `DeviceID` is checked rather than inferred as a
building name. Other meter IDs in a selected input are counted and excluded.

```bash
export DERCONNECT_DATA_PATH="/path/to/authorized/local/Haojian_Data.zip"
python3 tools/export_derconnect_history.py \
  --meter E2451 --channel Active_Power_A \
  --start 2026-01-01T00:00:00-08:00 --end 2026-01-08T00:00:00-08:00 \
  --minutes 15 --minimum-coverage 0.8 \
  --output local-data/derconnect-history.json
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/#historical` and choose that JSON. The browser reads
the local file without uploading it. It remains in memory across section changes,
but clears on reload. To load it over HTTP and retain the configuration on reload,
set this existing metadata element in your **local** `index.html`:

```html
<meta name="derconnect-history" content="local-data/derconnect-history.json">
```

Keep that path relative and on the dashboard's own HTTP origin. Do not deploy
private exports with a public site. A failed configured load produces an explicit
error, with no fallback. Automatic file-protocol fetching is unsupported; serve
over HTTP. Only the loaded, validated meter/channel/resolution is shown in the
disabled selection controls. Choose another export to change those selections.

`--input /path/to/extracted/tree` overrides the environment variable.
`--month 2026-01` replaces `--start/--end` and means the complete **campus-local**
month, including DST elapsed duration. Explicit bounds must include offsets and
align with the chosen complete UTC bins. Maximum range: 32 elapsed days. The
default resolution is 15 minutes; tested alternatives are 5 and 60 minutes.
The exporter refuses to overwrite an existing output; remove or rename your
previous export deliberately or choose a new output name.

ZIP/directory discovery selects CSVs under a directory named for the meter or
with a filename beginning `E2451_`, `E2451-` or `E2451.` (equivalently for other
documented meters). **All matching months are scanned through EOF**, so filename
calendar conventions and cross-file overlaps cannot silently affect the selected
range. Nothing is extracted. Memory is proportional to the chosen range's cadence
slots plus `--chunksize` rows (default 25,000), rather than all input observations.
Large archives may therefore require substantial I/O even for a short export.

Legacy `agg15_*.csv`, `hourly_total_kW.csv` and `fifteen_min_total_kW.csv` caches
are deliberately unsupported: their row counts cannot establish unique valid
cadence-slot coverage or duplicate-free extrema. Reprocess authorized raw inputs;
do not relabel those caches as this contract.

## Normative fields and validation

The static adapter `DC.history.validate(data)` rejects unknown versions. This
document defines 1.0; the Python exporter and exporter-to-JavaScript regression
test exercise it together. Version changes require a reviewed adapter update.

| Field | Rule |
|---|---|
| `schema_version` | Exactly `"1.0"` |
| `dataset_type`, `source` | `"historical_measurements"`, `"DERConnect"` |
| `measurement_kind` | `"actual_measurements"` or `"synthetic_fixture"`; the latter is visibly labeled in the UI |
| `meter_id`, `facility_type` | E2451 Instructional; E3020 Mixed; E3510/E7080/E7085 Office |
| `channel` | `Active_Power_A`, `Active_Power_B` or `Active_Power_C`; never a phase sum |
| `source_unit`, `display_unit` | `"W"`, `"kW"`; mapping CSV and existing helper mapping must agree |
| `timezone` | Exactly `"America/Los_Angeles"`, used for display/calendar grouping only |
| `aggregation_minutes` | 5, 15 or 60 |
| `cadence_seconds` | 2 (explicit provisional schedule assumption) |
| `minimum_coverage` | Finite fraction in [0, 1], default 0.8 |
| `start_utc`, `end_utc` | Canonical `YYYY-MM-DDTHH:mm:ssZ`, complete UTC bin boundaries, start inclusive/end exclusive, nonempty span ≤32 days |
| `records` | Dense ordered unique bins covering the entire declared range, including missing bins; an explicitly empty array is accepted as unavailable |
| `provenance` | Exporter identity/version, input kind, content hashes/bytes in scan order, code/mapping hashes, library versions, chunk size, duplicate policy, diagnostic counts, assumptions |

Every record has the following fields. No NaN, Infinity, numeric strings or
implicit undefined values are permitted in numeric fields.

| Record field | Meaning |
|---|---|
| `timestamp_utc` | Start of half-open bin `[timestamp_utc, timestamp_utc + aggregation_minutes)` |
| `mean_kw`, `min_kw`, `max_kw` | Observed sample statistics after W/1,000 conversion, finite and ordered for usable bins; all three are JSON `null` for rejected bins |
| `expected_slots` | `aggregation_minutes × 60 / 2`, including wholly absent observations |
| `observed_slots` | Number of two-second slots containing at least one matching meter observation with valid time, regardless of numeric validity |
| `collision_slots` | Number of slots containing more than one observation; exact duplicates and jitter collisions are both included |
| `valid_observations` | Finite observations in noncolliding slots, at most `observed_slots - collision_slots` |
| `coverage` | Exactly `valid_observations / expected_slots` (adapter tolerance 1e-12) |
| `quality` | `ok`, `missing`, `invalid`, `low_coverage`, or `cadence_collision` |

Slots are half-open two-second UTC intervals aligned to the epoch. Out-of-order
rows do not affect placement. A valid zero or negative reading is retained.
Missing/invalid/naive timestamps are excluded and counted. Missing and nonfinite
numeric values do not contribute to valid coverage. Counts for missing/invalid
values apply only to the selected meter/time range; time diagnostics cover the
selected meter's scanned inputs. `rows_scanned` and `other_meter_rows` describe all
rows in the selected source files; `backwards_steps` describes selected-range
order across the sorted inputs. Source-month conventions are not assumed.

Quality precedence is conservative:

1. Any colliding slot → `cadence_collision`, all power summaries withheld.
2. No observed slots → `missing`.
3. No valid observations → `invalid`.
4. Valid-slot coverage below the threshold → `low_coverage`.
5. Otherwise → `ok`, unless arithmetic produced nonfinite summaries (`invalid`).

Coverage remains available even for a rejected bin. Statistics never fill gaps,
select a duplicate arbitrarily, integrate energy, or combine meters/phases. Means
weight finite observed samples, rather than averaging partially populated
five-minute means. The selected range is padded internally to whole elapsed UTC
hours for the existing helper, then trimmed to the exact requested bins. Partial
requested bins are rejected at configuration time; they are not silently clipped.

## Frontend calculations

The adapter retains the validated dataset, selects records by inclusive campus
date (using Intl timezone conversion), and exposes independent summaries/profiles.
It does not use the synthetic `DC.time` convention or detector outputs. Validated
zero and negative values differ from nulls. The chart stops at every rejected bin
and hatches unavailable intervals; hover describes its quality/counts/extrema.

- **Mean observed power:** sum of usable bin mean × valid observations / sum of
  supporting observations. It is not energy consumption.
- **Maximum observed sample in usable bins:** maximum retained bin `max_kw`,
  excluding all rejected bins. It is not the maximum 15-minute mean or tariff demand.
- **Valid-slot coverage:** valid noncolliding slots / all expected slots in the
  selected range, including support within bins whose power is withheld.
- **Daily profile:** sample-weighted mean by campus-local hour, using only usable
  bins. Each hour needs 80% supporting slots relative to all selected bins in that
  hour. Display requires ≥23 elapsed hours and ≥18 eligible hour groups; sample
  counts/coverage are supplied per hour. This threshold is separate from bin
  coverage. Repeated fall-back hours contribute twice their elapsed support;
  nonexistent spring hours contribute none. Rejected bins never enter a mean.

The view does not report weather, forecasts, anomaly labels/scores, model accuracy,
energy, seasonal conclusions or physical diagnoses. No flatline detector is run;
coverage is not a guarantee of calibration or freedom from repeated-value issues.

## Provenance, reuse and privacy

Matthew's `_parse_times()`, `_numbers()`, `_accumulate()` and `_resolutions()` from
`derconnect_full_quality.py` are called directly. Their actual return values were
inspected and tested: the parser returns UTC timestamps/missing/naive masks;
the resolutions return frames keyed by minutes, with qualified statistics,
valid-row counts, slot coverage and duplicate flags. `scan_archive()` returns a
dictionary of diagnostics, dense frames and bounded detail, not an export path.
`aggregation_summary()` summarizes eligible-bin peaks; `calendar_tables()` returns
hour/profile/day/week/month tables with its own period eligibility policy.

The exporter replaces the scanner's O(raw rows) exact-timestamp arrays with bounded
slot occupancy and **stricter any-slot-collision bin rejection**. This may withhold
otherwise valid jittered readings. It is an intentional pilot policy, documented
and tested, not a claim that every collision is an exact timestamp duplicate.
The five-minute collision flags propagate correctly to larger bins.

Jared's `prepare()` returns a completion boolean, `process_file()` writes caches
and returns None, and `load()` returns `(agg15, flats, gaps)` frames. `process_file()`
loads a whole monthly CSV, retains duplicate rows in counts, computes unverified
`P_total_*` fields and does not export slot masks. `load()` also assumes cache
files exist (its empty-frame fallback can index an empty list). Those are reasons
not to consume that cache directly, rather than reasons to replace teammates' EDA.
Notebook 02's counter comparison is useful evidence to review; its numerical and
electrical conclusions were not independently reproduced here and do not authorize
phase sums in this pilot. The historical view does not import its screening events.

Provenance contains SHA-256 of the complete decompressed selected CSV bytes read
through EOF, input byte sizes, the exporter/reused helper sources, the unit mapping,
pandas/NumPy versions, policies and diagnostics. Inputs are listed by hash without
local paths; output is deterministic for identical input bytes, settings and code/
dependency versions. There is no volatile generation timestamp. Hashes provide
reproducibility identity, not authentication of a measurement's origin or calibration.
`actual_measurements` is the producer's declaration; always use `--synthetic-fixture`
for test inputs. The UI visibly preserves that distinction.

Keep raw/derived private inputs in Git-ignored `local-data/`, `data/raw/`,
`data/processed/`, or `local-results/`, or outside the repository. The historical
filename pattern is additionally ignored. No export is committed or published.
Existing notebooks/output records and generated synthetic assets are untouched.

## Validation and expansion

```bash
PYTHONDONTWRITEBYTECODE=1 MPLCONFIGDIR=/tmp/history-mpl python3 -m unittest discover -s tests -p 'test_*.py'
node tests/historical-monitoring.cjs
node tests/regression.cjs
node tests/csv-upload.cjs
node tests/reports.cjs
# With the server running and existing Playwright/Chromium installed:
node tests/historical-browser.cjs
node tests/browser.cjs
node tests/navigation.cjs
node tests/section-navigation.cjs
node tests/csv-upload-browser.cjs
node tests/meter-comparison.cjs
node tests/investigation-views.cjs
```

Optional `CHROMIUM_PATH`, `DASHBOARD_URL`, `SCREENSHOT_DIR` follow the existing
browser-test conventions (navigation.cjs accepts a URL argument). To demonstrate
the complete flow without real data, explicitly generate a labeled test export:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_derconnect_export.py --fixture work/history-fixture
```

Choose `work/history-fixture/derconnect-history-fixture.json` in the historical
view. This is synthetic test evidence, never the default or a real-data demo.
See the dated development log for actual commands/results, browser launch
fallbacks and intermediate failures.

Next: run a bounded authorized E2451 phase-A interval locally and reconcile counts,
extrema/means and source hashes; review source cadence/scaling/signs. Other four
meters and separate B/C phases are accepted by the exporter, but need their own
locally validated exports before display. The current UI loads one product at a
time; simultaneous meter switching needs a reviewed manifest. Add named-building/
feeder relationships only after verification. Future detector results should use
the stable `(meter_id, channel, timestamp_utc, aggregation_minutes)` identity with
separate run/model provenance; this schema does not imply detector outputs exist.

## Independent pre-PR reconciliation

`tools/validate_derconnect_history.py` is a standalone Python 3.11+ standard-library
validator. It does not call the exporter or EDA aggregators. It reads every matching
E2451 CSV in the ZIP, hashes complete decompressed inputs, and independently assigns
raw observations to two-second slots in a temporary SQLite database. No extraction
or original-input modification occurs. All exported bins are checked (672 for the
January 1–7 pilot), exceeding a ten-bin sample and covering every missing-bin neighbor,
period boundary and power level. The full scan and separate hash pass can take minutes.

From the local feature-branch checkout, run:

```bash
python3 tools/validate_derconnect_history.py \
  --archive "$HOME/Desktop/Haojian_Data.zip" \
  --export local-data/derconnect-history.json \
  --report local-results/historical-validation.json
```

The report is private and Git-ignored; it refuses to overwrite an existing report.
It contains all discrepancies, source/code/mapping hash comparisons, every bin's
UTC/campus time, counts, quality and observed extrema/mean, every unavailable bin's
reason, exact valid/expected totals, unrounded coverage and independent weighted
summary/daily-profile values. Power tolerance is 1e-8 absolute plus 1e-9 relative
(`math.isclose`); count/status/hash comparisons are exact. Exit 0 means agreement,
1 means discrepancies, 2 means validation could not run. This is reconciliation
against the stated contract, not confirmation of instrument calibration, electrical
semantics, or the provisional two-second schedule. The JSON must still pass the
frontend's full schema validator. Hash mismatches require source/version review;
do not edit hashes or relax checks to obtain PASS.

Optional automated frontend comparison (requires local Playwright, Node and Chrome;
set CHROMIUM_PATH to your actual browser executable on macOS):

```bash
HISTORY_EXPORT=local-data/derconnect-history.json \
HISTORY_REPORT=local-results/historical-validation.json \
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node tests/historical-reconcile-browser.cjs
```

Run the HTTP server first. This check requires a PASS independent report and verifies
the exact export's SHA-256 before loading it into the real browser. It compares the
adapter's summaries and all hourly profile values/counts with the independent raw
report, verifies displayed summary facts, labels, origin, chart markers and mobile
fit. The existing historical browser suite separately exercises campus-date filters,
gap geometry, themes, navigation and reload. Neither check authenticates meter data.

Slot coverage and usable-bin fraction have different denominators: finite,
noncolliding observations in a rejected bin can contribute to slot coverage while
its entire power summary is withheld. Thus coverage rounded to one decimal percent
may show 100.0% with unavailable bins. This behavior has a synthetic regression test;
it does not identify the cause or exact coverage of any particular private export.
Use the report's numerator/denominator and per-bin reasons rather than inferring
quality from rounded figures. The requesting user's reported January UI figures
remain unverified until this independent check is run on the actual local inputs.

## Optional synchronized comparisons

The separate comparison loader accepts up to nine schema-validated local JSON products (maximum 10 MB each and 30 MB combined), selected as one batch. It rejects duplicate `(meter_id, channel)` identities rather than stitching monthly products, and requires matching units, resolution, cadence, measurement kind and UTC grid. Generate bounded exports with the existing preprocessing script when authorized; no exporter or raw-data change is needed. All phases retain their existing W→kW contract. Actual exports cannot be mixed with synthetic test fixtures. Source hashes and thresholds remain per-product; acceptance by the frontend is schema validation, not an independent raw-source PASS.

Modes: one meter's available A/B/C phases, with unavailable phase labels; or the same phase across up to three selected stable device IDs. No building/hierarchy or combined-power inference. Selection defaults to the common half-open UTC product window. Date controls retain inclusive campus-date semantics via the existing helper, so DST days can contain 23 or 25 elapsed hours. Different start/end coverage is disclosed for each selected product. No overlap or excluding dates yields an explicit empty state.

Each selected available product has a separate chart with identical UTC x positions and shared observed-mean kW y domain. The single accessible timestamp range input supports arrow keys, Home and End; pointer movement in any chart updates every cursor and labeled readout. Readouts use only the exact UTC record, reporting quality reasons for missing/rejected/no-record bins. Raw-sample minima/maxima are labeled separately and do not drive the plotted mean scale. Unusable bins break line segments and remain shaded; zero/negative values remain measurements. Charts retain the selected cursor when the pointer leaves. There is no animation or added motion.

Per-product source provenance/full coverage and selected-scope quality counts are retained. The collapsed native Need Help? disclosure explains phase/meter use, compatibility, cursor/scales, gaps and why totals are absent. Single-file loading/configured HTTP loading and their summaries/profiles are unchanged; the comparison batch is independent, session-only and clears on reload. Selecting a replacement batch replaces all comparison products, and an invalid batch clears comparison charts instead of displaying stale data.

`js/history-comparison.js` owns this optional module; integration adds its script before the historical section and a disclosure host in that section. Existing indexed charts/store/exporter are untouched. `tests/fixtures/history-comparison.cjs` creates small, explicitly synthetic schema products with descriptor hashes solely for tests, never model predictions or real source claims. Unit/browser suites cover missing/collision bins, zero/negative values, UTC alignment/compatibility, overlapping/disjoint coverage, DST, missing phases, meter cap, synchronized pointer/keyboard readouts, themes/mobile and single/synthetic isolation. Actual multi-meter/phase reconciliation has not been performed in this change; the earlier private single-export transport-provenance mismatch is not treated as an all-PASS validation.
