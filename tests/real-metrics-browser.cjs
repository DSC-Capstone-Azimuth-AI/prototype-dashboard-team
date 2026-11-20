const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const fixture = require('./fixtures/chronos2.cjs');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const metric = (page, name) => page.locator('[data-real-metric="' + name + '"]');
function data(change = () => {}) {
  const tables = Object.fromEntries(Object.entries(fixture.bundle()).map(([name, text]) => {
    const [keys, ...rows] = text.trim().split('\n').map(line => line.split(','));
    return [name, { keys, rows: rows.map(row => Object.fromEntries(keys.map((key, i) => [key, row[i]]))) }];
  }));
  for (const row of tables.events.rows) row.peak_score = '20'; // Explicit synthetic normalized scores; raw prediction = 2.5.
  change(tables);
  return Object.fromEntries(Object.entries(tables).map(([name, { keys, rows }]) =>
    [name, [keys.join(','), ...rows.map(row => keys.map(key => row[key]).join(','))].join('\n') + '\n']));
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const errors = [];
  try {
    let texts = data();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const [key, file] of Object.entries(fixture.files)) await page.route('**/' + file, route => route.fulfill({ contentType: 'text/csv', body: texts[key] }));
    const load = async () => { await page.goto(base + '/#overview'); await page.reload(); await page.locator('#overview-source').selectOption('historical'); await metric(page, 'events').waitFor(); };
    const go = async name => { await page.locator('.tabs a[data-section="' + name + '"]').click(); await page.waitForFunction(name => DC.state.section === name && !document.querySelector('#main-content').hasAttribute('aria-busy'), name); };
    const facts = page.locator('#real-event-detail .summary-facts');
    const deviation = () => facts.locator('[data-fact="Deviation at Score Peak (kW)"]');
    await load();
    assert.deepEqual(await page.locator('#sec-overview .kpi .label').allTextContents(), ['Candidate Events', 'Meters with Candidates', 'Largest Deviation from Expected', 'Longest Candidate Event']);
    assert.equal(await metric(page, 'events').locator('.value').textContent(), '4');
    assert.equal(await metric(page, 'affected').locator('.value').textContent(), '4 of 5');
    assert.equal(await metric(page, 'deviation').locator('.value').textContent(), '+39.00 kW');
    assert.match(await metric(page, 'deviation').textContent(), /Above expected.*E2451/);
    assert.equal(await page.locator('#real-overview-quality').evaluate(n => n.open), false);
    for (const name of ['events', 'affected']) {
      await metric(page, name).click(); await page.locator('#real-investigate-log-table').waitFor();
      assert.equal(await page.inputValue('#f-meter'), 'all'); await page.goBack(); await metric(page, name).waitFor();
    }
    for (const name of ['deviation', 'duration']) {
      await metric(page, name).click(); await page.locator('#real-event-chart svg').waitFor();
      assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), 'E2451-test-event');
      assert.equal(await facts.locator('.fact').count(), 4);
      assert.equal(await page.locator('#real-event-detail .card-body').evaluate(n => [...n.childNodes].some(c => c.nodeType === 3 && ['null', 'undefined'].includes(c.textContent.trim()))), false);
      assert.equal(await deviation().locator('.v').textContent(), '39.00 kW above expected');
      assert.match(await deviation().textContent(), /above expected.*Actual: 55\.00 kW.*Expected: 16\.00 kW/);
      const details = page.locator('[data-detection-details="E2451-test-event"]');
      assert.equal(await details.evaluate(n => n.open), false);
      await details.locator('summary').click();
      assert.equal(await details.locator('[data-fact="Raw prediction score"] .v').textContent(), '2.5');
      assert.equal(await details.locator('[data-fact="Prediction threshold"] .v').textContent(), '0.125');
      assert.equal(await details.locator('[data-fact="Exported normalized event peak score"] .v').textContent(), '20');
      await page.goBack(); await metric(page, name).waitFor();
    }
    await page.locator('#f-meter').selectOption('E7085');
    assert.equal(await metric(page, 'events').locator('.value').textContent(), '0');
    assert.equal(await metric(page, 'affected').locator('.value').textContent(), '0 of 1');
    assert.equal(await metric(page, 'duration').locator('.value').textContent(), 'Unavailable');
    assert.match(await metric(page, 'deviation').getAttribute('href'), /derconnect%3AE7085\?at=/);
    await metric(page, 'deviation').click(); await page.locator('#chronos-chart svg').waitFor();
    assert.match(await page.locator('#chronos-reading-focus').textContent(), /Flagged reading.*Mar 1, 2026, 12:00 AM PST.*55\.0 kW.*16\.0 kW/);
    assert.equal(await page.evaluate(() => DC.state.routeId), 'derconnect:E7085');
    await page.locator('#chronos-chart path[transform][paint-order="stroke"]').first().waitFor({ state: 'attached' });
    assert.equal(await page.locator('#chronos-chart path[transform][paint-order="stroke"]').count(), 1);
    await page.goBack(); await metric(page, 'events').waitFor(); assert.equal(await page.inputValue('#f-meter'), 'E7085');
    await metric(page, 'deviation').click(); await page.locator('#chronos-chart svg').waitFor();
    await page.reload(); await page.locator('#chronos-chart svg').waitFor(); assert.match(await page.locator('#chronos-reading-focus').textContent(), /Flagged reading/);
    await page.goto(base + '/#buildings/derconnect%3AE7085?at=bad'); await page.locator('#chronos-reading-unavailable').waitFor();

    texts = data(t => {
      for (const name of ['forecasts', 'predictions']) {
        const row = t[name].rows.find(r => r.meter === 'E2451' && r.time_utc === '2026-03-01 08:00:00+00:00');
        t[name].rows.push({ ...row, time_local: '2026-03-01 23:00:00', time_utc: '2026-03-02 07:00:00+00:00' }, { ...row, time_local: '2026-03-02 00:00:00', time_utc: '2026-03-02 08:00:00+00:00' });
      }
      Object.assign(t.events.rows.find(r => r.meter === 'E2451'), { start: '2026-03-01 23:00:00', start_utc: '2026-03-02 07:00:00+00:00', end: '2026-03-02 01:00:00', end_utc: '2026-03-02 09:00:00+00:00', duration_h: '2', peak_time: '2026-03-01 23:00:00' });
    });
    await load(); await page.locator('#f-meter').selectOption('E2451'); await page.locator('#f-range').selectOption('custom');
    await page.locator('#f-from').fill('2026-03-02'); await page.locator('#f-to').fill('2026-03-02');
    assert.equal(await metric(page, 'duration').locator('.value').textContent(), '2 h'); assert.match(await metric(page, 'duration').textContent(), /extends outside selected dates/);
    await metric(page, 'duration').click(); await page.locator('#real-event-chart svg').waitFor();
    assert.match(await facts.locator('[data-fact="Duration"]').textContent(), /2 h.*extends outside selected list dates/);
    await page.locator('#sec-investigate a[href="#investigate"]').click(); await page.locator('#real-investigate-log-table').waitFor();
    assert.equal(await page.inputValue('#f-from'), '2026-03-02'); assert.equal(await page.inputValue('#f-to'), '2026-03-02');

    for (const missing of ['interpolated', 'forecast']) {
      texts = data(t => {
        if (missing === 'interpolated') t.predictions.rows.find(r => r.meter === 'E2451' && r.time_local === '2026-03-01 00:00:00').filled = 'True';
        else t.forecasts.rows.find(r => r.meter === 'E2451' && r.time_local === '2026-03-01 00:00:00').q50 = '';
      });
      await load(); await page.locator('#f-meter').selectOption('E2451');
      assert.equal(await metric(page, 'deviation').locator('.value').textContent(), 'Unavailable');
      await metric(page, 'duration').click(); await page.locator('#real-event-chart svg').waitFor();
      assert.equal(await deviation().locator('.v').textContent(), 'Unavailable');
    }
    texts = data(); await load();
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      await page.setViewportSize({ width: 390, height: 1000 }); await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      assert.equal(await page.locator('#sec-overview .kpi .metric-icon:visible').count(), 4);
      assert.equal(await page.locator('#sec-overview .kpi .metric-icon').evaluateAll(nodes => nodes.filter(n => n.getAttribute('aria-hidden') === 'true').length), 4);
      if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/metrics-' + theme + '-390.png', fullPage: true }); }
      await metric(page, 'duration').focus(); await page.keyboard.press('Enter'); await page.locator('#real-event-chart svg').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      if (process.env.SCREENSHOT_DIR) { await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/facts-' + theme + '-390.png', fullPage: true }); }
      await page.goBack(); await metric(page, 'events').waitFor();
    }
    await page.locator('#f-range').selectOption('custom'); await page.locator('#f-from').fill('2027-01-01'); await page.locator('#f-to').fill('2027-01-01');
    assert.equal(await metric(page, 'events').locator('.value').textContent(), '0');
    assert.equal(await metric(page, 'deviation').locator('.value').textContent(), 'Unavailable');
    assert.equal(await metric(page, 'duration').locator('.value').textContent(), 'Unavailable');
    assert.deepEqual(errors, []);
    console.log('PASS actionable metric cards, source score semantics, physical facts, orphan reading routes/reload, filtered full durations, missing evidence, icons, themes and mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
