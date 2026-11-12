"""One-pass preparation of the raw DERCONNECT CSVs for the building-type / forecasting /
anomaly-screening notebook.

Reads each monthly CSV once (only the columns needed) and writes small, portable CSV caches:

Used by notebooks/02_derconnect_building_types_forecasting_anomalies.ipynb.

  cache/agg15_<file>.csv  15-minute bins (UTC start): per-phase active power mean/min/max/count (W),
                          Voltage_A-N mean/min/max (V), Frequency min/max (Hz) and the last value of
                          the four active-energy counters (kWh) in each bin
  cache/flat_<file>.csv   runs of identical consecutive power readings lasting >= FLAT_MIN_SECONDS
  cache/gaps_<file>.csv   recording gaps longer than GAP_SECONDS

Nothing is written next to the raw data except the cache folder. Re-running skips cached files.
"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd

POWER = ["Active_Power_A", "Active_Power_B", "Active_Power_C"]
ENERGY = ["Active_Energy_in_Quadrant_I", "Active_Energy_in_Quadrant_II",
          "Active_Energy_in_Quadrant_III", "Active_Energy_in_Quadrant_IV"]
EXTRA = ["Voltage_A-N", "Frequency"]
FLAT_MIN_SECONDS = 600     # stuck-value screen: >= 10 minutes of identical readings
GAP_SECONDS = 30           # recording gap: > 30 s between consecutive readings
BIN = "15min"


def raw_files(data_dir: Path) -> list[Path]:
    return sorted(p for p in data_dir.glob("E*/E*_2026-*.csv") if p.stat().st_size > 0)


def _cache_paths(cache_dir: Path, f: Path):
    stem = f.stem
    return (cache_dir / f"agg15_{stem}.csv", cache_dir / f"flat_{stem}.csv", cache_dir / f"gaps_{stem}.csv")


def process_file(f: Path, cache_dir: Path) -> None:
    meter = f.stem.split("_")[0]
    cols = ["_time"] + POWER + ENERGY + EXTRA
    df = pd.read_csv(f, usecols=cols, dtype={c: "float64" for c in cols if c != "_time"})
    df["t"] = pd.to_datetime(df["_time"], format="ISO8601", utc=True)
    df = df.drop(columns="_time").sort_values("t", kind="stable").reset_index(drop=True)

    # ---- 15-minute aggregates
    df["bin"] = df["t"].dt.floor(BIN)
    g = df.groupby("bin", sort=True)
    out = pd.DataFrame(index=g.size().index)
    out["n_rows"] = g.size()
    for c in POWER:
        out[f"{c}_mean"] = g[c].mean()
        out[f"{c}_min"] = g[c].min()
        out[f"{c}_max"] = g[c].max()
        out[f"{c}_count"] = g[c].count()
    total = df[POWER].sum(axis=1, min_count=3)          # only rows with all three phases
    out["P_total_mean"] = total.groupby(df["bin"]).mean()
    out["P_total_max"] = total.groupby(df["bin"]).max()
    out["P_total_count"] = total.groupby(df["bin"]).count()
    out["V_AN_mean"] = g["Voltage_A-N"].mean()
    out["V_AN_min"] = g["Voltage_A-N"].min()
    out["V_AN_max"] = g["Voltage_A-N"].max()
    out["Freq_min"] = g["Frequency"].min()
    out["Freq_max"] = g["Frequency"].max()
    for c in ENERGY:
        out[f"{c}_last"] = g[c].last()
    out.index.name = "bin_utc"
    out.insert(0, "meter", meter)
    agg_path, flat_path, gap_path = _cache_paths(cache_dir, f)

    # ---- stuck / flat runs in power channels (identical consecutive readings)
    secs = (df["t"] - df["t"].iloc[0]).dt.total_seconds().to_numpy()
    flats = []
    for c in POWER:
        v = df[c].to_numpy()
        change = np.r_[True, v[1:] != v[:-1]]
        starts = np.flatnonzero(change)
        ends = np.r_[starts[1:], len(v)]           # exclusive
        dur = secs[ends - 1] - secs[starts]
        for s, e, d in zip(starts, ends, dur):
            if d >= FLAT_MIN_SECONDS:
                flats.append({"meter": meter, "channel": c, "start_utc": df["t"].iloc[s], "end_utc": df["t"].iloc[e - 1],
                              "seconds": round(float(d), 1), "n_readings": int(e - s), "value_W": float(v[s])})
    # ---- recording gaps
    dt = np.diff(secs)
    idx = np.flatnonzero(dt > GAP_SECONDS)
    gaps = [{"meter": meter, "last_before_utc": df["t"].iloc[i], "first_after_utc": df["t"].iloc[i + 1],
             "seconds": round(float(dt[i]), 1)} for i in idx]

    tmp = agg_path.with_suffix(".tmp")
    out.to_csv(tmp)
    pd.DataFrame(flats, columns=["meter", "channel", "start_utc", "end_utc", "seconds", "n_readings", "value_W"]).to_csv(flat_path, index=False)
    pd.DataFrame(gaps, columns=["meter", "last_before_utc", "first_after_utc", "seconds"]).to_csv(gap_path, index=False)
    tmp.replace(agg_path)  # agg file written last = completion marker


def prepare(data_dir: Path, cache_dir: Path, max_seconds: float | None = None, verbose: bool = True) -> bool:
    """Process uncached files. Returns True when every file is cached."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    start = time.time()
    files = raw_files(data_dir)
    for f in files:
        if _cache_paths(cache_dir, f)[0].exists():
            continue
        if max_seconds is not None and time.time() - start > max_seconds:
            break
        t0 = time.time()
        process_file(f, cache_dir)
        if verbose:
            print(f"cached {f.name} in {time.time() - t0:.1f}s", flush=True)
    done = all(_cache_paths(cache_dir, f)[0].exists() for f in files)
    if verbose:
        n = sum(_cache_paths(cache_dir, f)[0].exists() for f in files)
        print(f"{n}/{len(files)} files cached")
    return done


def load(cache_dir: Path):
    """Return (agg15, flats, gaps) data frames from the cache."""
    def read_all(pattern, dates):
        frames = [pd.read_csv(p, parse_dates=dates) for p in sorted(cache_dir.glob(pattern))]
        non_empty = [f for f in frames if not f.empty]
        return pd.concat(non_empty, ignore_index=True) if non_empty else frames[0]

    agg = read_all("agg15_*.csv", ["bin_utc"])
    flats = read_all("flat_*.csv", ["start_utc", "end_utc"])
    gaps = read_all("gaps_*.csv", ["last_before_utc", "first_after_utc"])
    for frame, cols in ((flats, ["start_utc", "end_utc"]), (gaps, ["last_before_utc", "first_after_utc"])):
        for c in cols:
            frame[c] = pd.to_datetime(frame[c], utc=True)
    agg["bin_utc"] = pd.to_datetime(agg["bin_utc"], utc=True)
    agg = agg.sort_values(["meter", "bin_utc"]).reset_index(drop=True)
    return agg, flats, gaps
