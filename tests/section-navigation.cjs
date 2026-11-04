/* Section transitions, rapid routing and anomaly-first building workflow.
   Serve localhost:8000. Uses the same optional Playwright/CHROMIUM_PATH setup. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const observe = page => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  };
  const settled = (page, section, id = null) => page.waitForFunction(({ section, id }) => DC.state.section === section && DC.state.routeId === id &&
    document.querySelector('.section.active')?.id === 'sec-' + section && !document.querySelector('#main-content').hasAttribute('aria-busy'), { section, id });
  const alignedNavigation = page => page.waitForFunction(() => {
    const active = document.querySelector('.tabs a[aria-current="page"]').getBoundingClientRect();
    const indicator = document.querySelector('#nav-indicator').getBoundingClientRect();
    return Math.abs(active.x - indicator.x) < 1 && Math.abs(active.y - indicator.y) < 1 && Math.abs(active.width - indicator.width) < 1 && Math.abs(active.height - indicator.height) < 1;
  });
  const sectionInView = page => page.waitForFunction(() => {
    const section = document.querySelector('.section.active'), header = document.querySelector('.app-header');
    const filters = document.querySelector('#filters'), landing = filters.hidden ? section : filters;
    const inset = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
    const desired = Math.min(Math.max(0, document.documentElement.scrollHeight - innerHeight), Math.max(0, scrollY + landing.getBoundingClientRect().top - inset - 16));
    return Math.abs(scrollY - desired) < 2;
  });
  const clickSection = async (page, section) => {
    await page.locator(`.tabs a[data-section="${section}"]`).click(); await settled(page, section);
    await alignedNavigation(page); await sectionInView(page);
    const filtersVisible = await page.locator('#f-range').evaluate(n => {
      const rect = n.getBoundingClientRect(), header = document.querySelector('.app-header');
      const inset = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
      return rect.top >= inset && rect.bottom <= innerHeight;
    });
    assert(filtersVisible, section + ' time-range filter remains visible after tab navigation');
  };
  const screenshot = async (page, name) => {
    if (!process.env.SCREENSHOT_DIR) return;
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), fullPage: true, animations: 'disabled' });
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); observe(page);
    await page.addInitScript(() => {
      window.transitionCount = 0;
      window.tabPressCount = 0; window.sectionScrollCalls = [];
      const animate = Element.prototype.animate, scroll = window.scrollTo.bind(window);
      Element.prototype.animate = function (...args) { if (this.matches('.tabs a')) window.tabPressCount++; return animate.apply(this, args); };
      window.scrollTo = (...args) => { if (typeof args[0] === 'object') window.sectionScrollCalls.push(args[0].behavior); return scroll(...args); };
      const native = document.startViewTransition?.bind(document);
      if (native) document.startViewTransition = update => { window.transitionCount++; return native(update); };
    });
    await page.goto(base); await settled(page, 'overview');
    assert.equal(await page.locator('#sec-overview .kpi .metric-icon[aria-hidden="true"]').count(), 4);
    const metric = key => page.locator(`#sec-overview .metric-toggle[data-metric="${key}"]`);
    const metricScope = await page.evaluate(() => JSON.stringify(DC.state));
    const metricValues = await page.locator('#sec-overview .kpi .value').allTextContents();
    await metric('review').click();
    assert.equal(await metric('review').getAttribute('aria-pressed'), 'true');
    await metric('priority').focus(); await page.keyboard.press('Enter');
    assert.equal(await metric('priority').getAttribute('aria-pressed'), 'true');
    assert.equal(await metric('review').getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Space');
    assert.equal(await metric('priority').getAttribute('aria-pressed'), 'false');
    await metric('completeness').click();
    assert.equal(await page.locator('#sec-overview .metric-toggle[aria-pressed="true"]').count(), 1);
    assert.equal(await page.evaluate(() => JSON.stringify(DC.state)), metricScope, 'emphasis does not change scope or event state');
    assert.deepEqual(await page.locator('#sec-overview .kpi .value').allTextContents(), metricValues);
    assert.equal(await page.locator('.tabs a').count(), 4);
    assert.equal(await page.locator('.nav-group').count(), 0);
    assert.equal(await page.locator('.tabs a .nav-icon[aria-hidden="true"]').count(), 4);
    assert.equal(await page.locator('.tabs a').evaluateAll(links => links.every(link => document.getElementById(link.getAttribute('aria-controls')))), true);
    await alignedNavigation(page);
    for (const section of ['investigate', 'buildings', 'models', 'overview']) {
      await clickSection(page, section);
      assert.equal(await page.locator('.section.active').count(), 1);
      assert.equal(await page.locator('.tabs a[aria-current="page"]').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
    }
    assert(await page.evaluate(() => !document.startViewTransition || window.transitionCount > 0), 'native transitions used when available');
    assert(await page.evaluate(() => window.tabPressCount > 0), 'tabs receive press feedback');
    assert(await page.evaluate(() => window.sectionScrollCalls.includes('smooth')), 'tab navigation requests smooth scrolling');
    const beforeSameTab = await page.evaluate(() => window.transitionCount);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await clickSection(page, 'overview');
    assert.equal(await page.evaluate(() => window.transitionCount), beforeSameTab, 'selected tab scrolls back without rerendering');
    // A superseding navigation must win; skipped native snapshots must not reject globally.
    await page.evaluate(async () => {
      DC.navigate('investigate'); await new Promise(requestAnimationFrame);
      DC.navigate('buildings'); await new Promise(requestAnimationFrame);
      DC.navigate('models');
    });
    await settled(page, 'models');
    await alignedNavigation(page);
    assert.equal(await page.locator('.tabs a[aria-current="page"]').getAttribute('data-section'), 'models');
    await clickSection(page, 'overview');
    const beforeFilters = await page.evaluate(() => window.transitionCount);
    await page.selectOption('#f-building', 'LIB');
    assert.equal(await metric('completeness').getAttribute('aria-pressed'), 'true', 'metric emphasis survives navigation and filter redraws');
    assert.equal(await page.evaluate(() => window.transitionCount), beforeFilters, 'local filters do not start route transitions');
    await screenshot(page, 'overview');

    await clickSection(page, 'buildings');
    await page.locator('#sec-buildings a[href="#buildings/LIB"]').first().click(); await settled(page, 'buildings', 'LIB');
    assert.equal(await page.locator('#building-anomalies').evaluate(n => Boolean(n.compareDocumentPosition(document.querySelector('#building-demand')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    assert((await page.locator('#building-anomalies a[href^="#investigate/"]').count()) <= 6);
    const preview = await page.locator('#building-anomalies a[href^="#investigate/"]').evaluateAll(nodes => nodes.map(n => n.hash.split('/')[1]));
    assert.equal(await page.evaluate(ids => {
      const flags = ids.map(id => DC.isOpen(DC.eventById(id))); return flags.every((open, i) => open || !flags.slice(i + 1).some(Boolean));
    }, preview), true, 'pending events precede reviewed events');
    await page.selectOption('#f-range', '14');
    const sourceScope = await page.evaluate(() => ({ t0: DC.state.t0, t1: DC.state.t1, detector: DC.state.detector }));
    await screenshot(page, 'building-profile');
    await page.getByRole('link', { name: 'Review all building events' }).click(); await settled(page, 'investigate');
    assert.equal(await page.locator('#f-building').inputValue(), 'LIB');
    assert.equal(await page.locator('#f-status').inputValue(), 'all');
    assert.deepEqual(await page.evaluate(() => ({ t0: DC.state.t0, t1: DC.state.t1, detector: DC.state.detector })), sourceScope);
    assert.equal(await page.locator('tr[data-id]').count(), await page.evaluate(() => DC.allEvents().filter(e => e.building === 'LIB' && e.start < DC.state.t1 && DC.state.t0 < e.end).length));
    await page.goBack(); await settled(page, 'buildings', 'LIB');
    await page.goForward(); await settled(page, 'investigate');
    await page.locator('tr[data-id]').first().click();
    const eventId = await page.evaluate(() => location.hash.split('/')[1]); await settled(page, 'investigate', eventId);
    await page.reload(); await settled(page, 'investigate', eventId);
    await page.getByLabel('Investigation notes').fill('Draft retained during local status update.');
    const beforeStatus = await page.evaluate(() => window.transitionCount);
    await page.getByLabel('Investigation status', { exact: true }).selectOption('investigating');
    assert.equal(await page.getByLabel('Investigation notes').inputValue(), 'Draft retained during local status update.');
    assert.equal(await page.evaluate(() => window.transitionCount), beforeStatus);
    await screenshot(page, 'event-detail');

    await clickSection(page, 'models');
    assert.equal(await page.locator('[data-detection-summary] thead th').count(), 7);
    assert.equal(await page.locator('[data-detection-summary] tbody tr').count(), 4);
    await page.getByText('Calibration & additional metrics', { exact: true }).click();
    assert.equal(await page.locator('[data-detection-settings] tbody tr').count(), 4);
    assert.match(await page.locator('[data-detection-settings]').innerText(), /FPR/);
    const calibration = await page.locator('[data-detection-settings] tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].slice(2).map(c => c.textContent)));
    assert.deepEqual(calibration, await page.evaluate(() => DC.D.detectors.map(d => { const e = DC.D.evaluation[d.id]; return [e.normal.false_alerts_per_1000.toFixed(1), e.auprc == null ? '—' : e.auprc.toFixed(2), `${e.coverage_80.toFixed(2)} / ${e.coverage_98.toFixed(2)}`]; })));
    await screenshot(page, 'detector-comparison');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const beforeReduced = await page.evaluate(() => window.transitionCount);
    const pressesBeforeReduced = await page.evaluate(() => window.tabPressCount);
    await clickSection(page, 'buildings');
    assert.equal(await page.evaluate(() => window.transitionCount), beforeReduced);
    assert.equal(await page.evaluate(() => window.tabPressCount), pressesBeforeReduced);
    assert.equal(await page.locator('.tabs').evaluate(n => n.getAnimations({ subtree: true }).length), 0);
    assert.equal(await page.locator('.section.active').evaluate(n => n.getAnimations().length), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const section of ['overview', 'investigate', 'buildings', 'models']) {
      await clickSection(page, section);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      if (section === 'overview') {
        await metric('buildings').click();
        assert.equal(await metric('buildings').getAttribute('aria-pressed'), 'true');
        assert.equal(await metric('buildings').evaluate(n => n.getAnimations().length), 0);
        await screenshot(page, 'mobile-overview');
      }
    }
    await screenshot(page, 'mobile-navigation');

    const fallback = await browser.newPage(); observe(fallback);
    await fallback.addInitScript(() => {
      document.startViewTransition = undefined; window.fallbackAnimations = 0;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) { window.fallbackAnimations++; return animate.apply(this, args); };
    });
    await fallback.goto(base); await settled(fallback, 'overview');
    for (const section of ['investigate', 'buildings', 'models']) await clickSection(fallback, section);
    assert(await fallback.evaluate(() => window.fallbackAnimations > 0), 'fallback animation works without native transitions');
    await fallback.emulateMedia({ reducedMotion: 'reduce' });
    const beforeFallbackReduce = await fallback.evaluate(() => window.fallbackAnimations);
    await clickSection(fallback, 'overview');
    assert.equal(await fallback.evaluate(() => window.fallbackAnimations), beforeFallbackReduce);
    await fallback.close();
    assert.deepEqual(errors, []);
    console.log('PASS: unified navigation, native/fallback/reduced-motion transitions, rapid route supersession, local-filter/draft stability, building event ordering/scope/history, retained calibration metrics, mobile and no page/console errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
