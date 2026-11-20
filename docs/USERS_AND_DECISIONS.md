# Target users and decisions (draft)

**Status: draft for team agreement.** This proposes who the dashboard serves and what each user should be able to decide. Nothing here is settled until the team agrees on the primary user.

## Proposed users

| User | How often | Decision they make | What the dashboard must answer |
|---|---|---|---|
| Building manager (proposed primary) | Daily, at a glance | Is anything wrong in my buildings, and do I need to act? | Which buildings or meters need attention, why, and the next step |
| Electrical engineer | When something is flagged | Is this a real usage problem or a meter/data problem, and what caused it? | The evidence behind one item: readings, quality, context and comparison with similar meters |
| Model/research team | Per experiment | Is the detector good enough to trust on this data? | Detection quality on labeled data, kept separate from real data |

## What a building manager should learn in one glance

1. **Which items need attention right now**, ranked by urgency.
2. **Why** each item was flagged, in one line.
3. **Whether the data can be trusted**, so a broken meter is not mistaken for a usage problem.
4. **One next step** per item, such as "Check the meter data" or "No action needed".

## Next steps by item type

| Item | Next step | Available now? |
|---|---|---|
| No usable data for a meter | Check the meter or its export | Yes, historical Overview |
| Coverage below the export's minimum, or conflicting exports | Check the meter data | Yes, historical Overview |
| Model-flagged candidate (Chronos-2, hourly total power) | Review the latest candidate in the meter profile | Yes, historical Overview, opening the Buildings meter profile |
| Classified demand anomaly (spike, sustained excess, unusual for the time of day) | Investigate the event | No, the detector does not classify candidates |
| Event reviewed and explained | Record the review outcome | Synthetic demo only |

## How the dashboard supports this today

- **Synthetic Overview:** opens with pending events, high/critical counts, affected buildings, meter completeness, and the top priority events with a link to review them.
- **Historical Overview:** opens with a **Needs attention** panel in two parts:
  - **Model-flagged candidates:** each meter's Chronos-2 candidate events in the selected dates, ranked by count, with a next step that opens the meter profile on its latest candidate. Candidates are unverified and unclassified.
  - **Data checks:** every loaded meter and phase with a status (No usable data, Check data, Usable), the reason, and a next step that opens the series in Historical Monitoring.
- **Not yet supported:** classified or confirmed anomalies, severity, building-level grouping (no verified meter-to-building mapping), and live data. CSV Upload is kept for future live data.

## Open questions for the team

1. Is the building manager the primary user, or the electrical engineer?
2. Which anomaly types should rank highest once the detector is connected?
3. Can we get a verified meter-to-building mapping so the first screen can group by building?
4. How should candidates be ranked once there are many: by count, duration, detector score or recency?
