# Instructions for AI coding agents

## Research purpose and scope

This UC San Diego DSC 180A capstone with Azimuth AI develops a unified, anomaly-focused DERCONNECT electricity dashboard for building managers and electrical engineers. Support Detect → Classify → Visualize → Investigate → Interpret. Integrate evidence from the SarSim synthetic-data group, the Chronos-2 anomaly group, and eventually real DERCONNECT measurements. The Quarter 1 checkpoint is Friday, November 6, 2026. Synthetic performance is not evidence of real-world fault detection.

Preserve the existing plain HTML/CSS/JavaScript and custom SVG architecture. Do not migrate to Streamlit, React, another framework, or a backend without a justified, explicitly scoped task. Audit the actual code rather than treating README claims as verified requirements. Do not assume access to unpublished code, datasets, trained weights, external generated runs, or the requirements document referenced by README.

## Architecture and execution

- `index.html` defines the shell, filters, section containers, and ordered classic scripts. There is no package manifest, bundler, application server, or existing test runner.
- `css/styles.css` owns theme tokens, responsive layout, components, and chart styling. Preserve type symbols/colours, severity labels/icons, and readable light/dark themes.
- `data/derconnect-data.js` assigns `window.DERCONNECT_DATA`; `data/synthetic-labels.js` assigns `window.DERCONNECT_LABELS`. Both are generated artifacts, not manually maintained application logic.
- `js/util.js` initializes `window.DC`, taxonomy, time/format/DOM helpers and local status storage; `js/charts.js` supplies SVG primitives; `js/store.js` owns indexes, shared state and derived selectors; `js/ui.js` supplies shared view components. Preserve script dependency order.
- `js/sections/{overview,investigate,buildings,models}.js` render the four sections. `js/app.js` wires filters, routing, theme and startup. Read shared data through the store; avoid independent copies of events, filters, time arithmetic or severity policy.
- Run from the repository root: `python3 -m http.server 8000 --bind 127.0.0.1`. Browser code needs only the committed static assets. Live processes must be restarted in a new environment. Use the existing isolated checkout; do not create a Git worktree unless the user requests one.

## Current data contract and boundaries

The current fixture is synthetic: 8 real UCSD demonstration building names with synthetic profiles and relationships, 11 meters, 2,016 hourly samples from August 10, 2026, four baseline detectors, 26 labels and 161 detected events. Chronos-2 is an optional builder model, not a detector in this fixture. Counts are audit observations, not validation constants for future datasets.

- `meta`: start, n, detector_start, calibration_start, clean_prefix, sampling_interval, levels, generator version, seeds and build time. Current indices are zero-based; event and label intervals are half-open `[start, end)`.
- `tools/building_metadata.json` owns replaceable demonstration names and official name sources; names do not establish DERCONNECT coverage or real meter relationships.
- Buildings reference synthetic subgrids and have occupancy arrays. Meters reference buildings and carry kind (`main`/`pv`), unit (`kW`), `actual[n]`, `dq[n]` (0 OK, 1 missing/zero, 2 stuck). Weather has aligned temperature °C, cloud fraction and irradiance W/m² arrays.
- Each detector has settings, a raw threshold, and series keyed by meter ID. q01/q10/q50/q90/q99 and normalized `score` arrays begin at `meta.detector_start`, not at index zero of actual readings. q10–q90 and q01–q99 are nominal 80% and 98% intervals. Scores are rounded and capped at 99 in exports; they cannot reconstruct exact alert decisions.
- Events reference detector, meter, building and subgrid; contain interval, peak_t (legacy score peak), score_peak_t, deviation_peak_t, duration_h, novelty (normalized peak score), operational priority (0–100), severity, behaviour, category, primary type, impact, explanations, detection settings and initial status. Novelty, operational priority, injected severity and review status are different concepts.
- Ground-truth labels and one-to-one overlap matches are evaluation evidence. Development labels are used to select settings; test labels must not feed test detection, calibration, classification or priority. Never present missing labels as proof of a false positive. Explanations are hypotheses; a local dropdown is not evidence of engineer confirmation.
- Current time helpers treat campus wall time as UTC solely to avoid DST shifts. Hourly kW sums stand in for kWh. ID suffixes, Monday-start weekly arithmetic and clean history are hardcoded assumptions. Do not extend these silently to real data.

`tools/build_data.py` simulates campuses, injects anomalies and imports scoring/calibration/events/metrics/forecasters from `DSC-Capstone-Azimuth-AI/chronos2-sarsim0-anomaly-team/src/sarsim_fm`. It does not ingest that repository's completed Parquet/JSON runs. Current imports need NumPy **and pandas**; the README's NumPy-only claim is incomplete. Torch/Chronos and checkpoint access are needed only for optional Chronos inference. Do not broadly install or run model training for a dashboard change.

Regenerate only when authorized, against a recorded upstream commit and dependency versions, with fixed seeds. Use a temporary output directory for verification:

```bash
python3 tools/build_data.py --repo /path/to/chronos2-sarsim0-anomaly-team --out /tmp/derconnect-validation-data
```

Do not overwrite committed data during an audit. Compare semantic JSON, ignoring build timestamps and object-key order. The upstream checkout is not included in this repository or guaranteed present in future tasks.

Before implementing an adapter, agree on schema version, UTC timestamps and campus display timezone, sample cadence and resampling, missing/duplicate/out-of-order observations, stable meter/building mapping, units and sign conventions, forecast origins/horizons/quantiles, raw scores and horizon-specific thresholds/alert flags, half-open event bounds, label availability and provenance, classification/severity ownership, run/model/checkpoint/source hashes and compatibility rules. Preserve a stable internal chart interface; validate and translate external data at the boundary. Optional weather, occupancy, PV, evaluation and forecasts must have explicit unavailable states, not fabricated values. See DEVELOPMENT_LOG.md for the initial audit and proposed contract details.

## Five-contributor collaboration

Use small feature branches and reviewable PRs; never commit or push directly to main. Agree on file ownership before concurrent work. Prefer one owner each for ingestion/builder, shared state/routing, investigation, building views, and evaluation/validation; coordinate changes to `index.html`, shared charts, CSS tokens and generated assets. These are suggested work boundaries, not assigned people.

Inspect `git status`, the active branch and applicable instructions before edits. Preserve existing changes, untracked files and other contributors' commits. Do not reset, clean, force-push, rewrite history, replace whole files blindly, or regenerate artifacts over local edits. Re-read shared documentation before appending; retain existing entries and resolve concurrent changes carefully. Keep source fixes separate from documentation-only tasks. Never invent contributor names, approvals, results, prompts or commit hashes.

## Quality, reproducibility and validation

Use small functions and existing DC helpers; favour textContent over HTML insertion for external content. Validate IDs, ranges, lengths, finite/null values, quantile ordering and references at ingestion. Report data quality separately from consumption anomalies. Keep evaluation splits and provenance explicit; never tune on held-out test labels or turn forecast benchmarking into a claim of anomaly-detection accuracy. Document any diagnostic use of future observations; centered decomposition is retrospective, not causal inference.

For each relevant change:

1. Run `git diff --check` and inspect the complete diff/status. Parse Python without leaving tracked caches and run `node --check` on changed JavaScript (all JS for shared changes).
2. For data changes, validate schemas, referential integrity, series offsets, quantile ordering, bounds and matching metrics. Rebuild into `/tmp` where prerequisites exist and compare semantic output. Preserve underlying command exit status.
3. For UI/state changes, serve the repository and check the affected flow in a real browser, including console/page errors, empty scope, all relevant detectors, filters, event selection, deep links, reload, status/theme persistence, and narrow viewport. For shared changes exercise all four sections. Check actual chart output and interactions; a running process or syntax check alone is insufficient.
4. For integrations, use supplied fixtures covering missing context/labels, irregular times, nulls, ID mappings and thresholds/horizons. Add meaningful automated regression tests when implementing fixes. There is currently no committed automated suite; do not claim otherwise.
5. Record exact commands, outcomes, versions, skipped/unrun checks and blockers. Do not disable assertions, integrity checks or TLS verification to obtain a pass. Stop after relevant checks; GPU/model experiments are optional unless required by the task.

## Required records

Append a dated entry to `DEVELOPMENT_LOG.md` for each substantive task: human/AI contributors, base revision/branch, changed files, rationale, checks, results, limitations and next steps. Use America/Los_Angeles for user-facing dates.

For every AI-assisted task, append to `AI_USE.md`: the complete verbatim user prompt(s), AI contributions, human contributions/review, validation, limitations, changed files, and associated commit(s) when they actually exist. Preserve earlier entries; do not reconstruct historical prompts. If no commit has been made, say so. Never record credentials, personal data or private measurements; flag a prompt containing such material for secure handling rather than copying secrets. Documentation is part of the task, not a substitute for human review.
