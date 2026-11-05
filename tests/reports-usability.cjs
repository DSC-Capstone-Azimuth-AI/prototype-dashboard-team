/* Export usability regressions: bundled Playwright + installed Edge; loopback server. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const value = id => page.inputValue('#report-' + id);
  const choose = (id, v) => page.selectOption('#report-' + id, v);
  const latest = page.getByRole('button', { name: 'Use latest available data', exact: true });
  const dir = process.env.REPORT_QA_DIR || process.env.TEMP + '/derconnect-report-usability'; fs.mkdirSync(dir, { recursive: true });
  try {
    await page.goto((process.env.DASHBOARD_URL || 'http://127.0.0.1:8001') + '/#export');
    const help = page.locator('#report-help'), summary = help.locator('summary').first();
    assert.equal(await help.getAttribute('open'), null);
    const initial = await page.locator('.report-controls').innerText();
    await summary.focus(); await page.keyboard.press('Enter'); assert(await help.evaluate(e => e.open));
    assert(await summary.evaluate(e => e === document.activeElement));
    assert.equal(await page.locator('.report-controls').innerText(), initial);
    await page.keyboard.press('Space'); assert.equal(await help.evaluate(e => e.open), false);
    await summary.click(); assert(await help.evaluate(e => e.open));
    const end = await page.evaluate(() => DC.reports.iso(DC.META.n - 1).slice(0, 10));
    assert((await help.textContent()).includes(end));
    await latest.click(); assert.equal(await value('preset'), 'latest-1');
    assert.match(await page.locator('#report-preset option:checked').textContent(), /Latest 1 day/);
    assert((await page.locator('#report-date-scope').textContent()).includes(end));
    assert((await page.locator('#report-scope-summary').textContent()).includes(end));
    assert.equal(await latest.count(), 0);
    assert(await help.evaluate(e => e.open));
    await choose('type', 'anomaly'); assert.equal(await value('preset'), 'all'); assert.equal(await latest.count(), 0);
    await choose('building', 'ENG'); await choose('meter', 'ENG-PV');
    assert.match(await page.locator('#report-meter option:checked').textContent(), /Solar generation \(PV\)/);
    assert.equal(await page.locator('#report-event option').count(), 3);
    assert.match(await page.locator('#report-event option').first().textContent(), /CR-012.*Generation/);
    await choose('building', 'ADM'); assert.equal(await value('meter'), 'all');
    assert.match(await page.locator('#report-selection-notice').textContent(), /Meter reset/);
    await choose('meter', 'ADM-PV'); await choose('building', 'all'); assert.equal(await value('meter'), 'ADM-PV');
    assert.match(await page.locator('.report-controls').textContent(), /Meter restriction remains active/);
    await choose('meter', 'all'); await choose('detector', 'rolling_mad'); await choose('building', 'ENG');
    assert(await page.locator('#report-event').isDisabled()); assert(await page.locator('#report-download').isDisabled());
    assert.match(await page.locator('#report-no-events').textContent(), /Jacobs Hall.*No matching detections does not prove normal/);
    await choose('building', 'all'); assert.equal(await page.locator('#report-event option').count(), 25);
    for (const detector of ['context_regression', 'seasonal_naive_168', 'seasonal_naive_24', 'rolling_mad']) { await choose('detector', detector); assert(await page.locator('#report-download').isEnabled()); }
    await choose('preset', 'custom'); assert(await page.locator('#report-from').isVisible());
    await page.fill('#report-from', '2026-10-01'); await page.fill('#report-to', '2026-10-01');
    await choose('type', 'building'); assert(await page.locator('#report-from').isVisible()); assert.notEqual(await value('building'), 'all');
    await choose('type', 'snapshot'); assert.equal(await value('preset'), 'latest-1'); assert.equal(await page.locator('#report-from').count(), 0);
    await choose('type', 'anomaly'); assert.equal(await value('preset'), 'custom'); assert.equal(await value('from'), '2026-10-01');
    assert.equal(await value('to'), '2026-10-01'); assert(await page.locator('#report-from').isVisible());
    await choose('preset', 'all'); await choose('building', 'ADM'); assert.equal(await page.locator('#report-from').count(), 0);
    assert(await page.locator('#report-chart-legend').isVisible());
    assert.match(await page.locator('#report-selected-event').textContent(), /Center Hall.*Main demand/);
    for (const details of await page.locator('#report-preview details').all()) if ((await details.locator('summary').textContent()).startsWith('Technical details:')) assert.equal(await details.getAttribute('open'), null);
    assert.match(await page.locator('#report-preview').textContent(), /Unreviewed/);
    const evidenceBefore = await page.evaluate(() => JSON.stringify(DC.reports.build({ type:'anomaly', event:document.querySelector('#report-event').value, building:'all' }).sections));
    await page.locator('#report-preview details').first().locator('summary').click();
    assert.equal(await page.evaluate(() => JSON.stringify(DC.reports.build({ type:'anomaly', event:document.querySelector('#report-event').value, building:'all' }).sections)), evidenceBefore);
    await page.screenshot({ path: dir + '/desktop-help.png', fullPage: true });
    await summary.click(); assert.equal(await help.evaluate(e => e.open), false);
    for (const theme of ['dark','light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      await page.setViewportSize({ width:390, height:844 }); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),390);
      await page.locator('#report-help > summary').click(); assert(await help.evaluate(e => e.open));
      await page.screenshot({path:dir+'/mobile-'+theme+'.png',fullPage:true});
      await page.locator('#report-help > summary').click();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS meter reset/retention, latest anchor, per-type dates, contextual empty states, categories/status labels, technical disclosures, PDF content independence, help mouse/keyboard/focus/state, both themes/mobile; '+dir);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
