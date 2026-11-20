# DERCONNECT Unified Dashboard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Building managers and operators are the primary users. They need to find unusual electricity use, examine the supporting evidence, and record review and follow-up. Electrical engineers are the deeper investigation audience, comparing meter behavior, forecast expectations, data quality and contextual evidence.

## Product Purpose

This UC San Diego DSC 180A capstone with Azimuth AI develops a unified, anomaly-focused DERCONNECT electricity dashboard. Its workflow is Detect → Classify → Visualize → Investigate → Interpret. Success means a user can move from a scoped candidate event to its meter readings, expected demand, available context and a recorded next step, while understanding what the evidence supports.

## Positioning

The dashboard brings together a labeled synthetic demonstration, exported Chronos-2 candidate detections from historical DERCONNECT measurements, and optional phase-level historical exports. It keeps their provenance and evidentiary limits distinct within linked overview, investigation and location workflows. It supports investigation; it does not establish that a candidate is a real operational fault.

## Operating Context

The current application has seven destinations: Overview, Anomaly Investigation, Buildings & Sub-grids, Detection Quality, CSV Upload, Export Reports and Historical Monitoring. Users scope evidence by available meters, locations and dates, open event or meter detail links, compare observations and expected power where available, and save operator annotations locally.

Real historical timestamps retain UTC instants with America/Los_Angeles campus display dates. The synthetic fixture uses a separate wall-time-as-UTC convention; it must not become the real-data time contract. Historical presets refer to loaded data dates, not live activity.

Serve the repository with `python3 -m http.server 8000 --bind 127.0.0.1`. The existing implementation uses plain HTML, CSS, classic JavaScript and custom SVG, with committed local assets and no build step. Preserve this architecture and script dependency order unless a future task explicitly scopes a justified change.

## Capabilities and Constraints

- Synthetic Overview, investigation, building analysis and Detection Quality use the shared store, fixed taxonomy and available fixture forecasts, events and evaluation labels. Development and held-out test evidence have separate roles; test labels must not influence detection, calibration, classification or priority.
- Real Overview, Investigation and meter profiles share the loaded Chronos-2 bundle and exported candidate events. Scores, thresholds, flags, interpolation and provenance remain inspectable. Exported direction and duration are descriptive evidence, not confirmed anomaly classifications.
- Optional historical phase exports support validated loading, monthly stitching, comparisons and explicit gap/conflict reporting. Phase-level data must not inherit model forecasts or events without an agreed mapping and compatible contract.
- CSV Upload validates and plots a meter file in the browser. It does not run an anomaly detector or create labels, forecast expectations or building mappings.
- Export Reports generates scoped PDFs from the existing synthetic reporting path. Do not imply that every data source supports reports.
- Academic-calendar overlays supply possible operational context where calendar coverage exists. They do not alter detection, establish causality or prove a facilities schedule.
- Real operator statuses are Not reviewed, In review, Follow-up needed and Reviewed. Saved annotations are browser-local and separate from measurements, model outputs and ground truth. There is no shared review backend or engineer-confirmation guarantee.
- Uploaded measurement data remains in session memory; reload requires reloading local exports. Browser-local annotations and theme preferences have separate persistence rules. Configured same-origin bundle loading is distinct from a user uploading a file.
- Missing labels, forecasts, weather, occupancy, PV, mappings or other context need explicit unavailable states. Never fabricate them or replace absent real measurements with synthetic values.
- Distinguish normalized novelty, operational priority, severity, measured power, data quality and review status. Scores are not probabilities of faults. Show source-reported units and scope; a meter or phase is not automatically a whole building or campus total.
- Preserve semantic navigation, deep links, keyboard access, reduced-motion support, readable light/dark themes, and anomaly type symbols and severity labels alongside color. These are existing constraints, not a claim of verified accessibility conformance.

## Brand Commitments

Use the existing DERCONNECT product name and UC San Diego/Azimuth AI capstone context. Copy should make the data source, scope, uncertainty and available actions clear. Explanations remain hypotheses until supported by independent facilities evidence; a saved dropdown choice alone is not confirmation.

## Evidence on Hand

- `data/derconnect-data.js` and `data/synthetic-labels.js`: generated synthetic measurements, detector outputs and separate evaluation labels. Real UCSD demonstration building names do not establish actual DERCONNECT coverage or meter relationships.
- `data/anomaly/chronos2-ft-5k/`: a committed historical hourly model-output bundle and its README. The current adapter supports its specific CSV contract; broader model compatibility must be agreed and validated rather than assumed.
- `data/campus-calendar.js`: sourced academic-calendar context with bounded date coverage. Extend and verify coverage before applying it to a different period.
- `tools/building_metadata.json`: replaceable demonstration names and official name sources.
- `README.md`, `DEVELOPMENT_LOG.md`, `AI_USE.md`, implementation files and `tests/`: workflow documentation, recorded limitations and existing regression checks. Documentation claims require checking against current code.

No ground-truth fault labels for the real bundle, independent facilities diagnoses, live telemetry service, unpublished requirements document, external trained weights or upstream run directories are established as available. Synthetic performance and forecast coverage do not establish real-world fault-detection accuracy. Do not regenerate committed data, train models or expose private measurements as part of a design task.

## Product Principles

1. Make the path from a candidate to evidence and follow-up direct.
2. Keep source, scope, time basis, units and data quality explicit.
3. Separate model outputs, explanatory hypotheses, evaluation truth and operator review.
4. Preserve useful investigation detail while keeping the primary task understandable to operators.
5. Treat missing evidence as unavailable and preserve the limits of every claim.

## Open Decisions

Specific accessibility conformance targets and assistive-technology acceptance criteria remain unconfirmed. Production deployment, multi-user review and future real-data adapters require separately scoped decisions; they are not commitments of this product record.
