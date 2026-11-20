# DERConnect anomaly detection: chronos2-ft-5k

Detector outputs for meters E2451, E3020, E3510, E7080, E7085, Jan–May 2026, one row per hour.
Each table is written as CSV.

- Model: `chronos2-ft-5k` (checkpoint `chronos2:azimuth-anomaly-detection/chronos2-ft-5k`), run folder `derconnect-hourly-chronos2_azimuth-anomaly-detection_chronos2-ft-5k`
- Forecast mode: `rolling`: each hour is forecast one step (1h) ahead
- Score: `interval_exceedance`; threshold set for a 1% false-alarm rate on the normal period
- Events: {'merge_gap': 2, 'min_run': 1, 'release_threshold_ratio': 1.0}
- 16350 scored rows, 106 events

## Signal and time

- `actual_kw` is total active power (phases A+B+C) in kW, averaged over each 1h interval. A
  row's time is the start of its interval (hourly: 13:00 covers 13:00–14:00).
- `time_local` is America/Los_Angeles wall-clock time, so a building's schedule sits at the same
  time of day across the daylight-saving change. `time_utc` is the same instant in UTC.
- Mar 8, 2:00–3:00 a.m. does not exist locally (clocks sprang forward). That hour is
  interpolated: `filled = True` and `time_utc` is empty. Other gaps in the meter data are also
  interpolated and marked `filled = True`.

## Files

**predictions**: one row per meter per hour.
`meter, time_local, time_utc, model, actual_kw, score, threshold, flag, period, filled`

- `flag = 1` when `score > threshold`.
- `period = calibration` for rows before 2026-03-01. That stretch is *assumed* normal and is
  used to set the threshold; flags there are expected false alarms (about 1%). Show or count
  flags only where `period = detection` (Mar 1 – May 31).
- Rows start 2026-01-15 18:00:00: the pipeline scores only the last three quarters of the normal period (the
  first quarter is history for the first forecasts).

**forecasts**: `meter, time_local, time_utc, model, actual_kw, q01 … q99` (13 quantiles of the
expected kW; q50 is the median). Plot q10–q90 and q01–q99 as bands around `actual_kw`.

**events**: consecutive flagged rows grouped into one event (detection period only).
`event_id, meter, model, start, end, start_utc, end_utc, duration_h, peak_time, peak_score,
peak_actual_kw, peak_expected_kw, direction`

- `end` is exclusive: a one-hour event at 13:00 has `end = 14:00`. `duration_h` is in hours.
- `direction` is `above` or `below` the forecast median for all flagged rows, else `mixed`.

## Caveats

- **Candidates, not confirmed anomalies.** DERConnect has no labels. Events need checking against
  facilities records.
- **No anomaly types.** The detector finds anomalous intervals; it does not classify them as spikes,
  dips, level shifts, etc. `direction` and `duration_h` are descriptive hints only.
- **No precision, recall or F1 for this data.** Without labels they cannot be computed, and the
  metrics in the run folder's `summary.json` count every event as a false positive. Do not show them.
- **What can be reported:** how often actual load fell inside the forecast bands (near 80% for
  q10–q90 and 98% for q01–q99 means well-calibrated forecasts) and the share of detection-period
  rows flagged (target 1%):

| Meter | Inside q10–q90 | Inside q01–q99 | Rows flagged |
|---|---|---|---|
| E2451 | 81.3% | 97.7% | 1.0% |
| E3020 | 83.0% | 97.9% | 1.2% |
| E3510 | 72.7% | 97.6% | 1.2% |
| E7080 | 81.0% | 98.9% | 1.1% |
| E7085 | 80.5% | 97.7% | 0.6% |

- **Assumed-normal period.** Thresholds assume Jan–Feb was normal for every meter. Anything unusual
  in that stretch raises the threshold and hides similar events later.
