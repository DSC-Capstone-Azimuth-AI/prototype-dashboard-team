#!/usr/bin/env python3
"""Sequential, bounded DERCONNECT phase-power exports; never overwrite local files."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import zipfile

from export_derconnect_history import bounds, export_history, valid_meter, utc, RESOLUTIONS, TIMEZONE


def filename(meter, channel, start, end, minutes):
    # Include exact UTC bounds, channel and resolution: no collisions between phases,
    # years, partial days or DST offsets. The interval end is exclusive.
    stamp = lambda t: t.strftime("%Y%m%dT%H%M%SZ")
    return f"{meter}-{channel}-{stamp(start)}--{stamp(end)}-{minutes}min.json"


def validate_export(data):
    """Check the complete generated grid before publishing a file.

    Aggregation/quality policy belongs to export_history. Browser-contract tests
    also pass these exact outputs through DC.history.validate.
    """
    a, b = bounds(start=data["start_utc"], end=data["end_utc"], minutes=data["aggregation_minutes"])
    step = data["aggregation_minutes"] * 60
    if (data["schema_version"] != "1.0" or data["dataset_type"] != "historical_measurements"
            or data["timezone"] != TIMEZONE or data["display_unit"] != "kW"
            or len(data["records"]) != int((b-a).total_seconds() // step)):
        raise ValueError("Generated export does not match the historical schema/grid.")
    for i, record in enumerate(data["records"]):
        if utc(record["timestamp_utc"]).value != a.value + i * step * 10**9:
            raise ValueError("Generated timestamps are not contiguous UTC bins.")
        if record["quality"] != "ok" and any(record[k] is not None for k in ("mean_kw", "min_kw", "max_kw")):
            raise ValueError("Rejected intervals must withhold power summaries.")
    return json.dumps(data, allow_nan=False, separators=(",", ":")) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=os.environ.get("DERCONNECT_DATA_PATH"))
    parser.add_argument("--meters", nargs="+", required=True)
    parser.add_argument("--channel", default="Active_Power_A", choices=["Active_Power_" + p for p in "ABC"])
    parser.add_argument("--month")
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--minutes", type=int, choices=RESOLUTIONS, default=15)
    parser.add_argument("--minimum-coverage", type=float, default=0.8)
    parser.add_argument("--chunksize", type=int, default=25000)
    parser.add_argument("--synthetic-fixture", action="store_true", help="Mandatory for generated test inputs.")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    if not args.input:
        parser.error("Set DERCONNECT_DATA_PATH or pass --input to authorized local raw data.")
    try:
        a, b = bounds(args.month, args.start, args.end, args.minutes)
        args.output_dir.mkdir(parents=True, exist_ok=True)
    except (OSError, ValueError) as exc:
        print(f"Batch failed: {exc}", file=sys.stderr)
        return 2
    succeeded, failed = [], []
    for meter in dict.fromkeys(args.meters):
        try:
            if not valid_meter(meter):
                raise ValueError("Invalid meter ID (1–64 letters/digits/underscore/dot/hyphen; start with a letter/digit).")
            output = args.output_dir / filename(meter, args.channel, a, b, args.minutes)
            if output.exists():
                raise FileExistsError(f"Refusing to overwrite {output.name}")
            result = export_history(args.input, meter=meter, channel=args.channel,
                                    start=a.isoformat(), end=b.isoformat(), minutes=args.minutes,
                                    minimum_coverage=args.minimum_coverage, chunksize=args.chunksize,
                                    synthetic_fixture=args.synthetic_fixture)
            if not any(r["observed_slots"] for r in result["records"]):
                raise ValueError("No observations for this meter/channel in the selected range; no file written.")
            encoded = validate_export(result)
            with output.open("x", encoding="utf-8") as stream:
                stream.write(encoded)
            succeeded.append(meter)
            usable = sum(r["quality"] == "ok" for r in result["records"])
            print(f"OK {meter}: {output.name} · {usable}/{len(result['records'])} usable intervals · {result['measurement_kind']}")
            del result, encoded
        except (OSError, ValueError, zipfile.BadZipFile) as exc:
            failed.append(meter)
            print(f"FAILED {meter}: {exc}", file=sys.stderr)
    print(f"Batch summary: {len(succeeded)} succeeded ({', '.join(succeeded) or 'none'}); "
          f"{len(failed)} failed ({', '.join(failed) or 'none'}).")
    return 2 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
