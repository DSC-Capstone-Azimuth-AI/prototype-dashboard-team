/* Run against a static server: node tests/csv-upload-browser.cjs
   Requires Playwright and Chromium (CHROMIUM_PATH can override the executable). */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const fixture = name => path.join(__dirname, 'fixtures', name);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const open = async viewport => {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/#upload');
    await page.waitForSelector('#csv-file');
    return page;
  };
  const shot = async (page, name) => { if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), fullPage: true, animations: 'disabled' }); } };
  const factValue = (page, label) => page.locator(`[data-upload-fact="${label}"]`).textContent();
  try {
    const page = await open({ width: 1440, height: 1000 });
    const before = await page.evaluate(() => JSON.stringify([DC.D.meters.length, DC.D.events.length, DC.D.meters[0].actual.slice(0, 5), DC.state.detector]));
    assert.equal(await page.locator('.tabs a[aria-current="page"]').getAttribute('data-section'), 'upload');
    assert.equal(await page.locator('#filters').isHidden(), true);
    assert.equal(await page.locator('#data-banner').isHidden(), true);
    assert.equal(await page.locator('#csv-empty').isVisible(), true);
    await shot(page, 'upload-empty');

    await page.setInputFiles('#csv-file', fixture('meter-upload-valid.csv'));
    await page.waitForSelector('#upload-chart svg');
    assert.match(await page.locator('#csv-status').textContent(), /Ready to review/);
    assert.equal(await factValue(page, 'Rows read'), '144');
    assert.equal(await factValue(page, 'Meters'), '2');
    assert.equal(await page.locator('[data-upload-meters] tbody tr').count(), 2);
    const ticks = await page.locator('#upload-chart .ax text').allTextContents();
    assert.equal(new Set(ticks).size, ticks.length, 'axis labels are distinct');
    assert.equal(await page.locator('[data-upload-unavailable] tbody tr').count(), 5);
    const line = () => page.locator('[data-upload-line]').getAttribute('d');
    const first = await line();
    assert(first.length > 100);
    await page.selectOption('#upload-meter', 'M-102');
    assert.notEqual(await line(), first, 'choosing a meter redraws the chart');
    await page.locator('#upload-chart .hit').hover();
    assert.match(await page.locator('.tooltip').textContent(), /kW/);
    await shot(page, 'upload-valid');

    // Results survive theme redraws and section changes, and leave simulated views alone.
    await page.click('#theme-toggle');
    assert.equal(await page.locator('#upload-meter').inputValue(), 'M-102');
    await shot(page, 'upload-valid-dark');
    await page.click('#theme-toggle');
    await page.locator('.tabs a[data-section="overview"]').click();
    await page.waitForFunction(() => DC.state.section === 'overview' && document.querySelector('#sec-overview .kpi'));
    assert.equal(await page.locator('#filters').isVisible(), true);
    assert.equal(await page.locator('#data-banner').isVisible(), true);
    assert.equal(await page.evaluate(() => JSON.stringify([DC.D.meters.length, DC.D.events.length, DC.D.meters[0].actual.slice(0, 5), DC.state.detector])), before);
    await page.locator('.tabs a[data-section="upload"]').click();
    await page.waitForSelector('#upload-chart svg');
    assert.equal(await factValue(page, 'Rows read'), '144');

    await page.setInputFiles('#csv-file', fixture('meter-upload-messy.csv'));
    await page.waitForFunction(() => /Loaded with warnings/.test(document.querySelector('#csv-status')?.textContent || ''));
    await page.waitForSelector('#upload-chart svg');
    assert.equal(await factValue(page, 'Rows rejected'), '4');
    assert.equal(await page.locator('[data-upload-issues] tbody tr').count(), 4);
    assert((await page.locator('#csv-status li').count()) >= 8);
    assert.equal((await line()).split('M').length - 1, 1, 'gaps and conflicts leave one drawn line in M-201');
    assert.equal(await page.locator('[data-upload-point]').count(), 2, 'isolated readings stay visible as points');
    assert.equal(await page.locator('#sec-upload .upload-picker .mono').textContent(), 'meter-upload-messy.csv');
    await shot(page, 'upload-messy');

    await page.setInputFiles('#csv-file', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('date,value\n2026-08-10,1\n') });
    await page.waitForFunction(() => /File rejected/.test(document.querySelector('#csv-status')?.textContent || ''));
    assert.match(await page.locator('#csv-status').textContent(), /Missing required columns/);
    assert.equal(await page.locator('#upload-chart').count(), 0);
    const hostile = '<img src=x onerror=window.pwned=1>';
    await page.setInputFiles('#csv-file', { name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from(`timestamp,meter_id,kw\n2026-08-10T00:00:00Z,"${hostile}",1\n2026-08-10T01:00:00Z,M,${hostile}\n`) });
    await page.waitForSelector('#upload-chart');
    assert.equal(await page.locator('#sec-upload img').count(), 0);
    assert.equal(await page.evaluate(() => window.pwned), undefined);

    const huge = await open({ width: 1440, height: 1000 });
    await huge.setInputFiles('#csv-file', { name: 'huge.csv', mimeType: 'text/csv', buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 'a') });
    await huge.waitForFunction(() => /20 MB limit/.test(document.querySelector('#csv-status')?.textContent || ''));

    const phone = await open({ width: 390, height: 844 });
    await phone.setInputFiles('#csv-file', fixture('meter-upload-messy.csv'));
    await phone.waitForSelector('#upload-chart svg');
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll at 390px');
    assert(await phone.locator('[data-upload-unavailable]').evaluate(n => n.scrollWidth <= n.parentElement.clientWidth), 'unavailable reasons wrap at 390px');
    await shot(phone, 'upload-mobile');

    await page.goto(base + '/#upload'); await page.reload(); await page.waitForSelector('#csv-empty');
    assert.deepEqual(errors, []);
    console.log('PASS: empty, valid, messy, rejected, hostile and oversized files; meter switching; hover; theme and section changes; reload clearing; simulated data unchanged; 390px layout. No page/console errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
