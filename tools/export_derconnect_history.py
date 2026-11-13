#!/usr/bin/env python3
"""Offline, bounded single-meter/channel export. See docs/HISTORICAL_DATA.md.

Reuses Matthew's offset-aware parser, numeric handling and weighted resolutions.
Unlike the exploratory scanner, this pilot rejects ANY cadence-slot collision
(including exact duplicates), so memory never grows with the number of raw rows.
"""
from __future__ import annotations

import argparse
import csv
from contextlib import contextmanager
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import zipfile

import numpy as np
import pandas as pd

from derconnect_full_quality import _parse_times, _numbers, _accumulate, _resolutions, RESOLUTIONS
from inspect_derconnect import METERS, UNITS

VERSION = "1.0"
TIMEZONE = "America/Los_Angeles"
CADENCE = 2
MAX_DAYS = 32


def utc(value):
    stamp = pd.Timestamp(value)
    if pd.isna(stamp) or stamp.tzinfo is None:
        raise ValueError("Time bounds must be valid ISO timestamps with Z or a UTC offset.")
    return stamp.tz_convert("UTC")


def iso(stamp):
    return stamp.isoformat().replace("+00:00", "Z")


def bounds(month=None, start=None, end=None, minutes=15):
    if minutes not in RESOLUTIONS:
        raise ValueError("Aggregation minutes must be 5, 15 or 60.")
    if month:
        if start or end or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            raise ValueError("Choose --month YYYY-MM OR both --start and --end.")
        a = pd.Timestamp(month + "-01", tz=TIMEZONE)
        b = a + pd.offsets.MonthBegin(1)
        a, b = a.tz_convert("UTC"), b.tz_convert("UTC")
    else:
        if not start or not end:
            raise ValueError("Choose --month OR both offset-aware --start and --end.")
        a, b = utc(start), utc(end)
    interval = minutes * 60 * 10**9
    if b <= a or b - a > pd.Timedelta(days=MAX_DAYS):
        raise ValueError("Select a nonempty interval of at most 32 elapsed days.")
    if a.value % interval or b.value % interval:
        raise ValueError("Bounds must align with complete UTC aggregation bins.")
    return a, b


class _HashingInput(io.RawIOBase):
    def __init__(self, stream):
        super().__init__()
        self.stream, self.digest, self.size = stream, hashlib.sha256(), 0

    def readable(self):
        return True

    def readinto(self, target):
        data = self.stream.read(len(target))
        target[:len(data)] = data
        self.digest.update(data)
        self.size += len(data)
        return len(data)


def _matches(name, meter):
    p = Path(name)
    return meter in p.parts or re.match(re.escape(meter) + r"(?:[_\-.]|$)", p.stem) is not None


@contextmanager
def inputs(path, meter):
    """Never extract archives; DeviceID remains authoritative within each CSV.

    Scan all matching months to detect cross-file repeats and avoid assuming that
    filename months use UTC or campus time. Only the selected range is retained.
    """
    if path.is_dir():
        files = sorted(p for p in path.rglob("*.csv") if _matches(str(p.relative_to(path)), meter))
        yield "csv_directory", [(lambda p=p: p.open("rb")) for p in files]
    elif path.is_file() and path.suffix.lower() == ".csv":
        yield "csv", [lambda: path.open("rb")]
    elif path.is_file() and zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            files = sorted((p for p in archive.infolist() if not p.is_dir()
                            and p.filename.lower().endswith(".csv") and _matches(p.filename, meter)),
                           key=lambda p: p.filename)
            yield "zip", [(lambda p=p: archive.open(p)) for p in files]
    elif not path.exists():
        raise FileNotFoundError("Input unavailable; set DERCONNECT_DATA_PATH or pass --input.")
    else:
        raise ValueError("Input must be a ZIP, raw CSV, or extracted meter directory tree.")


def export_history(path, *, meter="E2451", channel="Active_Power_A", month=None,
                   start=None, end=None, minutes=15, minimum_coverage=0.8,
                   chunksize=25000, synthetic_fixture=False):
    if meter not in METERS or channel not in ("Active_Power_A", "Active_Power_B", "Active_Power_C"):
        raise ValueError("Select a documented meter and an individual active-power phase.")
    module_dir = Path(__file__).resolve().parent
    mapping_bytes = (module_dir.parent / "data/Meter Reading Mapping.csv").read_bytes()
    documented = dict((r.get("Register Name"), r.get("Units")) for r in csv.DictReader(io.StringIO(mapping_bytes.decode("utf-8-sig"))))
    if UNITS.get(channel) != "W" or documented.get(channel) != "W":
        raise ValueError("Active-power source unit must be W.")
    if not np.isfinite(minimum_coverage) or not 0 <= minimum_coverage <= 1 or chunksize < 1:
        raise ValueError("Coverage must be in [0,1] and chunksize must be positive.")
    a, b = bounds(month, start, end, minutes)
    # Existing _resolutions expects whole elapsed hours, not a local-day grid.
    origin, stop = a.floor("h"), b.ceil("h")
    nslots = int((stop.value - origin.value) // (CADENCE * 10**9))
    slot_rows = np.zeros(nslots, dtype=np.uint8)
    valid = np.zeros(nslots, dtype=bool)
    nbins = nslots // 150
    acc = dict(count=np.zeros(nbins, dtype=np.int64), sum=np.zeros(nbins),
               sumsq=np.zeros(nbins), min=np.full(nbins, np.inf), max=np.full(nbins, -np.inf))
    diagnostics = dict(rows_scanned=0, other_meter_rows=0, missing_timestamps=0,
                       naive_timestamps=0, invalid_timestamps=0, outside_range_rows=0,
                       backwards_steps=0, missing_values=0, invalid_values=0)
    source_hashes, last = [], None
    path = Path(path).expanduser()
    with inputs(path, meter) as (kind, sources):
        if not sources:
            raise ValueError("No matching meter CSV inputs found; legacy agg15 caches are not supported.")
        for open_source in sources:
            with open_source() as raw:
                hashed = _HashingInput(raw)
                with io.BufferedReader(hashed) as stream:
                    reader = pd.read_csv(stream, dtype="string", keep_default_na=False,
                                         chunksize=chunksize, on_bad_lines="error")
                    for chunk in reader:
                        if not {"_time", "DeviceID", channel}.issubset(chunk.columns):
                            raise ValueError("Raw CSV requires _time, DeviceID and the selected phase; caches lack slot evidence.")
                        diagnostics["rows_scanned"] += len(chunk)
                        same = chunk.DeviceID.str.strip().eq(meter).fillna(False).to_numpy(bool)
                        diagnostics["other_meter_rows"] += int((~same).sum())
                        parsed, missing, naive = _parse_times(chunk["_time"])
                        times = parsed.array.as_unit("ns").asi8
                        good_time = parsed.notna().to_numpy()
                        for key, mask in (("missing_timestamps", missing), ("naive_timestamps", naive),
                                          ("invalid_timestamps", ~good_time & ~missing & ~naive)):
                            diagnostics[key] += int((mask & same).sum())
                        chosen = same & good_time & (times >= a.value) & (times < b.value)
                        diagnostics["outside_range_rows"] += int((same & good_time & ~chosen).sum())
                        ordered = times[chosen]
                        if len(ordered):
                            steps = np.diff(np.r_[last, ordered] if last is not None else ordered)
                            diagnostics["backwards_steps"] += int((steps < 0).sum())
                            last = ordered[-1]
                        slots = ((ordered - origin.value) // (CADENCE * 10**9)).astype(np.int64)
                        # Saturate at two: exact row multiplicity is unnecessary for collision rejection.
                        unique, counts = np.unique(slots, return_counts=True)
                        slot_rows[unique] = np.minimum(2, slot_rows[unique].astype(np.uint64) + counts)
                        values, missing, invalid = _numbers(chunk[channel])
                        diagnostics["missing_values"] += int((missing & chosen).sum())
                        diagnostics["invalid_values"] += int((invalid & chosen).sum())
                        values = values[chosen] / 1000.0
                        valid[slots[np.isfinite(values)]] = True
                        _accumulate(acc, slots // 150, values)
                source_hashes.append(dict(sha256=hashed.digest.hexdigest(), bytes=hashed.size))
    collision = slot_rows > 1
    valid[collision] = False
    duplicate5 = collision.reshape(-1, 150).any(axis=1)
    with np.errstate(over="ignore", invalid="ignore"):
        frame = _resolutions({channel: acc}, slot_rows > 0, {channel: valid}, duplicate5,
                             origin, CADENCE, minimum_coverage)[minutes]
    factor = minutes * 60 // CADENCE
    valid_counts = valid.reshape(-1, factor).sum(axis=1)
    present_counts = (slot_rows > 0).reshape(-1, factor).sum(axis=1)
    collision_counts = collision.reshape(-1, factor).sum(axis=1)
    records = []
    for i, (t, row) in enumerate(frame.iterrows()):
        if not a <= t < b:
            continue
        coverage = int(valid_counts[i]) / factor
        status = ("cadence_collision" if collision_counts[i] else "missing" if not present_counts[i]
                  else "invalid" if not valid_counts[i] else "low_coverage" if coverage < minimum_coverage else "ok")
        power = [float(row[channel + "__" + f + "_kw"]) for f in ("mean", "min", "max")]
        if status == "ok" and not all(np.isfinite(power)):
            status = "invalid"
        records.append(dict(timestamp_utc=iso(t), mean_kw=power[0] if status == "ok" else None,
                            min_kw=power[1] if status == "ok" else None,
                            max_kw=power[2] if status == "ok" else None,
                            valid_observations=int(valid_counts[i]), expected_slots=factor,
                            observed_slots=int(present_counts[i]), collision_slots=int(collision_counts[i]),
                            coverage=coverage, quality=status))
    diagnostics["cadence_collision_slots"] = int(collision.sum())
    return dict(schema_version=VERSION, dataset_type="historical_measurements", source="DERConnect",
                measurement_kind="synthetic_fixture" if synthetic_fixture else "actual_measurements",
                meter_id=meter, facility_type=METERS[meter], channel=channel, source_unit="W", display_unit="kW",
                timezone=TIMEZONE, aggregation_minutes=minutes, cadence_seconds=CADENCE,
                minimum_coverage=minimum_coverage, start_utc=iso(a), end_utc=iso(b), records=records,
                provenance=dict(exporter="export_derconnect_history/1.0", input_kind=kind,
                    inputs=source_hashes, chunksize=chunksize,
                    code_sha256={name: hashlib.sha256((module_dir / name).read_bytes()).hexdigest()
                                 for name in ("export_derconnect_history.py", "derconnect_full_quality.py", "inspect_derconnect.py")},
                    mapping_sha256=hashlib.sha256(mapping_bytes).hexdigest(),
                    pandas=pd.__version__, numpy=np.__version__,
                    duplicate_policy="reject_any_cadence_collision_bin", diagnostics=diagnostics,
                    assumptions="2-second cadence; W mapping; signs/scaling/calibration not verified; no phase or meter sums"))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default=os.environ.get("DERCONNECT_DATA_PATH"))
    p.add_argument("--meter", default="E2451", choices=METERS)
    p.add_argument("--channel", default="Active_Power_A", choices=["Active_Power_" + x for x in "ABC"])
    p.add_argument("--month")
    p.add_argument("--start")
    p.add_argument("--end")
    p.add_argument("--minutes", type=int, choices=RESOLUTIONS, default=15)
    p.add_argument("--minimum-coverage", type=float, default=0.8)
    p.add_argument("--chunksize", type=int, default=25000)
    p.add_argument("--synthetic-fixture", action="store_true", help="Mandatory when input is test data.")
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args(argv)
    if not args.input:
        p.error("Set DERCONNECT_DATA_PATH or pass --input to a local raw input.")
    try:
        result = export_history(args.input, meter=args.meter, channel=args.channel, month=args.month,
                                start=args.start, end=args.end, minutes=args.minutes,
                                minimum_coverage=args.minimum_coverage, chunksize=args.chunksize,
                                synthetic_fixture=args.synthetic_fixture)
        encoded = json.dumps(result, allow_nan=False, separators=(",", ":")) + "\n"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation prevents accidentally replacing raw input or teammate exports.
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(encoded)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"Export failed: {exc}", file=sys.stderr)
        return 2
    print(f"Exported {len(result['records'])} intervals; kind={result['measurement_kind']}. Keep measurements local.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
