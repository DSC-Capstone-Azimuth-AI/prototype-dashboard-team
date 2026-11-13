/* Real browser vertical slice with exporter-generated synthetic measurements only. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..'), folder = fs.mkdtempSync(path.join(os.tmpdir(), 'history-browser-'));
const fixture = execFileSync('python3', ['tests/test_derconnect_export.py', '--fixture', folder], {
  cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8'
}).trim();
const payload = fs.readFileSync(fixture, 'utf8'), base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const go = async section => {
      await page.evaluate(s => DC.navigate(s), section);
      await page.waitForFunction(s => DC.state.section === s && document.querySelector('.section.active')?.id === 'sec-' + s && !document.querySelector('#main-content').hasAttribute('aria-busy'), section);
    };
    await page.goto(base + '/#historical');
    await page.waitForSelector('#history-unconfigured');
    assert(await page.locator('#filters').isHidden()); assert(await page.locator('#data-banner').isHidden());
    const identity = await page.evaluate(() => ({ json: JSON.stringify(DC.D), count: DC.D.events.length }));
    await page.locator('#history-file').setInputFiles(fixture);
    await page.waitForSelector('#history-chart svg');
    assert.match(await page.locator('#history-kind').innerText(), /Synthetic test fixture/);
    assert.match(await page.getByLabel('Meter / facility').innerText(), /E2451.*Instructional/);
    assert.match(await page.getByLabel('Channel', { exact: true }).innerText(), /Active_Power_A.*kW/);
    assert(await page.getByLabel('Resolution', { exact: true }).isDisabled());
    assert.equal(await page.locator('[data-history-fact="Usable / unavailable intervals"]').innerText(), '187 / 5');
    assert.equal(await page.locator('#history-chart [data-history-gap]').count(), 4);
    assert.equal(await page.locator('#history-chart [data-history-line]').getAttribute('d').then(d => (d.match(/M/g) || []).length), 5);
    assert(await page.locator('#history-profile [data-history-hour]').count() >= 18);
    assert.match(await page.locator('#history-quality').innerText(), /cadence_collision: 1/);
    const text = await page.locator('#sec-historical').innerText();
    for (const forbidden of ['Precision', 'Recall', 'F1', 'CR-030', 'Ground truth', 'Confirmed fault']) assert(!text.includes(forbidden));
    assert.equal(await page.locator('#sec-historical svg').evaluateAll(nodes => nodes.flatMap(n => [...n.querySelectorAll('*')]).filter(n => [...n.attributes].some(a => /NaN|Infinity/.test(a.value))).length), 0);
    const chart = await page.locator('#history-chart svg').boundingBox();
    await page.mouse.move(chart.x + chart.width * 0.5, chart.y + 100);
    assert.match(await page.locator('.tooltip').innerText(), /Valid \/ expected slots/);
    await page.locator('#history-from').fill('2026-01-02'); await page.locator('#history-from').dispatchEvent('change');
    await page.waitForFunction(() => document.querySelector('[data-history-fact="Usable / unavailable intervals"]')?.textContent === '96 / 0');
    await page.locator('#history-to').fill('2026-01-01'); await page.locator('#history-to').dispatchEvent('change');
    await page.waitForSelector('#history-empty-range');
    await page.getByRole('button', { name: 'Full export range', exact: true }).click();
    await page.waitForSelector('#history-chart svg');
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      await page.waitForSelector('#history-chart svg');
      if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `historical-${theme}.png`), fullPage: true }); }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'historical-mobile.png'), fullPage: true });
    await go('overview'); await page.waitForSelector('#sec-overview svg');
    assert(await page.locator('#data-banner').isVisible());
    await go('historical'); await page.waitForSelector('#history-chart svg');
    await page.goBack(); await page.waitForSelector('#sec-overview.active');
    await page.goForward(); await page.waitForSelector('#history-chart svg');
    assert.equal(await page.evaluate(() => JSON.stringify(DC.D)), identity.json);
    await page.reload(); await page.waitForSelector('#history-unconfigured'); // File is never persisted.
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    const invalid = JSON.parse(payload); invalid.schema_version = '9.0';
    const upload = async value => page.locator('#history-file').setInputFiles({ name: 'synthetic-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await upload(invalid); await page.waitForSelector('#history-error');
    assert.match(await page.locator('#history-error').innerText(), /unsupported schema/);
    await page.locator('#history-file').setInputFiles({ name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('not JSON') });
    await page.waitForFunction(() => document.querySelector('#history-error')?.textContent === 'Historical export is not valid JSON.');
    const empty = JSON.parse(payload); empty.records = [];
    await upload(empty); await page.getByText('This export contains no historical intervals.', { exact: true }).waitFor();
    const missing = JSON.parse(payload);
    for (const r of missing.records) Object.assign(r, { mean_kw: null, min_kw: null, max_kw: null, quality: 'missing', valid_observations: 0, observed_slots: 0, collision_slots: 0, coverage: 0 });
    await upload(missing); await page.waitForSelector('#history-chart svg');
    assert.equal(await page.locator('[data-history-line]').getAttribute('d'), '');
    assert.equal(await page.locator('[data-history-gap]').count(), 1);
    await page.getByText('Insufficient daily-profile support:', { exact: false }).waitFor();
    // Configured same-origin HTTP loading and reloading; no private export is written.
    await page.route('**/configured-history.json', route => route.fulfill({ contentType: 'application/json', body: payload }));
    await page.route('**/', async route => {
      const response = await route.fetch();
      const html = (await response.text()).replace('name="derconnect-history" content=""', 'name="derconnect-history" content="configured-history.json"');
      await route.fulfill({ response, body: html });
    });
    await page.goto(base + '/#historical'); await page.waitForSelector('#history-chart svg');
    await page.reload(); await page.waitForSelector('#history-chart svg');
    assert.equal(await page.evaluate(() => DC.D.events.length), identity.count);
    await page.getByRole('button', { name: 'Reload configured export', exact: true }).click(); await page.waitForSelector('#history-chart svg');
    for (const s of ['overview', 'buildings', 'investigate', 'models', 'upload', 'export']) { await go(s); assert(await page.locator('#sec-' + s).isVisible()); }
    assert.deepEqual(errors, []);
    console.log('PASS historical browser: unconfigured, exporter fixture, gaps, tooltip, units, date scopes, profile, themes, 390px, navigation, reload, invalid/empty/all-missing, configured HTTP, synthetic isolation and six existing destinations');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(folder, { recursive: true, force: true }));
