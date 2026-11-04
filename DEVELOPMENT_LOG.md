# Shared development log

Chronological, append-only record for the five-contributor UC San Diego DSC 180A / Azimuth AI DERCONNECT dashboard team. Dates use America/Los_Angeles unless stated otherwise. Keep earlier entries intact; add corrections as dated follow-ups. Record evidence rather than retrospective claims.

## Reusable contributor entry template

```text
Date/time and timezone:
Task / issue / PR:
Human contributor(s):
AI tool(s) and AI_USE.md entry (if applicable):
Branch and base commit:
Associated commit(s): [pending until actually committed]
Objective and scope:
Files changed:
Implementation / decisions / reasons:
Data or upstream source versions, seeds and dependencies:
Validation commands and results (passed / failed / skipped / unrun):
Limitations, assumptions and integration impact:
Human review / acceptance: [pending until actually performed]
Next steps / proposed owner / dependencies:
```

## 2026-11-03 — Repository onboarding and integration audit

- Human contributor: requesting team member (name not supplied); five-person team membership was not inferred.
- AI contributor: OpenAI Codex. Complete task prompt and contribution record: AI_USE.md, entry `2026-11-03 — Repository onboarding`.
- Dashboard base: `e4bc545f7dfb0f9b7338fd07096f145d989a80d7` (fetched origin/main; initial working tree was clean). Branch: `docs/repository-onboarding`.
- Upstream inspected read-only in `/tmp/derconnect-anomaly-audit`: anomaly repository commit `b83acda9caa3c896ca198f65c94e9625c03568b7`.
- Changed files: AGENTS.md (new), DEVELOPMENT_LOG.md (new), AI_USE.md (appended to previously blank file). No application, CSS, dataset, dependency, test or README edits. No commit or push made. Human review remains pending.

### Architecture and data flow

`index.html` loads two generated data assignments, then util → charts → store → shared UI → four section renderers → app. Classic scripts share `window.DC`; no framework, network API, build step, package manifest, CI workflow or committed test suite is present. CSS owns theme tokens, layout and presentation. The complete tracked tree was inspected, including every section and the Python builder.

The builder simulates three 12-week hourly campuses with distinct seeds: dev for settings selection, test for display/evaluation, and normal for false alarms. The first 6 weeks are anomaly-free; forecasts start at index 252, residual-scale fitting precedes calibration at 504, and evaluation begins at 1008 of 2016 samples. Context regression refits daily on up to 21 prior days using contemporaneous weather/occupancy; other baselines use rolling one-step forecasts. The builder imports upstream injection, forecasts, scores, conformal thresholds, event grouping and metrics. It selects among 162 settings per detector on development labels, then fits test-campus thresholds on clean test history and evaluates the suffix. “Locked” applies to selected settings, not one frozen numerical threshold across all campuses.

The output is `window.DERCONNECT_DATA` (meters, context, forecasts, detected/enriched events and aggregate evaluation) plus separate `window.DERCONNECT_LABELS` (injected labels and detector-to-label matches). The page does not run models. Classifications, hypotheses, priority, severity and initial status are dashboard-side heuristics. Reviewer status and theme persist only in this browser's localStorage; there is no shared investigation backend or audit trail.

### Implemented features versus README claims

| Area | Implemented evidence | Limits / incomplete work |
|---|---|---|
| Overview | KPI cards, actual/expected SVG series and single-meter bands, meter/day heatmap, type/severity bars, clickable queue | Multi-meter charts sum mains and omit PV/bands; filters on event attributes do not restrict measured series. Overlapping events contribute whole-event impact even for a clipped date range. |
| Investigation | Sortable log, kW/normalized gallery, shared event details, scores, status timeline, weather/occupancy/PV context, hypotheses, status editing, history, scatter | Selected details can remain outside active filters; log/gallery selection does not update event URL; status is local and unauthenticated. |
| Buildings | Consumption/frequency/impact bars, building/week heatmap, feeder totals, focus selector, deviations, daily profiles, peak plots, retrospective decomposition, PV comparison | Main-meter naming/cadence assumptions; PV can fall back outside scope and always uses context regression expectations. Power quality is an explicit placeholder, not an implemented measurement view. |
| Models | Comparison tables/charts, per-kind recall, normal-control counts, prediction/label timeline, misses, false positives, score transparency, scenario panels and provenance display | Most metrics/miss/FP lists are precomputed campus-wide and ignore filters. Timeline uses scope/range but bypasses type/severity/status. Forecast backbone results are six hardcoded rows, not loaded experiment evidence. Missing-label/evaluation handling is incomplete. |
| Integration | Real imports of upstream NumPy-based anomaly modules; optional forecaster hook | No adapter for completed upstream runs, separate SarSim producer outputs, real DERCONNECT feeds or streaming updates. The fixture contains four baselines, no Chronos detector. |

README's claim that all filters apply to every view is too broad. “Needs only numpy” is also incomplete: upstream `anomaly/forecast.py` imports pandas. Current baseline regeneration succeeded with NumPy 2.3.5 and pandas installed, without torch. The upstream project's full dependency pins differ from this runtime; success is compatibility evidence for this run, not a supported lockfile. The README's requirements document is absent, so compliance with that document was not verified. Offline use is supported by local assets and classic scripts; offline file-mode operation and deployment to GitHub Pages were not tested. Historical forecasting numbers are not proof of current Chronos anomaly performance.

### Shared data and state audit

Store selectors centralize detector, meter/building/subgrid, event-attribute and overlap filters. All views reference the same actual/forecast/event objects, and primary controls trigger re-rendering. Section-local presentation state (gallery mode, sort, focus building) is separate and reasonable, but there is no declared per-panel filter policy.

Confirmed divergences: investigation selection survives an excluding scope; model comparison/misses/FP data are global; building statistics keep main-meter consumption even for a PV-only scope; solar uses a fixed context-regression baseline and may show another building. These are semantically different views of shared data, not independent datasets. Make scope exceptions explicit or fix them before claiming universal synchronization.

### Prioritized bugs and architectural risks (recommendations only)

1. **High — investigation record can contradict filters.** In Chromium, CR-030 (Library) remained selected after building filter changed to ENG; `DC.events()` excluded it but detail still showed Library. `investigate.js` checks existence/detector, not membership. Reconcile selection or visibly disclose an out-of-scope deep-linked record.
2. **High — peak time and displayed value disagree.** `enrich_events()` assigns `peak_t` from the normalized score maximum but `peak_actual`, `peak_expected` and deviation from the largest absolute residual. Six of 161 committed records have a measured-value mismatch at the displayed timestamp (CR-019, CR-030, CR-032, CR-043, CR-046, CR-048). Export distinct score-peak and deviation-peak fields or align the facts panel; add a regression fixture.
3. **High before integration — time, missing data and energy assumptions.** Fixed one-hour slots, wall-time-as-UTC parsing, Monday-origin modulo arithmetic, fixed 24/168 periods and implicit kW labels are pervasive. `DC.energy`, aggregate charts and decomposition treat nulls as zeros or propagate invalid values; completeness relies only on dq flags. Current upstream detectors require finite arrays. Resampling/imputation and provenance are prerequisites for real feeds. Signed PV deficit and consumption excess should not be conflated.
4. **High before real-data use — synthetic evidence is assumed present.** Models directly dereferences evaluation entries; investigation says no overlapping injected label means false positive even when labels were never provided. Replace with unavailable/not evaluated states for unlabeled data; keep synthetic ground truth distinct from predictions and human confirmations.
5. **Medium — shared-filter claims exceed behavior.** Global evaluation, fixed solar baseline/out-of-scope fallback, building main-meter metrics and unclipped event impact can mislead. Declare denominator/scope/range on each panel and choose a consistent policy. Negative-control windows are free of injections by construction, so their event counts are meaningful here; do not generalize that assumption to arbitrary windows.
6. **Medium — routing and persisted identity.** Log/gallery `openEvent(..., false)` does not write the selected event to the hash; confirmed `#investigate` while CR-030 was selected. IDs are re-numbered each generation and local status keys contain only event IDs, so regenerated datasets can inherit unrelated statuses. Namespace status by dataset/run and stable event identity; test permalink restoration and reload.
7. **Medium — incomplete reproducibility/integration boundary.** No dashboard dependency lock, schema version, upstream SHA or source hashes in generated metadata. Broad exception handling replaces a failing runtime import with a stub, potentially hiding issues. Builder couples to upstream internal modules, duplicated LEVELS and manually maintained benchmark rows. Keep compatibility fixtures and record exact source/environment versions. Do not treat imported source as consumption of the team's completed runs.
8. **Medium — decision transparency.** Selection prefers settings satisfying the FPR constraint but still returns an invalid best setting if all candidates fail; it should report infeasibility. Exported scores are rounded/capped, and zero thresholds require special normalization used by event generation; exported values cannot exactly reconstruct flags. Model AUPRC is a per-positive-meter mean, not campus-wide micro AUPRC. Centered decomposition uses future samples and is retrospective. Heuristic classifications/severity and possible explanations are not validated diagnoses. A dropdown selection alone cannot establish “Confirmed by an engineer.”
9. **Lower priority — usability and scale.** SVG/table click targets often lack keyboard equivalents; gallery creates one chart per event without pagination. Responsive widths exist, but large real datasets and accessibility have not been validated. No required redesign is implied.

### Integration readiness and proposed contracts

**Assessment:** a useful internal display model exists, but it is not yet an external interchange contract. An adapter can preserve most SVG views for aligned, normalized hourly data; simply replacing `simulate_campus()` is insufficient for arbitrary real measurements. Optional context/evaluation handling and the explicit assumptions above require focused changes. No external completed run, model checkpoint, real measurement or separate SarSim artifact was assumed available.

The inspected anomaly source exports forecast Parquet (`item_id`, `t`, `actual`, 13 quantiles, `forecast_horizon`), score Parquet (`t`, actual, horizon, split masks, raw score variants and later flags/labels), `events.parquet` (`item_id`, dataset, start, end, peak_time, normalized peak_score), per-series threshold/calibration/scale/metric JSON, summary JSON, run config, source snapshot and dataset manifests. These are supported export candidates; their generated contents were not present or evaluated here. The dashboard currently imports code instead of reading them.

| Contract to agree | Current dashboard | Proposed agreement / mapping |
|---|---|---|
| Schema/provenance | Generator name, seeds, build time, source repo name | Versioned bundle manifest with run/dataset IDs, upstream/dashboard SHAs, hashes, checkpoint/model ID, dependency versions, split/calibration windows and units. Distinguish raw artifact from transformed fixture. |
| Time | Dense integer hour indices; start lacks zone; UI appends UTC | Producer `t` must have a declared origin/cadence and map to timezone-aware UTC timestamps. Display America/Los_Angeles separately; specify DST, gaps, duplicates, sorting, resampling and end-exclusive boundaries. Do not infer that an arbitrary `t` is an epoch. |
| IDs/topology | Fictional building/subgrid IDs; `BUILDING-MAIN`/`-PV` lookup | Explicit immutable item_id → meter/channel → building → feeder mapping, channel kind, aggregation membership and display labels; no suffix parsing or double-counting parent/child meters. |
| Units/cadence | kW samples summed as hourly kWh; context °C, fraction, W/m² | Declare power versus interval energy versus cumulative counter; sampling duration, averaging/integration method, import/export sign, quality flags and missing-data policy. Normalize before rendering and label actual units. |
| Forecasts | q01/q10/q50/q90/q99 start at common offset 252 | Map upstream 13 quantiles to explicit probability levels; preserve forecast origin, target timestamp and horizon; resolve duplicate rolling/block targets; require monotonic finite or explicitly missing values. Never substitute zeros for unavailable bands. |
| Scores/thresholds | One selected score; normalized series; scalar threshold; fixed display clipping | Preserve raw score name/direction, raw and normalized values, alert flag, threshold by horizon/series, zero-threshold semantics, calibration/version/FPR and clipping indicators. Displayed normalization is not a substitute for original flags. |
| Events | Half-open indices; detection details + enrichment | Map item_id and peak_time explicitly; specify min_run/gap/hysteresis units, run/model IDs, event identity, score-peak versus deviation-peak, duration and boundary clipping. Keep prediction interval distinct from label interval. |
| Ground truth | Separate synthetic labels/matches; evaluation assumed | Optional explicit label availability, generator/injection identity, label intervals/types and split provenance. Specify one-to-one earliest-ending overlap matching, delay convention and denominators; unknown label status is not FP. Preserve locked test protocol. |
| Classification/severity | Behaviour point/contextual/collective; operational category; primary display type; heuristic priority thresholds 25/45/70 | Agree whether producer or dashboard owns each field; retain distinct injected severity, detector confidence/novelty, operational severity and human review state. Version rules and allow unknown types. Predictions and explanations are not confirmed faults. |
| Context | Weather/occupancy/PV always populated | Specify optional channel alignment, source/quality and unavailable states. Contemporary observed weather is contextual evidence, not necessarily a forecast available in advance. |

### Validation actually executed

Audit scripts, browser state and regeneration outputs were temporary under `/tmp`; they are not a committed test suite and must not be assumed retained in another environment.

- PASS: Python 3.12.14 AST parse of tools/build_data.py; Node v24.22.1 `node --check` on all 11 JavaScript files (including both data files). No bytecode was generated in the dashboard checkout.
- PASS: temporary Node data assertions (78,691 checks): unique IDs, dimensions/offsets, finite actuals, dq enums, monotone forecast quantiles, references, event/label bounds, peak bounds, duration and matched TP/FP consistency. This does not validate every field or scientific correctness.
- PASS: `python3 tools/build_data.py --repo /tmp/derconnect-anomaly-audit --out /tmp/derconnect-audit-generated` exited 0, without torch. All four detectors ran their 162-candidate selection. Dashboard output semantically matched committed data except `built_at`; labels/matches matched as parsed JSON (object-key order differs due to set iteration).
- Reproduced synthetic event F1: context regression 0.5128, weekly naive 0.1034, daily naive 0.3077, rolling MAD 0.0784. These are benchmark observations, not a readiness threshold or real DERCONNECT accuracy claim.
- PASS: local static server plus Playwright/system Chromium at 1440×1000: all four sections rendered, all four detector choices exercised, no page/console errors observed. Initial section SVG geometry contained no NaN/Infinity. Event gallery produced 52 panels for context regression; normalized toggle, log selection, local status persistence across reload, theme persistence and custom dates worked. Oct 1–2 mapped to `[1248,1296)`. A 390×844 viewport had document width 390; this alone is not a full responsive/accessibility review.
- CONFIRMED FAILURES: out-of-scope selected investigation record, missing event hash on log selection, six peak-value/timestamp mismatches. These were observed and left unchanged as requested.
- PASS: Git whitespace/diff checks and final change-scope checks (only the three documentation files). No existing repository test command was available. Full upstream tests, GPU/Chronos inference, real-data adapter, external completed-run ingestion, deployment, exhaustive chart-click/keyboard behavior, and browser file-mode/offline tests were not run.

### Minimal November 6 checkpoint checklist (proposed, not completed)

- [ ] Human review of this audit and the three documentation files; assign owners and scoped PRs.
- [ ] Demonstrate one coherent synthetic workflow: overview → event → measured/expected + score → context/hypothesis → local review status; state that it is simulated and uses baselines.
- [ ] Fix or prominently disclose selection/filter, peak timestamp and permalink defects; add regression checks.
- [ ] Label global evaluation and fixed-baseline panel scope accurately; retain power-quality placeholder and local-status limitations.
- [ ] Agree on a versioned minimal anomaly export with the other groups and validate one supplied small fixture end to end; if unavailable, explicitly report that dependency instead of fabricating integration success.
- [ ] Record base/upstream revisions, runtime versions, seeds, regeneration command and observed metrics. Keep test labels separate; avoid claiming Chronos inference or real-data validation.
- [ ] Re-run browser smoke/data validation after changes and record human review, evidence and AI prompts/associated commits.

### Five independent contribution proposals

| Contributor slot (unassigned) | Scope/files | Deliverable and coordination |
|---|---|---|
| 1 — data integration | tools/build_data.py and a separately scoped adapter/fixtures | Agree/export schema and upstream mapping, provenance and real-data normalization. Own generated data refreshes; coordinate store schema changes with slot 2. |
| 2 — shared state/routing | js/store.js, js/app.js | Selection reconciliation, stable deep links, run-scoped status identity, filter policy and regressions. Coordinate API changes before others edit views. |
| 3 — anomaly investigation | js/sections/investigate.js | Accurate peak facts, evidence levels, unlabeled-data states and investigation usability; coordinate new peak fields with slot 1. This is the recommended contribution for the requesting member. |
| 4 — building views | js/sections/buildings.js | Explicit PV/building scope, cadence-aware aggregates and unavailable-context states; use slot 1's normalized schema. |
| 5 — evaluation/validation | js/sections/models.js and separately scoped test/CI files | Correct global/filter labels, optional evaluation handling, metric provenance and browser/data regression suite. Request separate ownership windows for shared charts, CSS, index.html and documentation. |

Keep ownership narrow and merge shared schema/state contracts first. Shared documentation is append-only but contributors should re-read before appending; do not have five contributors regenerate the same data files.

### Recommended investigation/integration contribution

Own the event evidence contract and one vertical fixture: stable event/meter/run identity; half-open UTC-mapped interval; actual and median/bands; raw and normalized score, alert and threshold; distinct score/deviation peaks; missing-data flags; optional weather/occupancy; separate synthetic label match and review status. Ask the anomaly team for a small completed, provenance-bearing export and its schema, not an assumed checkpoint or inaccessible output directory. Agree with SarSim on units, cadence, label taxonomy and injection provenance.

Start with CR-030 as a regression example for filter reconciliation and peak timing. Demonstrate matched, unmatched, missing-label and missing-context cases. Explain what is detected, which contextual evidence supports a hypothesis, and what a human must verify; do not convert synthetic labels or a dropdown into fault confirmation. Coordinate the evidence-field change with the builder owner and keep it separate from this documentation branch. Next implementation requires a new scoped task; no code fixes were made in this audit.

## 2026-11-03 — Package onboarding documentation for review

- Human contributor: requesting team member; authorized the documentation commit and feature-branch push. AI contributor: OpenAI Codex; full follow-up prompt is appended in AI_USE.md.
- Branch: `docs/repository-onboarding`; base `e4bc545f7dfb0f9b7338fd07096f145d989a80d7`. Files: AGENTS.md, DEVELOPMENT_LOG.md and AI_USE.md only. Application code and generated data remain unchanged.
- Decision: preserve the earlier audit entries as historical records and add this follow-up rather than rewrite their uncommitted/no-push status.
- Checks: confirm branch and working-tree scope; review staged documentation for unrelated content and sensitive information; check whitespace and exact staged path allowlist before commit. Verify the resulting commit and remote branch after push; final outcomes and hash are reported in chat.
- Associated commit: the commit containing this entry, message `docs: add agent instructions, development log, and AI use documentation`.
- Next step: open a PR with base `main` and compare `docs/repository-onboarding`; substantive human review and recommended code changes remain separate tasks.

## 2026-11-03 — Real UCSD demonstration names and operator investigation

- Human: requesting contributor (name not supplied); AI: OpenAI Codex. Human supplied scope and constraints; human implementation review remains pending. No commit/push/merge performed.
- Branch: `feature/building-investigation`, based on `30cfbfb` (onboarding documentation preserved). Working tree was clean before implementation. Local branches/history inspected. GitHub branch lookup returned `main` and `docs/repository-onboarding`; no other implementation branch was returned. CLI `git ls-remote --heads origin` failed because the configured proxy was unreachable; connector lookup supplied branch visibility instead. No other checkout was modified.
- Read AGENTS.md, README.md, DEVELOPMENT_LOG.md, AI_USE.md, generator, all shared UI/state/chart code and relevant sections. Confirmed the earlier filter/selection, log permalink and peak semantics failures.

### Changes and decisions

- Added independently replaceable `tools/building_metadata.json` with eight real UCSD display names, official source URLs, verification date and explicit unverified DERCONNECT coverage. Retained all canonical building/meter/event IDs, existing synthetic profiles and readings. No 24-building padding or additional events. Sources were verified using official UCSD Maps, Library, Qualcomm Institute, University Centers and Facility Services pages, linked in README and the catalog. DERCONNECT capabilities search result reports 24 building meters at 2-second collection and 236 submeters; no complete authoritative mapping was found in consulted sources. Names alone do not verify meter/PV/feeder associations.
- Builder 1.1.0 exports separate `score_peak_t` and `deviation_peak_t`; legacy `peak_t` remains score-peak compatible. All initial reviews are now Unreviewed rather than inferred from contextual hypotheses. Added dataset identity and simulated metadata. Generated `data/derconnect-data.js` from the builder; did not hand-edit it. Existing synthetic labels and matches remain unchanged (labels file not rewritten).
- Shared store reconciles selected records against building/meter/subgrid/time/type/severity/status/detector filters. Filter edits clear exclusions; explicit event navigation restores scope when necessary. Queue, gallery, chart actions and deep links share the record path. Event and section navigation uses browser history; tabs no longer overwrite the selected-event permalink. No implicit first-event selection.
- Operator summary derives measured/expected/residual/percentage and energy from the selected meter/detector series, with separate maximum reading and maximum residual. Hourly kW net residual integration is withheld for missing/bad data or unsupported cadence/units. Peak marker uses the same series-derived residual peak as the summary. Export rounding may create ties distinct from full-precision builder peaks; legacy queue/scatter percentage remains relative to typical clean load and its axis is labeled accordingly.
- Preserved custom SVG charts, quantile bands, before/after context and hover; added explicit half-open start/end boundaries. Missing score values stay missing. Added data-derived evidence, score/threshold transparency, clipping disclosure, detector overlap and optional-context unavailable states. Removed synthetic label verdicts from operator detail; research evaluation remains separate.
- Added sourced plain-language definitions (point, collective, contextual, seasonal/pattern, trend/level shift and data integrity), distinguishing temporal behavior from operational category. Lai paper and Si abstract were consulted; the Guato Burgos DOI/MDPI page returned HTTP 429, so its link and user-supplied terminology were retained without claiming full-text review.
- Added dataset-scoped local review status and explicit Save note, legacy review preservation for this fixture, storage-failure disclosure and in-memory fallback. Annotations neither establish independent truth nor retrain/calibrate models.

### Files changed

`tools/building_metadata.json`, `tools/build_data.py`, `data/derconnect-data.js`, `js/store.js`, `js/app.js`, `js/util.js`, `js/ui.js`, `js/charts.js`, `js/sections/investigate.js`, `css/styles.css`, `tests/regression.cjs`, `tests/browser.cjs`, `README.md`, `AI_USE.md`, `DEVELOPMENT_LOG.md`, `AGENTS.md` (current fixture/peak contract refreshed).

### Validation actually run

Environment: Node v24.22.1, Python 3.12.14, NumPy 2.3.5, pandas 2.2.3; Playwright with system `/usr/bin/chromium`. Upstream source checkout: `b83acda9caa3c896ca198f65c94e9625c03568b7`, read/imported without edits.

- PASS: `python3 tools/build_data.py --repo /tmp/derconnect-anomaly-audit --out /tmp/building-investigation-data`; repeated after final builder cleanup with `--out /tmp/building-investigation-final`. Both exited 0; four 162-candidate selections, 26 labels, 161 events. Observed event F1 unchanged: context 0.513, weekly naive 0.103, daily naive 0.308, rolling MAD 0.078 (rounded builder output, synthetic only).
- PASS: Python semantic comparison of final generated dashboard against committed fixture, ignoring only `meta.built_at`; exact equality. Compared original HEAD fixture: meter IDs/readings/dq, detector settings/series, weather, evaluation and ordered event IDs unchanged. Synthetic labels/matches equal the regenerated result after ignoring generator-version metadata.
- PASS: `node tests/regression.cjs`: 8 buildings, 11 meters and all 161 event records; references, sample lengths, all quantile orderings, interval/duration/peak bounds and values, selection/filter exclusion for each event, permalink generation, unit restrictions, missing labels, note/status reload and blocked storage. Eight records have different score/deviation peak timestamps; the earlier six mismatch observation was not used as a hardcoded count.
- PASS: Python `ast.parse` of `tools/build_data.py`; `find js data -name '*.js' -exec node --check {} \;`; syntax check of browser suite; `git diff --check`.
- PASS: local `python3 -m http.server 8000 --bind 127.0.0.1`, then `SCREENSHOT_DIR=/workspace/work/building-investigation/screenshots node tests/browser.cjs`. Eight buildings across all four sections; all four detectors; 352 rendered SVG charts checked for NaN/Infinity. Queue/gallery same-record selection, history Back/Forward, CR-030 deep-link reload, status-filter exclusion, review and note persistence, missing labels/context, theme persistence and mobile document width 390/viewport 390. No observed page/console errors. Desktop/mobile screenshots captured; desktop inspected visually. The designated chat output directory was unavailable in this managed environment, so screenshots remain workspace verification artifacts.
- Initial browser-test assertions required correction: exact text included a child note; gallery panels have role=listitem; resize assertion ran before existing 150 ms debounce. A screenshot write also failed because `/codex/.../output` is absent/unwritable. These failed attempts were followed by the passing suite; assertions were corrected to test actual behavior, not removed. The old temporary onboarding browser audit expected implicit selection and was superseded by the committed regression suite.

### Limits and next steps

Human review and real DERCONNECT integration remain pending. No official 24-building mapping, real measurements, Chronos inference, calibrated fault probabilities, producer raw score/alert arrays or actual detection timestamps were available. The current fixture remains hourly campus-wall-time arithmetic, not an irregular UTC ingestion adapter. Other sections still assume labeled synthetic evaluation and populated context; only investigation's optional-context path was hardened. No new trend classifier, threshold controls, backend or shared review synchronization. Nominal quantile coverage does not establish real-world fault confidence. No deployment, full accessibility audit or offline file-mode test performed. Suggested commit: `feat: add sourced UCSD labels and evidence-based anomaly investigation`.

## 2026-11-03 — Package building investigation feature for GitHub review

- Human authorized commit/push after accepting the reported results; AI contributor: OpenAI Codex. Branch confirmed as `feature/building-investigation`; base onboarding commit retained. No merge into main.
- Reviewed feature files and semantic generated-data changes: metadata/name provenance, meter display labels, separate peak timestamps and initial review status only; detector arrays, measurements and evaluation are unchanged. No unrelated paths or sensitive content found in review; private-key/GitHub-token/AWS-access-key signature scan passed.
- Verified the complete original implementation prompt verbatim against the uploaded file in AI_USE.md and reviewed the development record. Appended this follow-up request and authorization without rewriting historical entries.
- Repeated `node tests/regression.cjs` (PASS: 8 buildings, 11 meters, 161 events); all JS/CJS syntax checks and `git diff --check` passed. Earlier browser and builder validation remain recorded above; not rerun for this packaging-only follow-up.
- Stage only the 16 documented feature files, verify the staged path allowlist and whitespace, commit with the requested message, then push `origin/feature/building-investigation`. Associated commit is the one containing this entry; exact hash and remote verification outcome will be reported in chat. No PR creation is required by this follow-up.
