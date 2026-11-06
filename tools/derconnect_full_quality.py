"""In-memory, chunked DERCONNECT quality and aggregation exploration (no exports).

Coverage is occupied expected-cadence slots, not row count. Source month boundaries
use the explicitly selected calendar timezone. Raw timestamps are retained as int64
arrays for one device at a time, allowing exact duplicate/order checks without a
Python set per reading. Only small aggregates and a bounded detail window survive.
"""
from __future__ import annotations

from pathlib import Path
import re
import zipfile

import numpy as np
import pandas as pd

from inspect_derconnect import METERS, MISSING, UNITS

PHASES = ["Active_Power_" + p for p in "ABC"]
MONTHS = [f"2026-{m:02d}" for m in range(1, 6)]
RESOLUTIONS = (5, 15, 60)


def phase_sum_allowed(review):
    """Numerical similarity cannot verify additive electrical phase semantics."""
    reference = review.get("source_reference", "")
    return all(review.get(k) is True for k in (
        "same_device_and_timestamp", "distinct_additive_phases",
        "compatible_signed_power_W")) and isinstance(reference, str) and bool(reference.strip())


def _bounds(month, calendar_tz):
    start = pd.Timestamp(month + "-01", tz=calendar_tz)
    end = start + pd.offsets.MonthBegin(1)
    return start.tz_convert("UTC"), end.tz_convert("UTC")


def _parse_times(raw):
    # Reject naive values rather than silently treating campus wall time as UTC.
    text = raw.astype("string").str.strip()
    aware = text.str.contains(r"(?:Z|[+-]\d{2}:?\d{2})$", case=False, regex=True, na=False)
    parsed = pd.to_datetime(text.where(aware), format="ISO8601", errors="coerce", utc=True)
    missing = text.isna() | text.str.lower().isin(MISSING)
    naive = ~missing & ~aware & pd.to_datetime(
        text.where(~aware), format="ISO8601", errors="coerce").notna()
    return parsed, missing.to_numpy(bool), naive.to_numpy(bool)


def _numbers(raw):
    text = raw.astype("string").str.strip()
    missing = (text.isna() | text.str.lower().isin(MISSING)).to_numpy(bool)
    values = pd.to_numeric(text.mask(missing), errors="coerce").to_numpy(dtype=float, na_value=np.nan)
    invalid = ~missing & ~np.isfinite(values)
    values[~np.isfinite(values)] = np.nan
    return values, missing, invalid


def _gap_rows(present, origin_ns, cadence_ns, meter, month, limit):
    """Count all missing runs; retain only the longest bounded number for plotting."""
    edges = np.diff(np.r_[False, ~present, False].astype(np.int8))
    starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
    lengths = ends - starts
    if len(starts) > limit:
        keep = np.argpartition(lengths, -limit)[-limit:]
        starts, ends, lengths = starts[keep], ends[keep], lengths[keep]
    rows = [{"device": meter, "month": month,
             "start_utc": pd.Timestamp(origin_ns + int(a) * cadence_ns, tz="UTC"),
             "end_utc": pd.Timestamp(origin_ns + int(b) * cadence_ns, tz="UTC"),
             "missing_slots": int(n), "duration_s": float(n * cadence_ns / 1e9)}
            for a, b, n in zip(starts, ends, lengths)]
    return rows, int(np.count_nonzero(edges == 1))


def _accumulate(acc, indices, values):
    finite = np.isfinite(values)
    indices, values = indices[finite], values[finite]
    if not len(indices):
        return
    size = len(acc["count"])
    acc["count"] += np.bincount(indices, minlength=size)
    acc["sum"] += np.bincount(indices, weights=values, minlength=size)
    acc["sumsq"] += np.bincount(indices, weights=values * values, minlength=size)
    np.minimum.at(acc["min"], indices, values)
    np.maximum.at(acc["max"], indices, values)


def _resolutions(accumulators, present, valid_slots, duplicated_bins, start, cadence_s, minimum_coverage):
    frames = {}
    for minutes in RESOLUTIONS:
        factor = minutes // 5
        slots_per_bin = int(minutes * 60 / cadence_s)
        index = pd.date_range(start, periods=len(present) // slots_per_bin, freq=f"{minutes}min")
        frame = pd.DataFrame(index=index)
        frame.index.name = "timestamp_utc"
        frame["timestamp_coverage_pct"] = present.reshape(-1, slots_per_bin).sum(axis=1) / slots_per_bin * 100
        duplicate = duplicated_bins.reshape(-1, factor).any(axis=1)
        frame["duplicate_bin"] = duplicate
        for channel, acc in accumulators.items():
            count = acc["count"].reshape(-1, factor).sum(axis=1)
            sums = acc["sum"].reshape(-1, factor).sum(axis=1)
            squares = acc["sumsq"].reshape(-1, factor).sum(axis=1)
            low = acc["min"].reshape(-1, factor).min(axis=1)
            high = acc["max"].reshape(-1, factor).max(axis=1)
            coverage = valid_slots[channel].reshape(-1, slots_per_bin).sum(axis=1) / slots_per_bin * 100
            mean = np.divide(sums, count, out=np.full(len(count), np.nan), where=count > 0)
            variance = np.divide(squares, count, out=np.full(len(count), np.nan), where=count > 0) - mean**2
            usable = (count > 0) & ~duplicate & (coverage >= minimum_coverage * 100)
            for name, values in [("mean_kw", mean), ("min_kw", low), ("max_kw", high),
                                 ("within_bin_std_kw", np.sqrt(np.maximum(variance, 0)))]:
                frame[channel + "__" + name] = np.where(usable, values, np.nan)
            frame[channel + "__valid_rows"] = count
            frame[channel + "__coverage_pct"] = coverage
        frames[minutes] = frame
    return frames


def scan_archive(path, *, months=MONTHS, devices=None, calendar_tz="America/Los_Angeles",
                 cadence_s=2, chunksize=25000, minimum_coverage=0.8,
                 phase_review=None, detail_device="E2451", detail_start=None,
                 detail_hours=2, max_detail_rows=10000, max_gaps_per_month=100,
                 progress=print):
    """Scan every matching CSV through EOF; return only in-memory diagnostics.

    Quality-value counts describe ALL source rows/registers by source device/month,
    including rows with unusable time. Coverage and power use matching DeviceID,
    offset-aware valid time within the source month only. Misplaced rows are reported,
    never silently reassigned. Exact duplicate timestamps (also across files) withhold
    power statistics in affected bins, rather than arbitrarily selecting values.
    Slot coverage credits at most one observation in each half-open cadence slot;
    duplicate-timestamp slots are excluded from valid-power coverage conservatively.
    Means are observed-sample means, not time-integrated energy or imputed demand.
    """
    path = Path(path).expanduser()
    if not path.is_file():
        raise FileNotFoundError("Set DATA_PATH to the local DERCONNECT ZIP before running Section F.")
    devices = list(METERS if devices is None else devices)
    months = list(months)
    if not months or len(set(months)) != len(months) or not devices or len(set(devices)) != len(devices):
        raise ValueError("Choose nonempty unique devices and months.")
    if any(d not in METERS for d in devices):
        raise ValueError("Unknown device; confirm mapping before analysis.")
    if detail_device not in devices:
        raise ValueError("Select a detail_device included in devices before scanning.")
    if cadence_s <= 0 or any((m * 60 / cadence_s) % 1 for m in RESOLUTIONS):
        raise ValueError("Cadence must divide 5-, 15- and 60-minute intervals exactly.")
    if chunksize < 1 or not 0 <= minimum_coverage <= 1 or detail_hours <= 0 or max_detail_rows < 1 or max_gaps_per_month < 1:
        raise ValueError("Invalid processing, coverage or detail limits.")
    if any(UNITS.get(p) != "W" for p in PHASES):
        raise ValueError("Power conversion requires the provided W mapping for every phase.")
    bounds = {month: _bounds(month, calendar_tz) for month in months}
    cadence_ns = int(cadence_s * 1e9)
    total_enabled = phase_sum_allowed(phase_review or {})
    channels = PHASES + (["Total_Active_Power"] if total_enabled else [])
    summary, measurements, gaps, observation_gaps, daily, file_rows, details, aggregates = [], [], [], [], [], [], [], {}
    notify = progress or (lambda _: None)
    with zipfile.ZipFile(path) as archive:
        inventory = {d: {m: [] for m in months} for d in devices}
        unrecognized = []
        for info in archive.infolist():
            if info.is_dir() or Path(info.filename).suffix.lower() != ".csv":
                continue
            meter = next((d for d in devices if d in Path(info.filename).parts), None)
            tokens = set(re.findall(r"2026[-_](?:0[1-9]|1[0-2])", Path(info.filename).name))
            tokens = {t.replace("_", "-") for t in tokens}
            if meter and len(tokens) == 1 and next(iter(tokens)) in months:
                inventory[meter][next(iter(tokens))].append(info)
            else:
                unrecognized.append(info.filename)
        total_files = sum(len(files) for by_month in inventory.values() for files in by_month.values())
        complete_files = 0
        chosen_start = None
        if detail_start is not None:
            chosen_start = pd.Timestamp(detail_start)
            if chosen_start.tzinfo is None:
                raise ValueError("detail_start must include a UTC offset or Z.")
            chosen_start = chosen_start.tz_convert("UTC")
        detail_end = None
        detail_seen = 0
        for meter in devices:
            states = {}
            raw_times = []
            for month in months:
                start, end = bounds[month]
                nslots = int((end.value - start.value) // cadence_ns)
                if (end.value - start.value) % cadence_ns or nslots % int(3600 / cadence_s):
                    raise ValueError("Month boundaries do not divide into complete expected slots/hour bins.")
                nbins = nslots // int(300 / cadence_s)
                states[month] = {
                    "present": np.zeros(nslots, dtype=bool),
                    "valid": {p: np.zeros(nslots, dtype=bool) for p in channels},
                    "acc": {p: {"count": np.zeros(nbins, dtype=np.int64),
                                "sum": np.zeros(nbins), "sumsq": np.zeros(nbins),
                                "min": np.full(nbins, np.inf), "max": np.full(nbins, -np.inf)} for p in channels},
                    "stats": dict(device=meter, month=month, files=len(inventory[meter][month]), rows=0,
                                  missing_timestamps=0, invalid_timestamps=0, naive_timestamps=0,
                                  device_id_mismatch=0, outside_source_month=0, backwards_steps=0),
                    "quality": {r: dict(missing=0, invalid=0, finite=0, negative=0, equal_adjacent=0,
                                        absent_column_rows=0, min=np.inf, max=-np.inf) for r in UNITS}}
                state = states[month]
                if chosen_start is None and meter == detail_device and inventory[meter][month]:
                    chosen_start = start
                if chosen_start is not None:
                    detail_end = chosen_start + pd.Timedelta(hours=detail_hours)
                for info in sorted(inventory[meter][month], key=lambda x: x.filename):
                    notify(f"[{complete_files + 1}/{total_files}] {meter} {month}: reading complete CSV in {chunksize:,}-row chunks")
                    last_time, last_values, processed = None, {}, 0
                    with archive.open(info) as stream:
                        reader = pd.read_csv(stream, dtype="string", keep_default_na=False,
                                             chunksize=chunksize, on_bad_lines="error")
                        for chunk_index, chunk in enumerate(reader):
                            if "_time" not in chunk or "DeviceID" not in chunk:
                                raise ValueError(f"{meter} {month}: _time and DeviceID columns are required.")
                            count = len(chunk)
                            state["stats"]["rows"] += count
                            processed += count
                            parsed, missing_time, naive = _parse_times(chunk["_time"])
                            times = parsed.array.as_unit("ns").asi8
                            valid_time = parsed.notna().to_numpy()
                            id_ok = chunk["DeviceID"].str.strip().eq(meter).fillna(False).to_numpy(bool)
                            in_month = valid_time & (times >= start.value) & (times < end.value)
                            accepted = in_month & id_ok
                            stats = state["stats"]
                            stats["missing_timestamps"] += int(missing_time.sum())
                            stats["naive_timestamps"] += int(naive.sum())
                            stats["invalid_timestamps"] += int((~valid_time & ~missing_time & ~naive).sum())
                            stats["device_id_mismatch"] += int((~id_ok).sum())
                            stats["outside_source_month"] += int((valid_time & ~in_month).sum())
                            ordered = times[valid_time & id_ok]
                            if len(ordered):
                                steps = np.diff(np.r_[last_time, ordered] if last_time is not None else ordered)
                                stats["backwards_steps"] += int((steps < 0).sum())
                                last_time = ordered[-1]
                                raw_times.append(ordered.copy())
                            slots = ((times[accepted] - start.value) // cadence_ns).astype(np.int64)
                            bins = slots // int(300 / cadence_s)
                            state["present"][slots] = True
                            power = {}
                            for register, quality in state["quality"].items():
                                if register not in chunk:
                                    quality["missing"] += count
                                    quality["absent_column_rows"] += count
                                    last_values.pop(register, None)
                                    continue
                                values, missing, invalid = _numbers(chunk[register])
                                finite = np.isfinite(values)
                                quality["missing"] += int(missing.sum())
                                quality["invalid"] += int(invalid.sum())
                                quality["finite"] += int(finite.sum())
                                quality["negative"] += int((values < 0).sum())
                                previous = last_values.get(register, np.nan)
                                quality["equal_adjacent"] += int((values == np.r_[previous, values[:-1]]).sum())
                                if count:
                                    last_values[register] = values[-1]
                                if finite.any():
                                    quality["min"] = min(quality["min"], float(np.nanmin(values)))
                                    quality["max"] = max(quality["max"], float(np.nanmax(values)))
                                if register in PHASES:
                                    power[register] = values / 1000.0
                            if total_enabled:
                                power["Total_Active_Power"] = np.sum(
                                    np.vstack([power.get(p, np.full(count, np.nan)) for p in PHASES]), axis=0)
                            for channel, values in power.items():
                                accepted_values = values[accepted]
                                state["valid"][channel][slots[np.isfinite(accepted_values)]] = True
                                _accumulate(state["acc"][channel], bins, accepted_values)
                            if meter == detail_device and chosen_start is not None:
                                pick = accepted & (times >= chosen_start.value) & (times < detail_end.value)
                                found = int(pick.sum())
                                remaining = max(0, max_detail_rows - detail_seen)
                                if found and remaining:
                                    detail = pd.DataFrame({"timestamp_utc": pd.to_datetime(times[pick][:remaining], utc=True)})
                                    for channel in channels:
                                        detail[channel] = power.get(channel, np.full(count, np.nan))[pick][:remaining]
                                    details.append(detail)
                                detail_seen += found
                            if chunk_index % 10 == 0:
                                notify(f"  {meter} {month}: {processed:,} rows scanned")
                    complete_files += 1
                    file_rows.append(dict(device=meter, month=month, rows=processed, complete=True))
                    notify(f"[{complete_files}/{total_files}] {meter} {month}: EOF reached ({processed:,} rows)")

            # Exact timestamps require O(rows) compact int64 memory for this device only.
            combined = np.concatenate(raw_times) if raw_times else np.array([], dtype=np.int64)
            del raw_times
            unique, multiplicity = np.unique(combined, return_counts=True)
            del combined
            duplicates = unique[multiplicity > 1]
            for month, state in states.items():
                start, end = bounds[month]
                stats, present = state["stats"], state["present"]
                lo, hi = np.searchsorted(unique, [start.value, end.value])
                month_times = unique[lo:hi]
                intervals = np.diff(month_times) / 1e9
                # Separately inspect elapsed gaps between actual observations. Fixed
                # slot holes alone can arise from jitter near a slot boundary.
                # A cross-month interval belongs to the month of its later reading.
                gap_times = unique[max(0, lo-1):hi]
                elapsed = np.diff(gap_times) / 1e9
                recording_indices = np.flatnonzero(elapsed > 1.5 * cadence_s)
                recording_count = len(recording_indices)
                max_interval = float(elapsed.max()) if len(elapsed) else np.nan
                if recording_count > max_gaps_per_month:
                    keep = np.argpartition(elapsed[recording_indices], -max_gaps_per_month)[-max_gaps_per_month:]
                    recording_indices = recording_indices[keep]
                for i in recording_indices:
                    observation_gaps.append(dict(device=meter, month=month,
                        start_utc=pd.Timestamp(int(gap_times[i]) + cadence_ns, tz="UTC"),
                        end_utc=pd.Timestamp(int(gap_times[i+1]), tz="UTC"),
                        interval_s=float(elapsed[i]), duration_s=float(elapsed[i]-cadence_s)))
                dup = duplicates[(duplicates >= start.value) & (duplicates < end.value)]
                dup_slots = ((dup - start.value) // cadence_ns).astype(np.int64)
                duplicate_bins = np.zeros(len(state["acc"][channels[0]]["count"]), dtype=bool)
                duplicate_bins[dup_slots // int(300 / cadence_s)] = True
                for valid in state["valid"].values():
                    valid[dup_slots] = False
                for register, quality in state["quality"].items():
                    rows = stats["rows"]
                    measurements.append(dict(device=meter, month=month, register=register,
                        mapped_unit=UNITS[register], rows=rows, **quality,
                        missing_pct=quality["missing"] / rows * 100 if rows else np.nan,
                        invalid_pct=quality["invalid"] / rows * 100 if rows else np.nan))
                register_stats = list(state["quality"].values())
                nvalues = stats["rows"] * len(UNITS)
                retained_gaps, gap_count = _gap_rows(present, start.value, cadence_ns, meter, month, max_gaps_per_month)
                gaps.extend(retained_gaps)
                stats.update(expected_slots=len(present), observed_slots=int(present.sum()),
                    missing_slots=int((~present).sum()), coverage_pct=present.mean() * 100,
                    duplicate_rows=int((multiplicity[lo:hi] - 1).sum()),
                    gap_count=gap_count, max_gap_s=max((g["duration_s"] for g in retained_gaps), default=0),
                    recording_gap_count=recording_count, max_observed_interval_s=max_interval,
                    interval_median_s=float(np.median(intervals)) if len(intervals) else np.nan,
                    interval_p01_s=float(np.quantile(intervals, .01)) if len(intervals) else np.nan,
                    interval_p99_s=float(np.quantile(intervals, .99)) if len(intervals) else np.nan,
                    off_cadence_intervals=int((np.abs(intervals - cadence_s) > .1 * cadence_s).sum()),
                    missing_measurement_values=sum(q["missing"] for q in register_stats),
                    invalid_measurement_values=sum(q["invalid"] for q in register_stats),
                    expected_measurement_values=nvalues)
                stats["missing_measurement_pct"] = stats["missing_measurement_values"] / nvalues * 100 if nvalues else np.nan
                stats["invalid_measurement_pct"] = stats["invalid_measurement_values"] / nvalues * 100 if nvalues else np.nan
                for channel in channels:
                    stats[channel + "__valid_coverage_pct"] = state["valid"][channel].mean() * 100
                issues = []
                for key in ("missing_timestamps", "invalid_timestamps", "naive_timestamps", "device_id_mismatch",
                            "outside_source_month", "backwards_steps", "duplicate_rows", "missing_slots",
                            "recording_gap_count", "missing_measurement_values", "invalid_measurement_values"):
                    if stats[key]:
                        issues.append(key)
                if stats["files"] != 1:
                    issues.append("expected_one_monthly_file")
                stats["potential_issues"] = ", ".join(issues) or "No issues under configured checks"
                summary.append(stats)
                # Local days are 23/24/25 hours as appropriate; no fixed 43,200/day assumption.
                day_edges = pd.date_range(start.tz_convert(calendar_tz), end.tz_convert(calendar_tz), freq="D").tz_convert("UTC")
                for a, b in zip(day_edges[:-1], day_edges[1:]):
                    left, right = (a.value - start.value) // cadence_ns, (b.value - start.value) // cadence_ns
                    observed = int(present[int(left):int(right)].sum())
                    daily.append(dict(device=meter, date=str(a.tz_convert(calendar_tz).date()),
                                      expected_slots=int(right-left), observed_slots=observed,
                                      coverage_pct=observed / (right-left) * 100))
                frames = _resolutions(state["acc"], present, state["valid"], duplicate_bins,
                                      start, cadence_s, minimum_coverage)
                for minutes, frame in frames.items():
                    aggregates.setdefault((meter, minutes), []).append(frame)
                # Avoid retaining five months' masks while scanning the next device.
            del states, state, unique, multiplicity, duplicates

    aggregate_frames = {key: pd.concat(frames).sort_index() for key, frames in aggregates.items()}
    detail = pd.concat(details, ignore_index=True) if details else pd.DataFrame(columns=["timestamp_utc", *channels])
    if len(detail):
        detail = detail.drop_duplicates("timestamp_utc", keep=False).sort_values("timestamp_utc").set_index("timestamp_utc")
        # Remove also duplicates outside a truncated detail buffer via aggregate duplicate-bin flag.
        frame = aggregate_frames.get((detail_device, 5))
        contaminated = frame["duplicate_bin"].reindex(detail.index.floor("5min"), fill_value=False).to_numpy()
        detail.loc[contaminated, channels] = np.nan
    quality = pd.DataFrame(measurements)
    quality[["min", "max"]] = quality[["min", "max"]].replace([np.inf, -np.inf], np.nan)
    return dict(summary=pd.DataFrame(summary), measurements=quality, daily=pd.DataFrame(daily),
                gaps=pd.DataFrame(gaps, columns=["device", "month", "start_utc", "end_utc", "missing_slots", "duration_s"]
                                  ).astype({"missing_slots": "int64", "duration_s": "float64"}),
                observation_gaps=pd.DataFrame(observation_gaps, columns=["device", "month", "start_utc", "end_utc", "interval_s", "duration_s"]
                                              ).astype({"interval_s": "float64", "duration_s": "float64"}),
                files=pd.DataFrame(file_rows), aggregates=aggregate_frames, detail=detail,
                channels=channels, total_enabled=total_enabled,
                metadata=dict(calendar_tz=calendar_tz, cadence_s=cadence_s, minimum_coverage=minimum_coverage,
                    complete_files=complete_files, expected_files=len(devices)*len(months),
                    unrecognized_csvs=unrecognized, detail_device=detail_device,
                    detail_start=chosen_start, detail_end=detail_end,
                    detail_truncated=detail_seen > max_detail_rows, max_gaps_per_month=max_gaps_per_month))


def aggregation_summary(result):
    rows = []
    for (meter, minutes), frame in result["aggregates"].items():
        for channel in result["channels"]:
            mean = frame[channel + "__mean_kw"]
            peak = frame[channel + "__max_kw"].max()
            peak_mean = mean.max()
            rows.append(dict(device=meter, interval_minutes=minutes, channel=channel,
                bins=len(frame), displayed_bins=int(mean.notna().sum()),
                mean_bin_coverage_pct=frame[channel + "__coverage_pct"].mean(),
                min_observed_kw=frame[channel + "__min_kw"].min(), max_observed_kw=peak,
                maximum_bin_mean_kw=peak_mean,
                peak_reduction_pct=(peak-peak_mean)/peak*100 if pd.notna(peak) and peak > 0 else np.nan,
                median_within_bin_range_kw=(frame[channel + "__max_kw"]-frame[channel + "__min_kw"]).median(),
                median_within_bin_std_kw=frame[channel + "__within_bin_std_kw"].median(),
                duplicate_bins_withheld=int(frame["duplicate_bin"].sum())))
    return pd.DataFrame(rows)
