const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { bundle, files, meters } = require('./fixtures/chronos2.cjs');
const phase = require('./fixtures/history-comparison.cjs');

const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const real = process.env.CHRONOS_REAL === '1';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [], requests = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('request', request => { if (request.url().includes('/data/anomaly/')) requests.push(request.url()); });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const texts = bundle();
    if (!real) for (const [key, file] of Object.entries(files)) {
      await page.route('**/' + file, route => route.fulfill({ contentType: 'text/csv', body: texts[key] }));
    }
    const go = async section => {
      await page.locator('.tabs a[data-section="' + section + '"]').click();
      await page.waitForFunction(name => DC.state.section === name && !document.querySelector('#main-content').hasAttribute('aria-busy'), section);
    };
    const toggle = name => page.locator('#buildings-source').getByRole('button', { name, exact: true }).click();
    const open = async meter => {
      await go('buildings');
      await page.locator('[data-real-meter="' + meter + '"] .action-link').click();
      await page.waitForFunction(id => document.querySelector('#h-buildings')?.textContent === id, meter);
    };
    const setDates = async (from, to) => {
      await page.locator('#buildings-history-from').fill(from);
      await page.locator('#buildings-history-to').fill(to);
    };
    const count = page.locator('#chronos-event-count');
    const events = page.locator('#chronos-event-list button');
    const chart = page.locator('#chronos-chart svg');

    await page.goto(base + '/#buildings');
    assert.equal(await page.locator('.building-card').count(), 8);
    assert.equal(requests.length, 0);
    await toggle('Real DERCONNECT');
    await page.waitForFunction(n => document.querySelectorAll('[data-real-meter]').length === n, meters.length);
    assert.equal(requests.length, 3);
    assert.equal(await page.locator('#buildings-history-from').isEnabled(), true);

    const eventCounts = real ? [21, 23, 24, 25, 13] : [1, 1, 1, 1, 0];
    for (const [i, meter] of meters.entries()) {
      await open(meter);
      await chart.waitFor();
      assert.match(await count.textContent(), new RegExp('^' + eventCounts[i] + ' candidate event'));
      assert.match(await page.locator('#chronos-analysis .sub').textContent(), new RegExp(meter + ' · chronos2-ft-5k'));
      assert.equal(await events.count(), eventCounts[i]);
      assert.equal(await page.locator('#buildings-history-chart').count(), 0);
    }

    await open('E2451');
    await chart.waitFor();
    assert.match(await page.locator('#chronos-analysis h3').textContent(), /Total Active Power/);
    assert.equal(await chart.locator('path[stroke-dasharray="5 4"]').count(), 1);
    assert.equal(await chart.locator('path[stroke="none"]').count(), 1);
    await page.locator('#chronos-band').uncheck();
    await chart.waitFor();
    assert.equal(await chart.locator('path[stroke="none"]').count(), 0);
    await page.locator('#chronos-band').check();

    if (!real) {
      await setDates('2026-03-01', '2026-03-01');
      const hit = chart.locator('.hit');
      const shade = chart.locator('rect[opacity="0.14"]');
      assert.equal(await shade.getAttribute('x'), await hit.getAttribute('x'));
      assert(Math.abs(Number(await shade.getAttribute('width')) / Number(await hit.getAttribute('width')) - 1 / 3) < 0.001);
      await hit.hover({ position: { x: 1, y: 100 } });
      assert.match(await page.locator('.tooltip.show').textContent(), /55\.0 kW.*16\.0 kW.*Flagged hour.*E2451-test-event/);
      await hit.click({ position: { x: 1, y: 100 } });
      await page.locator('#chronos-context-chart svg').waitFor();
      assert.match(await page.locator('#chronos-event').textContent(), /E2451-test-event.*2\.5.*55\.0 kW.*16\.0 kW.*Above expected/);
      await page.getByRole('button', { name: 'Close event' }).click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-focus-key') === 'E2451-test-event');
    }
    await events.first().focus();
    await page.keyboard.press('Enter');
    await page.locator('#chronos-context-chart svg').waitFor();
    assert.equal(await events.first().getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#chronos-event-title').textContent(), 'Unclassified candidate anomaly');
    assert.equal(await chart.locator('rect[stroke-width="1.5"]').count(), 1);
    assert.match(await page.locator('#chronos-event').textContent(), /End \(exclusive\).*Peak raw score.*Observed at peak.*Expected at peak/);
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        await page.waitForFunction(w => document.querySelector('#chronos-chart svg')?.clientWidth > (w < 500 ? 0 : 500) &&
          document.querySelector('#chronos-chart svg').clientWidth < w, width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        assert(await page.locator('#chronos-context-chart svg').isVisible());
        if (process.env.CHRONOS_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.CHRONOS_SCREENSHOT_DIR, { recursive: true });
          await page.locator('#chronos-analysis').screenshot({ path: process.env.CHRONOS_SCREENSHOT_DIR + '/' + theme + '-' + width + '.png' });
        }
      }
    }
    assert.equal(requests.length, 3, 'Redraws and meter navigation reuse the loaded bundle');

    await setDates(real ? '2026-02-01' : '2026-02-28', '2026-02-28');
    assert.match(await page.locator('#building-anomalies').textContent(), /No scored detection hours/);
    assert.equal(await count.count(), 0);
    await setDates('2027-01-01', '2027-01-02');
    assert.match(await page.locator('#chronos-analysis').textContent(), /No Chronos-2 hours/);
    assert.equal(await count.count(), 0);
    await page.getByRole('button', { name: 'Full available range', exact: true }).click();
    await chart.waitFor();

    if (!real) {
      const unknown = phase({ meter: 'E9999', start: '2026-03-01T08:00:00Z' });
      unknown.facility_type = null;
      const products = [phase({ start: '2026-03-01T08:00:00Z' }), unknown];
      await page.locator('#buildings-history-files').setInputFiles(products.map((data, i) => ({
        name: 'synthetic-' + i + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
      })));
      await page.waitForFunction(() => DC.history.session.products.length === 2);
      await page.locator('#buildings-history-chart svg').waitFor();
      assert.match(await page.locator('#building-demand .sub').textContent(), /Active_Power_A/);
      assert.match(await page.locator('#buildings-history-quality').textContent(), /usable.*valid slots/);
      await chart.waitFor();
      assert.match(await page.locator('#buildings-history-kind').textContent(), /Synthetic test fixtures/);
      await open('E9999');
      assert.match(await page.locator('#chronos-analysis').textContent(), /No Chronos-2 outputs are available for this meter/);
      assert.equal(await count.count(), 0);

      await go('historical');
      await page.locator('#history-chart svg').waitFor();
      assert.equal(await page.locator('#chronos-analysis:visible, #building-anomalies:visible').count(), 0);
    }

    await go('buildings');
    await toggle('Prototype Data');
    await page.waitForFunction(() => document.querySelectorAll('.building-card').length === 8);
    assert.equal(await page.locator('#chronos-analysis:visible').count(), 0);
    await go('investigate');
    assert(await page.locator('#sec-investigate').isVisible());

    if (!real) {
      const fallback = await browser.newPage();
      await fallback.goto(base + '/#buildings');
      await fallback.evaluate(() => document.querySelector('meta[name="derconnect-chronos2"]').remove());
      await fallback.getByRole('button', { name: 'Real DERCONNECT', exact: true }).click();
      await fallback.locator('#chronos-files').setInputFiles([{
        name: files.forecasts, mimeType: 'text/csv', buffer: Buffer.from(texts.forecasts),
      }]);
      await fallback.waitForFunction(() => document.querySelector('#chronos-load-status')?.textContent.includes('together'));
      await fallback.locator('#chronos-files').setInputFiles(Object.entries(files).map(([key, name]) => ({
        name, mimeType: 'text/csv', buffer: Buffer.from(texts[key]),
      })));
      await fallback.waitForFunction(() => document.querySelectorAll('[data-real-meter]').length === 5);
      await fallback.close();
    } else {
      await page.goto(base + '/#buildings/derconnect%3AE2451');
      await chart.waitFor();
      assert.match(await count.textContent(), /^21 candidate events/);
    }
    assert.deepEqual(errors, []);
    console.log('PASS Chronos-2 real-meter UI, all five meters, candidate investigation, dates, themes and responsive charts (' + (real ? 'committed export' : 'synthetic fixtures and workflow regression') + ').');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
