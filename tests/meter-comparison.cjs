/* Interactive related-meter checks. Serve localhost:8000; requires Playwright/Chrome. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const open = async id => {
      await page.goto(base + '/#investigate/' + id); await page.reload();
      await page.locator('#comparison-launch').click();
      await page.locator('.comparison-chart svg').first().waitFor();
    };
    const ids = () => page.locator('.comparison-row').evaluateAll(rows => rows.map(r => r.dataset.meter));
    const cursorTime = () => page.locator('#comparison-time').inputValue().then(Number);
    const synchronized = async () => {
      await page.waitForFunction(() => document.querySelectorAll('.comparison-chart svg').length > 0 && document.querySelectorAll('.comparison-chart svg').length === document.querySelectorAll('.comparison-row').length);
      const t = await cursorTime();
      const cursors = await page.locator('.comparison-chart .crosshair').evaluateAll(nodes => nodes.map(n => +n.getAttribute('data-time')));
      assert.equal(cursors.length, (await ids()).length);
      assert(cursors.every(value => value === t));
      const tickSets = await page.locator('.comparison-chart svg').evaluateAll(nodes => nodes.map(n => [...n.querySelector('g.ax').querySelectorAll('text')].map(t => t.textContent).join('|')));
      assert(tickSets.every(ticks => ticks === tickSets[0]), 'shared y scales');
      const expected = await page.evaluate(t => {
        const e = DC.eventById(DC.state.selected);
        return [...document.querySelectorAll('.comparison-row')].map(node => {
          const m = DC.meterById[node.dataset.meter], actual = m.actual[t];
          const forecast = DC.detectorById[e.detector].series[m.id].q50[t - DC.META.detector_start];
          return [DC.fmt.one(actual), DC.fmt.one(forecast), DC.fmt.signed(actual - forecast)];
        });
      }, t);
      const values = await page.locator('.comparison-readout tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].slice(0, 3).map(td => td.textContent)));
      assert.deepEqual(values, expected, 'readouts match original observed/forecast samples');
    };
    const geometry = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.comparison-chart svg').evaluateAll(nodes => nodes.flatMap(n => [...n.querySelectorAll('*')]).some(n => [...n.attributes].some(a => /NaN|Infinity/.test(a.value)))), false);
    };
    const shot = async name => {
      if (!process.env.SCREENSHOT_DIR) return;
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      if (page.viewportSize().width < 700) {
        // Viewport captures keep the mobile sticky header in its actual position.
        await page.locator('#meter-comparison').evaluate(n => n.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '-controls.png'), animations: 'disabled' });
        await page.locator('.comparison-row').first().evaluate(n => scrollTo({ top: scrollY + n.getBoundingClientRect().top - 140, behavior: 'instant' }));
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '-charts.png'), animations: 'disabled' });
      } else await page.locator('#meter-comparison').screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), animations: 'disabled' });
    };
    await page.goto(base + '/#investigate/CR-030');
    assert.equal(await page.locator('#meter-comparison').getAttribute('open'), null);
    assert.equal(await page.locator('.comparison-chart').count(), 0, 'comparison is initially lazy');
    await page.getByLabel('Investigation notes').fill('Draft while comparing peers.');
    await page.locator('#comparison-launch').click();
    await page.locator('.comparison-chart svg').first().waitFor();
    assert.equal(await page.locator('.comparison-purpose').innerText(), 'Check whether unusual readings are isolated to one meter or occur across several locations.');
    assert.deepEqual(await ids(), ['LIB-MAIN', 'ENG-MAIN']);
    assert.equal(await page.evaluate(() => location.hash), '#investigate/CR-030');
    await synchronized();
    await page.locator('#comparison-time').focus(); await page.keyboard.press('ArrowRight');
    await synchronized();
    const hit = await page.locator('.comparison-chart .hit').first().boundingBox();
    await page.mouse.move(hit.x + hit.width * .7, hit.y + hit.height / 2);
    await synchronized();
    await page.mouse.move(10, 10); await synchronized();
    await page.locator('#meter-comparison > summary').click();
    await page.locator('#meter-comparison > summary').click();
    await synchronized();

    await page.getByLabel('Comparison scope', { exact: true }).selectOption('campus');
    await page.getByLabel('Comparison meter 1', { exact: true }).selectOption('STU-MAIN');
    await page.getByLabel('Comparison meter 2', { exact: true }).selectOption('ENG-MAIN');
    assert.deepEqual(await ids(), ['LIB-MAIN', 'STU-MAIN', 'ENG-MAIN']);
    const duplicate = await page.locator('#comparison-meter-1 option[value="STU-MAIN"]').evaluate(n => ({ disabled: n.disabled, html: n.outerHTML }));
    assert.equal(duplicate.disabled, true, duplicate.html);
    await page.getByRole('button', { name: 'Deviation (kW)', exact: true }).click();
    await synchronized(); await geometry();
    await page.getByLabel('Chart window', { exact: true }).selectOption('event');
    assert.equal(await page.locator('#comparison-time').getAttribute('min'), String(await page.evaluate(() => DC.eventById(DC.state.selected).start)));
    await synchronized();
    await page.getByLabel('Comparison meter 1', { exact: true }).selectOption('');
    assert.equal(await page.locator('#comparison-meter-0').inputValue(), '');
    assert.deepEqual(await ids(), ['LIB-MAIN', 'ENG-MAIN'], 'empty selector slots stay stable');
    await page.getByLabel('Comparison meter 1', { exact: true }).selectOption('STU-MAIN');
    assert.equal(await page.getByLabel('Investigation notes').inputValue(), 'Draft while comparing peers.');
    await page.getByLabel('Investigation status', { exact: true }).selectOption('investigating');
    assert.deepEqual(await ids(), ['LIB-MAIN', 'STU-MAIN', 'ENG-MAIN']);
    assert.equal(await page.getByLabel('Investigation notes').inputValue(), 'Draft while comparing peers.');
    assert.equal(await page.getByRole('button', { name: 'Deviation (kW)', exact: true }).getAttribute('aria-pressed'), 'true');
    await shot('deviation-desktop');
    await page.locator('.comparison-events a[href="#investigate/CR-031"]').click();
    await page.waitForFunction(() => DC.state.selected === 'CR-031');
    await page.reload(); await page.waitForSelector('#comparison-launch');
    assert.equal(await page.evaluate(() => DC.state.selected), 'CR-031');

    // All detectors: compare in both modes and confirm route/detector identity stays fixed.
    const eventIds = await page.evaluate(() => DC.D.detectors.map(det => DC.D.events.find(e => e.detector === det.id && DC.meterById[e.meter].kind === 'main').id));
    for (const id of eventIds) {
      await open(id);
      const detector = await page.evaluate(() => DC.state.detector);
      await synchronized();
      await page.getByRole('button', { name: 'Deviation (kW)', exact: true }).click();
      await synchronized(); await geometry();
      assert.equal(await page.evaluate(() => DC.state.detector), detector);
    }
    // Peer readings/forecasts absent or flagged: retain gaps and withhold impact.
    await open('CR-030');
    await page.evaluate(() => {
      const e = DC.eventById(DC.state.selected), m = DC.meterById['ENG-MAIN'];
      m.actual[e.start] = null; m.dq[e.start + 1] = 2;
      DC.detectorById[e.detector].series[m.id].q50[e.start - DC.META.detector_start] = null;
      DC.setState({});
    });
    await page.locator('.comparison-chart svg').first().waitFor();
    assert.match(await page.locator('.comparison-row[data-meter="ENG-MAIN"] .comparison-evidence').innerText(), /energy difference: Unavailable/);
    assert.match(await page.locator('.comparison-readout tr[data-meter="ENG-MAIN"]').innerText(), /Unavailable/);
    await geometry();
    // Single compatible channel and PV-only campus comparison.
    const pvId = await page.evaluate(() => DC.D.events.find(e => DC.meterById[e.meter].kind === 'pv').id);
    await open(pvId);
    await page.getByText('No other meter with the same kind and unit is available in this sub-grid.', { exact: false }).waitFor();
    assert.equal((await ids()).length, 1);
    await page.getByLabel('Comparison scope', { exact: true }).selectOption('campus');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.comparison-row')].every(node => DC.meterById[node.dataset.meter].kind === 'pv')), true);
    // New selector persists through same-record theme redraw, and works at narrow widths.
    await page.setViewportSize({ width: 390, height: 844 });
    await open('CR-030');
    await page.getByLabel('Comparison scope', { exact: true }).selectOption('campus');
    await page.getByLabel('Comparison meter 1', { exact: true }).selectOption('STU-MAIN');
    await geometry(); await synchronized(); await shot('demand-mobile-light');
    const before = await ids();
    await page.locator('#theme-toggle').click();
    assert.deepEqual(await ids(), before);
    await synchronized(); await geometry(); await shot('demand-mobile-dark');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#comparison-launch').click();
    await page.locator('#comparison-time').focus(); await page.keyboard.press('ArrowRight');
    await synchronized();
    assert.deepEqual(errors, []);
    console.log('PASS: synchronized pointer/keyboard cursor and readouts, shared scales, peer/scope/window controls, demand/deviation, overlapping-event links, draft/theme retention, all detectors, missing samples/forecasts, PV separation, mobile and reduced motion. No page/console errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
