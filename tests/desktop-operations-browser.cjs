/* Desktop refinement regression. Serve the root; use existing Playwright/Chrome. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const fixture = require('./fixtures/chronos2.cjs');
const phaseFixture = require('./fixtures/history-comparison.cjs');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const shots = process.env.SCREENSHOT_DIR;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const errors = [], geometry = [];
  const observe = page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  };
  const settled = page => page.waitForFunction(() => !document.querySelector('#main-content').hasAttribute('aria-busy'));
  const go = async (page, section) => {
    if (await page.locator('#navigation-toggle').isVisible()) await page.locator('#navigation-toggle').click();
    await page.locator('.tabs a[data-section="' + section + '"]').click();
    await page.waitForFunction(s => DC.state.section === s && !document.querySelector('#main-content').hasAttribute('aria-busy'), section);
  };
  const capture = async (page, name) => {
    if (!shots) return;
    fs.mkdirSync(shots, { recursive: true });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true, animations: 'disabled' });
  };
  const canonical = page => page.evaluate(() => {
    const S = DC.chronos2.session;
    return JSON.stringify({ metrics: S.overviewMetrics(), events: S.bundle.meters.map(m => S.full(m).events),
      rows: S.bundle.meters.map(m => S.full(m).rows) });
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); observe(page);
    page.setDefaultTimeout(10000);
    await page.goto(base + '/#overview'); await settled(page);
    for (const detector of await page.locator('#f-detector option').evaluateAll(ns => ns.map(n => n.value))) {
      if (!await page.locator('#f-detector').isVisible()) await page.locator('#advanced-filters > summary').click();
      await page.selectOption('#f-detector', detector); await settled(page);
      assert(await page.locator('#sec-overview .chart-inspector').count());
    }
    await page.evaluate(() => DC.setState({ meter: DC.D.meters.find(m => m.kind === 'main').id })); await settled(page);
    await page.locator('#sec-overview .overview-evidence summary').click();
    const syntheticThreshold = await page.locator('#sec-overview .overview-evidence .inspection-facts').evaluate(n =>
      [...n.children].find(c => c.querySelector('dt').textContent === 'Detector raw threshold').querySelector('dd').textContent);
    assert.equal(syntheticThreshold, await page.evaluate(() => String(DC.D.detectors.find(d => d.id === DC.state.detector).threshold)));
    await page.evaluate(() => DC.setState({ meter: 'all' })); await settled(page);
    await page.selectOption('#overview-source', 'historical');
    await page.locator('#real-overview-chart svg').first().waitFor();
    const original = await canonical(page);
    for (const width of [1440, 1920]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      await go(page, 'overview'); await page.locator('#real-overview-chart svg').first().waitFor();
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const g = await page.evaluate(() => ({ width: innerWidth, theme: document.documentElement.dataset.theme,
        overflow: document.documentElement.scrollWidth > innerWidth,
        queueTop: document.querySelector('#real-overview-queue').getBoundingClientRect().top,
        chartTop: document.querySelector('.overview-evidence').getBoundingClientRect().top }));
      geometry.push(g); assert.equal(g.overflow, false); assert(g.queueTop < 500); assert(g.chartTop < 1000);
      assert(await page.getByText('Monitor & investigate', { exact: true }).isVisible());
      await capture(page, 'overview-' + theme + '-' + width);
      await go(page, 'buildings'); await page.locator('#sec-buildings .desktop-comparison tbody tr').first().waitFor();
      assert.equal(await page.locator('#sec-buildings .desktop-comparison tbody tr').count(), 5);
      assert.equal(await page.locator('#sec-buildings .comparison-cards').isVisible(), false);
      assert(await page.locator('#sec-buildings .desktop-comparison').isVisible());
      const tableSize = await page.locator('#sec-buildings .desktop-comparison').evaluate(n => ({ box: n.clientWidth, content: n.scrollWidth }));
      assert(tableSize.content <= tableSize.box + 1, 'desktop comparison columns fit without horizontal scrolling');
      const contrast = await page.evaluate(() => {
        const rgb = text => { const a = text.match(/[\d.]+/g).map(Number); return [a[0],a[1],a[2],a[3] ?? 1]; };
        const over = (a,b) => a.slice(0,3).map((v,i) => v*a[3]+b[i]*(1-a[3]));
        const luminance = c => c.map(v => { v/=255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4; }).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
        return ['caption','thead th','tbody td','tbody small','tbody a'].map(selector => {
          const node = document.querySelector('#sec-buildings .desktop-comparison '+selector), layers=[];
          for(let current=node;current;current=current.parentElement) layers.push(rgb(getComputedStyle(current).backgroundColor));
          const background=layers.reverse().reduce((b,a)=>over(a,b),[255,255,255]);
          const foreground=over(rgb(getComputedStyle(node).color),background), a=luminance(foreground), b=luminance(background);
          return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        });
      });
      contrast.forEach(sample => assert(sample.ratio>=4.5, `${theme} ${sample.selector} contrast ${sample.ratio}`));
      geometry.push({width,theme,contrast});
      await capture(page, 'meters-' + theme + '-' + width);
    }
    await page.getByRole('searchbox', { name: 'Search meters' }).fill('E2451');
    assert.equal(await page.locator('#sec-buildings .desktop-comparison tbody tr').count(), 1);
    await page.getByRole('searchbox', { name: 'Search meters' }).fill('unknown-meter');
    assert(await page.getByText('No meters match your search.', { exact: true }).filter({ visible: true }).isVisible());
    await page.getByRole('searchbox', { name: 'Search meters' }).fill('');
    await go(page, 'overview'); await page.locator('#real-overview-queue-table button').first().click();
    await page.locator('#real-event-chart svg').waitFor();
    const eventHash = new URL(page.url()).hash;
    await page.locator('#real-return-meter').click(); await page.locator('#chronos-chart svg').waitFor();
    assert.match(await page.locator('#chronos-range').textContent(), /Selected event context/);
    assert.equal(await page.locator('#chronos-context-chart').count(), 0, 'focused primary chart is not duplicated');
    await page.locator('#chronos-restore-range').click();
    await page.locator('#chronos-analysis').getByRole('button', { name: 'Custom dates', exact: true }).click();
    await page.locator('#chronos-from').fill('2026-03-01'); await page.locator('#chronos-from').press('Tab');
    await page.locator('#chronos-to').fill('2026-03-07'); await page.locator('#chronos-to').press('Tab');
    const saved = await page.evaluate(() => { const v = DC.chronos2.session.profile(DC.chronos2.session.event(DC.chronos2.session.state.selected).meter); return [v.preset,v.from,v.to]; });
    assert.deepEqual(saved, ['custom','2026-03-01','2026-03-07']);
    await page.locator('#chronos-open-review').click(); await page.locator('#real-event-chart svg').waitFor();
    await page.locator('#real-return-meter').click(); await page.locator('#chronos-chart svg').waitFor();
    assert.deepEqual(await page.evaluate(() => { const v=DC.chronos2.session.profile(DC.chronos2.session.event(DC.chronos2.session.state.selected).meter); return [v.preset,v.from,v.to]; }), saved);
    await page.locator('#chronos-chart summary').click();
    const slider = page.locator('#chronos-chart input[type="range"]'); await slider.focus();
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('#chronos-chart .inspection-readout').textContent(), /Observed total/);
    assert.equal(await canonical(page), original, 'inspection leaves model outputs, grouping, scope and metrics unchanged');
    await capture(page, 'focused-profile-inspector');
    await page.locator('#chronos-open-review').click(); await page.locator('#real-event-chart svg').waitFor();
    assert.equal(new URL(page.url()).hash, eventHash, 'review opens the exact selected event');
    await page.getByLabel('Review status', { exact: true }).selectOption('follow_up');
    await page.getByRole('button', { name: 'Save review', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#real-review-feedback')?.textContent.includes('saved'));
    await page.reload(); await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.getByLabel('Review status', { exact: true }).inputValue(), 'follow_up');
    await page.locator('#real-return-meter').click(); await page.locator('#chronos-chart svg').waitFor();
    await page.locator('#chronos-restore-range').click(); assert.match(await page.locator('#chronos-range').textContent(), /Saved chart window/);
    await go(page, 'buildings');
    assert.match(await page.locator('#sec-buildings .desktop-comparison').textContent(), /1 follow-up/);
    await page.locator('#buildings-source').getByRole('button', { name: 'Synthetic Demo', exact: true }).click();
    assert.equal(await page.locator('#sec-buildings .desktop-comparison tbody tr').count(), 8);
    assert.match(await page.locator('#sec-buildings .desktop-comparison caption').textContent(), /relationships are simulated/);
    await capture(page, 'synthetic-directory');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#sec-buildings .desktop-comparison').isVisible(), false);
    assert(await page.locator('#sec-buildings .comparison-cards').isVisible());
    await go(page, 'overview');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert((await page.locator('.app-header').boundingBox()).height <= 72);
    await page.close();

    // Invented, isolated fixture validates known values, gaps, zero and interpolation.
    const fixturePage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); observe(fixturePage);
    const texts = fixture.bundle();
    texts.predictions = texts.predictions.replaceAll(',2.5,0.125,1,detection,False', ',2.5,1.23456789e-11,1,detection,False');
    for (const [key, file] of Object.entries(fixture.files)) await fixturePage.route('**/' + file, route => route.fulfill({ contentType: 'text/csv', body: texts[key] }));
    await fixturePage.goto(base + '/#overview'); await settled(fixturePage);
    await fixturePage.selectOption('#overview-source', 'historical'); await fixturePage.locator('#real-overview-chart svg').first().waitFor();
    const fixtureBefore = await canonical(fixturePage);
    await go(fixturePage, 'buildings');
    await fixturePage.locator('#buildings-data-management > summary').click();
    const phase = phaseFixture({ meter: 'E9000', offset: 100, bins: 4, gaps: false });
    phase.facility_type = null;
    await fixturePage.locator('#buildings-history-files').setInputFiles({ name: 'synthetic-phase.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(phase)) });
    await fixturePage.waitForFunction(() => DC.history.session.products.some(p=>p.meter_id==='E9000') || document.querySelector('#buildings-history-error'));
    assert.equal(await fixturePage.locator('#buildings-history-error').count(),0,'valid synthetic phase contract loads');
    await fixturePage.locator('#sec-buildings [data-comparison-id="E9000"]').waitFor();
    const phaseRow = await fixturePage.locator('#sec-buildings [data-comparison-id="E9000"]').textContent();
    assert.match(phaseRow, /Not analyzed/); assert.match(phaseRow, /96\.5 kW phase mean/); assert.match(phaseRow, /Synthetic phase fixture/);
    assert.match(await fixturePage.locator('#sec-buildings [data-comparison-id="E2451"]').textContent(), /observations unavailable/);
    await fixturePage.locator('#sec-buildings [data-comparison-id="E2451"] .action-link').click();
    await fixturePage.locator('#chronos-analysis').getByRole('button', { name: 'Full range', exact: true }).click();
    await fixturePage.locator('#chronos-chart svg').waitFor(); await fixturePage.locator('#chronos-chart summary').click();
    const input = fixturePage.locator('#chronos-chart input[type="range"]'), values = fixturePage.locator('#chronos-chart .inspection-readout');
    const facts = () => fixturePage.locator('#chronos-chart .inspection-facts').evaluate(n => Object.fromEntries([...n.children].map(c => [c.querySelector('dt').textContent,c.querySelector('dd').textContent])));
    await input.focus(); await fixturePage.keyboard.press('Home'); await fixturePage.keyboard.press('ArrowRight');
    assert.deepEqual(await facts(), { 'Observed total':'55 kW', 'Expected total (median)':'16 kW', 'Nominal 80% interval':'8 kW to 24 kW', 'Raw prediction score':'2.5', 'Prediction threshold':'1.23456789e-11', 'Detector flag':'Flagged hour', 'Candidate event':'E2451-test-event' });
    assert.match(await values.textContent(), /Detection · Measured observation/);
    await fixturePage.keyboard.press('ArrowRight'); await fixturePage.keyboard.press('ArrowRight'); await fixturePage.keyboard.press('ArrowRight');
    assert.match(await values.textContent(), /No model output for this UTC hour/);
    await fixturePage.keyboard.press('End'); assert.equal((await facts())['Observed total'], '0 kW');
    await fixturePage.keyboard.press('ArrowLeft'); assert.equal((await facts())['Observed total'], 'Unavailable');
    await fixturePage.keyboard.press('ArrowLeft'); assert.match(await values.textContent(), /Interpolated observation/);
    await fixturePage.keyboard.press('Home'); await fixturePage.keyboard.press('ArrowRight');
    assert.equal(await canonical(fixturePage), fixtureBefore);
    await fixturePage.locator('#chronos-chart').getByRole('button', { name: 'Open candidate event' }).focus(); await fixturePage.keyboard.press('Enter');
    await fixturePage.locator('#real-event-chart svg').waitFor(); assert(new URL(fixturePage.url()).hash.includes('E2451-test-event'));
    await fixturePage.close();
    assert.deepEqual(errors, []);
    if (shots) fs.writeFileSync(path.join(shots,'desktop-geometry.json'), JSON.stringify(geometry,null,2));
    console.log('PASS desktop operations: comparison, review persistence, exact keyboard evidence/gaps, scopes, themes, 1440/1920px; narrow functionality retained.',JSON.stringify(geometry));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
