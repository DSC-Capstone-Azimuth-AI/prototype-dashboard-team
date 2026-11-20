/* Needs attention panel on the historical Overview: Chronos-2 candidates and phase-export data checks.
   Synthetic fixtures only. Serve the repository, then: node tests/historical-attention-browser.cjs */
const { chromium } = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const phase = require('./fixtures/history-comparison.cjs');
const { bundle, files } = require('./fixtures/chronos2.cjs');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const bad = r => Object.assign(r, { mean_kw: null, min_kw: null, max_kw: null, valid_observations: 0, observed_slots: 0, collision_slots: 0, coverage: 0, quality: 'missing' });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // The shared fixture gives E2451, E3020, E3510 and E7080 one candidate each and E7085 none.
  // A second, later E2451 candidate checks ranking by count and "latest".
  const texts = bundle();
  texts.events += 'E2451-test-2,E2451,chronos2-ft-5k,2026-03-08 05:00:00,2026-03-08 06:00:00,2026-03-08 12:00:00+00:00,2026-03-08 13:00:00+00:00,1,2026-03-08 05:00:00,1.5,0,16,below\n';
  for (const [key, file] of Object.entries(files)) await page.route('**/' + file, route => route.fulfill({ contentType: 'text/csv', body: texts[key] }));
  const shot = async name => { if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), fullPage: true, animations: 'disabled' }); } };
  const go = async section => { await page.locator('.tabs a[data-section="' + section + '"]').click(); await page.waitForFunction(s => DC.state.section === s && !document.querySelector('#main-content').hasAttribute('aria-busy'), section); };
  const rows = id => page.locator('#' + id + ' tbody tr').evaluateAll(ns => ns.map(n => [n.dataset.attention, n.children[1].textContent, n.children[3].textContent]));
  const summary = () => page.locator('#historical-attention-summary').textContent();
  const load = async exports => {
    await go('historical'); await page.locator('#history-clear').click();
    const version = await page.evaluate(() => DC.history.session.version);
    await page.locator('#history-file').setInputFiles(exports.map((d, i) => ({ name: 'synthetic-' + i + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) })));
    await page.waitForFunction(v => DC.history.session.version > v, version);
    await go('overview'); await page.waitForSelector('#attention-data-checks tbody tr');
  };
  try {
    await page.goto(base + '/#overview');
    assert.equal(await page.locator('#historical-attention').count(), 0, 'synthetic Overview is unchanged');
    await page.selectOption('#overview-source', 'historical');
    await page.waitForSelector('#attention-candidates tbody tr');

    // Model candidates show without any phase export loaded.
    assert.deepEqual(await rows('attention-candidates'), [
      ['E2451', 'Review candidates', 'Review latest candidate'],
      ['E3020', 'Review candidates', 'Review latest candidate'],
      ['E3510', 'Review candidates', 'Review latest candidate'],
      ['E7080', 'Review candidates', 'Review latest candidate'],
      ['E7085', 'No candidates', 'No action needed'],
    ]);
    assert.match(await page.locator('[data-attention="E2451"]').textContent(), /2 candidate events · longest 1 h · latest Mar 8, 2026/);
    assert.match(await page.locator('[data-attention="E7085"]').textContent(), /scored detection hours, none flagged/);
    assert.match(await page.locator('#attention-candidates').textContent(), /unverified and unclassified/);
    assert.equal(await summary(), '4 meters have model-flagged candidates to review.');
    assert.match(await page.locator('#attention-data-empty').textContent(), /No phase exports loaded/);
    await shot('attention-candidates');

    // The next step opens that meter's profile focused on its latest candidate.
    await page.locator('[data-attention-step="E2451"]').click();
    await page.waitForFunction(() => document.querySelector('#h-buildings')?.textContent === 'Meter E2451');
    await page.waitForSelector('#chronos-event');
    assert.match(await page.locator('#chronos-event').textContent(), /E2451-test-2/);
    assert.equal(await page.locator('#chronos-event-list button[aria-pressed="true"]').getAttribute('data-focus-key'), 'E2451-test-2');

    // Data checks for loaded phase exports. Their January dates fall outside the detection period.
    await go('overview');
    const usable = phase(), low = phase({ phase: 'B' }); low.records.slice(0, 120).forEach(bad);
    const none = phase({ meter: 'E3020' }); none.records.forEach(bad);
    const first = phase({ meter: 'E3510', bins: 96, gaps: false }), overlap = phase({ meter: 'E3510', bins: 48, gaps: false, offset: 50 });
    await load([usable, low, none, first, overlap]);
    assert.deepEqual(await rows('attention-data-checks'), [
      ['E3020/Active_Power_A', 'No usable data', 'Check the meter or its export'],
      ['E3510/Active_Power_A', 'Check data', 'Check the meter data'],
      ['E2451/Active_Power_B', 'Check data', 'Check the meter data'],
      ['E2451/Active_Power_A', 'Usable', 'No data action needed'],
    ]);
    // The shared catalog range is 192 bins, so E3510 has 48 usable, 48 conflicting and 96 bins with no export.
    assert.match(await page.locator('[data-attention="E3510/Active_Power_A"]').textContent(), /Coverage 25\.0% is below the export's 80\.0% minimum\. 48 intervals conflict between loaded exports\./);
    assert.match(await page.locator('[data-attention="E2451/Active_Power_B"]').textContent(), /below the export's 80\.0% minimum/);

    // Dates are shared: January dates have no scored detection hours.
    await page.locator('#overview-history-from').fill('2026-01-01');
    await page.locator('#overview-history-to').fill('2026-01-03');
    await page.waitForFunction(() => /Not scored/.test(document.querySelector('[data-attention="E2451"]')?.textContent || ''));
    assert((await rows('attention-candidates')).every(([, status]) => status === 'Not scored'));
    assert.equal(await summary(), 'No meter has model-flagged candidates; 3 of 4 loaded series need a data check.');
    await shot('attention-both');

    await page.locator('[data-attention-step="E2451/Active_Power_B"]').click();
    await page.waitForSelector('#history-chart svg');
    assert.equal(await page.evaluate(() => DC.history.session.selected.channel), 'Active_Power_B');
    assert.equal(await page.inputValue('#history-from'), '2026-01-01');

    await go('overview');
    await page.getByRole('button', { name: 'Full historical range', exact: true }).click();
    await page.waitForFunction(() => /Review candidates/.test(document.querySelector('[data-attention="E2451"]')?.textContent || ''));
    assert.equal(await summary(), '4 meters have model-flagged candidates to review; 3 of 4 loaded series need a data check.');

    await page.selectOption('#overview-source', 'synthetic');
    assert.equal(await page.locator('#historical-attention').count(), 0);
    await page.selectOption('#overview-source', 'historical');
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal page scroll at 390px');
      await shot('attention-mobile-' + theme);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    // If the model CSVs cannot load, the panel says so and data checks still work.
    const broken = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    broken.on('pageerror', e => errors.push(e.message));
    await broken.route('**/data/anomaly/**', route => route.fulfill({ status: 404, body: '' }));
    await broken.goto(base + '/#overview'); await broken.selectOption('#overview-source', 'historical');
    await broken.waitForFunction(() => /unavailable/.test(document.querySelector('#attention-candidates-status')?.textContent || ''));
    assert.equal(await broken.locator('#historical-attention-summary').count(), 0);

    await page.reload(); await page.selectOption('#overview-source', 'historical');
    await page.waitForSelector('#attention-data-empty');
    assert.deepEqual(errors, []);
    console.log('PASS Needs attention: synthetic Overview unchanged; model candidates without exports, ranking, latest/longest, unverified label, open latest candidate in the meter profile; data checks with order, reasons and next steps; shared date scope (Not scored outside detection); full range; source switch; dark/light 390px; model unavailable; reload. No page/console errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
