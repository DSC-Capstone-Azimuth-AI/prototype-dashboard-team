/* PR #2 browser regressions, adapted to the routed UX. Requires Playwright/Chromium.
   Serve repository on localhost:8000 first. Original evidence and review coverage is retained. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const url = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
    const go = async hash => {
      await page.evaluate(h => { location.hash = h; }, hash);
      await page.waitForFunction(h => DC.state.section === h.split('/')[0] && DC.state.routeId === (h.split('/')[1] || null) &&
        document.querySelector('.section.active')?.id === 'sec-' + h.split('/')[0] && !document.querySelector('#main-content').hasAttribute('aria-busy'), hash);
    };
    const openDisclosure = async text => {
      await page.getByText(text, { exact: true }).locator('..').evaluate(node => { node.open = true; });
      await page.waitForTimeout(50);
    };
    const checkGeometry = async () => assert.equal(await page.locator('.section.active svg').evaluateAll(ss => ss.flatMap(s => [...s.querySelectorAll('*')]).filter(e => [...e.attributes].some(a => /NaN|Infinity/.test(a.value))).length), 0);
    await page.goto(url + '/#investigate/CR-030');
    await page.waitForSelector('#event-detail svg');
    assert.equal(await page.evaluate(() => DC.state.selected), 'CR-030');
    assert(await page.getByRole('heading', { name: 'Why was this flagged?', exact: true }).isVisible());
    assert((await page.locator('.detail-head').innerText()).includes('Geisel Library'));
    await openDisclosure('Advanced technical details');
    await openDisclosure('Physical evidence & review provenance');
    assert(await page.locator('.fact').filter({ hasText: 'Ground-truth assessment' }).isVisible());
    assert((await page.locator('.evidence').innerText()).includes('raw threshold'));
    assert((await page.locator('#event-detail').innerText()).includes('not above 1 after export rounding') || (await page.locator('#event-detail').innerText()).includes('above the normalized threshold of 1'));
    await page.reload(); await page.waitForSelector('#event-detail svg');
    assert.equal(await page.evaluate(() => DC.state.selected), 'CR-030');

    // Every building through contextual filters, every section, and each profile/name source.
    let charts = 0;
    const buildings = await page.evaluate(() => DC.D.buildings.map(b => ({ id: b.id, name: b.name, source: b.name_source })));
    for (const b of buildings) {
      await go('investigate'); await page.selectOption('#f-building', b.id);
      assert.equal(await page.evaluate(() => DC.state.selected), null);
      for (const sec of ['overview', 'investigate', 'buildings', 'models']) {
        await go(sec);
        if (sec === 'models') await openDisclosure('Advanced filters');
        if (sec !== 'buildings') await page.selectOption('#f-building', b.id);
        else await page.getByRole('searchbox').fill(b.name);
        if (sec !== 'buildings') assert.equal(await page.evaluate(() => DC.events().every(e => e.building === DC.state.building)), true);
        await checkGeometry(); charts += await page.locator('.section.active svg').count();
      }
      await go('buildings/' + b.id);
      assert.equal(await page.locator('#h-buildings').innerText(), b.name);
      assert.equal(await page.getByRole('link', { name: 'Official building-name source' }).getAttribute('href'), b.source);
      assert((await page.locator('#sec-buildings').innerText()).includes('Not verified'));
      await checkGeometry();
    }
    await go('investigate'); await page.locator('#f-reset').click();
    const ids = await page.locator('#sec-investigate tr[data-id]').evaluateAll(rows => rows.slice(0, 2).map(r => r.dataset.id));
    await page.locator(`tr[data-id="${ids[0]}"]`).click(); await page.waitForSelector('#event-detail');
    assert.equal(await page.evaluate(() => location.hash), '#investigate/' + ids[0]);
    await go('investigate'); await page.locator(`tr[data-id="${ids[1]}"]`).click(); await page.waitForSelector('#event-detail');
    await page.goBack(); await page.waitForSelector('tr[data-id]');
    await page.goBack(); await page.waitForSelector('#event-detail');
    assert.equal(await page.evaluate(() => DC.state.selected), ids[0]);
    await page.goForward(); await page.waitForSelector('tr[data-id]');
    await page.goForward(); await page.waitForSelector('#event-detail');
    assert.equal(await page.evaluate(() => DC.state.selected), ids[1]);
    await go('investigate');
    await page.getByRole('button', { name: 'Gallery', exact: true }).click();
    await page.getByRole('button', { name: 'Normalized', exact: true }).click();
    await page.locator('.gallery .panel[aria-label="Open ' + ids[0] + '"]').click();
    await page.waitForSelector('#event-detail');
    assert.equal(await page.evaluate(() => location.hash), '#investigate/' + ids[0]);
    await go('investigate'); await page.getByRole('button', { name: 'Log', exact: true }).click();
    await go('investigate/' + ids[0]);
    await page.getByLabel('Investigation status', { exact: true }).selectOption('investigating');
    await page.getByLabel('Investigation notes').fill('Checked operating schedule; follow up with operator.');
    await page.getByRole('button', { name: 'Save notes', exact: true }).click();
    assert(await page.getByText('Saved in this browser.', { exact: true }).isVisible());
    await page.reload(); await page.waitForSelector('#event-detail svg');
    assert.equal(await page.getByLabel('Investigation status', { exact: true }).inputValue(), 'investigating');
    assert.equal(await page.getByLabel('Investigation notes').inputValue(), 'Checked operating schedule; follow up with operator.');
    // Shared-state filter edits must still clear an excluded selection and its URL.
    await page.evaluate(() => DC.setState({ status: 'investigating' }));
    await page.getByLabel('Investigation status', { exact: true }).selectOption('explained');
    assert.equal(await page.evaluate(() => DC.state.selected), null);
    assert.equal(await page.evaluate(() => location.hash), '#investigate');
    await page.locator('#event-detail').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#event-detail svg').count(), 0);
    await page.locator('#f-reset').click();
    const detectors = await page.evaluate(() => DC.D.detectors.map(d => d.id));
    for (const detector of detectors) {
      for (const sec of ['overview', 'investigate', 'buildings', 'models']) {
        await go(sec); await page.evaluate(d => DC.setState({ detector: d }), detector); await checkGeometry();
      }
      await go('investigate'); await page.evaluate(d => DC.setState({ detector: d }), detector);
      await page.locator('#sec-investigate tr[data-id]').first().click(); await page.waitForSelector('#event-detail');
      assert.equal(await page.evaluate(() => DC.eventById(DC.state.selected).detector === DC.state.detector), true);
    }
    await page.evaluate(() => { delete DC.D.weather.temp; delete DC.buildingById[DC.eventById(DC.state.selected).building].occupancy; DC.setState({}); });
    await openDisclosure('Weather, occupancy & meter quality');
    assert(await page.getByText('Weather context unavailable.', { exact: true }).isVisible());
    await page.route('**/data/synthetic-labels.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.DERCONNECT_LABELS = {labels:[],matches:{},meta:{}};' }));
    await page.goto(url + '/#investigate/CR-030'); await page.reload(); await page.waitForSelector('#event-detail svg');
    await openDisclosure('Advanced technical details'); await openDisclosure('Physical evidence & review provenance');
    assert.equal(await page.evaluate(() => DC.L.labels.length), 0);
    assert((await page.locator('#event-detail').innerText()).includes('Not evaluated'));
    assert(!(await page.locator('#event-detail').innerText()).includes('counts as a false positive'));
    assert(await page.locator('#event-detail svg text').filter({ hasText: 'End (exclusive)' }).isVisible());
    await page.locator('#theme-toggle').click();
    const theme = await page.locator('html').getAttribute('data-theme');
    await page.reload(); await page.waitForSelector('#event-detail svg');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    const shotDir = process.env.SCREENSHOT_DIR;
    if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: shotDir + '/investigation-desktop.png' }); }
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    const widths = await page.evaluate(() => ({ view: innerWidth, document: document.documentElement.scrollWidth }));
    assert.equal(widths.document, widths.view);
    if (shotDir) await page.screenshot({ path: shotDir + '/investigation-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', buildings: buildings.length, detectors: detectors.length, chartsChecked: charts, workflows: 'all sourced building profiles, filters, queue/gallery, back/forward, deep link/reload, excluded selection, dataset-scoped review/notes, physical evidence, missing labels/context, theme, mobile', errors, widths }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
