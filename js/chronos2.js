/* Adapter for the hourly flat CSV bundle from scripts/export_dashboard.py. */
(function () {
  'use strict';
  const DC = window.DC;
  const MODEL = 'chronos2-ft-5k', HOUR = 3600000;
  const quantiles = 'q01 q05 q10 q20 q30 q40 q50 q60 q70 q80 q90 q95 q99'.split(' ');
  const hourly = ['meter', 'time_local', 'time_utc', 'model', 'actual_kw'];
  const schemas = {
    forecasts: [...hourly, ...quantiles],
    predictions: [...hourly, 'score', 'threshold', 'flag', 'period', 'filled'],
    events: 'event_id meter model start end start_utc end_utc duration_h peak_time peak_score peak_actual_kw peak_expected_kw direction'.split(' '),
  };
  const names = Object.keys(schemas);
  const fileName = name => MODEL + '-' + name + '.csv';
  const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
  const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
  const hour = value => {
    const parsed = DC.csv.parseTimestamp(value);
    return parsed?.zoned && parsed.ms % HOUR === 0 ? parsed.ms : null;
  };
  const scored = row => row.period === 'detection' && row.score !== null && row.threshold !== null && row.flag !== null;

  function table(name, text) {
    const parsed = DC.csv.records(String(text ?? '').replace(/^\uFEFF/, ''));
    const [header, ...rows] = parsed.rows;
    const columns = header?.fields.map(value => value.trim()) || [];
    if (columns.length !== schemas[name].length || !schemas[name].every(key => columns.includes(key))) {
      throw new Error(name + ' CSV has an unexpected column schema.');
    }
    if (parsed.unterminatedLine) throw new Error(name + ' CSV has an unclosed quote on line ' + parsed.unterminatedLine + '.');
    return rows.map(({ fields, line }) => {
      const fail = message => { throw new Error(name + ' CSV, line ' + line + ' · ' + message); };
      if (fields.length !== columns.length) fail('Unexpected field count.');
      const row = Object.fromEntries(columns.map((key, i) => [key, fields[i].trim()]));
      const { meter, model } = row;
      if (!idPattern.test(meter) || model !== MODEL) fail('Invalid meter ID or unsupported model.');
      const number = (key, required = false) => {
        if (row[key] === '' && !required) return null;
        const value = Number(row[key]);
        if (!decimal.test(row[key]) || !Number.isFinite(value)) fail('Invalid ' + key + '.');
        return value;
      };
      if (name === 'events') {
        const { event_id: id, direction } = row;
        const start = hour(row.start_utc), end = hour(row.end_utc);
        const duration = number('duration_h', true);
        if (!idPattern.test(id) || !['above', 'below', 'mixed'].includes(direction) ||
            !Number.isSafeInteger(duration) || duration <= 0 || (start !== null && end !== null && end <= start)) {
          fail('Invalid event ID, interval, duration, or direction.');
        }
        return { id, meter, model, start, end, duration, direction,
          score: number('peak_score', true), actual: number('peak_actual_kw'), expected: number('peak_expected_kw') };
      }
      const time = hour(row.time_utc), actual = number('actual_kw');
      if (name === 'forecasts') {
        const q = Object.fromEntries(quantiles.map(key => [key, number(key)]));
        const values = Object.values(q).filter(v => v !== null);
        if (values.some((v, i) => i > 0 && v < values[i - 1])) fail('Forecast quantiles are out of order.');
        return { meter, time, actual, q };
      }
      const { period, flag, filled } = row;
      if (!['calibration', 'detection'].includes(period) || !['0', '1', ''].includes(flag) ||
          !['true', 'false', ''].includes(filled.toLowerCase())) fail('Invalid period, flag, or filled indicator.');
      return { meter, time, actual, period, flag: flag === '' ? null : flag === '1',
        filled: filled === '' ? null : filled.toLowerCase() === 'true', score: number('score'), threshold: number('threshold') };
    });
  }

  function parse(texts) {
    const tables = Object.fromEntries(names.map(name => [name, table(name, texts[name])]));
    const counts = Object.fromEntries(names.map(name => [name, tables[name].length]));
    // Each input row has already been checked against the one supported model ID.
    const meters = new Map();
    for (const name of ['forecasts', 'predictions']) {
      for (const row of tables[name]) {
        if (!meters.has(row.meter)) meters.set(row.meter, {
          byTime: new Map(), events: [], skipped: { forecasts: 0, predictions: 0, events: 0 },
        });
        const meter = meters.get(row.meter);
        if (row.time === null) { meter.skipped[name]++; continue; }
        if (!meter.byTime.has(row.time)) meter.byTime.set(row.time, { time: row.time });
        const sample = meter.byTime.get(row.time);
        if (sample[name]) throw new Error('Duplicate ' + name + ' UTC hour for ' + row.meter + '.');
        sample[name] = row;
      }
    }
    const eventIds = new Set();
    for (const event of tables.events) {
      const meter = meters.get(event.meter);
      if (!meter || eventIds.has(event.id)) throw new Error('Event CSV contains an unknown meter or duplicate event ID.');
      eventIds.add(event.id);
      if (event.start === null || event.end === null) { meter.skipped.events++; continue; }
      meter.events.push(event);
    }
    for (const meter of meters.values()) {
      meter.events.sort((a, b) => a.start - b.start);
      if (meter.events.some((event, i, events) => i > 0 && events[i - 1].end > event.start)) {
        throw new Error('Event CSV contains overlapping intervals for a meter.');
      }
      let i = 0;
      meter.rows = Array.from(meter.byTime.values()).sort((a, b) => a.time - b.time).map(sample => {
        const { time, forecasts: f, predictions: p } = sample;
        if (f?.actual != null && p?.actual != null && f.actual !== p.actual) {
          throw new Error('Forecast and prediction actual power disagree for the same meter and UTC hour.');
        }
        while (i < meter.events.length && meter.events[i].end <= time) i++;
        const event = p?.period === 'detection' && meter.events[i]?.start <= time ? meter.events[i] : null;
        return { time, day: DC.history.localDay(time), actual: f?.actual ?? null, q: f?.q ?? null,
          period: p?.period ?? null, score: p?.score ?? null, threshold: p?.threshold ?? null,
          flag: p?.flag ?? null, filled: p?.filled ?? null, event };
      });
      const matched = new Set(meter.rows.map(row => row.event).filter(Boolean));
      meter.skipped.events += meter.events.length - matched.size;
      delete meter.byTime;
      delete meter.events;
    }
    const available = Array.from(meters, ([id, meter]) => meter.rows.length ? id : null).filter(Boolean).sort();
    if (!available.length) throw new Error('The Chronos-2 CSVs contain no usable UTC hours.');
    const from = available.map(id => meters.get(id).rows[0].day).sort()[0];
    const to = available.map(id => meters.get(id).rows.at(-1).day).sort().at(-1);

    return {
      counts, meters: available, from, to,
      select(id, from = '', to = '') {
        const meter = meters.get(id);
        if (!meter) return null;
        const rows = meter.rows.filter(row => (!from || row.day >= from) && (!to || row.day <= to));
        const detection = rows.filter(row => row.period === 'detection');
        const scoredHours = detection.filter(scored).length;
        const events = scoredHours ? Array.from(new Set(detection.map(row => row.event).filter(Boolean))) : [];
        return { rows, events, scoredHours, unscoredHours: detection.length - scoredHours, skipped: meter.skipped,
          context: event => meter.rows.filter(row => row.time >= event.start - 24 * HOUR && row.time < event.end + 24 * HOUR),
        };
      },
    };
  }

  async function load(path) {
    const base = new URL(path, window.location.href);
    if (base.origin !== window.location.origin || !['http:', 'https:'].includes(base.protocol) ||
        !base.pathname.endsWith('/') || base.search || base.hash) throw new Error('Use a same-origin HTTP folder ending in /.');

    const texts = await Promise.all(names.map(async name => {
      const response = await window.fetch(new URL(fileName(name), base), { redirect: 'error' });
      if (!response.ok) throw new Error(name + ' CSV could not be loaded (HTTP ' + response.status + ').');
      return response.text();
    }));
    return parse(Object.fromEntries(names.map((name, i) => [name, texts[i]])));
  }

  async function readFiles(files) {
    if (files.length !== names.length) throw new Error('Select the forecasts, predictions and events CSVs together.');
    const texts = await Promise.all(names.map(name => {
      const file = files.find(file => file.name === fileName(name));
      if (!file) throw new Error('Missing ' + fileName(name) + '.');
      if (file.size > DC.csv.MAX_BYTES) throw new Error(fileName(name) + ' exceeds the 20 MB file limit.');
      return file.text();
    }));
    return parse(Object.fromEntries(names.map((name, i) => [name, texts[i]])));
  }

  DC.chronos2 = { MODEL, HOUR, load, readFiles, parse };
})();
