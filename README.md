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

| Section | Contents (doc section 6) |
|---|---|
| **1 · Overview & system health** | KPIs (active anomalies, high-priority events, affected buildings, meter data completeness, estimated excess energy) · actual vs. expected chart with anomaly overlays and forecast band · meter × day severity heatmap · anomaly type distribution · prioritized queue |
| **2 · Anomaly investigation** | Sortable event log **and** a SarSim0 Fig. 8–style event gallery (both open the same record) · event record with before/during/after chart, anomaly score vs. threshold, meter status timeline, temperature and occupancy (or irradiance for PV) · detected / possible explanation / confirmed fault levels · editable investigation status · explanations · detection details · historical comparison (previous 3 weeks) · magnitude vs. duration scatter |
| **3 · Building & sub-grid analysis** | Building comparison (consumption, anomaly frequency, excess energy) · building × week frequency/severity heatmap · sub-grid health table · deviation-from-expected heatmap (day × hour) · typical daily profile · peak demand vs. normal operating peak · load decomposition (trend / weekly pattern / residual) · solar generation vs. weather-informed expectation · power-quality placeholder (needs voltage/frequency data) |
| **4 · Detection model evaluation** | Detector comparison (precision, recall, F1, delay, false alerts, AUPRC, interval coverage) · detection by injected event type · false alarms on normal changes (heat wave, open house, no-anomaly campus) · predicted intervals vs. synthetic ground truth · missed events · false-positive analysis · score/threshold transparency · forecasting backbone results from `docs/results.md` · synthetic scenario gallery · scenario record (generator, seeds, interval) |

**Shared filters** (time range, sub-grid, building, meter, anomaly type, severity, status,
detector) apply to every view. Clicking a type bar, severity bar, heatmap cell, building bar
or feeder row filters or opens events too. The URL hash (`#investigate/CR-030`) links to an
event record.

### Visual encoding

- **Anomaly type**: fixed colour *and* symbol. Point ●, Collective ■, Contextual ◆,
  Seasonal/pattern ▲, Peak demand ★, Data integrity ✕.
- **Severity**: reserved status colours, always shown with an icon and a label.
- **Measured / expected**: neutral ink so anomalies stand out. Measured is a solid line,
  expected (median forecast) is dashed, with 80% and 98% forecast bands.
- Isolated events use **point markers**; sustained events use **shaded intervals**.
- Light and dark themes (follows the OS setting; the toggle remembers your choice).

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

Regenerate (needs only `numpy`; torch is not required for the included detectors):

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

Replace `simulate_campus()` in `tools/build_data.py` with a loader that returns hourly arrays
for weather, building occupancy and meters, then remove the injection step. Building Data
Genome 2 can stand in until DERCONNECT access is confirmed. The JSON schema the page reads:

```text
meta        start, n, clean_prefix, calibration_start, detector_start, generator_version, seeds
subgrids[]  id, name
buildings[] id, name, subgrid, profile, pv_kw, occupancy[n]
meters[]    id, building, kind ("main"|"pv"), unit, actual[n], dq[n] (0 ok, 1 missing, 2 stuck)
weather     temp[n], cloud[n], ghi[n]
detectors[] id, label, source, settings, threshold, series{meterId: {q01,q10,q50,q90,q99,score}}  (from detector_start)
events[]    id, detector, meter, building, subgrid, start, end, peak_t, type, behavior, category,
            severity, priority, novelty, peak_actual, peak_expected, peak_dev, excess_kwh,
            explanations[], context{}, detection{}, status
evaluation  per-detector metrics (only when labels exist)
```

## Repository layout

```
index.html                 page shell, filters, section containers
css/styles.css             design tokens (light/dark), layout, components
js/util.js                 time, formatting, taxonomy, colours, DOM helpers
js/charts.js               SVG charts: time series, bars, heatmap, scatter, timeline, tooltip
js/store.js                state, indexes, filtered events, persistence of status
js/ui.js                   cards, legends, event overlays/tooltips
js/sections/*.js           one file per dashboard section
js/app.js                  boot, filters, routing, theme
data/*.js                  generated data (detections and labels are separate)
tools/build_data.py        data builder that wraps the anomaly team's detector code
```

## Notes and limits

- All data is **simulated**. There are 8 fictional buildings and 3 PV arrays; the weather
  includes a heat wave and the calendar includes an open house as negative controls.
- Investigation status is saved in your browser only (localStorage). A shared status would
  need a small backend.
- Power-quality views are left out until voltage and frequency measurements exist (doc §4).
- The SarSim0 gallery adapts the *small-multiple layout* of Oreshkin et al. (2026), App. G,
  Fig. 8. Those figures examine simulator coverage, not electrical faults.
