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
| **Historical Monitoring** | Loads a separate, validated DERConnect phase-power export with campus-local dates, observed-power summaries, visible gaps, daily profiles and coverage/provenance. No actual export is bundled or configured by default. |

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
