
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
