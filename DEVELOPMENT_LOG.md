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


## 2026-11-03 — Dashboard navigation, profiles and focused investigation

- Timezone: America/Los_Angeles. Human contributor: requesting team member (unnamed); specification/reference URLs. AI contributor: OpenAI Codex; implementation and validation. No human review/test result is inferred.
- Base: `508251a08b36d627fa856a2e4b167dec67f728a8`; new branch `feature/dashboard-ux-navigation`, created from the clean `work` checkout. No commit/push/merge/deployment.

### Audit and design evidence

The existing static application had four large sections with every filter in a global strip. Overview combined five KPIs, a time series, type/severity charts, a heatmap and a ten-event queue. Investigation automatically selected a record, rendering log/gallery, detail, context, history and scatter together. Log/gallery selection did not update its hash; routing used replaceState, so browser history did not represent navigation. Building analysis offered a focus selection, not a building profile. Evaluation was substantial and reusable. Shared DC selectors/forecast offsets and custom SVG primitives already supplied the scientific evidence needed; no generator/data changes were necessary.

Both public reference URLs were attempted through the configured proxy and returned HTTP 403 CONNECT denial. No visual comparison with either hosted interface is claimed. A local before-Overview screenshot was captured. The checkout's eight labels are fictional (Engineering Hall, Science Library, etc.), contrary to the prompt's description of existing verified UCSD labels; preserving actual IDs/names avoids inventing a real association. All channels remain simulated and coverage unconfirmed.

### Architecture and implemented behavior

- Persistent green-accent sidebar: Overview, Buildings, Anomaly Investigation, Detection Quality. Native anchors/hashchange produce browser history entries. `#investigate/<event>` and `#buildings/<building>` restore identities on reload; invalid IDs show an unavailable state. Routing resets event selection on the list route and chooses the event's own detector for detail.
- Shared state remains DC-owned. In-memory snapshots retain each destination's filters; details are record-driven, so list filters cannot leave a contradictory selected event beneath an empty log. Returning to a list restores its scope. Filter state is not URL-serialized across reloads. Existing controls move between primary controls and Advanced filters; event detail hides list filters; building profiles expose time/detector independently of list scope.
- Overview now shows four metrics, one readable actual/expected chart with optional anomaly overlays, five priority events and building links. Original type/severity charts, meter heatmap, data completeness/quality counts and event excess remain in System diagnostics.
- Buildings now has a searchable directory and profiles with main-meter demand/baseline/band, consumption/peak/completeness, clean-history comparison, simulated meter metadata and linked events. Missing main-meter data has an unavailable state. Main/PV mapping now uses explicit building/kind associations instead of ID suffixes. The previous comparison/heatmaps/sub-grid/decomposition/daily-profile/peak/PV/power-quality views remain in Advanced building & sub-grid analysis. PV analysis no longer substitutes another building's meter when the focus building has none.
- Event list and gallery route to a dedicated detail. Detail has four summary facts, selected interval/deviation-peak chart, explanation/type definition, next-step guidance, review and notes. Context/quality, score/threshold/raw-score availability, forecast quantiles, detector overlap, baseline configuration, contextual statistics, synthetic labels, history and scatter use disclosures. Shared chart wrappers redraw on disclosure opening to use actual layout widths.
- Peak deviation is derived from unchanged actual/q50 samples; exported score-peak time remains separately shown in diagnostics. This corrects CR-030's previous mismatched measurement/time presentation without rewriting detections.
- Retained legacy browser-local status keys/IDs; added insufficient-evidence state and notes. Explained events now count as reviewed (not pending); confirmed operational issue remains open until resolved. Decisions are operator annotations, not engineer verification/ground truth/training labels. Unmatched labels alone no longer imply a verified operational false alarm; unexported raw scores are explicitly unavailable and normalized scores are not probabilities.
- Existing Detection Quality functionality is retained and full-run comparison scope is disclosed. Missing evaluation/labels shows an unavailable state. Theme persists; light is the coherent default. Primary routes/table sorting/review use keyboard-operable controls, skip navigation and route focus management. Legacy SVG research marks have not undergone a complete accessibility redesign.

### Files and reuse

Application: index.html; css/styles.css; js/app.js; js/store.js; js/util.js; js/charts.js; js/sections/overview.js, investigate.js, buildings.js, models.js. Added tests/navigation.cjs. Documentation: README.md, AI_USE.md, DEVELOPMENT_LOG.md. Existing generated data and tools/build_data.py are unchanged. No framework, bundler, backend or production dependency was added. Reused all four section renderers and SVG/series/store infrastructure; new components are routing/scopes, directory/profile, review notes, compact summaries/disclosures and regressions.

### Validation and evidence

Commands executed with Node v24.22.1 / Python 3.12.14:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
SCREENSHOT_DIR=work/screenshots node tests/navigation.cjs
for file in js/*.js js/sections/*.js data/*.js; do node --check "$file" || exit; done
# Python ast.parse(Path('tools/build_data.py').read_text())
git diff --check
git diff --exit-code -- data tools
```

Syntax, Python parsing, whitespace and unchanged-data/generator checks passed. Browser tests run in isolated Playwright/system Chromium at 1440×1000 and 390×844. Suite verifies the primary connected flows, list/detail separation, browser history/reload, contextual scope, event peak evidence, local status/notes, all four detectors/destinations, gallery/normalization, scientific disclosures, custom date mapping, invalid IDs, missing measurements/context/evaluation, theme persistence, finite SVG attributes and no document overflow at 390px. No observed page/console errors in successful runs. Early failures were test-fixture indexing and a locator matching retained hidden content; corrected the harness before successful reruns. Final exhaustive-route result is appended below when completed.

Screenshots: work/screenshots/before-overview.png (baseline), overview.png, buildings.png, building-profile.png, anomaly-detail.png and mobile-*.png. The requested absolute /codex/.../output directory could not be created because the managed filesystem denied it, including an escalated attempt; artifacts remain in the checkout and image previews are supplied in chat. They are not runtime assets.

### Limits and follow-up

No human usability review, full accessibility audit, other-browser matrix, deployment, model training/regeneration, real-data ingestion or literature re-verification was performed. Definitions reuse existing taxonomy; supplied paper texts were unavailable. Hourly fixture cadence, campus-wall-time-as-UTC and legacy event-ID persistence assumptions remain documented. A future regenerated dataset still needs run-scoped review identities. Existing advanced charts' scope conventions and retrospective decomposition are preserved rather than revalidated. A real adapter requires the contracts in the earlier audit. Review this feature branch, compare screenshots, and perform facilities-manager/keyboard/screen-reader acceptance before deployment.

Final validation: PASS — browser regression additionally opened dedicated detail routes for all 161 exported events across all four detectors, with no observed page/console errors. The final suite also verifies optional Overview overlays and skip navigation without changing the current event route. All JS/data/test syntax checks, Python AST parse, git diff --check, unchanged data/tools check and a verbatim-prompt inclusion assertion passed. No commit was created.

Validation runtime detail: Playwright 1.62.1, Chromium 155.0.8059.79 (Debian GNU/Linux 13). The Overview review action explicitly seeds a pending-event queue from its current scope and restores priority sorting; regular sidebar navigation retains independent page scopes. Final screenshot capture scrolls to the top of the page before export.


## 2026-11-03 — Reconcile dashboard UX with merged building-investigation PR #2

- Timezone: America/Los_Angeles. Human: requesting team member, identifying the missing merged feature. AI: OpenAI Codex, performing history inspection, conflict reconciliation and validation. Human review remains pending.
- Confirmed outdated base: UX branch was at 508251a with no feature commits and uncommitted changes. Fetch advanced origin/main to eeeba564f34bf96a19eb19bb7988a2f97362372f, two commits ahead, including 691a66c and PR #2. Saved a patch/document/test backup under /workspace/work/ux-main-integration plus stash 8285fcd60b76418b7340fab918153e62118e4f4d; rebased via fast-forward and reapplied the UX changes. No feature/merge commit, push, PR merge or publication was made. All resolved work is unstaged.
- Resolved conflicts in AI_USE.md, DEVELOPMENT_LOG.md, README.md, CSS, routing, investigation, store and util. Documentation resolution concatenates complete main records with intact UX appendices. Earlier fictional-label/legacy-storage statements are historical evidence from the stale base, superseded by this integration record.
- Preserved main's eight sourced UCSD demonstration names, metadata, data/label artifacts, generator and shared overlay improvements. Added official name-source links to profiles and retained the explicit simulated measurements/relationships and unverified DERCONNECT coverage disclosure. Stable building/meter/event IDs remain unchanged.
- Detail summaries now reuse eventFacts (separate observed/deviation/score peaks, percent of expected, valid-unit/cadence/data-quality conditions for excess). Kept main's score-threshold/export/grouping evidence, start/end lines, classification guide/citations, overlap and ground-truth separation in disclosures. Kept excluded-selection clearing and eventScope restoration, reconciled with the new history/list/detail routes and independent list scopes.
- Retained dataset-scoped review storage and in-memory fallback from main. UX notes use that same store; notes from the earlier preview key migrate for this dataset. All original regression.cjs assertions remain; appended migration/metadata checks. browser.cjs is adapted to separate list/detail routes and contextual filters without removing original scenarios. navigation.cjs checks the correct Geisel Library label and all 161 event details.

Validation actually executed:

```bash
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
node tests/regression.cjs
SCREENSHOT_DIR=work/integrated-screenshots/regression node tests/browser.cjs
SCREENSHOT_DIR=work/integrated-screenshots/navigation node tests/navigation.cjs
for file in js/*.js js/sections/*.js data/*.js tests/*.cjs; do node --check "$file" || exit; done
# Python ast.parse(Path('tools/build_data.py').read_text())
git diff --check
git diff --exit-code origin/main -- data tools AGENTS.md js/ui.js
```

Results: all passed. Regression: 8 buildings, 11 meters, 161 events, 8 distinct score/deviation peaks; filter, missing-label/unit, persistence, blocked-storage and note-migration checks. Browser: all eight sourced profiles, four detectors, 210 charts, evidence/notes/history/permalinks/gallery/missing-context/labels/theme/mobile. Navigation: all 161 event routes, page scopes, review, scientific disclosures, empty data/IDs, dates and desktop/mobile. Both browser suites observed no page/console errors; mobile document width equals 390px viewport. Runtime Node v24.22.1 / Python 3.12.14 / Playwright 1.62.1 / Chromium 155.0.8059.79; desktop 1440×1000 and mobile 390×844.

Data verification: current data/tools files are byte-identical to origin/main. Separate deep comparisons against 508251a confirmed all measurements, quality/weather arrays, forecasts/scores/settings, evaluation, negative controls, synthetic labels and original detection values are unchanged, apart from main's review defaults and newly added peak timestamps. No data regeneration was performed. Programmatic checks confirm complete main documentation plus original UX appendices are present in both records. HEAD equals fetched origin/main (0/0 ahead/behind), with feature changes uncommitted; no unmerged index entries remain. Screenshots with UCSD labels are under work/integrated-screenshots; older screenshots remain historical artifacts.

Changed files relative to current main: index.html, css/styles.css, js/app.js, js/charts.js, js/store.js, js/util.js, four section files, README.md, AI_USE.md, DEVELOPMENT_LOG.md, tests/browser.cjs, tests/regression.cjs, and new tests/navigation.cjs. No unresolved integration conflict or observed regression remains. Full accessibility/other-browser/human review, real-data integration and deployment remain unrun. Next step is human verification of the combined uncommitted feature before any publishing action. Complete follow-up prompt is recorded verbatim in AI_USE.md.


## 2026-11-03 — Package integrated dashboard UX feature

- Timezone: America/Los_Angeles. Human: requesting team member, explicitly authorizing the feature commit and push after integration verification. AI: OpenAI Codex, branch/scope/diff checks, documentation records, explicit staging and commit/push. Complete follow-up prompt is recorded in AI_USE.md.
- Branch feature/dashboard-ux-navigation; refreshed origin/main and confirmed HEAD equals eeeba564f34bf96a19eb19bb7988a2f97362372f before committing, including merged PR #2. Both main documentation histories and the UX/integration entries remain preserved. No unresolved index entries or unrelated tracked changes. work/ contains local screenshots/scratch artifacts and is excluded from staging.
- Stage only the 16 feature application/documentation/test files. Preserve data/, tools/, AGENTS.md and js/ui.js unchanged. Recheck regression/syntax/AST, whitespace, documentation and exact staged scope; rely on the preceding successful complete browser/navigation runs because no application code changed for packaging.
- Associated commit: the commit containing this entry, message feat: add dashboard navigation and focused anomaly investigation. Verify its contents and remote branch SHA after push; report actual results in chat. Push only origin/feature/dashboard-ux-navigation; no merge or push to main. Next step: open a pull request with base main and compare feature/dashboard-ux-navigation.


## 2026-11-04 — Anomaly-specific investigation and focused section layout

- Timezone: America/Los_Angeles. Human: requesting team member, selecting the feature and approving the four implementation prompts. AI: OpenAI Codex, audit, implementation, tests, visual inspection and records. Human code/usability review remains pending.
- Branch `matthew-prototype-feature`; clean base `f2c921055b9fc1481bd539b6ac1b000b1cb90055`. Existing checkout used; no worktree, commit, push, merge or deployment. Earlier conversation requests and approved working prompts are retained in AI_USE.md using its dated heading, verbatim prompt, contribution/validation/limits format.
- Rationale: align with the feedback recorded in the supplied context by foregrounding evidence appropriate to each anomaly instead of adding more general charts. Shared selector `DC.investigationEvidence` prioritizes quality, then seasonal category, context, point and collective behavior. It selects presentation from existing event fields/readings and never uses evaluation labels or alters detections. Unknown classifications use general evidence. Peak/impact remain unavailable without valid paired data; quality-invalid impact remains withheld.
- Event details: point view highlights the paired reading/range and uses a shorter window/point encoding; sustained view retains interval/impact emphasis; contextual view opens weather/occupancy evidence before review; seasonal view moves prior-week history to primary evidence; quality view moves the status timeline/counts above demand. All entries still resolve to the same shared event record. Removed one byte-equivalent duplicate classification-guide function; kept the guide/citations. Existing historical causal-sounding text now describes a retrospective comparison.
- Organization/polish: reordered Overview KPIs and queue while retaining demand/peak summaries; grouped building comparisons, patterns, peaks, decomposition and solar/availability; grouped evaluation charts, diagnostics, scenarios and methodology. Preserved filter-scope conventions, datasets and scientific encodings. Added 160ms transitions with reduced-motion support, consistent controls/focus states and narrow layout refinements. Local redraws preserve current-record drafts, focus, disclosure state and scroll. Save notes is still required before navigation/reload. Fixed the advanced-building focus renderer, missing-irradiance handling and duplicate heading ID. Explicitly disclosed the existing centered decomposition's future observations.
- Changed files: index.html; css/styles.css; js/app.js, store.js, ui.js; all four js/sections/*.js; tests/regression.cjs; new tests/investigation-views.cjs; README.md; AI_USE.md; DEVELOPMENT_LOG.md. Existing navigation/browser assertions retained unchanged. Data, labels, generator, metadata, instructions and chart primitives are unchanged. No runtime dependency/framework/backend added. Sites skill used for local-only development guidance; hosted operations skipped per approved scope.

Validation environment: Node v24.14.1; Python 3.13.1; Playwright 1.64.1 installed only at /tmp/derconnect-browser-qa; Google Chrome 158.0.8127.18 (macOS), isolated headless sessions at 1440×1000 and 390×844. Static server: `python3 -m http.server 8000 --bind 127.0.0.1`. Sandbox initially denied binding and Chrome launch, and npm initially failed DNS; tool-approved escalated retries succeeded. No checks or assertions were disabled to obtain a pass.

Executed checks during implementation:

```bash
node tests/regression.cjs
for file in js/*.js js/sections/*.js data/*.js tests/*.cjs; do node --check "$file" || exit; done
python3 - <<'CHECK'
import ast
from pathlib import Path
ast.parse(Path('tools/build_data.py').read_text())
CHECK
git diff --check
git diff --exit-code -- data tools AGENTS.md js/charts.js
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-qa/navigation node tests/navigation.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-qa/browser node tests/browser.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-qa/views node tests/investigation-views.cjs
```

Results during implementation: all above checks passed after the documented harness corrections. Selector regressions cover five views, precedence, label independence, unchanged event values, flagged/null readings, missing forecasts and generic fallback. Navigation opened all 161 event routes across four detectors and checked all sections, filters, empty/missing scopes, custom dates, keyboard/history/reload, gallery, status/notes, themes and 390px fit. Existing browser suite checked eight profiles, four detectors, 141 chart instances and evidence/persistence/missing-context/labels paths without page/console errors. Specialized suite checked tailored chart ordering/encoding, missing forecasts/weather/occupancy/irradiance, generic fallback, draft/focus retention, grouped chart redraws, mobile themes, finite SVGs and reduced motion, without page/console errors. Early specialized-suite failures were focus simulation, ambiguous locator and leaked test-only mutations across hash navigations; fixed the harness without dropping coverage. Inspection additionally corrected a generic marker fallback and widened the quality timeline label margin. Final verification after the last source refinements is recorded below.

Screenshots: /tmp/derconnect-qa/{navigation,browser,views}/, with final existing-suite captures under final-navigation/ and final-browser/. Visually inspected desktop point/quality details and mobile dark quality detail. These are temporary QA artifacts, not runtime assets. Full accessibility/screen-reader/user testing, other browsers, real measurements, adapter compatibility, model experiments, data rebuilds and deployment remain unrun. Existing hourly/campus-wall-time assumptions and diagnostic scope conventions remain. Synthetic evidence and operator annotations do not establish a verified fault. Next step: human review of the local feature; no commit exists.


Final verification (November 4, 2026, America/Los_Angeles): PASS. `node tests/regression.cjs`, all application/data/test `node --check` commands, builder Python AST parse, `git diff --check`, documentation-history prefix assertions and `git diff --exit-code -- data tools AGENTS.md js/charts.js tests/navigation.cjs tests/browser.cjs` passed. Final existing-suite commands used the same NODE_PATH/CHROMIUM_PATH above with SCREENSHOT_DIR=/tmp/derconnect-qa/final-navigation and /tmp/derconnect-qa/final-browser: navigation passed all 161 routes; browser passed eight profiles/four detectors with 133 chart instances and zero page/console errors, document width 390px at a 390px viewport. After the final missing-forecast/label refinements, `NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-qa/final-views node tests/investigation-views.cjs` passed, including the meter-label bounds assertion, both mobile themes and reduced motion. The chart-instance count varies with disclosure/render timing and is not an acceptance constant. Complete source/test diff and final status inspected. No commit exists; human review remains pending.


## 2026-11-04 — Interactive related-meter event comparison

- Timezone: America/Los_Angeles. Human: requesting team member, requesting a useful high-priority feature after clarifying the earlier increment. AI: OpenAI Codex, feature selection, implementation, validation and records. Human review pending. User-authored follow-ups are recorded verbatim in AI_USE.md; no approval or contributor name is invented.
- Branch `matthew-prototype-feature`, base `f2c921055b9fc1481bd539b6ac1b000b1cb90055`. Prior uncommitted work preserved; starting copies for incremental review under /tmp/derconnect-related-before. No new worktree, branch switch, stash, commit, push, merge or deployment. Interim Git support was read-only plus instructions.
- Added **Compare related meters →** on each event detail. A lazy panel compares the source meter with at most two same-kind/same-unit peers, scoped to simulated sub-grid or campus. Shared time/vertical domains, demand/deviation modes, event/context windows, synchronized pointer cursor plus keyboard slider, common timestamp readouts, quality markers/gaps, valid paired counts/withheld energy differences and overlapping-detection links provide a new cross-meter investigation workflow. Reference shading does not claim a peer detection. No correlated-cause classification is added.
- Data scope lives in the store, explicitly using the reference detector and half-open interval, independent of list filters/status and evaluation labels. No measurement/forecast/detection/label outputs changed. Shared charts gain only an optional per-comparison cursor with subscription cleanup on redraw. Local peer choices survive same-event redraws but reset on reload; the event permalink is preserved. Generation/consumption stay separate. Full reliability is required for signed hourly-kW energy sums; null readings/forecasts remain unavailable.
- Task files: js/store.js, js/charts.js, js/sections/investigate.js, css/styles.css, tests/regression.cjs, new tests/meter-comparison.cjs, README.md, AI_USE.md, DEVELOPMENT_LOG.md. Earlier local changes in other files remain intact. Original browser/navigation test files, generated assets, builder, building metadata and AGENTS.md remain unchanged.

Commands executed (Node v24.14.1, Python 3.13.1, Playwright 1.64.1, Google Chrome 158.0.8127.18 on macOS):

```bash
python3 -m http.server 8000 --bind 127.0.0.1
node tests/regression.cjs
for file in js/*.js js/sections/*.js data/*.js tests/*.cjs; do node --check "$file" || exit; done
python3 - <<'CHECK'
from pathlib import Path
import ast
ast.parse(Path('tools/build_data.py').read_text())
CHECK
git diff --check
git diff --exit-code -- data tools AGENTS.md tests/navigation.cjs tests/browser.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-comparison-final/new node tests/meter-comparison.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-comparison-final/navigation node tests/navigation.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-comparison-final/browser node tests/browser.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-comparison-final/views node tests/investigation-views.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-comparison-final/screens node tests/meter-comparison.cjs
```

Results: regression, syntax, Python AST, unchanged-artifact and whitespace checks passed. Four browser suites passed in the final full sweep: new comparison workflow; navigation through all 161 event routes/four detectors/four sections; original browser suite across eight profiles/four detectors (151 chart instances observed); previous five-view investigation suite. Tests exercised readouts against underlying samples, linked cursors/shared scales, controls/modes/windows, peer event links/reload, drafts/status/theme, missing/flagged data/forecasts, empty scopes, PV separation, keyboard, 390px mobile, reduced motion and finite SVG geometry. No observed page/console errors. Desktop 1440×1000; mobile 390×844. Final new-suite rerun changes only the screenshot harness to capture mobile viewports, avoiding sticky-header artifacts from a tall element screenshot; its result and final record-preservation checks are appended below.

Early browser failures: exact accessible names were absent on nested labels (source fixed); Playwright isDisabled did not reflect the option's native disabled property (assertion corrected to native property); a test assumed each detector had a Geisel event (fixture selection corrected to an available main-meter event for each detector). No detector/assertion/integrity/TLS policy was weakened. Intentional `diff -u` review against the snapshot exited 1 because files differ; standalone whitespace checks were subsequently run directly. Approved tool escalation was used for the local server and isolated Chrome. No runtime dependency was added.

Screenshots under /tmp/derconnect-comparison-qa and /tmp/derconnect-comparison-final are temporary QA artifacts. Desktop deviation panel visually inspected; final mobile controls/charts are reviewed before handoff. Prior records remain preserved. No data regeneration, upstream access, real-meter topology validation, training, full accessibility/user review, other browser engine or deployment was performed. Existing hourly/campus-wall-time assumptions remain. Simulated coincidences are evidence to investigate, not a shared-fault diagnosis; absence of overlapping detections does not establish normal operation. Next: human review of CR-030 with same-sub-grid and campus peers. No associated commit exists.


Final verification: PASS — all four browser suites and the dependency-free regression suite passed; the final comparison rerun also passed after the screenshot-harness refinement. Visually inspected desktop deviation output and the final mobile dark controls/charts at /tmp/derconnect-comparison-final/screens/demand-mobile-dark-{controls,charts}.png; labels, charts and controls fit the viewport. All application/data/test JavaScript syntax, Python AST, unchanged data/tools/original-browser-test checks, documentation prefix-preservation assertions and git diff --check passed. Full incremental source/test diff and final status reviewed. The owned local server was stopped after QA. No commit, push, merge or deployment was made. Human review remains pending.


## 2026-11-04 — Clearer comparison guidance and dashboard visual refinement

- Timezone: America/Los_Angeles. Human: requesting team member, directing the copy/removal/visual changes. AI: OpenAI Codex, implementation, QA and records. User request is recorded verbatim in AI_USE.md using its established dated-entry format. Human review remains pending.
- Branch `matthew-prototype-feature`; base `f2c921055b9fc1481bd539b6ac1b000b1cb90055`. Prior uncommitted work preserved; incremental starting copies at /tmp/derconnect-polish-before. No commit, push, merge, worktree or deployment.
- Removed the visible Investigation Focus component and its obsolete styles. Retained scientific evidence beside its charts: point paired-reading/range caption, quality summary/timeline, context and prior-week views. Internal view selection remains unchanged. Comparison panel now explains its purpose in one sentence; action has a short helper. All related-meter interaction/data behavior is retained.
- Navigation distinguishes Operations from Research, with a code-native SVG energy mark and per-section task labels. Refined sage/neutral surfaces, type hierarchy, spacing, borders and control feedback. Side-by-side event interpretation/review stacks below 1150px. Manager-facing detection copy is shorter; technical score/threshold/export evidence remains in its existing disclosure. Dataset provenance/reference disclosures reduce persistent text while keeping the simulated-data label visible. Added correct dark-button foreground contrast, subtle reduced-motion-aware section/disclosure transitions, and preserved focus/draft behavior. No data, detector or model changes.
- Task files: index.html; css/styles.css; js/app.js; four js/sections/*.js; tests/investigation-views.cjs; tests/meter-comparison.cjs; README.md; AI_USE.md; DEVELOPMENT_LOG.md. No new task file, framework/backend or runtime dependency. Earlier store/chart/test additions remain intact. Historical focus-box entries are preserved and superseded by this removal record.

Validation environment: Node v24.14.1 / Python 3.13.1 / Playwright 1.64.1 / Google Chrome 158.0.8127.18 (macOS), 1440×1000 desktop and 390×844 mobile. Existing temporary Playwright installation reused; server/isolated headless Chrome launched with approved tool escalation.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
node tests/regression.cjs
for file in js/*.js js/sections/*.js data/*.js tests/*.cjs; do node --check "$file" || exit; done
python3 - <<'CHECK'
import ast
from pathlib import Path
ast.parse(Path('tools/build_data.py').read_text())
CHECK
git diff --check
git diff --exit-code -- data tools AGENTS.md tests/navigation.cjs tests/browser.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-polish-qa/views node tests/investigation-views.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-polish-qa/comparison node tests/meter-comparison.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-polish-qa/navigation node tests/navigation.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-polish-qa/browser node tests/browser.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-polish-qa/final node tests/investigation-views.cjs
```

Results: dependency-free regression/syntax/AST/whitespace/unchanged-artifact checks passed. All four browser suites passed without page/console errors. Navigation exercised all 161 event routes across four detectors and all sections, filters/empty scopes, keyboard/history/reload, review/theme and mobile. Original browser suite checked eight profiles/four detectors and 152 chart instances (observation, not a constant); 390px document fit passed. Investigation coverage retains all evidence/fallback/missing-context/draft cases and now asserts no visible focus component, preserved point/quality evidence, keyboard dataset/reference disclosures, desktop/mobile interpretation-review placement, both-theme primary-button contrast ≥4.5:1 and reduced motion. Comparison suite retains real linked pointer/keyboard cursors/readouts, scope/modes/windows, peer drill-down, labels/quality/unit/PV boundaries, themes and mobile, adding the purpose-copy assertion. No assertion was disabled to obtain a pass. Final investigation rerun after minor visual refinements and final record preservation checks are appended below.

Visual QA: inspected desktop Overview and sustained-event page, plus mobile dark quality-event output; navigation, chart space and stacked/two-column review layouts are readable. Stable final Overview/Buildings/event captures are under /tmp/derconnect-polish-qa/final; these are temporary QA assets. No formal human usability/accessibility review, other browser engine, real measurements/adapters, model experiments/regeneration or deployment. Existing synthetic/hourly/wall-time assumptions remain. Next: human review of the local changes. Associated commit: none.


Final verification: PASS — the final investigation-suite rerun passed after the visual refinements, including removed-focus/preserved-evidence assertions, purpose copy, keyboard provenance/reference access, two-column/stacked review layouts, ≥4.5:1 button contrast in both themes and reduced motion. Other comparison/navigation/browser suites and dependency-free regressions passed; no page/console errors were observed. Stable final Overview and event screenshots were inspected, and earlier documentation prefixes were verified intact. A final low-impact Overview caption correction removes an obsolete “below” direction for the priority queue; no application logic changed after the successful browser sweep. Syntax/AST/unchanged-artifact/whitespace checks and final diff/status review passed. Temporary screenshots remain under /tmp/derconnect-polish-qa. The owned QA server was stopped. No commit, push, merge or deployment was made; human review remains pending.


## 2026-11-04 — Unified navigation, smooth route transitions and anomaly-first page flow

- Timezone: America/Los_Angeles. Human: requesting team member, directing unified navigation, smooth switching and intuitive anomaly-centered content. AI: OpenAI Codex. Human review pending.
- Branch `matthew-prototype-feature`, base `f2c921055b9fc1481bd539b6ac1b000b1cb90055`; previous local work preserved. Starting copies at /tmp/derconnect-navigation-before. No worktree, commit, push, merge or deployment.
- Unified all four navigation entries. Added native workspace/filter View Transitions (120–260ms), a 220ms Web Animations fallback, reduced-motion bypass, rapid-navigation supersession and promise handling for skipped snapshots. Latest-state rendering prevents stale routes. Scroll/focus commit after route rendering so outgoing snapshots retain their prior reading position. Same-page controls retain immediate refresh and draft/focus behavior; invalid records settle correctly.
- Overview's action now belongs to the queue. Building cards foreground pending events; profiles show review/high-priority/quality metrics and at most six event links before demand/history. Pending events precede reviewed events, retaining operational-priority ordering in each group. Full building-event review carries building/detector/time scope through existing routing/history. Peak/consumption context remains. Event-list/detail guidance is task-specific. Detector comparison has seven primary columns and an expandable five-column settings/calibration table with unchanged values and caveats.
- Task files: index.html; css/styles.css; js/app.js; four js/sections/*.js; tests/investigation-views.cjs; tests/browser.cjs; new tests/section-navigation.cjs; README.md; AI_USE.md; DEVELOPMENT_LOG.md. Existing chart/store/comparison changes retained. Measurements, forecasts, labels, detectors, priority/severity and builder unchanged; no runtime dependency added.

Validation environment: Node v24.14.1 / Python 3.13.1 / Playwright 1.64.1 / Google Chrome 158.0.8127.18 (macOS), isolated 1440×1000 and 390×844 sessions. Existing temporary QA installation reused. Server and browser launched through approved tool escalation.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
node tests/regression.cjs
for file in js/*.js js/sections/*.js data/*.js tests/*.cjs; do node --check "$file" || exit; done
python3 - <<'CHECK'
import ast
from pathlib import Path
ast.parse(Path('tools/build_data.py').read_text())
CHECK
git diff --check
git diff --exit-code -- data tools AGENTS.md
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-navigation-qa/new node tests/section-navigation.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-navigation-qa/views node tests/investigation-views.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-navigation-qa/comparison node tests/meter-comparison.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-navigation-qa/navigation node tests/navigation.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-navigation-qa/browser node tests/browser.cjs
```

Results: all six suites/check groups passed, including the new routing suite and all prior browser suites. New coverage verifies native use, skipped/rapid route settlement, single active destination, keyboard focus, unchanged local-control/draft behavior, building event preview/order, full-list scope/back/forward, expanded settings values, mobile, reduced motion and the no-native-API fallback. Navigation opened all 161 event routes with all four detectors/sections. Browser suite verified eight building profiles/four detectors and 175 chart instances (observation, not a fixed criterion); 390px document fit passed. No page/console errors in successful runs. Syntax, AST, unchanged data/tools/instructions and whitespace checks passed.

Initial failures: new test selected an existing hidden Overview link (locator scoped to the visible Buildings section); original browser test checked record removal before asynchronous navigation completed (added explicit detachment wait, retained assertion). Scroll/focus was moved into rendered-route completion during implementation. No assertions or security/integrity checks were disabled. Visual inspection covered anomaly-first building profile and compact/expanded detector tables; screenshots remain temporary under /tmp/derconnect-navigation-qa.

Limits: fallback tested in Chrome with the native API absent, not a second engine. No formal human/accessibility/screen-reader study, real data/model validation, regeneration or deployment. Existing synthetic/hourly/wall-time assumptions and browser-local annotations remain. The full event list remains available beyond the six-event preview. Next: human review of navigation motion and anomaly investigation flows. No associated commit exists.


Final verification: PASS — all six regression/browser suites passed, including native/fallback/reduced-motion navigation, rapid route supersession, building-event scope/history, preserved calibration values, all 161 event routes, four detectors, mobile and existing investigation/comparison/persistence cases. No page/console errors were observed in successful runs. Source/test syntax, Python AST, unchanged data/tools/instructions, documentation-prefix preservation and git diff --check passed. Incremental source/test diff and final status reviewed; building-profile and detector-comparison screenshots inspected. The owned QA server was stopped. No commit, push, merge or deployment was made. Human review remains pending.


## 2026-11-04 — Interactive navigation, visible filters and Overview metric emphasis

- Timezone: America/Los_Angeles. Human: requesting team member, specifying icons, subtle tab feedback, filter visibility, selectable metrics and compact prompt records. AI: OpenAI Codex. Human code/usability review pending.
- Branch `matthew-prototype-feature`, base `f2c921055b9fc1481bd539b6ac1b000b1cb90055`; earlier local work preserved. Starting copies at `/tmp/derconnect-icons-before`. No associated commit, push, merge or deployment.
- Added inline SVG tab/Overview icons, restrained press feedback, responsive sliding active highlight and brief heading emphasis. Clicking a section lands at its filters, accounting for the mobile sticky header. Re-selecting the active tab scrolls back without resetting filters or rerendering. Rapid changes cancel superseded animations; reduced motion disables/cancels motion.
- Overview metrics now support mouse and native Enter/Space selection with `aria-pressed`. One card has an accent border/top stripe, background and value emphasis; selecting it again clears it. Selection survives current-session redraws/navigation and resets on reload. Filters, calculations and event state are unchanged by selecting a metric.
- Files: index.html; css/styles.css; js/app.js; js/sections/overview.js; tests/section-navigation.cjs; tests/browser.cjs; README.md; AI_USE.md; DEVELOPMENT_LOG.md. Earlier files/features retained; no generated data/labels, algorithms, builder, dependencies or architecture changes.

Validation environment: Node v24.14.1 / Python 3.13.1 / Playwright 1.64.1 / Google Chrome 158.0.8127.18 on macOS. Isolated headless desktop 1440×1000 and mobile 390×844; existing temporary QA dependencies reused. Browser execution used approved escalation. Reused the owned local server; an additional start attempt reported port 8000 already occupied.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
node tests/regression.cjs
for file in js/*.js js/sections/*.js data/*.js tests/*.cjs; do node --check "$file" || exit; done
python3 -c "import ast; from pathlib import Path; ast.parse(Path('tools/build_data.py').read_text()); print('Python AST PASS')"
git diff --check
git diff --exit-code -- data tools AGENTS.md
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-icons-qa/final node tests/section-navigation.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-icons-qa/views node tests/investigation-views.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-icons-qa/comparison node tests/meter-comparison.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-icons-qa/navigation node tests/navigation.cjs
NODE_PATH=/tmp/derconnect-browser-qa/node_modules CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SCREENSHOT_DIR=/tmp/derconnect-icons-qa/browser node tests/browser.cjs
```

Results: all six regression/browser suites passed. Section-navigation asserts four tab icons/four Overview icons, active-indicator geometry, actual filter visibility after navigation on desktop/mobile and native/fallback/reduced-motion paths, smooth/same-tab scrolling, rapid routing and reduced-motion suppression. Metric checks cover mouse/Enter/Space toggling, exclusivity, stable values/shared state, retained selection through redraws/navigation and no reduced-motion animation. Existing building-event scope/history, drafts and calibration checks remain. Other suites covered five investigation views, comparison cursors/readouts/missing data/PV separation, all 161 event routes/four detectors/four sections, eight building profiles, persistence, missing labels/context and 390px document fit. Browser suite observed 218 chart/SVG instances, not a fixed acceptance count. No page/console errors in successful runs.

One existing browser test initially read the prior building-list title because its 50ms route wait ended before native transition rendering. Replaced the fixed delay with active-section/render-completion checks, keeping original assertions. Rerunning the browser suite passed. Earlier icons-only runs also passed before later filter/metric requests; final results above cover the full current implementation. No assertion was disabled. Syntax, Python AST, whitespace and unchanged-data/tools/instructions checks passed. Incremental diff/status reviewed; final Overview desktop/mobile screenshots visually inspected under `/tmp/derconnect-icons-qa/final`.

Limits: no formal accessibility/screen-reader/user study, second engine, real-data/model validation, regeneration or deployment. Native fallback tested by disabling its API in Chrome. Existing synthetic/hourly/wall-time/browser-local assumptions remain. Next: human review of metric emphasis and section navigation before a commit.


Final verification: PASS — all six regression/browser suites passed, with no page/console errors in successful runs. Desktop/mobile Overview captures were inspected. Source/test syntax, Python AST, unchanged artifacts, whitespace, previous-record preservation and incremental diff/status checks passed. No commit, push, merge or deployment; human review pending.


## 2026-11-04 — Documentation clarity

Human: requesting team member. AI: OpenAI Codex. Refined wording in `AI_USE.md` and `DEVELOPMENT_LOG.md` to keep prompts and technical records clear. Branch `matthew-prototype-feature`, base `f2c921055b9fc1481bd539b6ac1b000b1cb90055`; existing local work retained. Checks: incremental documentation diff reviewed, targeted text searches completed, `git diff --check` passed. Documentation only; no application tests rerun. Human review pending; no associated commit. Next: review the documentation wording.
