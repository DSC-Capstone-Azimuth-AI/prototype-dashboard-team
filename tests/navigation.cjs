/* Run against a static server: node tests/navigation.cjs [base URL].
   Requires Playwright and Chromium (CHROMIUM_PATH can override the executable). */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8000';
const shots = process.env.SCREENSHOT_DIR;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const route = async hash => {
    await page.evaluate(h => { location.hash = h; }, hash);
    await page.waitForFunction(h => location.hash === '#' + h && DC.state.routeId === (h.split('/')[1] || null), hash);
    await page.waitForTimeout(80);
  };
  const screenshot = async name => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: name.startsWith('mobile-') }); } };
  const geometry = async () => {
    const bad = await page.locator('.section.active svg').evaluateAll(nodes => nodes.flatMap(n => [...n.querySelectorAll('*')]).filter(n => [...n.attributes].some(a => /NaN|Infinity/.test(a.value))).length);
    assert.equal(bad, 0, 'SVG geometry is finite');
  };
  try {
    await page.goto(base);
    await page.waitForSelector('#sec-overview svg');
    assert.equal(await page.locator('#sec-overview .kpi').count(), 4);
    await screenshot('overview');
    await page.getByRole('link', { name: 'Review priority events' }).click();
    await page.waitForSelector('#sec-investigate tr[data-id]');
    assert.equal(await page.locator('#f-status').inputValue(), 'open');
    await route('overview');
    await page.getByRole('checkbox', { name: 'Show anomaly overlays' }).check();
    await geometry();
    await page.getByRole('checkbox', { name: 'Show anomaly overlays' }).uncheck();
    await page.locator('#sec-overview .building-summary').first().click();
    await page.waitForFunction(() => DC.state.profile === 'ENG');
    await route('overview');
    // Overview queue -> dedicated record, with no log alongside it.
    await page.locator('#sec-overview tbody tr').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#event-detail');
    assert.match(await page.evaluate(() => location.hash), /^#investigate\//);
    assert.equal(await page.locator('#sec-investigate tr[data-id]').count(), 0);
    await page.getByRole('link', { name: 'Back to anomaly list' }).click();
    await page.waitForSelector('#sec-investigate tr[data-id]');
    assert.equal(await page.locator('#event-detail').count(), 0);
    // List filters survive detail/back, and do not leak to Overview.
    await page.selectOption('#f-building', 'ENG');
    await page.selectOption('#f-status', 'open');
    const firstId = await page.locator('tr[data-id]').first().getAttribute('data-id');
    await page.locator('tr[data-id]').first().click();
    await page.waitForSelector('#event-detail');
    assert.equal(await page.evaluate(() => DC.state.selected), firstId);
    await page.goBack(); await page.waitForSelector('tr[data-id]');
    assert.equal(await page.locator('#f-building').inputValue(), 'ENG');
    await page.goForward(); await page.waitForSelector('#event-detail');
    await page.reload(); await page.waitForSelector('#event-detail');
    assert.equal(await page.evaluate(() => DC.state.selected), firstId);
    await route('overview');
    assert.equal(await page.locator('#f-building').inputValue(), 'all');
    // Building directory, search, dedicated profile, associated event and building link.
    await route('buildings');
    assert.equal(await page.locator('.building-card').count(), 8);
    await screenshot('buildings');
    await page.getByRole('searchbox').fill('not-a-building');
    await page.getByText('No buildings match your search.').waitFor();
    await page.getByRole('searchbox').fill('Geisel Library');
    assert.equal(await page.locator('.building-card').count(), 1);
    await page.getByRole('link', { name: 'Open building profile' }).click();
    await page.waitForSelector('#sec-buildings svg');
    assert.equal(await page.evaluate(() => DC.state.profile), 'LIB');
    await screenshot('building-profile');
    await page.reload(); await page.waitForSelector('#sec-buildings svg');
    assert.equal(await page.locator('#h-buildings').innerText(), 'Geisel Library');
    await page.locator('#sec-buildings a[href^="#investigate/"]').first().click();
    await page.waitForSelector('#event-detail');
    assert.equal(await page.evaluate(() => DC.eventById(DC.state.selected).building), 'LIB');
    await page.getByRole('link', { name: 'View Geisel Library' }).click();
    await page.waitForSelector('#h-buildings');
    // Known peak timestamp regression; review and notes persistence.
    await route('investigate/CR-030');
    await page.locator('.skip-link').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => location.hash), '#investigate/CR-030');
    assert.equal(await page.locator('#filters').isVisible(), false);
    assert.equal(await page.locator('.summary-facts .fact').count(), 4);
    const expectedStamp = await page.evaluate(() => {
      const e = DC.eventById('CR-030'); let peak = e.start, magnitude = -1;
      for (let t = e.start; t < e.end; t++) { const d = Math.abs(DC.actual(e.meter, t) - DC.q(e.meter, 'q50', t)); if (d > magnitude) { magnitude = d; peak = t; } }
      return DC.time.stamp(peak);
    });
    assert.ok((await page.locator('.summary-facts').innerText()).includes(expectedStamp));
    await page.getByLabel('Investigation status', { exact: true }).selectOption('insufficient');
    await page.getByLabel('Investigation notes').fill('Check operating schedule before assigning a cause.');
    await page.getByRole('button', { name: 'Save notes' }).click();
    await page.reload(); await page.waitForSelector('#event-detail');
    assert.equal(await page.getByLabel('Investigation status', { exact: true }).inputValue(), 'insufficient');
    assert.match(await page.getByLabel('Investigation notes').inputValue(), /Check operating schedule/);
    await screenshot('anomaly-detail');
    for (const label of ['Weather, occupancy & meter quality', 'Advanced technical details', 'Historical comparison & event distribution']) {
      await page.getByText(label, { exact: true }).click(); await page.waitForTimeout(80); await geometry();
    }
    // A route identifies its event even when prior list filters would exclude it.
    await route('investigate'); await page.selectOption('#f-building', 'ENG');
    await route('investigate/CR-030');
    assert.equal(await page.evaluate(() => DC.eventById(DC.state.selected).building), 'LIB');
    await route('investigate');
    assert.equal(await page.locator('#f-building').inputValue(), 'ENG');
    assert.equal(await page.locator('#event-detail').count(), 0);
    await page.locator('#f-reset').click();
    // Empty filter result, gallery and advanced settings.
    await page.locator('#advanced-filters summary').click();
    await page.selectOption('#f-type', 'data_integrity');
    await page.selectOption('#f-building', 'REC');
    assert.equal(await page.locator('#event-detail').count(), 0);
    await page.locator('#f-reset').click();
    await page.getByRole('button', { name: 'Gallery', exact: true }).click();
    await page.waitForSelector('.gallery .panel svg');
    await page.getByRole('button', { name: 'Normalized', exact: true }).click();
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    // All detectors across all destinations, including preserved research views.
    const detectors = await page.evaluate(() => DC.D.detectors.map(d => d.id));
    for (const detector of detectors) {
      for (const section of ['overview', 'buildings', 'investigate', 'models']) {
        await route(section);
        await page.evaluate(d => DC.setState({ detector: d }), detector);
        await page.waitForTimeout(80); await geometry();
        if (section === 'buildings') {
          await page.getByText('Advanced building & sub-grid analysis', { exact: true }).locator('..').evaluate(node => { node.open = true; });
          await page.waitForTimeout(80); await geometry();
          assert.ok(await page.locator('#sec-buildings details svg').count() > 5);
        }
      }
    }
    const eventIds = await page.evaluate(() => DC.D.events.map(e => e.id));
    for (const id of eventIds) {
      await route('investigate/' + id);
      assert.equal(await page.evaluate(() => DC.state.selected), id);
      assert.equal(await page.locator('#event-detail').count(), 1);
      await geometry();
    }
    console.log(`Verified dedicated routes for all ${eventIds.length} exported events.`);
    // Custom dates; no manufactured measurements for missing-meter building.
    await route('overview'); await page.selectOption('#f-range', 'custom');
    await page.fill('#f-from', '2026-10-01'); await page.locator('#f-from').dispatchEvent('change');
    await page.fill('#f-to', '2026-10-02'); await page.locator('#f-to').dispatchEvent('change');
    assert.deepEqual(await page.evaluate(() => [DC.state.t0, DC.state.t1]), [1248, 1296]);
    await page.evaluate(() => { const b = { id: 'EMPTY', name: 'No measurements fixture', subgrid: 'N1', profile: 'unknown' }; DC.D.buildings.push(b); DC.buildingById[b.id] = b; });
    await route('buildings/EMPTY');
    await page.getByText('No simulated main-meter measurements available.', { exact: false }).waitFor();
    await route('investigate/unknown'); await page.locator('.section.active').getByText('Record unavailable').waitFor();
    await page.reload(); await page.locator('.section.active').getByText('Record unavailable').waitFor();
    await route('buildings/unknown'); await page.locator('.section.active').getByText('Record unavailable').waitFor();
    await route('investigate/CR-030');
    await page.evaluate(() => { DC.D.weather = null; DC.buildingById.LIB.occupancy = null; DC.setState({}); });
    await page.getByText('Weather, occupancy & meter quality', { exact: true }).click();
    await page.getByText('Weather context unavailable.').waitFor();
    await page.getByText('Occupancy context unavailable.').waitFor();
    await page.reload(); await page.waitForSelector('#event-detail');
    await route('models');
    await page.evaluate(() => { DC.D.evaluation = null; DC.setState({}); });
    await page.getByText('Synthetic evaluation evidence is unavailable', { exact: false }).waitFor();
    await page.reload();
    await route('overview');
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.reload(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#theme-toggle').click();
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
    for (const hash of ['overview', 'buildings', 'buildings/LIB', 'investigate', 'investigate/CR-030', 'models']) {
      await route(hash); await geometry();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, hash + ' fits mobile');
      await screenshot('mobile-' + hash.replace('/', '-'));
    }
    assert.deepEqual(errors, []);
    console.log('PASS: navigation, history/reload, contextual filters, peak evidence, local review/notes, gallery, all four detectors/sections, research disclosures, missing data/IDs, custom dates, theme and 390px layout. No page/console errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
