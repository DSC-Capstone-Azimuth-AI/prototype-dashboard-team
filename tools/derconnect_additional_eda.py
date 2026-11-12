"""Offline H–K summaries. No dashboard adapter, exports, models or imputation.

Power calendar comparisons reuse F's hourly summaries. One additional chunked
pass retains electrical summaries and fixed histograms, never complete raw CSVs.
"""
from pathlib import Path
import hashlib
import json
import re
import zipfile

import numpy as np
import pandas as pd

from inspect_derconnect import UNITS
from derconnect_full_quality import _bounds, _parse_times, _numbers, _accumulate

ELECTRICAL = [r for r in UNITS if r.startswith((
    'Voltage_', 'Current_', 'Power_Factor_', 'THD_')) or r == 'Frequency']
POWER = ['Active_Power_' + p for p in 'ABC']


def calendar_tables(result, minimum_bin_fraction=0.8):
    """Equal weight per eligible elapsed hour; preserve full calendar denominators.

    The second coverage rule controls the fraction of eligible hourly bins in a
    day/week/month, independently of F's valid-slot rule inside each hourly bin.
    Monday weeks at dataset edges are marked partial and withheld.
    """
    if not 0 < minimum_bin_fraction <= 1:
        raise ValueError('minimum_bin_fraction must be in (0, 1].')
    tz = result['metadata']['calendar_tz']
    frames = []
    for (meter, minutes), frame in result['aggregates'].items():
        if minutes != 60:
            continue
        local = frame.index.tz_convert(tz)
        for channel in result['channels']:
            item = pd.DataFrame({
                'device': meter, 'channel': channel, 'timestamp_utc': frame.index,
                'local_day': local.normalize(), 'hour': local.hour,
                'weekend': local.dayofweek >= 5,
                'month': local.strftime('%Y-%m'),
                'mean_kw': frame[channel + '__mean_kw'].to_numpy(),
            })
            # Strip timezone only to derive calendar labels, never source instants.
            item['week'] = local.tz_localize(None).to_period('W-SUN').start_time
            frames.append(item)
    hours = pd.concat(frames, ignore_index=True)
    profiles = hours.groupby(['device', 'channel', 'weekend', 'hour']).mean_kw.agg(
        mean_kw='mean', median_kw='median', valid_hours='count').reset_index()
    tables = {'hours': hours, 'profiles': profiles}
    for name, key in [('daily', 'local_day'), ('weekly', 'week'), ('monthly', 'month')]:
        summary = hours.groupby(['device', 'channel', key]).mean_kw.agg(
            mean_kw='mean', peak_hourly_mean_kw='max',
            valid_hours='count', expected_hours='size').reset_index()
        summary['eligible_hours_pct'] = 100 * summary.valid_hours / summary.expected_hours
        if name == 'weekly':
            # DST-aware expected duration of an entire local Monday week.
            starts = pd.DatetimeIndex(summary[key]).tz_localize(tz)
            ends = (pd.DatetimeIndex(summary[key]) + pd.Timedelta(days=7)).tz_localize(tz)
            whole_week_hours = (ends.tz_convert('UTC') - starts.tz_convert('UTC')).total_seconds() / 3600
            summary['partial_calendar_period'] = summary.expected_hours.to_numpy() != whole_week_hours
        else:
            summary['partial_calendar_period'] = False  # F supplies whole local months.
        usable = (summary.eligible_hours_pct >= 100 * minimum_bin_fraction) & ~summary.partial_calendar_period
        summary.loc[~usable, ['mean_kw', 'peak_hourly_mean_kw']] = np.nan
        tables[name] = summary
    return tables


def quantile_bounds(counts, low, high, probability):
    """Histogram interval containing the empirical inverse-CDF quantile.

    This is NOT an exact interpolated raw median/p95. Never substitute a midpoint
    as an exact result. All finite accepted observations contribute deterministically.
    """
    if not 0 <= probability <= 1:
        raise ValueError('Quantile probability must be in [0, 1].')
    n = int(np.sum(counts))
    if not n:
        return np.nan, np.nan
    if low == high:
        return float(low), float(high)
    rank = max(1, int(np.ceil(probability * n)))
    i = min(len(counts) - 1, int(np.searchsorted(np.cumsum(counts), rank)))
    width = (high - low) / len(counts)
    return low + i * width, min(high, low + (i + 1) * width)


def _accumulator(size):
    return dict(count=np.zeros(size, dtype=np.int64), sum=np.zeros(size),
                sumsq=np.zeros(size), min=np.full(size, np.inf), max=np.full(size, -np.inf))


def scan_measurements(path, result, *, chunksize=25000, histogram_bins=4096, progress=print):
    """Additional pass for I/J only; reuse F's time parsing and duplicate policy.

    Ranges for histogram edges come from F, but statistics here include only valid
    time/ID/month rows outside F's duplicate five-minute bins. Unexpected values
    outside those edges fail rather than silently clipping a changed source.
    Per-register finite-slot coverage is computed for one meter/month at a time.
    No full raw quantile arrays, random samples, or output files are retained.
    """
    if chunksize < 1 or histogram_bins < 2:
        raise ValueError('Positive chunksize and at least two histogram bins required.')
    meta = result['metadata']
    tz, cadence = meta['calendar_tz'], meta['cadence_s']
    if cadence <= 0 or 900 / cadence % 1:
        raise ValueError('Cadence must divide 15 minutes.')
    registers = POWER + ELECTRICAL
    devices = list(result['summary'].device.unique())
    months = list(result['summary'].month.unique())
    ranges = result['measurements'].groupby(['device', 'register']).agg(low=('min', 'min'), high=('max', 'max'))
    stats, aggregates, peaks, histograms = [], {}, {}, {}
    notify = progress or (lambda _: None)
    scanned = 0
    with zipfile.ZipFile(Path(path).expanduser()) as archive:
        inventory = {}
        signature = []
        for info in archive.infolist():
            if info.is_dir() or Path(info.filename).suffix.lower() != '.csv':
                continue
            device = next((d for d in devices if d in Path(info.filename).parts), None)
            tokens = {t.replace('_', '-') for t in re.findall(r'2026[-_]\d{2}', Path(info.filename).name)}
            if device and len(tokens) == 1 and next(iter(tokens)) in months:
                inventory.setdefault((device, next(iter(tokens))), []).append(info)
                signature.append((info.filename, info.CRC, info.file_size))
        for device in devices:
            raw = {}
            for register in registers:
                bounds = ranges.loc[(device, register)]
                raw[register] = dict(count=0, sum=0., sumsq=0., low=bounds.low, high=bounds.high,
                                     min=np.inf, max=-np.inf, histogram=np.zeros(histogram_bins, dtype=np.int64))
            for month in months:
                start, end = _bounds(month, tz)
                slots = int((end - start).total_seconds() / cadence)
                slots_per_bin = int(900 / cadence)
                size = slots // slots_per_bin
                index = pd.date_range(start, periods=size, freq='15min')
                acc = {r: _accumulator(size) for r in registers}
                present = {r: np.zeros(slots, dtype=bool) for r in registers}
                reference = result['aggregates'][(device, 5)]
                # F's complete grid includes all selected months.
                duplicate5 = reference.loc[(reference.index >= start) & (reference.index < end), 'duplicate_bin'].to_numpy()
                for info in sorted(inventory.get((device, month), []), key=lambda i: i.filename):
                    with archive.open(info) as stream:
                        reader = pd.read_csv(stream, dtype='string', keep_default_na=False,
                                             chunksize=chunksize, on_bad_lines='error')
                        for chunk in reader:
                            parsed, _, _ = _parse_times(chunk['_time'])
                            times = parsed.array.as_unit('ns').asi8
                            accept = parsed.notna().to_numpy() & chunk.DeviceID.str.strip().eq(device).fillna(False).to_numpy(bool)
                            accept &= (times >= start.value) & (times < end.value)
                            chosen = np.flatnonzero(accept)
                            slot = ((times[chosen] - start.value) // int(cadence * 1e9)).astype(np.int64)
                            keep = ~duplicate5[slot // int(300 / cadence)]
                            chosen, slot = chosen[keep], slot[keep]
                            bins = slot // slots_per_bin
                            # Vectorized local calendar dates avoid formatting 32M strings.
                            # Timezone is removed only after conversion to campus wall time.
                            days = parsed.iloc[chosen].dt.tz_convert(tz).dt.tz_localize(None).to_numpy(dtype='datetime64[D]')
                            for register in registers:
                                if register not in chunk:
                                    continue
                                values, _, _ = _numbers(chunk[register])
                                values = values[chosen]
                                finite = np.isfinite(values)
                                valid = values[finite]
                                if not len(valid):
                                    continue
                                present[register][slot[finite]] = True
                                _accumulate(acc[register], bins, values)
                                item = raw[register]
                                low, high = float(valid.min()), float(valid.max())
                                if not np.isfinite(item['low']) or low < item['low'] or high > item['high']:
                                    raise ValueError('Source values changed since F; rerun F before H–L.')
                                item['count'] += len(valid)
                                item['sum'] += valid.sum()
                                item['sumsq'] += np.sum(valid * valid)
                                item['min'], item['max'] = min(item['min'], low), max(item['max'], high)
                                if item['low'] == item['high']:
                                    hist_index = np.zeros(len(valid), dtype=np.int64)
                                else:
                                    hist_index = np.minimum(histogram_bins - 1, (
                                        (valid - item['low']) / (item['high'] - item['low']) * histogram_bins).astype(np.int64))
                                item['histogram'] += np.bincount(hist_index, minlength=histogram_bins)
                                if register in POWER:
                                    for day in np.unique(days[finite]):
                                        candidates = np.flatnonzero(finite & (days == day))
                                        tied = candidates[values[candidates] == values[candidates].max()]
                                        best = tied[np.argmin(times[chosen[tied]])]
                                        timestamp = parsed.iloc[chosen[best]]
                                        key = (device, register, str(day))
                                        previous = peaks.get(key)
                                        peak_kw = values[best] / 1000.
                                        if previous is None or peak_kw > previous['observed_peak_kw'] or (
                                                peak_kw == previous['observed_peak_kw'] and timestamp < previous['peak_utc']):
                                            peaks[key] = dict(device=device, channel=register, local_day=str(day),
                                                observed_peak_kw=values[best] / 1000., peak_utc=timestamp)
                    scanned += 1
                    notify(f'Additional electrical/statistics scan: {device} {month} EOF ({scanned} CSVs)')
                frame = pd.DataFrame(index=index)
                frame.index.name = 'timestamp_utc'
                for register, a in acc.items():
                    count = a['count']
                    coverage = present[register].reshape(-1, slots_per_bin).mean(axis=1) * 100
                    duplicate15 = duplicate5.reshape(-1, 3).any(axis=1)
                    usable = (count > 0) & (coverage >= 100 * meta['minimum_coverage']) & ~duplicate15
                    mean = np.divide(a['sum'], count, out=np.full(size, np.nan), where=count > 0)
                    for field, value in [('mean', mean), ('min', a['min']), ('max', a['max'])]:
                        frame[register + '__' + field] = np.where(usable, value, np.nan)
                    frame[register + '__coverage_pct'] = coverage
                aggregates.setdefault(device, []).append(frame)
            for register, item in raw.items():
                n = item['count']
                mean = item['sum'] / n if n else np.nan
                med = quantile_bounds(item['histogram'], item['low'], item['high'], .5)
                p95 = quantile_bounds(item['histogram'], item['low'], item['high'], .95)
                stats.append(dict(device=device, register=register, mapped_unit=UNITS[register], finite_rows=n,
                    min=item['min'] if n else np.nan, max=item['max'] if n else np.nan,
                    mean=mean, std=np.sqrt(max(0., item['sumsq']/n - mean**2)) if n else np.nan,
                    median_low=med[0], median_high=med[1], p95_low=p95[0], p95_high=p95[1],
                    constant=bool(n and item['min'] == item['max'])))
                histograms[(device, register)] = (item['histogram'], item['low'], item['high'])
    peak_frame = pd.DataFrame(list(peaks.values()), columns=['device', 'channel', 'local_day', 'observed_peak_kw', 'peak_utc'])
    peak_frame['peak_utc'] = pd.to_datetime(peak_frame.peak_utc, utc=True)
    peak_frame['peak_local'] = peak_frame.peak_utc.dt.tz_convert(tz)
    peak_frame['peak_local_hour'] = peak_frame.peak_local.dt.hour
    peak_frame['month'] = peak_frame.local_day.str[:7]
    return dict(statistics=pd.DataFrame(stats), aggregates={d: pd.concat(a).sort_index() for d, a in aggregates.items()},
                daily_peaks=peak_frame, histograms=histograms,
                metadata=dict(complete_files=scanned, histogram_bins=histogram_bins,
                    inventory_sha256=hashlib.sha256(json.dumps(sorted(signature)).encode()).hexdigest(),
                    fingerprint_note='ZIP member names, CRC32 and sizes; not a cryptographic content hash'))


def distribution_tables(result, extra):
    """Exact quantiles of eligible 15-minute means; raw quantiles stay bounded."""
    rows = []
    for (device, minutes), frame in result['aggregates'].items():
        if minutes != 15:
            continue
        for channel in result['channels']:
            values = frame[channel + '__mean_kw'].dropna()
            rows.append(dict(device=device, channel=channel, eligible_bins=len(values),
                min_kw=values.min(), max_kw=values.max(), mean_kw=values.mean(),
                median_kw=values.median(), p95_kw=values.quantile(.95),
                std_kw=values.std(ddof=0), iqr_kw=values.quantile(.75)-values.quantile(.25)))
    raw = extra['statistics'].loc[extra['statistics'].register.isin(POWER)].copy()
    for field in ['min', 'max', 'mean', 'std', 'median_low', 'median_high', 'p95_low', 'p95_high']:
        raw[field + '_kw'] = raw[field] / 1000.
    return raw, pd.DataFrame(rows)


def matched_comparison(result, channel):
    """Same UTC hour for every meter; signed median normalization only if >0."""
    wide = pd.DataFrame({device: frame[channel + '__mean_kw'] for (device, minutes), frame in result['aggregates'].items() if minutes == 60})
    common = wide.dropna(how='any')
    summary = common.agg(['mean', 'max', 'median', 'std']).T if len(common) else pd.DataFrame(index=wide.columns)
    summary['common_hours'] = len(common)
    summary['union_hours'] = len(wide)
    summary['common_hours_pct'] = 100 * len(common) / len(wide) if len(wide) else np.nan
    medians = common.median()
    normalized = common.divide(medians.where(medians > 0), axis='columns')
    return common, summary, normalized
