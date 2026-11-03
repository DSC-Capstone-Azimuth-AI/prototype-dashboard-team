#!/usr/bin/env python3
"""Build the DERCONNECT dashboard data files from the D05 anomaly team's detector code.

The detection path reuses the numpy-only modules of
`chronos2-sarsim0-anomaly-team` (sarsim_fm.anomaly.* and sarsim_fm.data.anomaly_injection):

    inject_anomaly      -> labelled synthetic events (kept in a separate labels file)
    rolling_forecast    -> one-step quantile forecasts (MedianMAD, SeasonalNaive, optional Chronos-2)
    *_score             -> interval_exceedance / robust_residual / quantile_tail
    fit_thresholds      -> split-conformal thresholds on the clean calibration window
    build_events        -> grouped detections (min_run, merge_gap, hysteresis)
    event_metrics, ...  -> precision / recall / F1 / delay / AUPRC / coverage

Protocol (same as `docs/anomaly-detection.md`):
    campus-dev     choose score, target FPR and event settings (162 candidates per detector)
    campus-test    locked settings; this is the data the dashboard displays
    campus-normal  no injected events; measures false alarms

The campus itself (8 buildings, 3 PV meters, weather, occupancy) is simulated here because
DERCONNECT measurements are not yet available. Replace `simulate_campus` with a loader for
real meters once access is confirmed; everything downstream is model- and data-agnostic.

Usage:
    python tools/build_data.py --repo ../chronos2-sarsim0-anomaly-team
    # inside the team's uv environment, Chronos-2 can be added as another detector:
    uv run python ../derconnect-dashboard/tools/build_data.py --repo . --model chronos2:amazon/chronos-2
"""

from __future__ import annotations

import argparse
import importlib.util
import itertools
import json
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

GENERATOR_VERSION = "derconnect-campus-sim 1.0.0"
LEVELS = (0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99)  # sarsim_fm.evaluate.LEVELS
Q01, Q10, Q50, Q90, Q99 = (LEVELS.index(x) for x in (0.01, 0.1, 0.5, 0.9, 0.99))

START = datetime(2026, 8, 10, 0, 0)          # Monday
DAYS = 84                                    # 12 weeks of hourly data, through 2026-11-01 23:00
N = DAYS * 24
PREFIX = 42 * 24                             # clean prefix: Aug 10 - Sep 20 (six weeks)
CAL_START = PREFIX // 2                      # thresholds fit on [CAL_START, PREFIX)
DET_START = CAL_START // 2                   # first forecast; residual scale fit on [DET_START, CAL_START)
CONTEXT = 256
SCORES = ("interval_exceedance", "robust_residual", "quantile_tail")
SEEDS = {"campus-dev": 3_200_000, "campus-test": 4_200_000, "campus-normal": 5_200_000}

SUBGRIDS = [
    {"id": "N1", "name": "Feeder N1 (North)"},
    {"id": "C2", "name": "Feeder C2 (Central)"},
    {"id": "S3", "name": "Feeder S3 (South)"},
]
# Fictional campus. kW figures are typical magnitudes, not measurements.
BUILDINGS = [
    dict(id="ENG", name="Engineering Hall", subgrid="N1", profile="office", base=180, occ_kw=260, hvac=14, pv=120),
    dict(id="LIB", name="Science Library", subgrid="N1", profile="library", base=120, occ_kw=170, hvac=9, pv=0),
    dict(id="LAB", name="Research Lab B", subgrid="C2", profile="office", base=340, occ_kw=140, hvac=16, pv=0),
    dict(id="STU", name="Student Center", subgrid="C2", profile="student", base=90, occ_kw=220, hvac=10, pv=150),
    dict(id="DCA", name="Data Center Annex", subgrid="C2", profile="flat", base=520, occ_kw=25, hvac=11, pv=0),
    dict(id="RES", name="Residence Hall North", subgrid="S3", profile="residence", base=110, occ_kw=130, hvac=6, pv=0),
    dict(id="ADM", name="Administration", subgrid="S3", profile="admin", base=60, occ_kw=130, hvac=7, pv=80),
    dict(id="REC", name="Recreation Center", subgrid="S3", profile="rec", base=70, occ_kw=150, hvac=8, pv=0),
]
# Normal changes the detectors should not call faults (negative controls).
NORMAL_CONTROLS = [
    {"id": "heatwave", "name": "Santa Ana heat wave", "start_day": 56, "end_day": 61,
     "note": "Weather-driven cooling load; real but expected given temperature."},
    {"id": "openhouse", "name": "Campus open house (Sat)", "start_day": 68, "end_day": 69,
     "note": "Scheduled occupancy surge at Student Center, Library and Rec Center."},
]

# Repository kinds map onto the dashboard taxonomy (doc section 4). Three kinds are added here
# because building-energy faults need them; they are not part of the repo's injection module.
EXTRA_KINDS = ("overnight_load", "hvac_contextual", "pv_underperformance")
KIND_DURATIONS = {  # hours (min, max)
    "spike": (1, 2), "dip": (1, 3), "level_shift": (18, 48), "variance_burst": (8, 20),
    "trend_change": (36, 72), "seasonal_disruption": (24, 48), "dropout": (4, 12),
    "stuck_sensor": (8, 24), "reversed_segment": (12, 24), "time_warp": (12, 24),
}


# --------------------------------------------------------------------------------------------
# Repository import
# --------------------------------------------------------------------------------------------
def load_repo(repo: Path):
    src = repo / "src"
    if not (src / "sarsim_fm" / "anomaly" / "scores.py").exists():
        sys.exit(f"{repo} does not look like chronos2-sarsim0-anomaly-team (missing src/sarsim_fm)")
    sys.path.insert(0, str(src))
    real_runtime = True
    try:
        import sarsim_fm.runtime  # noqa: F401  (needs torch)
    except Exception:
        # Without torch, stub the runtime module so the numpy-only code can be imported.
        real_runtime = False
        stub = types.ModuleType("sarsim_fm.runtime")
        stub.Runtime = object
        stub.ROOT = repo
        sys.modules["sarsim_fm.runtime"] = stub
    from sarsim_fm.anomaly import calibration, events, forecast, metrics, scores
    from sarsim_fm.anomaly.baselines import MedianMAD
    from sarsim_fm.data import anomaly_injection

    spec = importlib.util.spec_from_file_location("sfm_naive", src / "sarsim_fm" / "models" / "naive.py")
    naive = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(naive)
    return types.SimpleNamespace(scores=scores, calibration=calibration, events=events,
                                 metrics=metrics, forecast=forecast, MedianMAD=MedianMAD,
                                 SeasonalNaive=naive.SeasonalNaive, inj=anomaly_injection,
                                 real_runtime=real_runtime)


# --------------------------------------------------------------------------------------------
# Campus simulation
# --------------------------------------------------------------------------------------------
def solar_clear_sky(day_index, hour, lat=32.88):
    doy = START.timetuple().tm_yday + np.asarray(day_index)
    decl = np.radians(23.45) * np.sin(2 * np.pi * (284 + doy) / 365)
    ha = np.radians(15 * (hour + 0.5 - 12))
    phi = np.radians(lat)
    sin_el = np.sin(phi) * np.sin(decl) + np.cos(phi) * np.cos(decl) * np.cos(ha)
    return 1050 * np.maximum(0, sin_el) ** 1.15


def occupancy_profile(profile, hour, weekend):
    h = hour
    if profile == "flat":
        return 0.3 + 0.2 * ((h >= 8) & (h < 18) & ~weekend)
    if profile == "residence":
        base = 0.55 + 0.3 * np.exp(-((h - 7.5) / 1.5) ** 2) + 0.45 * np.exp(-((h - 20.5) / 2.5) ** 2)
        return np.where(weekend, base * 1.05, base - 0.25 * ((h >= 10) & (h < 16)))
    hours = {"office": (7, 19), "admin": (8, 17), "library": (8, 23), "student": (8, 21), "rec": (6, 22)}[profile]
    on = (h >= hours[0]) & (h < hours[1])
    ramp = np.clip(np.minimum(h - hours[0] + 1, hours[1] - h) / 2.5, 0, 1)
    weekday = np.where(on, 0.25 + 0.75 * ramp, 0.08)
    weekend_level = {"office": 0.2, "admin": 0.05, "library": 0.45, "student": 0.4, "rec": 0.7}[profile]
    return np.where(weekend, np.where(on, 0.08 + weekend_level * ramp, 0.06), weekday)


def simulate_campus(seed):
    rng = np.random.default_rng(seed)
    t = np.arange(N)
    day, hour = t // 24, t % 24
    weekend = ((day % 7) >= 5)
    # Weather: seasonal cooling, diurnal cycle, synoptic AR(1) anomaly, heat wave, marine layer.
    synoptic = np.zeros(DAYS)
    for d in range(1, DAYS):
        synoptic[d] = 0.75 * synoptic[d - 1] + rng.normal(0, 1.3)
    seasonal = 25.5 - 6.5 * day / DAYS
    heat = np.zeros(N)
    for c in NORMAL_CONTROLS:
        if c["id"] == "heatwave":
            span = (day >= c["start_day"]) & (day < c["end_day"])
            heat[span] = 9 * np.sin(np.pi * (t[span] - c["start_day"] * 24) / ((c["end_day"] - c["start_day"]) * 24))
    cloud_day = np.clip(rng.beta(1.2, 3.0, DAYS) + 0.15 * (rng.random(DAYS) < 0.12), 0, 1)
    cloud_day[(np.arange(DAYS) >= 56) & (np.arange(DAYS) < 61)] = 0.03
    cloud = np.clip(cloud_day[day] + 0.35 * np.exp(-((hour - 7) / 2.5) ** 2) * (rng.random(DAYS)[day] < 0.6)
                    + rng.normal(0, 0.04, N), 0, 1)
    diurnal = 5.0 * np.sin(2 * np.pi * (hour - 9) / 24) * (1 - 0.5 * cloud)
    temp = seasonal + synoptic[day] + diurnal + heat + rng.normal(0, 0.35, N)
    ghi = solar_clear_sky(day, hour) * (1 - 0.75 * cloud ** 3.2)
    campus_factor = np.repeat(np.clip(rng.normal(1.0, 0.06, DAYS), 0.8, 1.2), 24)
    weather = {"temp": temp, "cloud": cloud, "ghi": ghi}

    buildings, meters = [], []
    for b in BUILDINGS:
        occ = occupancy_profile(b["profile"], hour, weekend) * campus_factor
        if b["id"] in ("STU", "LIB", "REC"):
            span = (day == 68) & (hour >= 9) & (hour < 18)
            occ = np.where(span, np.minimum(occ * 2.1, 1.6), occ)
        occ = np.clip(occ * (1 + rng.normal(0, 0.03, N)), 0, None)
        cdd = np.maximum(0, temp - 18)
        noise = np.zeros(N)
        e = rng.normal(0, 1, N)
        for i in range(1, N):
            noise[i] = 0.8 * noise[i - 1] + e[i]
        level = b["base"] + b["occ_kw"] * occ + b["hvac"] * cdd * (0.45 + 0.55 * np.minimum(occ, 1))
        load = np.maximum(level + noise * 0.018 * (b["base"] + 0.5 * b["occ_kw"]), 5)
        buildings.append({"id": b["id"], "name": b["name"], "subgrid": b["subgrid"],
                          "profile": b["profile"], "pv_kw": b["pv"], "occupancy": occ})
        meters.append({"id": f"{b['id']}-MAIN", "building": b["id"], "kind": "main",
                       "label": f"{b['name']} - main meter", "clean": load})
        if b["pv"]:
            t_cell = temp + ghi / 800 * 25
            pv = b["pv"] * ghi / 1000 * 0.86 * (1 - 0.0038 * (t_cell - 25))
            pv = np.maximum(pv * (1 + rng.normal(0, 0.025, N)), 0)
            meters.append({"id": f"{b['id']}-PV", "building": b["id"], "kind": "pv",
                           "label": f"{b['name']} - rooftop PV", "clean": pv})
    return weather, buildings, meters


def local_scale(x, start):
    hist = x[max(0, start - 96):start]
    return max(1.4826 * np.median(np.abs(hist - np.median(hist))), 1e-8)


def inject_extra(clean, kind, start, duration, severity, occ, ghi):
    out = clean.copy()
    scale = local_scale(clean, start)
    sl = slice(start, start + duration)
    hours = (np.arange(start, start + duration)) % 24
    if kind == "overnight_load":       # equipment left on overnight
        night = (hours < 6) | (hours >= 22)
        out[sl] += severity * scale * night * 0.6
    elif kind == "hvac_contextual":    # HVAC running hard on a mild day
        out[sl] += severity * scale * 0.55 * np.clip(occ[sl], 0.2, 1)
    elif kind == "pv_underperformance":  # inverter derate / soiling on clear days
        out[sl] *= np.where(ghi[sl] > 50, 1 - min(0.75, 0.12 * severity), 1)
    return out


def inject_campus(repo, meters, buildings, weather, seed, normal=False):
    """Inject labelled events after the clean prefix. Labels never touch detector inputs."""
    rng = np.random.default_rng(seed + 17)
    occ_by_b = {b["id"]: b["occupancy"] for b in buildings}
    for m in meters:
        m["series"] = m["clean"].copy()
    if normal:
        return []
    main = [m for m in meters if m["kind"] == "main"]
    pv = [m for m in meters if m["kind"] == "pv"]
    plan = [(k, None) for k in repo.inj.KINDS for _ in range(2)]
    plan += [("overnight_load", None), ("overnight_load", None),
             ("hvac_contextual", None), ("hvac_contextual", None),
             ("pv_underperformance", "pv"), ("pv_underperformance", "pv")]
    rng.shuffle(plan)
    blocked = []
    for c in NORMAL_CONTROLS:  # keep negative-control windows free of injected labels
        blocked.append((c["start_day"] * 24, c["end_day"] * 24))
    used = {m["id"]: [] for m in meters}
    labels = []
    for n, (kind, target) in enumerate(plan):
        pool = pv if target == "pv" else main
        for _attempt in range(200):
            m = pool[int(rng.integers(len(pool)))]
            if kind == "overnight_load":
                duration = 24 * int(rng.integers(3, 6))
                start = PREFIX + 24 * int(rng.integers(0, (N - PREFIX) // 24 - 6))
                start -= 2
            elif kind == "hvac_contextual":
                duration = 24 * int(rng.integers(1, 3)) - 14
                start = PREFIX + 24 * int(rng.integers(0, (N - PREFIX) // 24 - 3)) + 8
            elif kind == "pv_underperformance":
                duration = 24 * int(rng.integers(2, 5))
                start = PREFIX + 24 * int(rng.integers(0, (N - PREFIX) // 24 - 5))
            else:
                lo, hi = KIND_DURATIONS[kind]
                duration = int(rng.integers(lo, hi + 1))
                start = int(rng.integers(PREFIX + 6, N - duration - 6))
                if kind in ("spike", "dip"):  # place peaks in occupied afternoon hours more often
                    start = start - start % 24 + int(rng.choice([11, 13, 14, 15, 16, 2, 20]))
            end = start + duration
            if start < PREFIX or end > N - 1:
                continue
            if any(start < e + 24 and s < end + 24 for s, e in used[m["id"]]):
                continue
            if any(start < e and s < end for s, e in blocked):
                continue
            if kind == "hvac_contextual" and weather["temp"][start:end].mean() > 25:
                continue
            if kind == "pv_underperformance" and weather["cloud"][start:end].mean() > 0.35:
                continue
            break
        else:
            raise RuntimeError(f"could not place {kind}")
        severity = float(rng.uniform(1.5, 3.5) if kind in ("spike", "dip") else rng.uniform(0.9, 2.2))
        if kind == "time_warp":
            severity = float(rng.uniform(0.8, 1.6))
        before = m["series"].copy()
        if kind in EXTRA_KINDS:
            m["series"] = inject_extra(m["series"], kind, start, duration, severity,
                                       occ_by_b[m["building"]], weather["ghi"])
        else:
            m["series"], _ = repo.inj.inject_anomaly(m["series"], np.random.default_rng(seed + n),
                                                     kind, severity, duration, start, 24)
        if m["kind"] == "main" and kind != "dropout":  # keep meter readings physical inside the event
            m["series"][start:end] = np.maximum(m["series"][start:end], 1.0)
        used[m["id"]].append((start, end))
        diff = m["series"][start:end] - before[start:end]
        labels.append({
            "label_id": f"L{len(labels) + 1:02d}", "meter": m["id"], "building": m["building"],
            "kind": kind, "source": "repo inject_anomaly" if kind not in EXTRA_KINDS else "dashboard generator",
            "start": int(start), "end": int(end), "severity_param": round(severity, 3),
            "magnitude_kw": round(float(diff[np.argmax(np.abs(diff))]), 1),
            "energy_kwh": round(float(diff.sum()), 1),
        })
    labels.sort(key=lambda x: x["start"])
    for i, lab in enumerate(labels):
        lab["label_id"] = f"L{i + 1:02d}"
    return labels


# --------------------------------------------------------------------------------------------
# Detectors
# --------------------------------------------------------------------------------------------
class ContextRegression:
    """Context-aware baseline: hour x day-type profile + cooling degrees x occupancy + solar.

    Fit once on clean history [0, CAL_START); residual quantiles give the forecast band.
    Thresholds are still calibrated out-of-sample on [CAL_START, PREFIX).
    """

    def __init__(self, weather, occupancy, is_pv):
        t = np.arange(N)
        hour, weekend = t % 24, (t // 24) % 7 >= 5
        cdd = np.maximum(0, weather["temp"] - 18)
        if is_pv:
            g = weather["ghi"] / 1000
            X = np.column_stack([g, g * weather["temp"], g ** 2, np.ones(N)])
        else:
            onehot = np.zeros((N, 48))
            onehot[t, hour + 24 * weekend] = 1
            X = np.column_stack([onehot, cdd, cdd * np.minimum(occupancy, 1.2), occupancy])
        self.X, self.is_pv, self.ghi = X, is_pv, weather["ghi"]

    WINDOW = 21 * 24  # trailing training window (hours)

    def _fit(self, rows, y):
        X = self.X[rows]
        ridge = 1e-1 * np.eye(X.shape[1])
        beta = np.linalg.solve(X.T @ X + ridge, X.T @ y)
        resid = y - X @ beta
        # One robust pass: drop gross outliers (possible earlier anomalies) and refit.
        active = np.abs(y) > 1e-6  # ignore PV night-time zeros when estimating the spread
        ref = resid[active] if active.sum() > 24 else resid
        mad = 1.4826 * np.median(np.abs(ref - np.median(ref))) + 1e-8
        keep = (np.abs(resid) < 4 * mad) | ~active
        beta = np.linalg.solve(X[keep].T @ X[keep] + ridge, X[keep].T @ y[keep])
        return beta, (y - X @ beta)[keep], keep

    def forecast(self, series):
        """Causal: each day is predicted from a model refit on the preceding 21 days only."""
        q = np.full((N, len(LEVELS)), np.nan)
        for d in range(DET_START // 24, DAYS):
            rows = np.arange(max(0, 24 * d - self.WINDOW), 24 * d)
            beta, resid, keep = self._fit(rows, series[rows])
            today = np.arange(24 * d, 24 * d + 24)
            pred = self.X[today] @ beta
            if self.is_pv:
                day_rows = (self.ghi[rows] > 30)[keep]
                for mask_today, mask_hist in ((self.ghi[today] > 30, day_rows), (self.ghi[today] <= 30, ~day_rows)):
                    if mask_today.any():
                        r_hist = resid[mask_hist] if mask_hist.sum() >= 10 else resid
                        q[today[mask_today]] = pred[mask_today, None] + np.quantile(r_hist, LEVELS)[None, :]
                q[today] = np.maximum(q[today], 0)
            else:
                q[today] = pred[:, None] + np.quantile(resid, LEVELS)[None, :]
        times = np.arange(DET_START, N)
        return times, series[DET_START:], q[DET_START:], np.ones(len(times), dtype=int)


def forecast_meter(repo, detector, meter, ctx_models):
    series = meter["series"]
    if detector["id"] == "context_regression":
        return ctx_models[meter["id"]].forecast(series)
    fc = repo.forecast.rolling_forecast(detector["model"], meter["id"], series, DET_START,
                                        CONTEXT, LEVELS, 256)
    return fc.time, fc.actual, fc.quantiles, fc.forecast_horizon


def score_frame(repo, times, actual, q):
    s = repo.scores
    scale_fit = times < CAL_START
    scale = s.fit_residual_scale(actual[scale_fit], q[scale_fit, Q50])
    return {
        "interval_exceedance": s.interval_exceedance_score(actual, q, LEVELS),
        "robust_residual": s.robust_residual_score(actual, q[:, Q50], scale),
        "quantile_tail": s.quantile_tail_score(actual, q, LEVELS),
    }


def detect_events(repo, raw, horizons, model, event_cfg, offset):
    """Same normalisation as sarsim_fm.anomaly.pipeline._events."""
    boundary = np.array([model.thresholds[int(h)] for h in horizons])
    normalized = raw / np.maximum(boundary, 1e-8)
    alerts = repo.calibration.apply_thresholds(raw, horizons, model)
    normalized = np.where(alerts, np.maximum(normalized, np.nextafter(1.0, 2.0)), np.minimum(normalized, 1.0))
    evs = repo.events.build_events(normalized, alerts, **event_cfg)
    return alerts, [(e.start + offset, e.end + offset, e.peak_time + offset, e.peak_score) for e in evs]


def run_split(repo, detector, split):
    """Forecast + score every meter in one split. Returns per-meter frames."""
    frames = {}
    for m in split["meters"]:
        times, actual, q, horizons = forecast_meter(repo, detector, m, split["ctx"])
        frames[m["id"]] = {"times": times, "actual": actual, "q": q, "h": horizons,
                           "scores": score_frame(repo, times, actual, q)}
    return frames


def label_mask(times, labels):
    mask = np.zeros(len(times), dtype=bool)
    for lab in labels:
        mask |= (times >= lab["start"]) & (times < lab["end"])
    return mask


def pooled_thresholds(repo, frames, score, fpr):
    s, h = [], []
    for f in frames.values():
        cal = (f["times"] >= CAL_START) & (f["times"] < PREFIX)
        s.append(f["scores"][score][cal])
        h.append(f["h"][cal])
    return repo.calibration.fit_thresholds(np.concatenate(s), np.concatenate(h), fpr)


def evaluate_frames(repo, frames, labels_by_meter, score, model, event_cfg):
    counts = {"event_tp": 0, "event_fp": 0, "event_fn": 0}
    normal_pts = normal_alerts = 0
    all_events, delays = {}, []
    for mid, f in frames.items():
        ev_mask = f["times"] >= PREFIX
        alerts, evs = detect_events(repo, f["scores"][score][ev_mask], f["h"][ev_mask], model, event_cfg, PREFIX)
        labs = labels_by_meter.get(mid, [])
        lm = label_mask(f["times"][ev_mask], labs)
        normal_pts += int((~lm).sum())
        normal_alerts += int(alerts[~lm].sum())
        objs = [types.SimpleNamespace(start=e[0], end=e[1]) for e in evs]
        r = repo.metrics.event_metrics(objs, [(lab["start"], lab["end"]) for lab in labs])
        for k in counts:
            counts[k] += r[k]
        delays += r["detection_delays"]
        all_events[mid] = (alerts, evs)
    tp, fp, fn = counts["event_tp"], counts["event_fp"], counts["event_fn"]
    return {**counts,
            "event_precision": tp / (tp + fp) if tp + fp else 0.0,
            "event_recall": tp / (tp + fn) if tp + fn else 0.0,
            "event_f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.0,
            "detection_delay": float(np.mean(delays)) if delays else None,
            "normal_points": normal_pts, "normal_alerts": normal_alerts,
            "realized_fpr": normal_alerts / normal_pts if normal_pts else None}, all_events


def select_settings(repo, frames, labels_by_meter):
    """Grid of sarsim_fm.anomaly.selection: 3 scores x 3 FPRs x 18 event settings = 162."""
    best, n = None, 0
    for score, fpr in itertools.product(SCORES, repo.calibration.TARGET_FPRS):
        try:
            model = pooled_thresholds(repo, frames, score, fpr)
        except ValueError:
            continue
        for min_run, merge_gap, ratio in itertools.product([1, 2, 3], [0, 2, 6], [1.0, 0.75]):
            cfg = {"min_run": min_run, "merge_gap": merge_gap, "release_threshold_ratio": ratio}
            res, _ = evaluate_frames(repo, frames, labels_by_meter, score, model, cfg)
            n += 1
            ok = res["realized_fpr"] is not None and res["realized_fpr"] <= 2 * fpr
            key = (ok, res["event_f1"], -res["normal_alerts"], -(min_run + merge_gap), ratio)
            if best is None or key > best[0]:
                best = (key, {"score": score, "target_fpr": fpr, "events": cfg}, res)
    return best[1], best[2], n


# --------------------------------------------------------------------------------------------
# Event enrichment (classification, impact, explanation) - dashboard side, no labels used
# --------------------------------------------------------------------------------------------
def dq_flags(meter, series):
    """0 ok, 1 missing/zero, 2 stuck (>=4 identical readings). Independent of labels."""
    flags = np.zeros(N, dtype=int)
    if meter["kind"] == "main":
        flags[series <= 0.0] = 1
    run = 1
    for i in range(1, N):
        run = run + 1 if series[i] == series[i - 1] and series[i] > 0 else 1
        if run >= 4:
            flags[i - run + 1:i + 1] = np.where(flags[i - run + 1:i + 1] == 0, 2, flags[i - run + 1:i + 1])
    return flags


def classify(meter, actual, expected, s, e, flags, clean_ref):
    seg_a, seg_e = actual[s:e], expected[s:e]
    dev = seg_a - seg_e
    dur = e - s
    dq_share = float((flags[s:e] > 0).mean())
    hours = np.arange(s, e) % 24
    wknd = (np.arange(s, e) // 24) % 7 >= 5
    unocc = float((((hours < 6) | (hours >= 22)) | wknd).mean())
    lo, hi = np.percentile(clean_ref, [2, 98])
    peak_thr = float(np.percentile(clean_ref, 99.5))
    if dur <= 2:
        behavior = "point"
    elif seg_a.max() <= hi and seg_a.min() >= lo:
        behavior = "contextual"
    else:
        behavior = "collective"
    corr = float(np.corrcoef(seg_a, seg_e)[0, 1]) if dur >= 6 and seg_a.std() > 0 and seg_e.std() > 0 else 1.0
    if dq_share >= 0.3:
        category = "data_integrity"
    elif meter["kind"] == "main" and seg_a.max() > peak_thr and dev.max() > 0:
        category = "peak_demand"
    elif (unocc >= 0.6 and dev.mean() > 0) or (dur >= 12 and corr < 0.3):
        category = "seasonal_pattern"
    elif meter["kind"] == "pv":
        category = "generation_deficit" if dev.mean() < 0 else "generation_excess"
    else:
        category = "excess_consumption" if dev.mean() > 0 else "load_drop"
    if category in ("data_integrity", "peak_demand", "seasonal_pattern"):
        primary = {"data_integrity": "data_integrity", "peak_demand": "peak", "seasonal_pattern": "seasonal"}[category]
    else:
        primary = behavior
    return behavior, category, primary, dq_share, unocc, peak_thr


def explanations(meter, building, weather, s, e, dev_mean, category, unocc):
    out = []
    t = np.arange(s, e)
    prior = np.concatenate([t - 24 * k for k in range(1, 15)])
    prior = prior[prior >= 0]
    dtemp = float(weather["temp"][s:e].mean() - weather["temp"][prior].mean())
    occ = building["occupancy"]
    hist = np.concatenate([t - 168 * k for k in (1, 2, 3)])
    hist = hist[hist >= 0]
    occ_ratio = float(occ[s:e].mean() / max(occ[hist].mean(), 1e-6))
    cloud = float(weather["cloud"][s:e].mean())
    if category == "data_integrity":
        out.append({"type": "data_quality", "supports": True,
                    "text": "Meter reported zero or constant readings: likely a data-quality issue, not consumption."})
    if meter["kind"] == "pv":
        if cloud > 0.5 and dev_mean < 0:
            out.append({"type": "weather", "supports": True,
                        "text": f"Cloud cover averaged {cloud:.0%}; low irradiance may explain reduced output."})
        elif dev_mean < 0:
            out.append({"type": "weather", "supports": False,
                        "text": f"Mostly clear sky (cloud {cloud:.0%}); weather does not explain the generation deficit."})
        return out, dtemp, occ_ratio, cloud
    if dtemp > 3.5 and dev_mean > 0:
        out.append({"type": "weather", "supports": True,
                    "text": f"Temperature {dtemp:+.1f} °C vs. 14-day norm; extra cooling load may explain it."})
    elif dev_mean > 0:
        out.append({"type": "weather", "supports": False,
                    "text": f"Temperature {dtemp:+.1f} °C vs. 14-day norm; weather does not explain the extra load."})
    if occ_ratio > 1.3 and dev_mean > 0:
        out.append({"type": "occupancy", "supports": True,
                    "text": f"Occupancy {occ_ratio - 1:+.0%} vs. the same hours in prior weeks."})
    elif occ_ratio < 0.75 and dev_mean < 0:
        out.append({"type": "occupancy", "supports": True,
                    "text": f"Occupancy {occ_ratio - 1:+.0%} vs. prior weeks; lower use may explain the drop."})
    if unocc >= 0.6 and dev_mean > 0:
        out.append({"type": "schedule", "supports": False,
                    "text": "Load occurs mostly outside occupied hours: check HVAC/lighting schedules or equipment left on."})
    return out, dtemp, occ_ratio, cloud


def enrich_events(det, split, frames, weather, settings, model):
    events = []
    bmap = {b["id"]: b for b in split["buildings"]}
    prefix = {"rolling_mad": "RM", "seasonal_naive_24": "SN", "seasonal_naive_168": "SW",
              "context_regression": "CR"}.get(det["id"], det["id"][:2].upper())
    for m in split["meters"]:
        f = frames[m["id"]]
        actual = np.full(N, np.nan)
        expected = np.full(N, np.nan)
        actual[:] = m["series"]
        expected[f["times"]] = f["q"][:, Q50]
        ev_mask = f["times"] >= PREFIX
        raw = f["scores"][settings["score"]]
        _, evs = detect_events(det["repo"], raw[ev_mask], f["h"][ev_mask], model, settings["events"], PREFIX)
        clean_ref = m["series"][:PREFIX]
        median_load = float(np.median(clean_ref[clean_ref > 0])) if (clean_ref > 0).any() else 1.0
        for s, e, peak_t, peak_score in evs:
            behavior, category, primary, dq_share, unocc, peak_thr = classify(
                m, actual, expected, s, e, m["dq"], clean_ref)
            dev = actual[s:e] - expected[s:e]
            i_max = int(np.argmax(np.abs(dev)))
            excess = None if category == "data_integrity" else float(dev.sum())
            b = bmap[m["building"]]
            expl, dtemp, occ_ratio, cloud = explanations(m, b, weather, s, e, float(dev.mean()), category, unocc)
            rel = abs(dev[i_max]) / max(median_load, 1e-6)
            dur_f = min(1.0, np.log1p(e - s) / np.log1p(72))
            energy_f = 0.0 if excess is None else min(1.0, abs(excess) / max(median_load * 12, 1e-6))
            priority = 100 * (0.4 * min(1.0, rel / 0.5) + 0.25 * dur_f + 0.35 * energy_f)
            if category == "peak_demand":
                priority += 15
            if category == "data_integrity":
                priority = max(priority, 35 + 20 * dur_f)
            if any(x["supports"] and x["type"] in ("weather", "occupancy") for x in expl):
                priority *= 0.7
            priority = float(min(100, priority))
            severity = ("critical" if priority >= 70 else "high" if priority >= 45 else
                        "medium" if priority >= 25 else "low")
            status = "explained" if any(x["supports"] for x in expl) else "new"
            events.append({
                "id": "", "detector": det["id"], "meter": m["id"], "building": m["building"],
                "subgrid": b["subgrid"], "start": int(s), "end": int(e), "duration_h": int(e - s),
                "peak_t": int(peak_t), "novelty": round(float(peak_score), 2),
                "peak_actual": round(float(actual[s + i_max]), 1), "peak_expected": round(float(expected[s + i_max]), 1),
                "peak_dev": round(float(dev[i_max]), 1), "peak_dev_pct": round(float(rel * np.sign(dev[i_max]) * 100), 1),
                "mean_dev": round(float(dev.mean()), 1),
                "excess_kwh": None if excess is None else round(excess, 1),
                "behavior": behavior, "category": category, "type": primary,
                "priority": round(priority, 1), "severity": severity, "status": status,
                "dq_share": round(dq_share, 2), "offhours_share": round(unocc, 2),
                "context": {"temp_delta": round(dtemp, 1), "occupancy_ratio": round(occ_ratio, 2),
                            "cloud": round(cloud, 2), "temp_mean": round(float(weather["temp"][s:e].mean()), 1),
                            "peak_threshold_kw": round(peak_thr, 1) if m["kind"] == "main" else None},
                "explanations": expl,
                "detection": {"score": settings["score"], "target_fpr": settings["target_fpr"],
                              "threshold": round(float(model.thresholds[1]), 4), **settings["events"]},
            })
    events.sort(key=lambda x: (x["start"], x["meter"]))
    for i, ev in enumerate(events):
        ev["id"] = f"{prefix}-{i + 1:03d}"
    return events


# --------------------------------------------------------------------------------------------
def r(a, nd=1):
    return [None if not np.isfinite(v) else round(float(v), nd) for v in a]


def build_split(repo, name, normal=False):
    weather, buildings, meters = simulate_campus(SEEDS[name])
    labels = inject_campus(repo, meters, buildings, weather, SEEDS[name], normal=normal)
    occ = {b["id"]: b["occupancy"] for b in buildings}
    ctx = {m["id"]: ContextRegression(weather, occ[m["building"]], m["kind"] == "pv") for m in meters}
    for m in meters:
        m["dq"] = dq_flags(m, m["series"])
    by_meter = {}
    for lab in labels:
        by_meter.setdefault(lab["meter"], []).append(lab)
    return {"name": name, "weather": weather, "buildings": buildings, "meters": meters,
            "labels": labels, "by_meter": by_meter, "ctx": ctx}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", type=Path, required=True, help="path to chronos2-sarsim0-anomaly-team")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    ap.add_argument("--model", action="append", default=[],
                    help="extra repo forecaster spec, e.g. chronos2:amazon/chronos-2 (needs torch + chronos)")
    ap.add_argument("--device", default="auto")
    args = ap.parse_args()
    repo = load_repo(args.repo.resolve())

    detectors = [
        {"id": "context_regression", "label": "Context-aware regression",
         "source": "dashboard baseline + repo scoring",
         "description": "Hour x day-type profile, cooling degrees x occupancy, irradiance for PV. "
                        "Uses the repo's scores, conformal thresholds and event grouping."},
        {"id": "seasonal_naive_168", "label": "Seasonal naive (weekly)", "source": "repo SeasonalNaive(168)",
         "description": "Repeats the same hour last week. All quantiles equal the point forecast.",
         "model": repo.SeasonalNaive(168)},
        {"id": "seasonal_naive_24", "label": "Seasonal naive (daily)", "source": "repo SeasonalNaive(24)",
         "description": "Repeats the same hour yesterday.", "model": repo.SeasonalNaive(24)},
        {"id": "rolling_mad", "label": "Rolling median / MAD", "source": "repo MedianMAD",
         "description": "Median of the last 256 h with Gaussian quantiles from MAD. Ignores daily cycle.",
         "model": repo.MedianMAD()},
    ]
    for spec in args.model:
        if not repo.real_runtime:
            sys.exit("--model needs the repo's full environment (torch). Run inside `uv run`.")
        from sarsim_fm.models import load_forecaster
        from sarsim_fm.runtime import resolve_runtime
        detectors.append({"id": spec.replace(":", "_").replace("/", "_"), "label": spec, "source": f"repo {spec}",
                          "description": "Repo forecaster loaded through sarsim_fm.models.load_forecaster.",
                          "model": load_forecaster(spec, resolve_runtime(args.device), CONTEXT)})

    splits = {name: build_split(repo, name, normal=(name == "campus-normal")) for name in SEEDS}
    test = splits["campus-test"]
    out_detectors, out_events, evaluation, matches = [], [], {}, {}

    for det in detectors:
        det["repo"] = repo
        print(f"[{det['id']}] forecasting dev/test/normal ...", flush=True)
        frames = {name: run_split(repo, det, sp) for name, sp in splits.items()}
        settings, dev_res, n_cand = select_settings(repo, frames["campus-dev"], splits["campus-dev"]["by_meter"])
        model = pooled_thresholds(repo, frames["campus-test"], settings["score"], settings["target_fpr"])
        test_res, test_events = evaluate_frames(repo, frames["campus-test"], test["by_meter"],
                                                settings["score"], model, settings["events"])
        nmodel = pooled_thresholds(repo, frames["campus-normal"], settings["score"], settings["target_fpr"])
        normal_res, normal_events = evaluate_frames(repo, frames["campus-normal"], {}, settings["score"],
                                                    nmodel, settings["events"])
        # Secondary metrics: AUPRC, coverage (normal evaluation points), per-kind recall.
        auprc, cov80, cov98 = [], [], []
        for mid, f in frames["campus-test"].items():
            ev = f["times"] >= PREFIX
            lm = label_mask(f["times"][ev], test["by_meter"].get(mid, []))
            if lm.any():
                auprc.append(repo.metrics.point_auprc(lm, f["scores"][settings["score"]][ev]))
            c = repo.calibration.interval_coverage(f["actual"][ev][~lm], f["q"][ev][~lm], LEVELS)
            cov80.append(c["coverage_80"])
            cov98.append(c["coverage_98"])
        events = enrich_events(det, test, frames["campus-test"], test["weather"], settings, model)
        # Ground-truth matching (evaluation only): same rule as repo event_metrics.
        mt, per_kind = {}, {}
        for mid in {m["id"] for m in test["meters"]}:
            labs = sorted(test["by_meter"].get(mid, []), key=lambda x: x["end"])
            used = set()
            for ev in sorted([x for x in events if x["meter"] == mid], key=lambda x: x["start"]):
                hit = None
                for lab in labs:
                    if lab["label_id"] not in used and ev["start"] < lab["end"] and lab["start"] < ev["end"]:
                        hit = lab
                        used.add(lab["label_id"])
                        break
                mt[ev["id"]] = None if hit is None else {
                    "label_id": hit["label_id"], "delay_h": max(ev["start"], hit["start"]) - hit["start"]}
        hit_labels = {v["label_id"] for v in mt.values() if v}
        for lab in test["labels"]:
            k = per_kind.setdefault(lab["kind"], {"n": 0, "detected": 0})
            k["n"] += 1
            k["detected"] += lab["label_id"] in hit_labels
        controls = {}
        for c in NORMAL_CONTROLS:
            s0, e0 = c["start_day"] * 24, c["end_day"] * 24
            controls[c["id"]] = sum(1 for x in events if x["start"] < e0 and s0 < x["end"])
        matches[det["id"]] = mt
        evaluation[det["id"]] = {
            "selection": {"split": "campus-dev", "candidates": n_cand, **settings,
                          "dev_event_f1": round(dev_res["event_f1"], 3),
                          "dev_realized_fpr": round(dev_res["realized_fpr"], 4)},
            "test": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in test_res.items()},
            "normal": {"events": sum(len(v[1]) for v in normal_events.values()),
                       "normal_points": normal_res["normal_points"], "normal_alerts": normal_res["normal_alerts"],
                       "false_alerts_per_1000": round(1000 * normal_res["realized_fpr"], 2)},
            "auprc": round(float(np.mean(auprc)), 3) if auprc else None,
            "coverage_80": round(float(np.mean(cov80)), 3), "coverage_98": round(float(np.mean(cov98)), 3),
            "false_alerts_per_1000": round(1000 * test_res["realized_fpr"], 2),
            "per_kind": per_kind, "control_window_events": controls,
            "missed": sorted(lab["label_id"] for lab in test["labels"] if lab["label_id"] not in hit_labels),
            "false_positives": sorted(k for k, v in mt.items() if v is None),
        }
        series = {}
        for mid, f in frames["campus-test"].items():
            thr = np.array([model.thresholds[int(h)] for h in f["h"]])
            score = f["scores"][settings["score"]] / np.maximum(thr, 1e-8)
            series[mid] = {"q50": r(f["q"][:, Q50]), "q01": r(f["q"][:, Q01]), "q99": r(f["q"][:, Q99]),
                           "q10": r(f["q"][:, Q10]), "q90": r(f["q"][:, Q90]),
                           "score": r(np.minimum(score, 99), 2)}
        out_detectors.append({k: det[k] for k in ("id", "label", "source", "description")} | {
            "settings": settings, "threshold": round(float(model.thresholds[1]), 4), "series": series})
        out_events += events
        t = evaluation[det["id"]]
        print(f"  selected {settings} | test F1 {t['test']['event_f1']:.3f} P {t['test']['event_precision']:.3f} "
              f"R {t['test']['event_recall']:.3f} | events {len(events)}", flush=True)

    ts = lambda i: (START + timedelta(hours=int(i))).strftime("%Y-%m-%dT%H:%M")  # noqa: E731
    data = {
        "meta": {
            "title": "DERCONNECT Unified Dashboard", "generator_version": GENERATOR_VERSION,
            "seed": SEEDS["campus-test"], "seeds": SEEDS, "sampling_interval": "1h", "start": ts(0), "n": N,
            "clean_prefix": PREFIX, "calibration_start": CAL_START, "detector_start": DET_START,
            "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
            "source_repo": "chronos2-sarsim0-anomaly-team", "levels": LEVELS,
            "notes": ("Simulated campus (no DERCONNECT data yet). Detection uses the repo's scores, "
                      "split-conformal thresholds and event grouping. Injected labels are stored separately "
                      "in synthetic-labels.js."),
        },
        "subgrids": SUBGRIDS,
        "buildings": [{k: b[k] for k in ("id", "name", "subgrid", "profile", "pv_kw")} | {
            "occupancy": r(b["occupancy"], 3)} for b in test["buildings"]],
        "meters": [{"id": m["id"], "building": m["building"], "kind": m["kind"], "label": m["label"], "unit": "kW",
                    "actual": r(m["series"]), "dq": [int(x) for x in m["dq"]]} for m in test["meters"]],
        "weather": {"temp": r(test["weather"]["temp"]), "cloud": r(test["weather"]["cloud"], 2),
                    "ghi": r(test["weather"]["ghi"], 0)},
        "normal_controls": [c | {"start": c["start_day"] * 24, "end": c["end_day"] * 24} for c in NORMAL_CONTROLS],
        "detectors": out_detectors,
        "events": out_events,
        "evaluation": evaluation,
        "forecasting_results": FORECASTING_RESULTS,
    }
    labels = {
        "meta": {"generator_version": GENERATOR_VERSION, "dataset": "campus-test", "seed": SEEDS["campus-test"],
                 "sampling_interval": "1h", "index_convention": "zero-based half-open [start, end)",
                 "note": "Ground truth for evaluation only. Never used by detectors, thresholds or event priority."},
        "labels": test["labels"],
        "matches": matches,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "derconnect-data.js").write_text(
        "// Generated by tools/build_data.py - do not edit by hand.\nwindow.DERCONNECT_DATA = "
        + json.dumps(data, separators=(",", ":")) + ";\n")
    (args.out / "synthetic-labels.js").write_text(
        "// Synthetic ground truth (kept separate from detector output).\nwindow.DERCONNECT_LABELS = "
        + json.dumps(labels, indent=1) + ";\n")
    print(f"Wrote {args.out}/derconnect-data.js and synthetic-labels.js "
          f"({len(test['labels'])} labels, {len(out_events)} events across {len(detectors)} detectors)")


# From docs/results.md of chronos2-sarsim0-anomaly-team (forecasting backbone, not anomaly results).
FORECASTING_RESULTS = [
    {"model": "Seasonal naive", "sim_iid_mase": 1.1901, "sim_ood_mase": 1.1375, "m4_smape": 15.99, "m4_mase": 1.2597, "m4_cov98": 0.014},
    {"model": "amazon/chronos-2 (zero-shot)", "sim_iid_mase": 0.6343, "sim_ood_mase": 0.6234, "m4_smape": 13.11, "m4_mase": 0.9221, "m4_cov98": 0.973},
    {"model": "chronos2-ft-1k-b8", "sim_iid_mase": 0.6289, "sim_ood_mase": 0.6158, "m4_smape": 13.08, "m4_mase": 0.9174, "m4_cov98": 0.960},
    {"model": "chronos2-ft-500", "sim_iid_mase": 0.6248, "sim_ood_mase": 0.6105, "m4_smape": 12.75, "m4_mase": 0.9038, "m4_cov98": 0.973},
    {"model": "chronos2-ft-5k", "sim_iid_mase": 0.6176, "sim_ood_mase": 0.6054, "m4_smape": 12.89, "m4_mase": 0.9242, "m4_cov98": 0.965},
    {"model": "chronos2-scratch-20k", "sim_iid_mase": 0.7024, "sim_ood_mase": 0.8300, "m4_smape": 16.63, "m4_mase": 1.3712, "m4_cov98": 0.867},
]

if __name__ == "__main__":
    main()
