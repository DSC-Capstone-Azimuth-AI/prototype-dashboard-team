# Export Reports: first-use walkthrough and instructional notes

Date: November 4, 2026 (America/Los_Angeles). Reviewer: OpenAI Codex, acting through the live browser controls as a first-time user. Branch: Ryan; base c71b221 plus the existing uncommitted Export Reports work. This is a heuristic walkthrough by the implementation assistant, not an independent human usability study. No application code was changed during this review.

## Scope and method

Used the live local site at http://127.0.0.1:8001/#export. Tried the default snapshot, anomaly selection, Jacobs Hall PV, detector changes, empty-state recovery, building changes, custom dates, report-type switching, latest-available data and an actual PDF download. Used visible controls and preview content to assess the workflow. Did not edit reviews/notes, upload files or run detectors. This review focused on Export Reports, not an exhaustive dashboard or accessibility audit. Narrow-screen behavior was covered in earlier automated checks, not repeated in this walkthrough.

The existing browser tab initially displayed an older four-tab interface despite its #export URL. Reloading showed the current six-tab interface. This is an observed stale-session issue; its cache/root cause was not investigated. Mention refresh when local development changes do not appear.

## Historical observations (see resolution status below)

| Priority | Observation and reproduction | Likely first-time interpretation | Instruction or follow-up |
|---|---|---|---|
| High — bug | Select Anomaly report → Jacobs Hall → Jacobs Hall PV, then change Building to Center Hall. Meter becomes blank and the event list has no matches. | Center Hall has no events, or the export feature is broken. | Reset Meter to All meters after changing buildings. Fix the dependent-meter state in a separate task; a blurb cannot fully solve this. |
| High — misleading label | Select General snapshot → Today, then Use latest available data. The selector still says Today while the preview reports November 1, 2026. | The latest historical day is today's date. | Always verify Requested coverage. Recommend visibly labeling latest-data mode/date; current button changes the date anchor without updating the preset wording. |
| High — missing conceptual explanation | Jacobs Hall PV has three Context-aware regression IDs, but switching to Rolling median / MAD yields no matches. | The PV readings disappeared, or every detector should have the same anomaly IDs. | Explain that Detector selects a separate set of detections, not a display style. Empty results do not establish normal operation. |
| Medium | On first load, General snapshot defaults to Today with a disabled download and no reportable data. | Nothing is working. | Explain upfront that the demonstration ends November 1, 2026; use latest available data or a custom historical range. |
| Medium | Broadening Building to All buildings leaves the chosen Jacobs Hall PV meter active; Rolling Median remains empty until Meter is also set to All meters. | All buildings should clear every location restriction. | Explain that filters combine. For recovery, set both Building and Meter to All, and dates to All available dates. |
| Medium | Switching report types retains building/detector and some date selections. Selecting Anomaly report resets the date preset to All available dates. | A new report starts fresh, or all fields stay unchanged. | Recheck every scope field after changing report type. Recommend consistent/resettable scope behavior in a later change. |
| Medium | Anomaly custom dates filter the list, while the resulting preview reports the complete selected event interval. For example, Center Hall on October 1 yields RM-006, 11:00–15:00. | Custom range trims the anomaly PDF to the requested dates. | Say explicitly that an anomaly PDF covers the whole detected event. Building/snapshot dates instead define the summary period. |
| Medium | Meter names appear as Jacobs Hall and Jacobs Hall · PV. Main-meter choice does not explicitly say Main. | They are duplicate building choices; PV is unfamiliar. | Define PV as the solar-generation meter, and distinguish it from the main building-demand meter. Recommend explicit Main/PV labels. |
| Medium | The chooser uses IDs such as CR-012, ENG-PV and date strings without a short description of the anomaly. | Users must already know the technical ID. | Choose building/meter first, then confirm ID, time and classification in the preview. Consider adding a short category to each option later. |
| Medium | The preview opens many detailed tables, including raw JSON metadata/settings; status uses values such as new and classification uses internal codes. | All technical fields must be understood before download. | Tell users to first verify Scope, coverage and selected event. Put raw settings/provenance in advanced disclosures or a research appendix in a later change. |
| Medium | Preview chart has axes but no obvious measured/expected text legend; the PDF chart does have a legend. The preview is content-oriented, not a page-for-page PDF rendering. | Users may confuse the lines or expect identical pagination. | Explain measured versus predicted demand and that the preview checks content/scope, not exact PDF layout. A visible legend would be preferable. |
| Medium | Include saved operator notes and Include synthetic ground-truth research appendix require domain knowledge. | Notes are shared team records, or ground truth means verified field diagnosis. | Explain notes are this browser's saved notes. Leave research labels off for routine reports; they are injected simulation labels, not confirmed faults. |
| Low | Terms include finite hours, OK signed kWh subtotal, novelty, end exclusive and provenance. | Finite means a quality-approved reading; positive subtotal means waste; novelty is confidence. | Define finite as a numeric reading; OK as passing fixture quality flags. Energy is a signed hourly subtotal, not savings/waste. Novelty is not probability. End-exclusive means the final timestamp is outside the interval. |
| Low | Use latest available data remains visible under All available dates, where it does not materially expand the selection. | A new dataset will be fetched. | Explain the button only changes dates within the already loaded fixture; it does not fetch readings or rerun detectors. |

## Verified event examples for instruction

Observed through the current interface:

- Anomaly report → All available dates → Jacobs Hall → Jacobs Hall PV → Context-aware regression gives CR-012, CR-021 and CR-024.
- The same meter with Rolling median / MAD gives no matching events.
- Rolling median / MAD → All buildings → All meters → All available dates gives 25 choices.
- Center Hall → All meters → Rolling median / MAD → Custom range October 1–October 1 gives RM-006.
- Anomaly report CR-012 shows September 29, 2026, 10:00–12:00, end exclusive. Download PDF completed and saved DERCONNECT-anomaly-CR-012-2026-09-29-2026-09-29.pdf in the browser Downloads folder. No notes or research-label checkboxes were enabled for that download. This walkthrough verified download completion; it did not repeat the earlier PDF visual/text audit.

## Updated instructional blurb

Open **Need Help?** for a step-by-step guide and optional glossary. Choose Anomaly, Building or General snapshot, then check the building, detector and dates. For an anomaly, start with **All available dates**, choose Main demand or Solar generation (PV), and select an ID/category. Detectors produce different event lists. If none match, broaden the building, meter and dates or try another detector; an empty list does not establish normal operation.

Choose **Custom range** to show dates. Summary dates include both days. Anomaly dates find overlapping events, while the report covers the complete selected event. **Use latest available data** explicitly switches to a labeled historical window ending at the dataset's final day. The page shows this date dynamically. Date settings are restored separately for each report type; building and detector carry over where compatible, with resets announced.

Check the compact scope summary, actual coverage and measured/predicted chart legend. Technical disclosures start closed but remain in the PDF. Include saved notes only when wanted; leave synthetic research labels off for routine reports. Choose **Download PDF**, then check browser Downloads. These are synthetic demonstration reports, excluding CSV uploads; local notes/status and explanatory hypotheses are not verified fault diagnoses.

## Suggested order before publishing the blurb

1. Fix invalid meter selection after a building change.
2. Make latest-data mode visibly distinct from Today.
3. Explain detector-specific event lists near the chooser; label Main versus PV clearly.
4. Shorten the top-level preview and add a chart legend.
5. Revisit the blurb after those changes so it teaches intended behavior instead of permanent workarounds.

No fixes in this review. Human usability review and decisions on these suggestions remain pending. Existing implementation and documentation changes were preserved; no commit/push/PR was created.


## Resolution status — November 4, 2026

| Finding | Current status |
|---|---|
| Blank meter after changing buildings | Resolved: incompatible meter resets to All meters; compatible selections are retained and reset is announced. Regression covers Jacobs Hall PV → Center Hall. |
| Today label after historical latest action | Resolved: latest window has an explicit label/anchor and visible selected dates; redundant latest action is hidden. |
| Detector-specific lists / empty-state interpretation | Addressed: detector hint, scoped empty message, recovery guidance and no-normality caveat. |
| Historical fixture / initially empty Today | Explained in Need Help? with dataset-derived coverage; initial Today remains deliberate. |
| All buildings retains a meter restriction | Deliberate and explained visibly; not silently cleared. |
| Report-type date switching | Resolved: dates remembered separately per type; compatible building/detector retained, required resets announced. |
| Anomaly dates select complete overlapping events | Deliberate and explained beside dates and in help. |
| Main versus PV / technical IDs | Addressed: explicit meter labels and readable category in event options. IDs remain for traceability. Native select text can truncate at narrow widths; scope summary confirms selected ID/building. |
| Technical preview overload | Addressed: compact scope summary, readable preview taxonomy/status labels, collapsed settings/provenance. Original report/PDF evidence remains intact. |
| Chart legend / preview pagination | Addressed: visible measured/predicted legend and explicit content-preview description. |
| Notes, ground truth and jargon | Addressed: collapsed native Need Help? and optional glossary. Research appendix remains opt-in. |
| Latest-data action under All available dates | Resolved: action hidden for all-dates and already latest-anchored windows. |
| Stale local-development tab | Still an environment observation; refresh if changes are not visible. Root cause not investigated. |

Verified with headless installed Edge, desktop and 390px mobile, both themes. Help toggles by mouse/Enter/Space without losing focus or changing selections; default is collapsed. Report-model/core regressions and existing three-type PDF download suite pass. New tests/reports-usability.cjs covers the resolved behaviors and confirms closing preview disclosures does not change report sections. No PDF model/renderer content changes in this refinement, so a new PDF visual audit was not required. No formal screen-reader/user study or second browser engine. Human review pending; no commit/push/PR. The original suggested-fix list above records the historical review, not outstanding work.
