#!/usr/bin/env python3
"""Bounded, offline ZIP inspection. Reports describe file prefixes, never full coverage."""
from __future__ import annotations
import argparse
import csv
import io
import json
import os
import re
import zipfile
from collections import Counter
from pathlib import Path

METERS = {"E2451": "Instructional", "E3020": "Mixed", "E3510": "Office", "E7080": "Office", "E7085": "Office"}
MISSING = {"", "na", "n/a", "nan", "null", "none"}
UNITS = {}
for stem, suffixes, unit in [
    ("Active_Energy_in_Quadrant_", ["I", "II", "III", "IV"], "kWh"),
    ("Active_Power_", "ABC", "W"), ("Apparent_Power_", "ABC", "VA"),
    ("Current_", "ABC", "A"), ("Power_Factor_", "ABC", "dimensionless"),
    ("Reactive_Power_", "ABC", "VAR"), ("THD_Current_", "ABCN", "%"),
    ("THD_Voltage_", ["A-N", "B-N", "C-N"], "%"),
    ("Voltage_", ["A-B", "A-N", "B-C", "B-N", "C-A", "C-N"], "V")]:
    UNITS.update({stem + s: unit for s in suffixes})
UNITS.update(Frequency="Hz", Current_Unbalance_Worst="%", **{"Voltage_Unbalance_L-N_Worst": "%"})


def numeric_summary(series):
    import pandas as pd
    raw = series.astype("string").str.strip()
    missing = raw.isna() | raw.str.lower().isin(MISSING)
    values = pd.to_numeric(raw.mask(missing), errors="coerce")
    finite = values.notna() & ~values.isin([float("inf"), -float("inf")])
    valid = values[finite]
    return {"missing": int(missing.sum()), "non_numeric": int((~missing & values.isna()).sum()),
            "nonfinite": int((values.notna() & ~finite).sum()), "numeric_count": len(valid),
            "min": float(valid.min()) if len(valid) else None,
            "max": float(valid.max()) if len(valid) else None,
            "negative": int((valid < 0).sum()),
            "adjacent_equal": int((values.eq(values.shift()) & finite & finite.shift(fill_value=False)).sum()),
            "decreases": int((values.diff() < 0).sum())}


def time_summary(series):
    from datetime import datetime, timezone
    parsed, invalid, naive, aware = [], 0, 0, 0
    for value in series:
        try:
            t = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
            if t.tzinfo is None:
                naive += 1
            else:
                aware += 1
                t = t.astimezone(timezone.utc)
            parsed.append(t)
        except (ValueError, TypeError):
            invalid += 1
    result = {"parsed": len(parsed), "invalid": invalid, "naive": naive, "offset_aware": aware}
    if naive and aware:
        return dict(result, warning="Mixed naive/aware timestamps: cadence withheld")
    steps = [(b-a).total_seconds() for a, b in zip(parsed, parsed[1:])]
    positive = Counter(s for s in steps if s > 0)
    cadence = positive.most_common(1)[0][0] if positive else None
    unique = sorted(set(parsed))
    gaps = [(b-a).total_seconds() for a, b in zip(unique, unique[1:])]
    result.update(start=min(parsed).isoformat() if parsed else None,
                  end=max(parsed).isoformat() if parsed else None,
                  duplicate_timestamps=len(parsed)-len(unique), backwards=sum(s < 0 for s in steps),
                  interval_counts_seconds=positive.most_common(10), modal_interval_seconds=cadence,
                  large_gaps=sum(s > 1.5*cadence for s in gaps) if cadence else None,
                  off_cadence=sum(abs(s-cadence) > .01*cadence for s in gaps) if cadence else None,
                  max_gap_seconds=max(gaps) if gaps else None,
                  warning="Naive timestamps: timezone and DST unresolved" if naive else "Offsets do not identify a campus timezone")
    return result


def read_member(archive, member, rows=2000, max_bytes=8*1024*1024):
    """Read at most max_bytes decompressed bytes; discard the last partial CSV record via parser error.

    Parquet requires a seekable file: only members within the byte budget are supported.
    """
    import pandas as pd
    suffix = Path(member.filename).suffix.lower()
    if suffix not in {".csv", ".tsv", ".parquet"}:
        raise ValueError(f"Unsupported format {suffix or '(none)'}; supported: CSV, TSV, bounded Parquet")
    if suffix == ".parquet":
        if member.file_size > max_bytes:
            raise ValueError("Parquet member exceeds byte budget; inspect a local copy with pyarrow metadata/row groups")
        import pyarrow.parquet as pq
        with archive.open(member) as stream:
            parquet = pq.ParquetFile(io.BytesIO(stream.read(max_bytes)))
        batches = parquet.iter_batches(batch_size=rows)
        batch = next(batches, None)
        frame = batch.to_pandas() if batch is not None else pd.DataFrame(columns=parquet.schema.names)
        return frame, len(frame) < parquet.metadata.num_rows
    records, byte_count, limited = [], 0, False
    with archive.open(member) as stream:
        def lines():
            nonlocal byte_count
            while True:
                line = stream.readline(max_bytes - byte_count + 1)
                if not line:
                    return
                byte_count += len(line)
                if byte_count > max_bytes:
                    raise ValueError("Byte budget reached inside a record")
                yield line.decode("utf-8-sig" if byte_count == len(line) else "utf-8")
        reader = csv.reader(lines(), delimiter="\t" if suffix == ".tsv" else ",", strict=True)
        header = next(reader, None)
        if not header or len(set(header)) != len(header):
            raise ValueError("Empty or duplicate CSV headers require an explicit adapter")
        try:
            for _ in range(rows):
                row = next(reader, None)
                if row is None:
                    break
                if len(row) != len(header):
                    raise ValueError("CSV record width differs from header")
                records.append(row)
            else:
                limited = True
        except ValueError as exc:
            if "Byte budget" not in str(exc):
                raise
            limited = True
    return pd.DataFrame(records, columns=header), limited


def inspect(path, rows=2000, max_bytes=8*1024*1024, timestamp=None):
    """Inventory all members; inspect a bounded prefix of each supported file."""
    path = Path(path).expanduser()
    if not path.is_file():
        raise ValueError("Archive unavailable. Set DERCONNECT_DATA_PATH to a local ZIP file.")
    report = {"archive_bytes": path.stat().st_size, "scope": "Per-file prefix samples; no full-data claims or cross-file quality checks", "files": []}
    with zipfile.ZipFile(path) as archive:
        members = [m for m in archive.infolist() if not m.is_dir()]
        report.update(file_count=len(members), compressed_bytes=sum(m.compress_size for m in members),
                      uncompressed_bytes=sum(m.file_size for m in members))
        for member in members:
            meter = next((m for m in METERS if m in Path(member.filename).parts), None)
            months = re.findall(r"2026[-_]?0[1-9]|2026[-_]?1[0-2]", member.filename)
            item = {"name": member.filename, "meter": meter, "months_in_name": months,
                    "compressed_bytes": member.compress_size, "uncompressed_bytes": member.file_size,
                    "format": Path(member.filename).suffix.lower()}
            report["files"].append(item)
            try:
                frame, limited = read_member(archive, member, rows, max_bytes)
                item.update(sample_rows=len(frame), sample_limited=limited,
                            columns=list(frame.columns), dtypes={c: str(frame[c].dtype) for c in frame},
                            quality={c: numeric_summary(frame[c]) for c in frame},
                            expected_units={c: UNITS[c] for c in frame if c in UNITS})
                candidates = [c for c in frame if "time" in c.lower() or "date" in c.lower()]
                item["timestamp_candidates"] = candidates
                chosen = timestamp if timestamp in frame else candidates[0] if len(candidates) == 1 else None
                if chosen:
                    item["time_column"] = chosen
                    item["time"] = time_summary(frame[chosen])
                else:
                    item["time_warning"] = "Select an ISO timestamp column with --timestamp; epoch/split timestamps need an explicit adapter"
            except (ValueError, ImportError, OSError, UnicodeError, csv.Error) as exc:
                item["inspection_error"] = str(exc)
    report["meters_observed_in_paths"] = sorted({f["meter"] for f in report["files"] if f["meter"]})
    report["missing_expected_meters"] = sorted(set(METERS)-set(report["meters_observed_in_paths"]))
    report["schema_variants"] = [list(cols) for cols in sorted({tuple(f["columns"]) for f in report["files"] if "columns" in f})]
    report["month_note"] = "Name tokens only; verify timestamp coverage before concluding months are missing. Expected January–May 2026 is instructor-provided."
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", default=os.environ.get("DERCONNECT_DATA_PATH"))
    parser.add_argument("--rows", type=int, default=2000)
    parser.add_argument("--max-bytes", type=int, default=8*1024*1024)
    parser.add_argument("--timestamp")
    args = parser.parse_args()
    if not args.path:
        parser.error("Provide a local ZIP path or set DERCONNECT_DATA_PATH. No data is bundled.")
    if args.rows < 1 or args.max_bytes < 1:
        parser.error("--rows and --max-bytes must be positive")
    try:
        print(json.dumps(inspect(args.path, args.rows, args.max_bytes, args.timestamp), indent=2, allow_nan=False))
    except (ValueError, OSError, zipfile.BadZipFile) as exc:
        parser.exit(2, f"Inspection failed: {exc}\n")


if __name__ == "__main__":
    main()
