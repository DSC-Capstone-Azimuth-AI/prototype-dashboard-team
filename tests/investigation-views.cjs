/* Specialized investigation and disclosure regressions. Serve localhost:8000.
   Uses the same optional Playwright dependency and CHROMIUM_PATH as existing suites. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const shots = process.env.SCREENSHOT_DIR;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const route = async hash => {
      await page.goto(base + '/#' + hash);
      await page.reload(); // Reset test-only data mutations; a hash navigation alone retains them.
      await page.waitForFunction(h => DC.state.section === h.split('/')[0] && DC.state.routeId === (h.split('/')[1] || null), hash);
    };
    const open = async name => {
      await page.locator('summary').filter({ hasText: name }).locator('..').evaluate(node => { node.open = true; });
      await page.waitForTimeout(50); // Wait for the existing disclosure chart redraw.
    };
    const shot = async name => {
      if (!shots) return;
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true, animations: 'disabled' });
    };
    const fits = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.section.active svg').evaluateAll(nodes => nodes.flatMap(n => [...n.querySelectorAll('*')]).some(n => [...n.attributes].some(a => /NaN|Infinity/.test(a.value)))), false);
    };
    // Dataset provenance remains available without occupying the main task flow.
    await route('overview');
    assert.equal(await page.locator('.dataset-details').getAttribute('open'), null);
    assert(await page.getByText('Simulated demonstration', { exact: true }).isVisible());
    await page.locator('.dataset-details summary').focus(); await page.keyboard.press('Enter');
    await page.locator('.dataset-details p').filter({ hasText: 'DERCONNECT coverage is not verified' }).waitFor();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.nav-group').count(), 0, 'all destinations share one navigation group');
    assert.equal(await page.locator('.tabs a[aria-current="page"]').count(), 1);
    await page.locator('.footer-details summary').focus(); await page.keyboard.press('Enter');
    assert.match(await page.locator('.footer-details').innerText(), /Oreshkin/);
    await page.keyboard.press('Enter');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await shot('overview');
    await route('buildings'); await shot('buildings');
    for (const [id, lens] of [['CR-005', 'point'], ['CR-014', 'sustained'], ['CR-001', 'context'], ['CR-004', 'pattern'], ['CR-010', 'quality']]) {
      await route('investigate/' + id);
      await page.locator('svg[aria-label="Event demand and forecast evidence"]').waitFor();
      assert.equal(await page.locator('[data-investigation-view]').getAttribute('data-investigation-view'), lens);
      assert.equal(await page.locator('.investigation-focus').count(), 0, 'removed focus box stays absent');
      assert.equal(await page.getByText('INVESTIGATION FOCUS', { exact: true }).count(), 0);
      if (lens === 'point') {
        assert.match(await page.locator('.reading-summary').innerText(), /observed.*expected.*98% forecast range/);
        assert.equal(await page.locator('svg[aria-label="Event demand and forecast evidence"] rect[opacity="0.26"]').count(), 0, 'isolated readings use point encoding');
      }
      if (lens === 'context') assert.equal(await page.getByText('Weather, occupancy & meter quality', { exact: true }).locator('..').getAttribute('open'), '');
      if (lens === 'pattern' || lens === 'quality') {
        const selector = lens === 'pattern' ? '.pattern-evidence' : '.quality-evidence';
        assert.equal(await page.locator(selector).evaluate(n => Boolean(n.compareDocumentPosition(document.querySelector('svg[aria-label="Event demand and forecast evidence"]')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'primary evidence precedes demand');
      }
      if (lens === 'quality') assert.equal(await page.locator('.quality-evidence svg text').first().evaluate(n => n.getBoundingClientRect().left >= n.closest('svg').getBoundingClientRect().left), true, 'meter label fits its chart');
      if (lens === 'quality') assert.match(await page.locator('.quality-evidence .quality-summary').innerText(), /missing \/ zero flags/);
      await fits(); await shot(lens);
    }
    const interpretation = await page.locator('.interpretation-summary').boundingBox();
    const review = await page.locator('.review-panel').boundingBox();
    assert(review.x >= interpretation.x + interpretation.width, 'interpretation and review share a desktop row');
    // Drafts, focus and opened details survive local status/theme redraws.
    await route('investigate/CR-014');
    await open('Advanced technical details');
    await page.getByLabel('Investigation notes').fill('Unsaved draft: verify schedule.');
    await page.getByLabel('Investigation status', { exact: true }).focus();
    await page.getByLabel('Investigation status', { exact: true }).selectOption('investigating');
    assert.equal(await page.getByLabel('Investigation notes').inputValue(), 'Unsaved draft: verify schedule.');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'review-status');
    assert.equal(await page.getByText('Advanced technical details', { exact: true }).locator('..').getAttribute('open'), '');
    await page.locator('#theme-toggle').click();
    assert.equal(await page.getByLabel('Investigation notes').inputValue(), 'Unsaved draft: verify schedule.');
    await page.getByRole('button', { name: 'Save notes', exact: true }).click();
    await page.reload();
    assert.equal(await page.getByLabel('Investigation notes').inputValue(), 'Unsaved draft: verify schedule.');

    await route('investigate');
    await page.getByRole('button', { name: 'Gallery', exact: true }).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Gallery');
    await page.locator('.panel').first().waitFor();
    await page.getByRole('button', { name: 'Normalized', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Normalized');

    // Missing context and forecasts remain visible gaps, without manufactured evidence.
    await route('investigate/CR-001');
    await page.evaluate(() => {
      const e = DC.eventById(DC.state.selected);
      DC.D.weather = null; DC.buildingById[e.building].occupancy = null;
      const s = DC.detectorById[e.detector].series[e.meter];
      for (let t = e.start; t < e.end; t++) s.q50[t - DC.META.detector_start] = null;
      DC.setState({});
    });
    await page.getByText('Weather context unavailable.', { exact: true }).waitFor();
    await page.getByText('Occupancy context unavailable.', { exact: true }).waitFor();
    assert.match(await page.locator('#event-detail').innerText(), /Forecast comparison incomplete: 0 of/);
    assert.match(await page.locator('.summary-facts').innerText(), /Unavailable/);
    await fits();
    await route('investigate/CR-005');
    await page.evaluate(() => {
      const e = DC.eventById(DC.state.selected); DC.meterById[e.meter].dq[e.start] = 2; DC.setState({});
    });
    assert.equal(await page.locator('[data-investigation-view]').getAttribute('data-investigation-view'), 'quality');
    assert.match(await page.locator('.summary-facts').innerText(), /Unavailable/);
    await route('investigate/CR-014');
    await page.evaluate(() => {
      const e = DC.eventById(DC.state.selected); e.type = 'unknown'; e.category = 'unknown'; e.behavior = 'unknown'; DC.setState({});
    });
    assert.equal(await page.locator('[data-investigation-view]').getAttribute('data-investigation-view'), 'general');
    await fits();

    // Grouping preserves analysis output and redraws charts when disclosures open.
    await route('buildings');
    await open('Advanced building & sub-grid analysis');
    for (const name of ['Building comparisons & sub-grid health', 'Historical patterns', 'Peak demand', 'Load decomposition', 'Solar & measurement availability']) {
      await open(name); await fits();
      assert(await page.locator('summary').filter({ hasText: name }).locator('..').locator('svg').count() > 0, name);
    }
    assert.equal(await page.locator('#h-buildings').count(), 1, 'section heading ID is unique');
    assert.match(await page.locator('#sec-buildings').innerText(), /centered 7-day mean uses future observations/);
    await shot('buildings-grouped');
    await page.evaluate(() => { DC.D.weather = null; DC.setState({}); });
    await open('Advanced building & sub-grid analysis'); await open('Solar & measurement availability');
    // Focus a building with PV; its weather-informed comparison must not crash.
    await page.getByLabel('Focus building', { exact: true }).selectOption('ENG');
    await open('Solar & measurement availability');
    await page.getByText('Irradiance context unavailable.', { exact: false }).waitFor();

    await route('models');
    for (const name of ['Comparison charts', 'Evaluation diagnostics', 'Synthetic scenarios', 'Methodology & provenance']) {
      const group = page.locator('summary').filter({ hasText: name }).locator('..');
      assert.equal(await group.getAttribute('open'), null);
      await open(name); assert(await group.locator('svg').count() > 0); await fits();
    }
    await shot('evaluation-grouped');
    // Both themes, specialized mobile views and reduced motion.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => localStorage.setItem('derconnect.theme', t), theme);
      for (const hash of ['overview', 'buildings', 'models', 'investigate/CR-005', 'investigate/CR-001', 'investigate/CR-004', 'investigate/CR-010']) {
        await route(hash); await fits();
      }
      const contrast = await page.locator('#comparison-launch').evaluate(n => {
        const luminance = color => {
          const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const style = getComputedStyle(n), a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      assert(contrast >= 4.5, theme + ' primary button text contrast');
      const interpretation = await page.locator('.interpretation-summary').boundingBox();
      const review = await page.locator('.review-panel').boundingBox();
      assert(review.y >= interpretation.y + interpretation.height, 'review stacks below interpretation on mobile');
      await shot('quality-mobile-' + theme);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('#theme-toggle').evaluate(n => getComputedStyle(n).transitionDuration), '0s');
    assert.equal(await page.locator('.section.active').evaluate(n => getComputedStyle(n).animationName), 'none');
    assert.deepEqual(errors, []);
    console.log('PASS: five specialized views, quality precedence, generic fallback, absent forecasts/context, focus/draft preservation, grouped charts, retrospective disclosure, mobile themes and reduced motion. No page/console errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
