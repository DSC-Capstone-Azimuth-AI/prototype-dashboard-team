# DERCONNECT Unified Dashboard

Anomaly-focused monitoring for DERCONNECT buildings and sub-grids, built around the workflow
**Detect → Classify → Visualize → Investigate → Interpret**. It implements the requirements in
*DERCONNECT Unified Dashboard — Final Requirements & Visualizations*. Detections come from the
D05 anomaly team's code in `chronos2-sarsim0-anomaly-team`.

Plain HTML, CSS and JavaScript. No build step, no frameworks, no CDN: the charts are
hand-written SVG, so the page works offline and on GitHub Pages.

## Run it

```bash
# Option 1: open the file
open index.html            # macOS (or double-click it)

# Option 2: serve locally
python3 -m http.server 8000   # then visit http://localhost:8000
```

**GitHub Pages:** push the repo, then go to *Settings → Pages → Deploy from branch → `main` / root*.

## What's in it

| Destination | Purpose |
|---|---|
| **Overview** | Pending events, high/critical events, affected buildings and meter completeness; five priority events appear before the compact demand summary/chart. Building consumption links, type/severity charts and meter heatmap remain available. |
| **Buildings** | Searchable directory with consumption, pending priority, meters and completeness. Open `#buildings/LIB` for a dedicated profile with demand, historical means, simulated channels and linked anomalies. Advanced building/sub-grid analysis retains comparisons, heatmaps, daily profiles, peaks, decomposition and solar views. |
| **Anomaly Investigation** | Filtered, sortable event list or optional gallery. Every event opens a separate `#investigate/CR-030` detail route: four key facts, highlighted demand chart, evidence, definition and browser-local operator review/notes. Weather, quality, score/threshold, forecast quantiles, detector overlap, synthetic labels, history and scatter remain in disclosures. |
| **Detection Quality** | Detector comparisons, precision/recall/F1, false-positive analysis, synthetic scenarios, threshold diagnostics and ground-truth comparisons. Comparison metrics describe the complete evaluation run; diagnostic panels retain their existing scope. |
| **CSV Upload** | Checks a meter CSV in the browser and reports rejected rows, gaps, duplicates and cadence, then plots the measured readings. Results stay in memory, separate from the simulated dataset, and no detector runs on them. |
| **Historical Monitoring** | Loads validated monthly DERConnect exports for multiple meters/phases, with global campus dates, month selection, synchronized comparisons, daily/weekly/monthly power summaries and visible missing/conflicting intervals. No actual export is bundled or configured by default. |

Navigation uses URL hashes and supports browser Back/Forward and detail reloads. Page-specific filter scopes are retained during navigation in the current session. A detail URL identifies its record independently of list filters; returning to the list restores that list's scope. Filter scopes themselves are not serialized across reloads. Unknown record IDs show an explicit unavailable state.

Filters are contextual: Overview exposes time/building; Buildings exposes time and search; the anomaly list exposes date/building/priority/status; Detection Quality exposes detector/time. Additional controls remain in **Advanced filters**. Event details hide list filters. Priority labels are dashboard heuristics, and normalized detector scores are not probabilities of a fault.

Review decisions and notes use localStorage, with no server or training-label synchronization. Explicit Save notes reports storage availability. A review decision does not prove a diagnosis. PR #2’s dataset-scoped review storage and status IDs are retained. Notes from the earlier uncommitted UX version migrate into that same review store for this dataset. Existing status records still load.

Investigation details adapt to the existing event classification: point events foreground the paired reading and nominal forecast range; sustained events emphasize the interval and valid signed excess use; contextual events open weather/occupancy evidence; seasonal events foreground prior-week comparisons; quality events put the meter-status timeline first. Suspect or absent readings take precedence over temporal behavior. This selects a presentation, not a new classification or detection rule. Unsupported classifications use a general evidence view. Missing forecasts/context remain explicit gaps, and prior-week comparisons are retrospective evidence rather than a confirmed cause.


**Compare related meters:** Open an event to compare its readings with up to two compatible meters using synchronized charts. This helps investigate whether unusual activity is isolated or shared across locations. All readings and meter relationships are simulated.


### Visual encoding

- **Anomaly type**: fixed colour *and* symbol. Point ●, Collective ■, Contextual ◆,
  Seasonal/pattern ▲, Peak demand ★, Data integrity ✕.
- **Severity**: reserved status colours, always shown with an icon and a label.
- **Measured / expected**: neutral ink so anomalies stand out. Measured is a solid line,
  expected (median forecast) is dashed, with 80% and 98% forecast bands.
- Isolated events use **point markers**; sustained events use **shaded intervals**.
- Light and dark themes (light default; the toggle remembers your choice).

## Data pipeline

```
tools/build_data.py ──uses──▶ chronos2-sarsim0-anomaly-team/src/sarsim_fm
      │                         anomaly_injection.inject_anomaly   → labelled test events
      │                         forecast.rolling_forecast          → quantile forecasts
      │                         baselines.MedianMAD, models/naive  → detectors
      │                         scores (3 kinds), calibration      → conformal thresholds
      │                         events.build_events, metrics       → events + evaluation
      ▼
data/derconnect-data.js     meters, weather, occupancy, forecasts, events, evaluation
data/synthetic-labels.js    injected ground truth + matches (evaluation only)
```

Regenerate (requires `numpy` and `pandas`; torch is not required for the included detectors):

```bash
python3 tools/build_data.py --repo ../chronos2-sarsim0-anomaly-team
```

Same protocol as the repo's `docs/anomaly-detection.md`:

1. Three simulated campuses with different seeds: **campus-dev** (choose settings),
   **campus-test** (shown in the dashboard) and **campus-normal** (no anomalies; false alarms).
2. Each campus has 12 weeks of hourly data. The first 6 weeks are clean: residual scale fit,
   then threshold calibration. The last 6 weeks are evaluated.
3. For each detector, the same 162-candidate grid as `sfm select-anomaly` is tried on
   campus-dev. The setting with the best event F1, subject to normal FPR ≤ 2× target, is
   locked and then applied to campus-test.
4. Labels are written to a separate file and are never used by detectors, thresholds,
   classification or priority.

### Detectors included

| Detector | Source |
|---|---|
| Context-aware regression | Dashboard baseline (hour × day-type profile, cooling degrees × occupancy, irradiance for PV; refit daily on the previous 21 days) scored with the repo's scores, thresholds and event grouping |
| Seasonal naive (weekly / daily) | Repo `SeasonalNaive(168)` / `SeasonalNaive(24)` |
| Rolling median / MAD | Repo `MedianMAD` |
| Chronos-2 (optional) | Repo `load_forecaster`. Run inside the team's `uv` environment: `uv run python ../derconnect-dashboard/tools/build_data.py --repo . --model chronos2:outputs/chronos2-ft-500/checkpoint-final` |

The UI doesn't depend on any particular model. Any detector that produces quantile forecasts
(`q01, q10, q50, q90, q99`), a normalized score and events in the schema below shows up in
every view without UI changes.

### Classification, priority and explanations (dashboard side)

- **Behaviour**: point (≤ 2 h), contextual (values stay inside the meter's normal range but
  are abnormal for their context), collective (sustained, outside that range).
- **Operational category**: data integrity (zero or stuck readings), peak demand (above the
  99.5th percentile of clean history), seasonal/pattern (mostly off-hours excess, or a shape
  change), excess consumption, load drop, or generation deficit.
- **Priority (0–100)** combines relative deviation, duration and estimated excess energy.
  Peak demand adds to it; context that supports an explanation lowers it. The **novelty
  score** (peak score ÷ threshold) is kept separate.
- **Excess energy** is the sum of (measured − expected) over the event in kWh. It is left out
  for data-integrity events, where the baseline isn't valid.
- **Explanations** come from temperature against its 14-day norm, occupancy against prior
  weeks, off-hours share, cloud cover (PV) and data-quality flags. They are labelled as
  hypotheses, not confirmed causes.

## Switching to real DERCONNECT data

Use the independent **Historical Monitoring** view below for actual observed channels.
Its versioned timestamp contract preserves gaps and UTC instants without changing the
synthetic store. Replacing `simulate_campus()` alone cannot satisfy those requirements.
The following remains the existing **synthetic anomaly** display schema:

```text
meta        start, n, clean_prefix, calibration_start, detector_start, generator_version, seeds
subgrids[]  id, name
buildings[] id, name, subgrid, profile, pv_kw, occupancy[n]
meters[]    id, building, kind ("main"|"pv"), unit, actual[n], dq[n] (0 ok, 1 missing, 2 stuck)
weather     temp[n], cloud[n], ghi[n]
detectors[] id, label, source, settings, threshold, series{meterId: {q01,q10,q50,q90,q99,score}}  (from detector_start)
events[]    id, detector, meter, building, subgrid, start, end, peak_t (legacy score peak),
            score_peak_t, deviation_peak_t, type, behavior, category,
            severity, priority, novelty, peak_actual, peak_expected, peak_dev, excess_kwh,
            explanations[], context{}, detection{}, status
evaluation  per-detector metrics (only when labels exist)
```

## CSV upload format

The upload view uses a provisional checkpoint format, not the agreed DERCONNECT data contract.
Files must be UTF-8 CSV, up to 20 MB, with these columns in any order. Extra columns are ignored.

| Column | Value |
|---|---|
| `timestamp` | ISO 8601 date and time. `Z` or an offset is converted to UTC; a file without zones is shown as written. A file cannot mix both. |
| `meter_id` | Any non-empty ID. IDs are not mapped to buildings. |
| `kw` | Power in kW. Blank, `NA`, `NaN` and `null` are gaps, never zero. |

| Case | Handling |
|---|---|
| Bad timestamp, missing ID, invalid number or wrong column count | Row rejected and listed with its line number |
| Identical duplicate | Kept once and reported |
| Conflicting duplicate | Shown as a gap, so no value is chosen |
| Out-of-order rows | Sorted and reported |
| Off-cadence intervals or time gaps | Reported, never resampled or filled |
| Negative kW | Kept and reported, because the sign convention is not agreed |

Sample files: `tests/fixtures/meter-upload-valid.csv` and `tests/fixtures/meter-upload-messy.csv`.

## Repository layout

```
index.html                 page shell, filters, section containers
css/styles.css             design tokens (light/dark), layout, components
js/util.js                 time, formatting, taxonomy, colours, DOM helpers
js/charts.js               SVG charts: time series, bars, heatmap, scatter, timeline, tooltip
js/store.js                state, indexes, filtered events, persistence of status
js/ui.js                   cards, legends, event overlays/tooltips
js/csv.js                  meter CSV parsing and validation (no DOM, no simulated data)
js/sections/*.js           one file per dashboard section
js/app.js                  boot, filters, routing, theme
data/*.js                  generated data (detections and labels are separate)
tools/build_data.py        data builder that wraps the anomaly team's detector code
```

## Notes and limits

- The bundled anomaly data is **simulated**. Optional historical exports are separate and explicitly identify their origin. There are 8 real UCSD demonstration building names and 3 simulated PV arrays; the weather
  includes a heat wave and the calendar includes an open house as negative controls.
- Investigation status is saved in your browser only (localStorage). A shared status would
  need a small backend.
- Power-quality views are left out until voltage and frequency measurements exist (doc §4).
- The SarSim0 gallery adapts the *small-multiple layout* of Oreshkin et al. (2026), App. G,
  Fig. 8. Those figures examine simulator coverage, not electrical faults.

## Building labels and investigation (November 3, 2026)

Eight existing synthetic building IDs are retained; no extra buildings or events were added.
`tools/building_metadata.json` is the independently replaceable display-name/source catalog.
The builder embeds it in the generated static data, so browser loading remains offline-capable.
**Real names do not establish DERCONNECT coverage.** Meter IDs, meter relationships, feeder
assignments, profiles, PV capacities, occupancy, weather, measurements and detections are simulated.
For example, the York Hall label retains the old RES simulation profile; this does not describe
York Hall's actual use. No official list of all 24 metered buildings was found in the consulted sources.
[DERCONNECT capabilities](https://derconnect.ucsd.edu/testers/capabilities) reports 24 building
meters at 2-second cadence and 236 submeters; this fixture remains hourly and represents eight examples.

| Internal ID | Demonstration name | Official source |
|---|---|---|
| ENG | Jacobs Hall | [UCSD Maps](https://m.ucsd.edu/maps/list_nearby_points?ec=1&groupId=35&lat=32.87749&lng=-117.23528&rad=1600) |
| LIB | Geisel Library | [UCSD Library](https://ucsd.libguides.com/c.php?g=1078052&p=7853974) |
| LAB | Atkinson Hall | [Qualcomm Institute](https://qi.ucsd.edu/atkinson-hall/) |
| STU | Price Center | [University Centers](https://universitycenters.ucsd.edu/visit/directory.html) |
| DCA | San Diego Supercomputer Center | [Facility Services](https://facilityservices.ucsd.edu/information/density.html) |
| RES | York Hall | [Facility Services](https://facilityservices.ucsd.edu/information/density.html) |
| ADM | Center Hall | [UCSD Maps](https://m.ucsd.edu/maps/list_nearby_points?ec=1&groupId=35&lat=32.87749&lng=-117.23528&rad=1600) |
| REC | RIMAC | [Facility Services](https://facilityservices.ucsd.edu/information/density.html) |

Filter edits clear an excluded selection. Opening a queue/gallery record updates the hash and
adds browser history. Dedicated details restore the event's detector and an explicit inclusive
scope; returning to the list restores its independent list scope. The Overview review action
seeds that list from the Overview filters and ranks pending events by priority. No event is
selected automatically. A research label or contextual
hypothesis never sets a human review state. New records are Unreviewed; explicit legacy browser
reviews are retained. Annotations use a dataset-scoped localStorage key, with in-memory fallback
and disclosure if storage fails. Save notes explicitly before changing views. Reviews do not
synchronize, retrain models, or establish independently verified truth.

The operator record separates highest measured load, largest absolute residual, and peak detector
score. Physical summaries come from the selected meter's exported series. Percent deviation uses
expected demand at that timestamp; queue/scatter legacy `peak_dev_pct` remains relative to typical
clean load and is labeled accordingly. Hourly kW residual sums estimate **net** excess kWh only
when every sample/baseline is valid and readings have no data-quality flags. Missing/suspect data
withholds this estimate. The selected chart marks the largest residual in the exported series;
full-precision builder peaks can differ in ties introduced by export rounding.

The evidence panel shows model, score, raw threshold, normalized ratio and grouping settings,
with separate overlapping intervals from other detectors. These scores are not calibrated
probabilities. Exported scores are rounded/capped at 99×; the score plot additionally clips at 6×.
Exact per-sample alert flags, raw score arrays, actual detection timestamps and operational delay
are unavailable. Prediction bands are nominal quantiles, not fault confidence. Operator ground-truth
assessment remains Not evaluated; synthetic matches are separate research evidence in an advanced disclosure and Detection Quality.

Teaching explanations draw on [Guato Burgos et al. (2024)](https://doi.org/10.3390/app14031194),
[Lai et al. (2021)](https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/hash/ec5decca5ed3d6b8079e2e7e7bacc9f2-Abstract-round1.html),
and [Si et al., TimeSeriesBench](https://arxiv.org/abs/2402.10802).
Temporal behavior and operational category remain separate. Trend/level shift is educational,
not a new inferred event class. No threshold controls or unlabeled precision/recall were added.

### Regression checks

```bash
node tests/regression.cjs
node tests/csv-upload.cjs
python3 -m http.server 8000 --bind 127.0.0.1
# In another shell, with Playwright installed and Chromium at /usr/bin/chromium:
node tests/browser.cjs
node tests/navigation.cjs
node tests/csv-upload-browser.cjs
```

Optional browser-test environment variables: `DASHBOARD_URL`, `CHROMIUM_PATH`, `SCREENSHOT_DIR`.
Browser tests do not add a runtime dependency to the dashboard. See DEVELOPMENT_LOG.md for
actual validation outcomes. The dashboard still requires an adapter for irregular timestamps,
other sample cadences, optional channels across all views, real meter mappings and producer alert
flags. Existing time helpers display campus wall time using UTC arithmetic, not a real UTC conversion.
Detection Quality displays this labeled synthetic benchmark, with an unavailable state when evaluation evidence or labels are missing; it does not compute unlabeled real-data performance.

## Export Reports

Open `#export` for anomaly, building or general snapshot PDFs. Choose scope, detector and inclusive date range; review the complete section preview before downloading. Anomaly date/building/meter filters select the event, then the PDF covers its complete detected interval. Building and campus summaries use main meters only. Selection is independent of the other dashboard sections; uploaded CSVs are not integrated.

Today / Last 3 / Last 7 / Last 30 days use the current America/Los_Angeles calendar date, inclusive of today. They never silently anchor to the fixture. Empty scopes disable download; **Use latest available data** explicitly anchors the same window to the final fixture day (seven days for Custom). Coverage is clipped to available fixture hours and disclosed. The fixture still uses its existing campus-wall-time-as-UTC convention, not real UTC measurements.

Reports include scoped quality counts, quality-OK signed hourly energy subtotals, complete overlapping events, detector identity/settings, dataset metadata, limitations and a measured/median-prediction vector chart. Suspect/absent hours are excluded from energy; no imputation is performed. Notes and synthetic ground truth are opt-in for anomaly reports. Review status is browser-local assessment, not confirmation. Missing context/labels remain unavailable. PDFs contain selectable text, repeated table headers and page numbers. Unsupported font characters produce an explicit generation error. See `vendor/README.md` for pinned offline dependencies/licenses.

Regression commands: `node tests/reports.cjs` and `node tests/reports-browser.cjs` (Playwright with installed Edge, `DASHBOARD_URL` defaults to port 8001; `REPORT_QA_DIR` optionally selects the PDF/screenshot output folder). Browser tests use an isolated browser context, never the user's stored reviews.

### Report selection help

Export Reports now includes **Need Help?**, collapsed by default, with plain-language instructions and a glossary. Main and solar-generation meters are explicitly labeled. Incompatible meter choices reset when buildings change; specific compatible meters remain selected under All buildings. Latest-data windows have an explicit historical anchor, and date settings are restored separately for each report type. The preview leads with a scope summary/legend; technical settings and provenance start collapsed without changing PDF contents. `node tests/reports-usability.cjs` checks these flows, mouse/keyboard help, focus, both themes and 390px fit using the same Playwright/Edge setup as report downloads.

### Custom report notes

All three report types have an optional **Custom report notes** field (up to 5,000 characters). Nonblank text appears in the live preview and PDF as user-supplied comments, separate from detector evidence and saved investigation notes. Drafts are separate for each report type, remain visible when changing scope and persist across local redraws during the session. Review them before download; Clear custom notes removes that draft, and reloading clears all drafts. Nothing is written to investigation records or browser storage. `node tests/report-notes-browser.cjs` exercises these behaviors and downloads all three PDFs.


## Local DERCONNECT exploration (November 5, 2026)

Use `notebooks/01_derconnect_data_exploration.ipynb` and `tools/inspect_derconnect.py`
for the November 6 checkpoint. This workflow does not change the synthetic pipeline,
browser CSV preview or detector outputs. No real archive was available in the cloud
workspace; real schema, cadence, quality and visual findings remain unverified.

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-derconnect.txt
# macOS, when the ZIP is on the current user's Desktop:
export DERCONNECT_DATA_PATH="$HOME/Desktop/Haojian_Data.zip"
mkdir -p local-results
python3 tools/inspect_derconnect.py --rows 2000 --max-bytes 8388608 > local-results/inspection.json
jupyter lab notebooks/01_derconnect_data_exploration.ipynb
```

The CLI also accepts a positional ZIP path and `--timestamp COLUMN`. Output is a
JSON inventory, schema variants, per-file prefix quality/time summaries and explicit
inspection errors. Units are instructor expectations, not verified source metadata.
Month checks are filename-token diagnostics; timestamp coverage requires confirmation.
The notebook displays tables/plots only when suitable records exist, and gives setup
instructions when data is absent. All code cells are saved without outputs.

CSV/TSV reads stop at the row or decompressed-byte budget and preserve complete parsed
records. Memory use depends on these budgets per file; the report also grows with file
and column count. Sampling every file may take time. It is not a full quality scan.
UTF-8 delimited tables and ISO timestamps are supported; other encodings, split dates,
epoch times, long-format registers and schema-specific units require explicit adapters.
For small Parquet members, optionally install `pyarrow>=15`; large members are reported
as unsupported within the budget rather than extracted. The utility uses no network
and never extracts the complete archive. Exceptions/failures are reported per member.

The approximately 3 GB raw archive is intentionally excluded from version control.
Keep extracted data in `data/raw/` or `local-data/`, intermediate/processed files in
`data/intermediate/` or `data/processed/`, and private reports in `local-results/`.
Other external data locations must also remain untracked. Do not commit measurements,
large derived tables or notebook outputs. Clear outputs in Jupyter before committing.
The ignore rules preserve existing tracked synthetic JavaScript fixtures.

Validation (synthetic fixtures only):

```bash
PYTHONDONTWRITEBYTECODE=1 MPLCONFIGDIR=/tmp/derconnect-mpl python3 -m unittest discover -s tests -p test_inspect_derconnect.py
node tests/regression.cjs
node tests/csv-upload.cjs
```

The notebook recommends a versioned long measurement table with stable meter ID,
raw/UTC timestamps, explicit measurement/value/unit, quality flags and local provenance;
a separate derived wide model view requires agreed cadence and aggregation. Real-data
integration, full archive scanning, cross-file duplicate checks, timezone confirmation,
long-format adapters and model execution remain future work.


## Preliminary real-data findings (November 5, 2026)

After the original Codex notebook preparation, the requesting team member executed it
locally on a Mac against the actual DERCONNECT ZIP and interpreted the results.
These human-reported findings update the earlier cloud-only validation status above:

- **Archive inventory:** 25 monthly CSV files across E2451, E3020, E3510, E7080 and
  E7085, with files corresponding to January–May 2026 for each meter; approximately
  3.5 GB compressed and 11.95 GB uncompressed. One consistent column schema was
  verified across all 25 files. File months do not establish complete timestamp coverage.
- **Bounded inspection:** 2,000 rows per file. In those samples, `_time` timestamps
  included UTC offsets, sampling was approximately 2 seconds, and no invalid or
  duplicate timestamps were observed. These observations do not establish cadence,
  timestamp validity or uniqueness throughout the dataset or across files.
- **Local visualization:** active-power time-series plots, distributions and phase
  comparisons were successfully generated from actual measurements.

Full-period completeness, daily/weekly behavior and anomaly ground truth remain
unverified. This preliminary exploration does not validate real-data anomaly detection
or integrate measurements into the dashboard. Measurements, plots and execution outputs
are not included in this documentation update. See DEVELOPMENT_LOG.md and AI_USE.md
for execution provenance and the distinction between human and AI contributions.

## Historical Monitoring (November 12, 2026)

This independent `#historical` view displays a single meter/active-power phase:
observed kW over actual timestamps, inclusive campus-date filtering, mean observed
power, maximum observed sample in usable bins, valid-slot coverage, rejected/missing
intervals, a daily demand profile and source hashes. It uses America/Los_Angeles,
including DST, and never joins synthetic forecasts, labels or events. Existing
synthetic views, CSV preview and PDF reports retain their own data and behavior.

**No raw archive or derived cache was available here. No actual measurements were
exported or validated.** The default view says no real export is configured.

With the existing NumPy/pandas EDA dependencies, run from the repository root:

```bash
export DERCONNECT_DATA_PATH="/path/to/authorized/local/Haojian_Data.zip"
python3 tools/export_derconnect_history.py \
  --meter E2451 --channel Active_Power_A \
  --start 2026-01-01T00:00:00-08:00 --end 2026-01-08T00:00:00-08:00 \
  --minutes 15 --minimum-coverage 0.8 \
  --output local-data/derconnect-history.json
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/#historical` and choose that JSON. Local file selection
clears on reload. To reload automatically over HTTP, set the existing
`<meta name="derconnect-history" content="">` element in your local `index.html`
to `content="local-data/derconnect-history.json"`. Keep exports Git-ignored and
private; do not deploy them to public hosting. A failed load never falls back to
synthetic data. Existing outputs are not overwritten; choose a new filename.

`--input` also accepts extracted raw meter directories or a single raw CSV.
`--month 2026-01` selects a full campus-local month instead of explicit bounds.
Tested resolutions: 5, 15 and 60 minutes; maximum selection: 32 elapsed days.
Coverage assumes two-second slots, never raw row counts. Any repeated observation
in a slot rejects its entire bin. Missing data stays null; zeros/negative readings
remain values. W is divided by 1,000 for kW; no phase or meter totals are inferred.
Legacy EDA aggregate caches lack the unique-slot evidence this contract requires.

Daily profiles weight supporting observations, need at least 23 elapsed hours and
18 eligible local-hour groups, and withhold hours below 80% supporting slot coverage.
Power means are not energy, coverage is not calibration, and quality issues are not
confirmed physical faults. See [the contract and provenance guide](docs/HISTORICAL_DATA.md)
for exact fields, policies, preprocessing reuse, limitations and expansion steps.

```bash
PYTHONDONTWRITEBYTECODE=1 MPLCONFIGDIR=/tmp/history-mpl python3 -m unittest discover -s tests -p 'test_*.py'
node tests/historical-monitoring.cjs
node tests/regression.cjs
node tests/csv-upload.cjs
node tests/reports.cjs
# With the HTTP server running and Playwright/Chromium installed:
node tests/historical-browser.cjs
```

For an explicitly synthetic demonstration, generate a labeled test export using
`PYTHONDONTWRITEBYTECODE=1 python3 tests/test_derconnect_export.py --fixture work/history-fixture`
and choose its `derconnect-history-fixture.json` in the view. This never stands in
for real-data validation. Exact validation outcomes are in DEVELOPMENT_LOG.md.

## Synchronized historical comparisons

Open **Compare historical exports** in Historical Monitoring. Choose 1–120 local JSON exports together (10 MB each, 60 MB combined). Each export passes the existing schema 1.0 validator. Compatible monthly exports form one series per meter/channel; identical overlaps count once and conflicting overlaps are withheld. Incompatible units/resolutions/cadences, transformation provenance or actual/test origins reject the batch. Comparison-panel scope is separate from the single-product selection. Successful loads add to the shared historical catalog used by Overview, Buildings and Historical Monitoring; files are never uploaded or persisted.

Choose **Phases within one meter** for A/B/C (unloaded phases remain explicitly unavailable), or **Selected meters — same phase** for up to three loaded meters. The default common window is the intersection of available selected products' half-open UTC ranges. Campus-date filters use the existing America/Los_Angeles helper, including DST. No overlap gives an empty state. Charts share UTC bin positions and a kW scale; hover any chart or use the timestamp slider's arrow/Home/End keys for synchronized exact-bin readouts. Missing/rejected bins stay gaps; readouts distinguish observed means from raw-sample min/max. No nearest-bin substitution, interpolation, phase totals, meter totals or topology inference.

Per-product disclosures retain coverage, quality threshold and provenance. Slot coverage and usable-bin counts have different denominators. **Need Help?** starts collapsed and explains comparisons and limitations. Schema acceptance does not establish instrument calibration or independent raw-data reconciliation. No actual multi-product exports are bundled. Existing single export, synthetic sections, CSV Upload and PDF reporting remain separate.

Tests: `node tests/history-comparison.cjs` and, with Playwright/Edge or `CHROMIUM_PATH` configured and the local server running, `node tests/history-comparison-browser.cjs`. Browser outputs default to the OS temporary directory; never commit screenshots/private exports.

## Overview data source and shared historical session

Overview offers **Synthetic Demo** (the unchanged synthetic workflow) and **Historical DERCONNECT** (one loaded device/phase product). Historical mode shows an explicit no-data state when nothing is loaded; it never substitutes simulation data. A historical test fixture stays labeled as synthetic. This is historical phase power, not live data or whole-building/campus totals. The source switch and private measurements reset on reload; configured HTTP loading, when explicitly set locally, retains its existing behavior.

A successful single-file, configured-file or comparison-batch load **adds to the shared historical catalog**, retaining the current product and dates (the first load selects its first product). Use **Clear loaded exports** to start over. Monthly stitching and overlap checks apply across separate loading actions. Invalid loads retain the previous valid shared catalog with a visible notice (comparison panels retain their independent scope). The single-product dropdown selects among the current catalog; changing it retains the global dates, including unavailable periods. Overview and Historical Monitoring share product and inclusive campus-date scope. Comparison-panel selection/date scope remains independent; the Overview comparison action explicitly seeds it from the shared selection. No measurement objects are copied to the synthetic store, localStorage or a remote service.

Historical Overview shows coverage with four decimal places and exact supporting counts, usable/unavailable bins, observed mean/sample maximum, actual scope, last usable observed-bin timestamp and a gap-preserving chart reused from Historical Monitoring. Quality reasons are separate from demand behavior. Anomaly detection/forecasts remain explicitly unavailable. Need Help? is collapsed by default. Detail navigation retains historical scope and synthetic filters remain unchanged.

Tests: `node tests/historical-session.cjs` and `node tests/historical-overview-browser.cjs` (same local Playwright/Edge/server setup as comparison checks). New tests use explicitly synthetic historical products, not real-data reconciliation. Public deployment of private exports is not authorized by these features.

## Multiple meters across months

Generate each meter/phase/month independently with the existing 32-day safeguard:

```bash
python3 tools/export_derconnect_history.py --input /path/to/authorized/raw \
  --meter E2451 --channel Active_Power_A --month 2026-01 \
  --output local-data/derconnect-history-E2451-A-2026-01.json
# Repeat with --month 2026-02, another --meter, or phase B/C; or use the batch command below.
python3 -m http.server 8000 --bind 127.0.0.1
```

At `http://127.0.0.1:8000/#historical`, select all desired files together in
**Historical exports**. Switch device/phase with **Loaded device / phase**;
facility classifications are shown without inferred building names. Select **Month**
or inclusive **From/Through campus date**. The catalog range covers all loaded
series; unloaded months remain hatched gaps. New loads add to the session catalog;
invalid loads retain it. Reload clears local files. No upload or persistence occurs.

Open **Compare historical exports** to compare loaded A/B/C phases or up to three
meters on the same phase. Shared scales/cursors use exact UTC bins; comparison dates
remain independent of the main range. **Weekly patterns and monthly trends** and
**Data quality and source details** are expandable. Power is kW; no energy or totals
are calculated. Partial-month statistics describe only selected dates, and period
means need 80% usable supporting slots. See docs/HISTORICAL_DATA.md for policies,
limits and stable identifiers for future model outputs.

Additional checks (local server running for browser tests):

```bash
node tests/history-catalog.cjs
node tests/history-catalog-browser.cjs
CHROMIUM_PATH=/usr/bin/chromium DASHBOARD_URL=http://127.0.0.1:8000 node tests/history-comparison-browser.cjs
CHROMIUM_PATH=/usr/bin/chromium DASHBOARD_URL=http://127.0.0.1:8000 node tests/historical-overview-browser.cjs
```

This work reuses the unmerged PR #15 implementation at
`d4ae5d56d27b6a86a54e30aef7696d1b2004e437` in a separate local feature branch.
Coordinate review with that PR; its contributor branch has not been changed or merged.

### Validation status and pending review

The contributor reports successful Mac testing with six **real** E2451/E3020
January–March 2026 exports and independent raw-archive reconciliation PASS for
all 2,976 E2451 January intervals. Automated tests use explicitly synthetic
fixtures; the other five exports are not claimed independently reconciled.
No private measurements, exports or validation reports are bundled. Comparison
UX polish is a nonblocking follow-up. See
[validation and merge coordination](docs/HISTORICAL_DATA.md#current-validation-and-merge-coordination)
for the precise evidence and the unresolved overlap with open PR #15. Coordinate
that PR before merging this expansion; its contributor branch is unchanged.


## Batch exports and real measurements in Buildings

Use the existing Python environment with pandas and NumPy. Set `DERCONNECT_DATA_PATH`
to an authorized raw ZIP/CSV/directory, or supply `--input`:

```bash
python3 tools/export_derconnect_batch.py \
  --meters E2451 E3020 E3510 E7080 E7085 \
  --channel Active_Power_A \
  --start 2026-01-01T00:00:00-08:00 \
  --end 2026-01-08T00:00:00-08:00 \
  --minutes 15 --minimum-coverage 0.8 --output-dir local-data/
```

The range is half-open: January 1–7 in campus time. Each meter gets a separate
validated export, for example
`E2451-Active_Power_A-20260101T080000Z--20260108T080000Z-15min.json`.
Names include exact UTC bounds, phase and interval to avoid ambiguity across years,
channels and DST. Existing files are refused. Success/failure is reported per meter;
exit status is 2 if any fail, while successful exports remain available. Missing
meters/channels or ranges without observations do not produce a successful export.
Observed but rejected/low-coverage bins remain explicit nulls. `--month YYYY-MM`
may replace the bounds; `--chunksize` controls streaming memory.

Open **Buildings & Sub-grids**, choose **Real DERCONNECT**, and add multiple JSON
exports. Later additions retain earlier meters, selection and dates. Historical
Monitoring's existing loader and comparison loader use this same catalog. Identical
overlap bins count once; conflicting aggregates are withheld, with source evidence
retained. Clear the catalog to remove conflicts or change transformation versions.
The shared source choice affects Overview, Buildings and Anomaly Investigation.
Detection Quality remains explicitly scoped to the synthetic demonstration. Choose **Prototype Data**
to return to the existing Buildings workflow. Manual imports clear on reload; real
meter/event routes restore real mode and reload the configured model bundle.

Both modes use the original searchable building-card grid and click-through profile
layout. Existing cards, charts, spacing, typography and responsive columns are
unchanged below the new control panel.
Real mode creates one meter card per imported ID; phases/months share that card and
are never summed. Open a card to view power, daily profiles, phase buttons and quality.
The **Prototype Data / Real DERCONNECT** toggle appears below the page title.
In Real DERCONNECT, **Advanced data management** below the directory or profile
holds the multi-file JSON loader, loaded-export status, and phase dates. Later
additions retain an explicitly selected phase date scope. **Full phase range**
restores all loaded phase dates. **Clear loaded exports** starts a new phase catalog.
Prototype dates reuse the existing filter handler and its range limits. The legacy filter
bar is hidden on Buildings to avoid duplicate controls. The directory shows an empty
state when neither phase exports nor the Chronos-2 bundle are available.
Phase-level forecasts and energy remain unavailable. See the hourly Chronos-2 analysis below.
Original advanced analysis groups remain available; supported profiles, sample peaks
and same-phase comparisons use measured data. The synchronized comparison action opens
Historical Monitoring with the current dates. The phase measurement exports supply facility **types**,
not verified names or topology, so meter IDs identify selections. Unknown meter IDs
are accepted with `facility_type: null`; no building relationship is guessed.

Limits: schema 1.0 still supports only individual `Active_Power_A/B/C` channels in
W → kW, 5/15/60-minute bins, an assumed two-second cadence, and up to 32 elapsed days
per export. Other electrical quantities need a separately reviewed schema/UI extension.
Safe IDs are 1–64 letters/digits/dots/underscores/hyphens, beginning with a letter/digit.
Older dashboards reject undocumented meters. Catalog exports must share transformation
hashes, library versions, quality policy and actual/test origin. Do not edit provenance
to bypass that check. Sequential export scans all matching CSVs through EOF; a short
range can still take time on a large archive. Browser limits: 120 source files per
catalog, 10 MB each/60 MB per file selection, three elapsed years/500,000 derived bins.
Only selected series/date charts are drawn, with gap/extrema-preserving reduction;
raw two-second data is never loaded into the browser. Keep exports in ignored
`local-data/`; never commit or publicly serve private measurements.

Checks: `python3 -B -m unittest discover -s tests -p 'test_derconnect_batch.py'`,
`node tests/historical-session.cjs`, and (with Playwright, browser and local server)
`node tests/real-buildings-browser.cjs`. See DEVELOPMENT_LOG.md for actual outcomes
and the distinction between synthetic tests and local real-export checks.

### Chronos-2 hourly candidate anomalies in real meter profiles

Serve the dashboard over local HTTP and open **Buildings & Sub-grids → Real DERCONNECT**.
The five Chronos-2 meter cards show candidate counts across their full detection
period. Open **E2451** or another model meter. All five profiles are available
before you add phase JSONs. Upload matching phase exports under **Advanced data
management** to see phase charts, daily profiles and measurement quality. Model
chart dates are independent of the shared phase dates.

**Observed vs. expected total active power** compares the export’s observed total
(A+B+C) with its median forecast in source-reported kW. The **7 days** and **30 days**
presets start on the first campus date in the detection period (March 1 for this
export). Choose **Full range** or **Custom dates** for other windows. The optional
nominal 80% band uses q10–q90. Dates and hover timestamps use America/Los_Angeles.
The window summary’s mean and peak use readings explicitly marked as measured.

The sortable **Candidate events** table opens to **All detection dates**. Choose
**Selected dates** to limit the table to the current analysis window. Inspect a row
or click a highlighted chart interval to open that exact event in Anomaly Investigation.
The **View meter chart** link returns to the meter profile with the event highlighted.
Profile **Previous** and **Next** follow the meter table order and open Investigation;
Investigation **Previous** and **Next** follow the shared event log, newest first.
**Return to chart range** in the profile restores its original chart window while
keeping the event details open. Calibration assumptions, UTC exclusions and
interpolation counts are under **Model provenance and data quality**. Candidate
events require facilities verification.

The `derconnect-chronos2` metadata in `index.html` explicitly configures the authorized
same-origin CSV bundle under `data/anomaly/chronos2-ft-5k/`. The bundle loads once per page
session when Real DERCONNECT opens. If the URL is unavailable or the metadata is omitted,
choose the three CSVs together in **Advanced data management**. Keep other private exports in local
storage and off publicly served paths.

Run `node --test tests/chronos2.cjs` and, with the local server running and Playwright
installed, `node tests/chronos-buildings-browser.cjs`. Set
`CHRONOS_EXPORT_DIR=data/anomaly/chronos2-ft-5k` for the Node aggregate checks and
`CHRONOS_REAL=1` for the browser walkthrough with the configured export.
Run `node tests/chronos-csv-cache-browser.cjs` to verify an upgrade with the previous
CSV parser in Chromium’s HTTP cache. This test starts its own local server and uses
the committed exports.


### Shared real Overview and Anomaly Investigation

Choose **Real DERCONNECT** in Overview, Buildings or Investigation. All three use
one session-only Chronos bundle and the same exported grouped events. Overview
shows four linked metric cards: **Candidate Events** in the shared scope,
**Meters with Candidates** out of selected meters, **Largest Deviation from Expected**
and **Longest Candidate Event**. The deviation is signed observed-minus-q50 kW, ranked
by absolute magnitude, using only aligned, finite, explicitly non-interpolated flagged
detection readings. Calibration flags are excluded. A flag without a group links to
its meter and UTC-hour evidence (`#buildings/derconnect%3A<meter>?at=<UTC timestamp>`),
with a marked reading and surrounding context; the link supports reload. Longest
uses the full matching exported duration and explains when it extends beyond selected
campus dates. Eligible zero counts are shown as zero; unavailable calculations are
labelled explicitly. Analyzed meter-hours, exclusions and calibration counts are in
**Analyzed coverage & data quality**. Counts describe historical outputs, not live alarms.
Labeled actual/expected power comparisons still show all loaded model meters by default,
with separate vertical scales and no summed campus power.
Additional phase measurements remain available below the model overview; phase
JSON dates and model chart presets are separately labelled.

Overview and the Investigation list reuse the original filter bar: **All meters** or
one loaded model meter, **All loaded dates**, historical **Last 7/14/30 days** presets,
**Custom** inclusive campus dates, and **Reset**. Presets end at the loaded bundle's
last campus date, rather than today's date. Unsupported synthetic filters are hidden;
switching back restores the synthetic controls and scope. Metrics, comparisons and
events use the same shared selection. Metric cards reuse the original icons/styling.
A meter profile uses its own meter and retains the shared candidate dates without
changing the Overview/list meter filter.
Its **All detection dates** table still respects those shared dates; **Selected dates**
additionally intersects them with the local chart window. Directory card counts
continue to describe the full detection period. The **All candidate dates** action
clears shared date bounds. Dates are inclusive campus dates in America/Los_Angeles;
model joins and interval highlights use UTC instants and half-open event bounds.

Every real Inspect action uses `#investigate/real%3A<exported-event-id>`, independently
of list filters. Event IDs are native links; rows also open with click or Enter/Space,
and Inspect remains available. Links/buttons inside a row navigate once. Dedicated
Event Investigation pages reuse the original detail heading, cards and evidence
layout. They hide list controls and explain when event context falls outside retained
list filters. Back to candidate events restores those filters. Refresh and Back/Forward
resolve that exact ID after loading the configured CSV bundle. Unknown IDs and absent/failed loads show explicit unavailable
states. Local file bundles must be selected again after reload. Unresolved IDs are
never replaced by a different candidate. Selection and filters remain separate from
the synthetic demonstration and synthetic review storage.

The four main Event Investigation facts are **Meter**, **Event period**, **Duration**,
and **Deviation at Score Peak**, with supporting actual/q50 values and above/below
wording. The score peak need not be the largest power deviation. The source event's
`peak_time` wall-time key must match exactly one prediction inside the event's UTC
bounds; missing/ambiguous keys or interpolated/missing pairs withhold the physical
fact instead of choosing a different hour. No host-timezone interpretation is used.

Expandable **Detection details** separates the corresponding prediction `score` (raw),
its exported `threshold`, the event `peak_score` (normalized), and model/scoring context.
The paired committed files confirm 106/106 peak-row and actual/q50 joins. All 81 peaks
with nonzero exported thresholds are consistent with normalized ratios within the
four-decimal CSV rounding bounds. The other 25 event thresholds export as zero, so
an exact normalization/floor cannot be verified from these rounded files; the upstream
exporter implementation is not bundled. Near-zero thresholds can inflate normalized
scores into millions. Scores are not kW, severity or probabilities. The UI does not
clip normalized scores or reconstruct raw scores from rounded thresholds. Raw and
normalized labels in tables/profile evidence now reflect this distinction.

The existing highlighted power chart, up to 24 hours of available context per side,
nominal q10–q90 band, missing-data gaps, source quality, and disclosed hourly table
remain available. Large normalized values and tiny raw values remain visible with
appropriate formatting; hover facts retain numeric values. Model outputs, thresholds,
flags, grouping rules and committed datasets are unchanged.
Classification, severity, operational priority, calibrated fault confidence, verified
building topology and real detection accuracy remain unavailable. Candidate events
need facilities verification; scores are not fault probabilities.

Checks (serve on loopback first, with Playwright and a Chrome/Chromium executable):

```bash
CHRONOS_EXPORT_DIR=data/anomaly/chronos2-ft-5k node --test tests/real-events.cjs tests/real-metrics.cjs
node tests/real-metrics-browser.cjs
node tests/real-events-browser.cjs
CHRONOS_REAL=1 node tests/real-events-browser.cjs
```

Use `NODE_PATH` for an existing Playwright installation when needed, and
`CHROMIUM_PATH` for the installed browser. Optional `SCREENSHOT_DIR` stores browser
QA captures outside the repository. These checks cover grouped counts and shared
filters, both Inspect paths, exact event evidence/highlights, meter switching,
refresh/history, unavailable data, source isolation, synthetic review, and themes
at desktop/mobile sizes.

The real Anomaly Investigation list reuses the Buildings & Sub-grids event-table
renderer and scroll/sticky-action styling. Both real tables use Start, Duration,
Usage difference (kW) and Action. Usage difference uses the exported peak actual minus
expected power, displayed as an absolute magnitude with above/below wording; it is
not necessarily the largest difference during the event. Missing/nonfinite pairs
are unavailable. The Buildings largest-difference sort uses absolute kW difference,
with unavailable values last. Start links, row click/Enter/Space and Inspect resolve
the same event ID. Technical detector scores remain in Detection details.
Meter/date scope and event-detail context remain separate.
Overview's Recent candidate event activity uses the same exported usage difference
and help text, with direction included in the value instead of a separate column.

Real event details include a **Building Manager / Operator Review** with status,
assessment, notes, follow-up action and optional reviewer name. Save writes only to
this browser's localStorage for this site. It does not change detections, ground truth,
training, evaluation or synthetic reviews. Keys include dataset, model, meter, event
and a SHA-256 fingerprint of the exact three loaded CSV texts. Identical files restore
reviews after reload; any content/formatting change creates a different run scope.
The fingerprint is a content identity, not a verified upstream run identifier.
If Web Crypto or localStorage is unavailable, saving is explicitly unavailable or
reports failure. Successful writes are checked; conflicting saved changes in another
tab are not overwritten. Unsaved drafts remain isolated by event/run in this tab
during dashboard navigation. Save before reload/close; a native browser unload
warning is requested while drafts remain unsaved, subject to browser behavior.

Additional focused checks (same browser environment as above):

```bash
node --test tests/real-review.cjs
node tests/real-review-browser.cjs
CHRONOS_REAL=1 node tests/real-review-browser.cjs
node tests/real-event-list-browser.cjs
CHRONOS_REAL=1 node tests/real-event-list-browser.cjs
```
