/* Requires Playwright and Chromium. Serve repository on localhost:8000 first. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
  await page.goto(url + '/#investigate/CR-030');
  await page.waitForSelector('#event-detail svg');
  assert.equal(await page.evaluate(() => DC.state.selected), 'CR-030');
  assert(await page.getByText('Why was this flagged?', { exact: true }).isVisible());
  assert(await page.locator('.fact').filter({ hasText: 'Ground-truth assessment' }).isVisible());
  await page.reload();
  await page.waitForSelector('#event-detail svg');
  assert.equal(await page.evaluate(() => DC.state.selected), 'CR-030');
  // Every building, all four sections and detectors; check rendered SVG geometry.
  let charts = 0;
  const buildings = await page.evaluate(() => DC.D.buildings.map(b => b.id));
  for (const b of buildings) {
    await page.selectOption('#f-building', b);
    assert.equal(await page.evaluate(() => DC.state.selected), null);
    for (const sec of ['overview', 'investigate', 'buildings', 'models']) {
      await page.locator(`.tabs a[data-section=${sec}]`).click();
      await page.waitForTimeout(40);
      assert.equal(await page.evaluate(() => DC.events().every(e => e.building === DC.state.building)), true);
      assert.equal(await page.locator(`#sec-${sec} svg`).evaluateAll(ss => ss.flatMap(s => [...s.querySelectorAll('*')]).filter(e => [...e.attributes].some(a => /NaN|Infinity/.test(a.value))).length), 0);
      charts += await page.locator(`#sec-${sec} svg`).count();
    }
  }
  await page.locator('#f-reset').click();
  await page.locator('.tabs a[data-section=investigate]').click();
  const ids = await page.locator('#sec-investigate tr[data-id]').evaluateAll(rows => rows.slice(0, 2).map(r => r.dataset.id));
  await page.locator(`tr[data-id="${ids[0]}"]`).click();
  assert.equal(await page.evaluate(() => location.hash), '#investigate/' + ids[0]);
  await page.locator(`tr[data-id="${ids[1]}"]`).click();
  await page.goBack(); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => DC.state.selected), ids[0]);
  await page.goForward(); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => DC.state.selected), ids[1]);
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.locator('.gallery .panel[aria-label="Open ' + ids[0] + '"]').click();
  assert.equal(await page.evaluate(() => location.hash), '#investigate/' + ids[0]);
  await page.getByRole('button', { name: 'Normalized', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByLabel('Investigation status', { exact: true }).selectOption('investigating');
  await page.getByLabel('Review note', { exact: true }).fill('Checked operating schedule; follow up with operator.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  assert(await page.getByText('Saved in this browser.', { exact: true }).isVisible());
  await page.reload(); await page.waitForSelector('#event-detail svg');
  assert.equal(await page.getByLabel('Investigation status', { exact: true }).inputValue(), 'investigating');
  assert.equal(await page.getByLabel('Review note', { exact: true }).inputValue(), 'Checked operating schedule; follow up with operator.');
  await page.selectOption('#f-status', 'investigating');
  await page.getByLabel('Investigation status', { exact: true }).selectOption('explained');
  assert.equal(await page.evaluate(() => DC.state.selected), null);
  assert.equal(await page.evaluate(() => location.hash), '#investigate');
  assert.equal(await page.locator('#event-detail svg').count(), 0);
  await page.locator('#f-reset').click();
  const detectors = await page.evaluate(() => DC.D.detectors.map(d => d.id));
  for (const detector of detectors) {
    await page.selectOption('#f-detector', detector);
    for (const sec of ['overview', 'investigate', 'buildings', 'models']) {
      await page.locator(`.tabs a[data-section=${sec}]`).click();
      await page.waitForTimeout(50);
    }
    await page.locator('.tabs a[data-section=investigate]').click();
    await page.locator('#sec-investigate tr[data-id]').first().click();
    assert.equal(await page.evaluate(() => DC.eventById(DC.state.selected).detector === DC.state.detector), true);
  }
  // Missing labels and optional context must not invent a false-positive verdict.
  await page.evaluate(() => { delete DC.D.weather.temp; delete DC.buildingById[DC.eventById(DC.state.selected).building].occupancy; DC.setState({}); });
  await page.waitForTimeout(80);
  assert(await page.getByText('Weather context unavailable.', { exact: true }).isVisible());
  await page.route('**/data/synthetic-labels.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.DERCONNECT_LABELS = {labels:[],matches:{},meta:{}};' }));
  await page.goto(url + '/#investigate/CR-030'); await page.reload(); await page.waitForSelector('#event-detail svg');
  assert.equal(await page.evaluate(() => DC.L.labels.length), 0);
  assert((await page.locator('#event-detail').innerText()).includes('Not evaluated'));
  assert(!(await page.locator('#event-detail').innerText()).includes('counts as a false positive'));
  assert(await page.locator('#event-detail svg text').filter({ hasText: 'End (exclusive)' }).isVisible());
  await page.locator('#theme-toggle').click();
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.reload(); await page.waitForSelector('#event-detail svg');
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  const shotDir = process.env.SCREENSHOT_DIR;
  if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.locator('#event-detail').screenshot({ path: shotDir + '/investigation-desktop.png', style: '.filters { visibility: hidden !important; }' }); }
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const widths = await page.evaluate(() => ({ view: innerWidth, document: document.documentElement.scrollWidth }));
  assert.equal(widths.document, widths.view);
  if (shotDir) await page.screenshot({ path: shotDir + '/investigation-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', buildings: buildings.length, detectors: detectors.length, chartsChecked: charts, workflows: 'queue/gallery, back/forward, deep link/reload, excluded selection, review notes/status persistence, missing context, theme, mobile', errors, widths }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
