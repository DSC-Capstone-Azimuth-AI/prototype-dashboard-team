
# AI-use record

Append new records without deleting or replacing existing entries. Record complete prompts as supplied; do not invent or reconstruct earlier prompts. No historical prompts were reconstructed during onboarding. The file contained only a newline at the audited base commit; that newline was preserved.

## Reusable task template

```text
Date/time and timezone:
Task title / issue / PR:
Human contributor(s):
AI tool / model (only if known):
Branch and base revision:
Complete prompt(s): [verbatim, one fenced block per prompt; include follow-up instructions]
AI contributions:
Human contributions, decisions and review:
Changed files:
Testing commands, inputs and outcomes:
Limitations / unrun checks:
Associated commit(s): [pending until committed; add exact hashes later]
```

Do not put credentials or private measurements here. Distinguish human review that actually occurred from review still pending. For tool checks, state what was executed and what passed, failed or was not run.

## 2026-11-03 — Repository onboarding

- Date timezone: America/Los_Angeles.
- Human contributor: requesting UC San Diego DSC 180A team member (name not supplied).
- AI tool: OpenAI Codex; exact model version not recorded.
- Branch: `docs/repository-onboarding`; base `e4bc545f7dfb0f9b7338fd07096f145d989a80d7`.
- Associated commits: none created; documentation changes remain uncommitted. No push made.

### Complete task prompt (verbatim)

```text
# DSC 180A — Unified DERCONNECT Dashboard: Repository Onboarding

You are working in the GitHub repository `DSC-Capstone-Azimuth-AI/prototype-dashboard-team`.

This is our UC San Diego DSC 180A capstone project with Azimuth AI. We are developing a unified, anomaly-focused DERCONNECT electricity monitoring dashboard.

Our Quarter 1 checkpoint is due Friday, November 6, 2026.

## Current context

A teammate has pushed the initial dashboard skeleton. The project uses plain HTML, CSS, JavaScript, custom SVG visualizations, and a Python synthetic-data generation pipeline.

Do not migrate the application to Streamlit, React, or another framework. Preserve the existing architecture unless a change is clearly justified.

Our long-term priority is integrating the dashboard with the SarSim synthetic-data group, the Chronos-2 anomaly detection group, and eventually real DERCONNECT measurements.

## Task 1: Audit the existing repository

Inspect the entire repository, including:

- README.md
- index.html
- css/
- js/
- js/sections/
- data/
- tools/build_data.py
- AI_USE.md

Identify:

1. The current architecture and data flow.
2. Which dashboard features are implemented and which are incomplete.
3. Whether the visualizations use consistent shared data and state.
4. How the Python data pipeline connects to the anomaly team's code.
5. Whether the generated data format can be adapted to real DERCONNECT measurements.
6. Potential bugs, hardcoded assumptions, or integration risks.
7. Which functionality can be tested automatically.

Distinguish implemented functionality from claims in the README.

Run available non-destructive checks where feasible, and report the results.

## Task 2: Establish persistent project documentation

Create `AGENTS.md` containing repository-specific instructions for all future AI coding agents.

It should cover:

- The project's research objectives.
- Existing HTML/CSS/JavaScript architecture.
- Data schemas and integration boundaries.
- Collaboration conventions for five contributors.
- Code quality and reproducibility.
- Testing requirements.
- Preserving other contributors' work.
- Required AI-use documentation.

Create `DEVELOPMENT_LOG.md` as a shared chronological development record with a reusable template for contributors, changed files, decisions, testing, and next steps.

Update the existing `AI_USE.md` with a clear template for recording complete prompts, AI contributions, human contributions, testing, and associated commits.

For this task, record this exact prompt in `AI_USE.md` as an AI-assisted development task.

Do not invent or reconstruct earlier prompts. Do not overwrite existing entries.

## Task 3: Evaluate integration readiness

The anomaly team's repository is:

`DSC-Capstone-Azimuth-AI/chronos2-sarsim0-anomaly-team`

Their pipeline includes synthetic anomaly injection, forecasting, anomaly scoring, event grouping, and evaluation.

Our dashboard must eventually consume their outputs and real DERCONNECT measurements without requiring major visualization changes.

Evaluate whether the current data layer accomplishes this.

Identify the specific contracts that must be agreed upon, particularly:

- Time indices versus timestamps.
- Meter and building identifiers.
- Measurement units and sampling intervals.
- Forecast quantiles.
- Anomaly scores and thresholds.
- Detected event intervals.
- Ground-truth labels versus predictions.
- Anomaly classification and severity.

Do not assume access to external generated artifacts that are not present in the repository.

## Task 4: Recommend next steps

After auditing, produce:

1. A summary of the existing implementation.
2. A prioritized list of bugs and architectural risks.
3. A minimal checkpoint-readiness checklist for November 6.
4. Suggested independent tasks that five contributors can implement without major merge conflicts.
5. Specific recommendations for my contribution to anomaly investigation and integration.

## Important constraints

- Do not rewrite or redesign the existing dashboard.
- Do not make unrelated code changes.
- Do not commit or push directly to main.
- Make documentation changes on a separate feature branch, if branch creation is available.
- Preserve existing contributor work.
- Never claim a feature or test works without checking it.
- Clearly identify any assumptions.

Start with the audit. Implement only the three documentation files and report any further code improvements as recommendations for separate tasks.
```

### Contributions and evidence

**AI contributions:** Audited all tracked dashboard files and the current upstream anomaly source; created the documentation branch; wrote AGENTS.md and DEVELOPMENT_LOG.md; appended this template and exact task prompt. Identified implemented features, README overclaims, confirmed bugs, integration contracts, a November 6 checklist and five independent contributor scopes. Kept proposed application fixes separate from documentation changes.

**Human contributions:** Supplied the project objectives, architecture constraints, team size, deadline, repository identities and task prompt. Existing dashboard implementation belongs to its contributors; no authorship was reassigned. No subsequent human code review or acceptance is claimed.

**Changed files:** AGENTS.md, DEVELOPMENT_LOG.md and AI_USE.md only. Source, tests, generated data, README and dependency files were not modified. The upstream audit checkout and generated validation output were under `/tmp`, outside the dashboard checkout.

**Testing:** Node v24.22.1 syntax checks on all 11 JS files and Python 3.12.14 AST parsing passed. Temporary data validation passed 78,691 assertions. Builder execution against upstream `b83acda9caa3c896ca198f65c94e9625c03568b7` completed for all four baselines, writing to `/tmp`; data matched semantically except build timestamp, and labels/matches matched ignoring JSON key order. Playwright/system Chromium rendered four sections and all four detector choices without observed page/console errors; gallery, normalized mode, local status/theme persistence and custom dates were checked. Git diff/whitespace and documentation-only scope checks passed. See DEVELOPMENT_LOG.md for commands, detailed findings and limits.

**Failures found, left unchanged:** Investigation selection can remain outside active building filters; selecting a log record does not update its event hash; six event records pair peak measurements with a different peak timestamp. Other source-level risks include filter exceptions, hourly/timezone assumptions and missing evaluation/context handling.

**Unrun / unavailable:** No committed dashboard test suite exists. Full upstream tests, actual Chronos/GPU inference, external generated runs, real DERCONNECT measurements, deployment, full accessibility review and offline file-mode operation were not validated. Temporary scripts are audit aids, not permanent tests. Human review, associated commits and implementation tasks remain pending.

## 2026-11-03 — Commit and push onboarding documentation

Complete follow-up prompt (verbatim):

```text
Please commit and push the documentation changes from the repository onboarding task.

1. Confirm we're on the `docs/repository-onboarding` branch.
2. Run `git status` and verify that only `AGENTS.md`, `DEVELOPMENT_LOG.md`, and `AI_USE.md` have changed.
3. Review the staged diff to ensure there are no unrelated modifications or sensitive information.
4. Stage only those three files.
5. Commit with the message: `docs: add agent instructions, development log, and AI use documentation`
6. Push the branch to `origin/docs/repository-onboarding`.

Do not push directly to `main` or modify any application code.

After pushing, provide the branch URL and explain how to open a pull request into `main`
```

Human contribution: explicitly authorized committing and pushing this documentation branch; substantive audit acceptance is not inferred. AI contribution: branch/scope verification, documentation diff review, staging only the three authorized files, and Git commit/push execution. Validation: verify staged paths and whitespace before committing, then inspect commit contents and remote branch identity. No application tests are required for this documentation-only follow-up. Associated commit: the commit containing this entry, with the requested message `docs: add agent instructions, development log, and AI use documentation`; exact resulting hash and push outcome will be reported in chat. Earlier uncommitted/no-push statements describe the preceding audit phase.

## 2026-11-03 — UCSD labels and operator investigation

- Timezone: America/Los_Angeles. Human: requesting contributor (name not supplied). AI: OpenAI Codex.
- Branch: feature/building-investigation; base: 30cfbfb (documentation onboarding retained).
- Complete prompt from uploaded Pasted text.txt, verbatim:

```text
# Feature: Realistic UCSD Building Navigation and Human-in-the-Loop Anomaly Investigation

You are a senior full-stack engineer, data scientist, and research collaborator working on our UC San Diego DSC 180A capstone project with Azimuth AI.

Repository: `DSC-Capstone-Azimuth-AI/prototype-dashboard-team`

Our dashboard is designed for building managers, facility operators, and electrical engineers to investigate abnormal electricity behavior using synthetic data, with future integration planned for real DERCONNECT measurements and the anomaly detection team's Chronos-2/SarSim0 pipeline.

**Your objective is to implement two closely related improvements:**

1. Replace fictional building labels with verified UC San Diego building names in the synthetic dashboard prototype.
2. Significantly improve the Anomaly Investigation page so building operators can understand, evaluate, and review individual detected anomalies.

Preserve the existing HTML, CSS, JavaScript, SVG, and Python architecture. Do not migrate frameworks or redesign the entire dashboard.

## 1. Start with repository context

Before making changes:

- Read `AGENTS.md`, `README.md`, `DEVELOPMENT_LOG.md`, and `AI_USE.md`.
- Inspect the current data generator in `tools/build_data.py`.
- Inspect `js/sections/investigate.js`, `js/store.js`, shared chart utilities, and relevant UI components.
- Review existing synthetic building metadata, meter identifiers, event schemas, and investigation-status handling.
- Confirm which functionality is already implemented and avoid duplicating it.
- Check for existing work on other branches that should be preserved.

Work on a new feature branch, such as `feature/building-investigation`.

Do not push directly to `main`.

## 2. Real UCSD building names with synthetic measurements

DERCONNECT's official testbed capabilities page states that the infrastructure includes 24 building meters collecting data every 2 seconds and 236 submeters.

Source: https://derconnect.ucsd.edu/testers/capabilities

We want our prototype to reflect this real-world setting while clearly communicating that our electricity measurements and anomaly events are simulated.

### Requirements

- First inspect the repository for any existing verified UCSD or DERCONNECT building names.
- If an authoritative list of DERCONNECT's 24 metered buildings is available, use it and preserve source references.
- Otherwise, use verified real UCSD building names as demonstration labels, but do not claim they are among DERCONNECT's 24 metered buildings without evidence.
- Do not invent building names, real meter IDs, building-to-meter relationships, or DERCONNECT coverage.
- Preserve existing synthetic internal identifiers where possible so event relationships and permalinks remain stable.
- Keep display names separate from canonical building IDs.
- Ensure that building names propagate consistently throughout the dashboard: dropdowns, overview, building analysis, anomaly queue, event gallery, and detail records.
- Clearly label the dataset as simulated.
- Do not populate 24 buildings with arbitrary additional simulated events merely to meet the target count.
- If we choose to represent 24 buildings, distinguish buildings with generated example readings from buildings with metadata-only placeholders. The latter should show "No simulated measurements available" rather than zero anomalies or fabricated healthy status.
- Make the building metadata independently replaceable when official DERCONNECT identifiers become available.

The purpose is to make the dashboard more geographically recognizable without sacrificing scientific integrity or integration compatibility.

## 3. Improve the Anomaly Investigation page

### Primary user story

A building operator notices that a particular building has been flagged for unusual electricity consumption.

They open the Anomaly Investigation page and want to understand:

- What abnormal behavior was detected?
- Which building and meter were affected?
- When did it begin, and how long did it last?
- How far did electricity demand deviate from expected behavior?
- Was this an isolated spike or a sustained abnormal pattern?
- What evidence caused the detection algorithm to flag the event?
- Could weather, occupancy, operating schedules, or meter problems explain it?
- How confident should the operator be in the finding?
- Does the event require investigation, or can it be dismissed as expected behavior?

Build the interface around answering these questions, not merely displaying charts.

### A. Improve event selection and navigation

The existing dashboard has an anomaly event queue and a gallery.

Preserve both interfaces, but ensure:

- Selecting any event opens the correct detailed investigation record.
- The selected event remains consistent with active building, meter, date, type, and severity filters.
- If a filter excludes the selected event, clear the selection or explicitly indicate that it is outside the current filter scope.
- Event selection updates the URL permalink.
- Browser navigation and deep links select the correct event.
- Every event record consistently refers to the same meter, time interval, and detector.

Use the previously identified Engineering-versus-Library filter inconsistency and `CR-030` regression example if they are still relevant.

### B. Create an operator-focused anomaly summary

When an event is selected, display a clear summary with:

**Location**
- Building name
- Meter or equipment
- Associated sub-grid, if known

**Timing**
- Start timestamp
- End timestamp
- Duration in minutes or hours
- Detection time or delay, only when supported by actual data

**Magnitude**
- Peak observed measurement
- Expected measurement at the corresponding timestamp
- Absolute deviation
- Percentage deviation, when the baseline is nonzero and meaningful
- Estimated excess energy (kWh), only when measurements and sampling intervals support a valid calculation

**Classification**
- Detected anomaly type, if available
- Temporal behavior (point, collective, contextual, or pattern-wise)
- Operational category, if supported
- Priority or severity score
- Investigation status

Use appropriate units and explicitly show when a measurement is normalized or unitless.

Never invent physical units, fault causes, or confidence percentages.

### C. Improve the anomaly time-series visualization

The detailed anomaly plot should make the event easy to interpret.

Include, where supported:

- Actual observed measurement
- Expected demand or forecasting baseline
- Forecast uncertainty or quantile bands
- Highlighted anomaly points or intervals
- Visible start/end boundaries
- A marker for the actual peak deviation
- A before/during/after inspection window
- Hover details with values, timestamps, scores, and relevant thresholds

Verify that peak timestamps and values are internally consistent.

Previously, the repository audit identified six event records in which the peak measurement and reported peak timestamp disagreed. Investigate and correct the underlying issue rather than merely changing displayed labels.

Preserve the existing SVG chart system unless a compelling technical limitation is demonstrated.

### D. Add educational anomaly explanations

Building operators may not be familiar with time-series anomaly detection terminology.

Add concise, plain-language explanations for different anomaly behaviors.

Ground the taxonomy in the research literature provided below.

**Point anomaly**
An isolated observation differs substantially from expected behavior.

Example: An unusually large demand spike lasting one sample.

**Collective anomaly**
A sustained sequence of observations is unusual even when individual readings are not extreme.

Example: Unexpectedly elevated electricity demand for several hours.

**Contextual anomaly**
A measurement becomes unusual when compared against relevant context.

Example: Electricity demand is normal for an occupied afternoon but unexpectedly high overnight.

**Seasonal or pattern anomaly**
The load pattern differs from expected recurring behavior.

Example: A building that normally reduces demand on weekends instead maintains weekday-level usage.

**Trend or level-shift anomaly**
Demand changes systematically or shifts to a persistently different level.

Example: A gradual increase in overnight baseline consumption.

**Data integrity anomaly**
Readings are missing, stuck, or otherwise suspicious.

Example: A meter reports exactly the same value for an unusually long interval.

Keep the distinction between temporal anomaly behavior and operational issue categories.

Do not imply that a detected statistical anomaly necessarily indicates equipment failure, energy theft, or a cyberattack.

### E. Add a "Why was this flagged?" evidence panel

This should be one of the most important improvements.

For every selected event, explain what evidence the detection pipeline actually used.

Where available, show:

- Detection model
- Forecast or baseline method
- Observed measurement
- Expected measurement
- Forecast residual
- Anomaly score
- Detection threshold
- Whether the score exceeded the threshold
- Detection period and duration
- Weather or occupancy context

The explanation should be generated from actual event data, not generic AI-written speculation.

For example, an explanation might state that observed consumption exceeded the expected forecast during the detected interval and that the anomaly score crossed the configured threshold.

Do not manufacture a causal explanation.

### F. Model confidence and evidence transparency

A central design goal is helping building operators evaluate possible false positives.

Display an interpretable evidence indicator using available detection outputs.

However:

- Do not treat an anomaly score as a calibrated probability.
- Do not label a score of 0.92 as "92% confidence" unless calibration supports that interpretation.
- Distinguish anomaly score, threshold exceedance, operational priority, and prediction uncertainty.
- If appropriate, display score relative to threshold as a detection-strength indicator.
- When multiple detectors are available, allow operators to compare whether different methods flagged the same event.
- Do not assume detector agreement means the event is a confirmed fault.
- When ground-truth labels are unavailable, display "Not evaluated" rather than "False positive."

If calibrated probabilities are unavailable, prefer labels such as "Detection strength" or "Evidence summary" over "Model confidence."

### G. Human-in-the-loop anomaly review

We want building operators to investigate events rather than blindly accept every model prediction.

Improve the existing investigation-status functionality to support a review workflow.

Suggested review states:

- Unreviewed
- Investigating
- Confirmed operational issue
- Expected or explained behavior
- False alarm
- Insufficient evidence

Allow an operator to select a review status and optionally add a brief note.

Separate model detection results from human review decisions. An operator's choice is a review annotation, not independently verified ground truth.

Preserve review status locally if the application has no backend. Clearly disclose that the status is browser-local and does not synchronize across users.

Do not imply that changing an event's review status retrains or calibrates the anomaly detection model.

For synthetic data, separately stored injected labels may be available for research evaluation. These labels must not leak into operator-facing classification or confidence calculations.

### H. False positives, false negatives, and operational tradeoffs

Our project emphasizes detecting potentially important anomalies rather than missing them.

However, the appropriate balance between recall and false-alert burden depends on the operational consequences.

The dashboard should support investigation of uncertain events without implying that maximizing sensitivity is always optimal.

Where supported by available data:

- Explain that higher sensitivity can identify more possible issues but may generate more false alarms.
- Display detector thresholds transparently.
- Allow comparison of detectors and their alert patterns.
- Clearly separate actual false positives measured using labeled datasets from operator-dismissed events.
- Do not calculate recall, false-negative rates, or precision from unlabeled real-world events.

Do not add threshold-adjustment controls unless they can be implemented consistently with the detection pipeline and evaluated appropriately.

## 4. Research grounding

Use the following papers to inform terminology and explanation design:

**Guato Burgos et al. (2024) — A Review of Smart Grid Anomaly Detection Approaches Pertaining to Artificial Intelligence**

https://doi.org/10.3390/app14031194

Relevant concepts:
- Smart-grid anomaly detection
- Point, contextual, and collective anomalies
- Abnormal consumption and measurement behavior
- Distinguishing abnormal electrical measurements from cybersecurity-related anomalies

**Lai et al. (2021) — Revisiting Time Series Outlier Detection: Definitions and Benchmarks**

https://proceedings.neurips.cc/paper/2021

Relevant concepts:
- Point-wise versus pattern-wise anomalies
- Contextual anomalies
- Shapelet, seasonal, and trend outliers
- Synthetic anomalies and evaluation

**Si et al. — TimeSeriesBench: An Industrial-Grade Benchmark for Time Series Anomaly Detection Models**

https://arxiv.org/abs/2402.10802

Relevant concepts:
- Event-level anomaly detection
- False-positive burden
- Detection delay
- Precision/recall tradeoffs
- Operationally meaningful evaluation

Use accurate and appropriately attributed terminology. These sources inform the design but do not establish that any simulated event is a real electrical fault.

## 5. Maintain upstream integration compatibility

Do not modify the anomaly team's source repository.

Preserve a clean separation between:

1. Synthetic measurements.
2. Forecast and detector outputs.
3. Synthetic ground-truth labels.
4. Dashboard-derived event summaries.
5. Human investigation annotations.

The dashboard must remain compatible with different anomaly detectors and eventual DERCONNECT measurements.

Avoid tightly coupling visualization components to specific synthetic generator assumptions, hardcoded building indices, or a single detector.

Document any remaining integration limitations.

## 6. Testing and acceptance criteria

Before declaring the feature complete, verify:

1. Every available building can be selected consistently across relevant dashboard views.
2. Building display names do not corrupt meter or event identifiers.
3. All synthetic content is clearly labeled as simulated.
4. Selecting an event from either the queue or gallery opens the same underlying record.
5. Filtering buildings never leaves a contradictory selected event visible.
6. Event permalinks reflect the selected event and work after reload.
7. Start/end timestamps, durations, peak values, and peak times are internally consistent.
8. Anomaly types have understandable descriptions.
9. Scores and thresholds are not represented as probabilities without calibration.
10. Events without ground truth are not automatically called false positives.
11. Human review statuses and notes persist according to the application's stated limitations.
12. All existing dashboard sections still render.
13. No unrelated functionality is broken.

Add appropriate regression tests, particularly for event selection, filtering, and peak timestamp consistency.

Run the available tests and report the actual results.

## 7. AI documentation and contributions

Follow `AGENTS.md`.

Update:

**AI_USE.md**
- Record this exact prompt.
- Identify the AI-assisted implementation.
- Record verification and human review accurately.
- Do not fabricate previous prompts.

**DEVELOPMENT_LOG.md**
- Summarize work completed.
- List files changed.
- Record architectural decisions.
- List limitations and next steps.

Keep the README consistent with implemented functionality.

## 8. Execution priorities

The checkpoint is Friday, November 6.

Prioritize implementation in this order:

1. Preserve existing architecture and correctly integrate verified building names.
2. Fix event filtering, permalinks, and inconsistent peak facts.
3. Improve the selected anomaly summary and detailed visualization.
4. Add evidence-based anomaly explanations and detection transparency.
5. Improve human review statuses and optional notes.
6. Add tests and update documentation.

If the full scope cannot be implemented reliably, prioritize a smaller complete vertical slice over incomplete features.

Do not perform an unrelated redesign.

## 9. Final deliverables

After implementation, provide:

- Summary of completed features.
- Files changed.
- Sources used for building names.
- Exact tests run and their results.
- Screenshots or browser verification if available.
- Remaining limitations.
- Confirmation that documentation was updated.
- Suggested commit message and pull request description.

Do not commit, push, or merge unless explicitly instructed.

Begin by inspecting the existing implementation and identifying the smallest safe set of changes. Then implement and validate the feature.
```

AI contributions: inspected guidance, history and implementation; implemented catalog, builder peak fields, shared selection/routing, operator facts/evidence, taxonomy, detector overlap, local reviews/notes and regression suites. Updated README and development log. Human supplied objectives and constraints; implementation review remains pending. No commit, push or merge performed. Consult DEVELOPMENT_LOG.md for changed files, exact commands, final results and limitations.

Changed files: tools/building_metadata.json, tools/build_data.py, data/derconnect-data.js, js/store.js, js/app.js, js/util.js, js/ui.js, js/charts.js, js/sections/investigate.js, css/styles.css, tests/regression.cjs, tests/browser.cjs, README.md, DEVELOPMENT_LOG.md, AGENTS.md and AI_USE.md. Final verification: both regression suites passed; browser checked 352 charts with no page/console errors and 390px viewport/document width. Two full builder runs passed, with final semantic output comparison preserving readings, event IDs, detector outputs and evaluation. JS syntax, Python AST and git whitespace checks passed. Human review remains pending; no commits exist for this task.

## 2026-11-03 — Prepare and push building investigation feature

Complete follow-up prompt (verbatim):

```text
The implementation and validation results look good. Please prepare these changes for a GitHub pull request.

1. Confirm we're on `feature/building-investigation`.
2. Run `git status` and review the changes for unrelated modifications or sensitive information.
3. Verify that `AI_USE.md` contains my complete original implementation prompt and `DEVELOPMENT_LOG.md` accurately records the work.
4. Stage the files associated with this feature.
5. Commit with the message: `feat: add sourced UCSD labels and evidence-based anomaly investigation`
6. Push the branch to `origin/feature/building-investigation`.

Do not merge into main.

After pushing, provide the GitHub branch URL and the pull request link if one was created
```

Human contribution: accepted the reported implementation/validation results and explicitly authorized staging, committing and pushing this feature branch; a separate line-by-line code review is not inferred. AI contribution: branch/status and scope review, original prompt verification, sensitive-information review, repeat regression/syntax/whitespace checks, and the authorized commit/push workflow. Original implementation prompt was compared against the uploaded file and is present verbatim. No main-branch merge authorized or performed. Associated commit: the commit containing this entry, with message `feat: add sourced UCSD labels and evidence-based anomaly investigation`; exact hash and push outcome will be reported in chat after execution. Earlier uncommitted/no-push entries describe the implementation phase.
