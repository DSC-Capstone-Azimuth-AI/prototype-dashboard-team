/* Real Overview/Inspect synchronization. Synthetic fixtures by default; CHRONOS_REAL=1 uses committed exports. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { bundle, files } = require('./fixtures/chronos2.cjs');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const real = process.env.CHRONOS_REAL === '1';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (r.url().includes('/data/anomaly/')) requests.push(r.url()); });
    if (!real) for (const [key, file] of Object.entries(files)) await page.route('**/' + file, route => route.fulfill({ contentType: 'text/csv', body: bundle()[key] }));
    const go = async section => {
      await page.locator('.tabs a[data-section="' + section + '"]').click();
      await page.waitForFunction(s => DC.state.section === s && !document.querySelector('#main-content').hasAttribute('aria-busy'), section);
    };
    await page.goto(base + '/#overview');
    const synthetic = await page.locator('#sec-overview .kpi .value').allTextContents();
    await page.locator('#overview-source').selectOption('historical');
    await page.locator('#real-overview-chart svg').first().waitFor();
    const total = real ? 106 : 4;
    assert.equal(await page.locator('[data-real-metric="events"] .value').textContent(), String(total));
    assert.equal(await page.locator('[data-real-metric="affected"] .value').textContent(), real ? '5 of 5' : '4 of 5');
    assert.equal(await page.locator('[data-real-metric="duration"] .value').textContent(), real ? '4 h' : '1 h');
    assert.equal(await page.locator('#filters').isVisible(), true);
    assert.equal(await page.locator('[data-overview-meter]').count(), 5);
    assert.equal(await page.inputValue('#f-meter'), 'all');
    assert.deepEqual(await page.locator('[data-overview-chart-meter]').evaluateAll(nodes => nodes.map(n => n.dataset.overviewChartMeter)), ['E2451', 'E3020', 'E3510', 'E7080', 'E7085']);
    await page.waitForFunction(() => document.querySelectorAll('#real-overview-chart svg').length === 5);
    assert.equal(await page.locator('#sec-overview .kpi .metric-icon').count(), 4);
    assert.equal(await page.locator('#filters .filter:visible').count(), 2);
    assert.match(await page.locator('#real-analysis-coverage').textContent(), /Analyzed coverage:/);
    assert.equal(requests.length, 3);
    assert.equal(await page.locator('#real-overview-chart svg *').evaluateAll(nodes => nodes.filter(n => [...n.attributes].some(a => /NaN|Infinity/.test(a.value))).length), 0);
    const first = page.locator('#real-overview-queue-table button').first();
    const id = await first.getAttribute('data-event-id');
    await page.evaluate(() => {
      const open = DC.chronos2.session.open;
      window.realOpenCalls = 0;
      DC.chronos2.session.open = (...args) => { window.realOpenCalls++; return open(...args); };
    });
    for (const entry of ['id', 'row', 'enter', 'space', 'button-enter']) {
      const row = page.locator('#real-overview-queue-table tr[data-event-id="' + id + '"]');
      assert.equal(await row.getByRole('link', { name: id, exact: true }).getAttribute('href'), '#investigate/' + encodeURIComponent('real:' + id));
      await page.evaluate(() => { window.realOpenCalls = 0; });
      if (entry === 'id') await row.getByRole('link', { name: id, exact: true }).click();
      else if (entry === 'row') await row.locator('td').nth(2).click();
      else if (entry === 'button-enter') { await row.getByRole('button').focus(); await page.keyboard.press('Enter'); }
      else { await row.focus(); await page.keyboard.press(entry === 'enter' ? 'Enter' : 'Space'); }
      await page.locator('#real-event-chart svg').waitFor();
      assert.equal(await page.evaluate(() => DC.state.routeId), 'real:' + id);
      assert.equal(await page.evaluate(() => window.realOpenCalls), 1, entry + ' navigates exactly once');
      assert.equal(await page.locator('#h-investigate').textContent(), 'Event investigation');
      assert(await page.locator('#real-event-detail .detail-head').isVisible());
      assert(await page.locator('#filters').isHidden());
      await page.goBack();
      await page.locator('#real-overview-queue-table').waitFor();
      assert.equal(await page.inputValue('#f-meter'), 'all');
    }
    await first.click();
    await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.evaluate(() => DC.state.routeId), 'real:' + id);
    const original = await page.evaluate(() => {
      const s = DC.chronos2.session, e = s.event(s.state.selected);
      return { id: e.id, meter: e.meter, start: e.start, end: e.end, duration: e.duration, score: e.score, actual: e.actual, expected: e.expected };
    });
    assert.match(await page.locator('#real-event-detail').textContent(), new RegExp(original.meter + '.*' + id));
    assert.equal(await page.locator('#real-event-chart rect[stroke-width="1.5"]').count(), 1);
    const highlight = await page.evaluate(() => {
      const S = DC.chronos2.session, event = S.event(S.state.selected), rows = S.full(event.meter).context(event);
      const svg = document.querySelector('#real-event-chart svg'), rect = svg.querySelector('rect[stroke-width="1.5"]');
      const span = (rows.at(-1).time - rows[0].time) / DC.chronos2.HOUR + 1, width = svg.clientWidth - 60;
      return { actualX: Number(rect.getAttribute('x')), actualWidth: Number(rect.getAttribute('width')),
        expectedX: 48 + ((event.start - rows[0].time) / DC.chronos2.HOUR) * width / span,
        expectedWidth: Math.max(2, ((event.end - event.start) / DC.chronos2.HOUR) * width / span) };
    });
    assert(Math.abs(highlight.actualX - highlight.expectedX) < 0.1);
    assert(Math.abs(highlight.actualWidth - highlight.expectedWidth) < 0.1);
    assert.match(await page.locator('#real-event-detail').textContent(), /Deviation at Score Peak/);
    assert.equal(await page.locator('#real-event-detail .summary-facts > .fact').count(), 4);
    assert.equal(await page.locator('#real-event-detail .summary-facts').textContent().then(t => t.includes('Peak raw score')), false);
    const threshold = page.locator('#real-event-detail .fact').filter({ hasText: 'Prediction threshold' }).locator('.v');
    const thresholdValues = await page.evaluate(() => {
      const S = DC.chronos2.session, e = S.event(S.state.selected);
      return S.full(e.meter).rows.filter(r => r.time >= e.start && r.time < e.end && r.period === 'detection' && r.threshold !== null).map(r => r.threshold);
    });
    if (thresholdValues.length && thresholdValues.every(v => v === thresholdValues[0])) {
      assert.equal(Number(await threshold.getAttribute('title')), thresholdValues[0]);
      if (thresholdValues[0] !== 0) assert.notEqual(Number((await threshold.textContent()).replaceAll(',', '')), 0);
    }
    await page.getByText('Supporting hourly measurements and model outputs', { exact: true }).click();
    assert(await page.locator('#real-event-hours tbody tr').count() > 1);
    const selected = page.locator('#real-event-hours tr.selected');
    assert(await selected.count() > 0);
    assert(await page.locator('#real-event-hours tbody tr:not(.selected)').count() > 0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForFunction(id => DC.chronos2.session.state.selected !== id, id);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await page.waitForFunction(id => DC.chronos2.session.state.selected === id, id);
    await page.reload(); await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), id);
    await page.locator('#real-return-meter').click();
    await page.locator('#chronos-chart svg').waitFor();
    assert.equal(await page.evaluate(() => DC.state.routeId), 'derconnect:' + original.meter);
    assert.equal(await page.locator('#chronos-chart rect[stroke-width="1.5"]').count(), 1);
    const meterRow = page.locator('#chronos-event-list tr[data-event-id="' + id + '"]');
    assert.equal(await meterRow.getByRole('link', { name: id, exact: true }).getAttribute('href'), '#investigate/' + encodeURIComponent('real:' + id));
    await meterRow.getByRole('link', { name: id, exact: true }).click();
    await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), id);
    await page.goBack(); await page.locator('#chronos-chart svg').waitFor();
    await meterRow.focus(); await page.keyboard.press('Space');
    await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), id);
    await page.goBack(); await page.locator('#chronos-chart svg').waitFor();
    await page.locator('#chronos-event-list button[data-focus-key="' + id + '"]').click();
    await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), id);
    assert.equal(await page.locator('#real-event-interval').textContent(), await page.evaluate(e => DC.history.stamp(e.start) + ' → ' + DC.history.stamp(e.end) + ' (end exclusive)', original));
    await page.locator('#sec-investigate a[href="#investigate"]').click();
    await page.locator('#real-investigate-log-table').waitFor();
    await page.locator('#f-meter').selectOption('E2451');
    await page.locator('#f-range').selectOption('custom');
    await page.locator('#f-from').fill('2026-03-01');
    await page.locator('#f-to').fill('2026-03-01');
    const filtered = await page.locator('#real-investigate-log-table tbody tr').count();
    const outside = await page.evaluate(() => DC.chronos2.session.full('E3020').events[0].id);
    await page.evaluate(id => { location.hash = DC.chronos2.session.href(id); }, outside);
    await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), outside);
    assert.match(await page.locator('#real-detail-scope').textContent(), /outside.*retained.*filters.*own historical context/);
    await page.locator('#sec-investigate a[href="#investigate"]').click();
    await page.locator('#real-investigate-log').waitFor();
    assert.equal(await page.inputValue('#f-meter'), 'E2451');
    assert.equal(await page.inputValue('#f-from'), '2026-03-01');
    assert.equal(await page.inputValue('#f-to'), '2026-03-01');
    await go('overview');
    assert.equal(await page.inputValue('#f-meter'), 'E2451');
    assert.equal(await page.inputValue('#f-from'), '2026-03-01');
    assert.equal(await page.locator('[data-real-metric="events"] .value').textContent(), String(filtered));
    assert.equal(await page.locator('[data-real-metric="affected"] .value').textContent(), '1 of 1');
    assert.deepEqual(await page.locator('[data-overview-chart-meter]').evaluateAll(nodes => nodes.map(n => n.dataset.overviewChartMeter)), ['E2451']);
    await page.locator('[data-overview-meter="E2451"] a.action-link').click();
    await page.locator('#chronos-chart svg').waitFor();
    assert.equal(await page.inputValue('#building-events-from'), '2026-03-01');
    assert.equal(await page.locator('#chronos-event-list tbody tr').count(), filtered);
    await page.locator('#building-events-from').fill('2027-01-01');
    assert.equal(await page.locator('#chronos-event-list tbody tr').count(), 0);
    await go('overview');
    assert.equal(await page.inputValue('#f-from'), '2027-01-01');
    assert.equal(await page.locator('[data-real-metric="events"] .value').textContent(), '0');
    assert.match(await page.locator('#real-overview-queue').textContent(), /No grouped candidate events/);
    await page.locator('#f-range').selectOption('all');
    await page.locator('#f-meter').selectOption('E3020');
    await page.locator('#real-overview-queue-table button').first().click();
    await page.locator('#real-event-chart svg').waitFor();
    assert.match(await page.locator('#real-event-detail').textContent(), /E3020/);
    if (!real) {
      assert.match(await page.locator('#real-event-detail').textContent(), /55\.00 kW.*16\.00 kW/);
      await page.getByText('Supporting hourly measurements and model outputs', { exact: true }).click();
      assert.match(await page.locator('#real-event-hours tr.selected').textContent(), /2\.5.*0\.125.*Flagged.*Measured.*detection/);
      assert.match(await page.locator('#real-event-interval').textContent(), /Mar 1, 2026, 12:00 AM PST.*01:00 AM PST/);
      assert.equal((await page.locator('#real-event-detail .chronos-method').textContent()).includes('Detection hours with incomplete'), false, 'Context quality excludes an unscored hour elsewhere in the export');
    }
    await page.locator('#investigate-source').selectOption('synthetic');
    await page.locator('#sec-investigate table').first().waitFor();
    assert.equal(await page.locator('#real-event-detail:visible').count(), 0);
    await go('overview');
    assert.deepEqual(await page.locator('#sec-overview .kpi .value').allTextContents(), synthetic);
    await go('models'); await page.locator('#sec-models svg').first().waitFor({ state: 'attached' });
    await go('buildings'); assert.equal(await page.locator('.building-card').count(), 8);
    await page.goto(base + '/#investigate/CR-030'); await page.locator('#event-detail svg').first().waitFor();
    await page.getByLabel('Investigation status', { exact: true }).selectOption('investigating');
    await page.reload(); await page.locator('#event-detail svg').first().waitFor();
    assert.equal(await page.getByLabel('Investigation status', { exact: true }).inputValue(), 'investigating');
    await page.goto(base + '/#investigate/real%3Aunknown');
    await page.locator('#real-event-unavailable').waitFor();
    assert.equal(await page.locator('#real-event-detail').count(), 0);
    await page.goto(base + '/#investigate/' + encodeURIComponent('real:' + id));
    await page.locator('#real-event-chart svg').waitFor();
    await page.goBack(); await page.locator('#real-event-unavailable').waitFor();
    await page.goForward(); await page.locator('#real-event-chart svg').waitFor();
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        assert(await page.locator('#real-event-chart svg').isVisible());
        if (process.env.SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/real-detail-' + theme + '-' + width + '.png', fullPage: true });
        }
      }
    }
    await go('overview');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.locator('#real-overview-chart svg').first().waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('#real-overview-chart .chart')].every(node => node.querySelector('svg')?.clientWidth <= node.clientWidth));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      assert.equal(await page.locator('#sec-overview .kpi .metric-icon:visible').count(), 4);
      assert.equal(await page.locator('#sec-overview .kpi .metric-icon').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().width > 0 && getComputedStyle(n).stroke !== 'none').length), 4);
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/real-overview-' + theme + '-390.png', fullPage: true });
    }
    await page.locator('#f-range').selectOption('custom');
    await page.locator('#f-from').fill('2026-03-01'); await page.locator('#f-to').fill('2026-03-08');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.locator('#f-reset').click();
    assert.equal(await page.inputValue('#f-meter'), 'all'); assert.equal(await page.inputValue('#f-range'), 'all');
    assert.equal(await page.locator('[data-overview-chart-meter]').count(), 5);
    await page.reload(); await page.locator('#overview-source').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.inputValue('#overview-source'), 'synthetic');
    assert.deepEqual(errors, []);
    if (!real) {
      const empty = await browser.newPage();
      await empty.goto(base + '/#overview');
      await empty.evaluate(() => document.querySelector('meta[name="derconnect-chronos2"]').remove());
      await empty.locator('#overview-source').selectOption('historical');
      assert(await empty.locator('#real-overview-empty').isVisible());
      assert.equal(await empty.locator('#sec-overview .kpi').count(), 0);
      await empty.locator('.tabs a[data-section="investigate"]').click();
      await empty.locator('#real-investigate-empty').waitFor();
      assert.equal(await empty.locator('#event-detail').count(), 0);
      await empty.locator('#investigate-chronos-files').setInputFiles(Object.entries(files).map(([key, name]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(bundle()[key]) })));
      await empty.locator('#real-investigate-log-table').waitFor();
      assert.equal(await empty.locator('#real-investigate-log-table tbody tr').count(), 4);
      await empty.close();
    }
    console.log('PASS shared real Overview, grouped counts, filters, exact Inspect from both pages, context/highlight, cross-meter selection, reload/back/forward, mode isolation, synthetic review, missing data, themes and mobile (' + (real ? 'committed export' : 'synthetic fixture') + ').');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
