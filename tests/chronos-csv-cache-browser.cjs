/* Exercise the real dashboard upgrade with a previous CSV asset in Chromium's HTTP cache. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const previousCsv = execFileSync('git', ['show', '533dcec:js/csv.js'], { cwd: root });
const csvReads = [];
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.csv': 'text/csv' };
let upgraded = false;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/warm-cache') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><script src="/js/csv.js"></script>');
    return;
  }
  if (url.pathname === '/js/csv.js') {
    csvReads.push(url.search);
    if (!upgraded) {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=86400, immutable' });
      response.end(previousCsv);
      return;
    }
  }
  const file = path.join(root, url.pathname === '/' ? '/index.html' : url.pathname);
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [], csvResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/data/anomaly/chronos2-ft-5k/') && response.ok()) csvResponses.push(path.basename(url.pathname));
    });
    await page.goto(base + '/warm-cache');
    assert.equal(await page.evaluate(() => typeof DC.csv.records), 'undefined');
    assert.deepEqual(csvReads, ['']);
    upgraded = true;

    await page.goto(base + '/#/buildings');
    await page.locator('.tabs a[data-section="buildings"]').click();
    await page.getByRole('button', { name: 'Real DERCONNECT', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-real-meter]').length === 5 ||
      document.querySelector('#chronos-load-status')?.textContent.startsWith('Chronos-2 unavailable'));
    assert.equal(await page.locator('#chronos-load-status').count(), 0, await page.locator('#chronos-load-status').allTextContents());
    assert.equal(await page.locator('#chronos-files').count(), 0);
    assert.deepEqual(await page.locator('[data-real-meter]').evaluateAll(nodes => nodes.map(node => node.dataset.realMeter).sort()),
      ['E2451', 'E3020', 'E3510', 'E7080', 'E7085']);
    assert.deepEqual(csvResponses.sort(), ['events', 'forecasts', 'predictions'].map(name => 'chronos2-ft-5k-' + name + '.csv'));
    assert.equal(csvReads.length, 2);
    assert.notEqual(csvReads[1], '');

    await page.locator('[data-real-meter="E2451"] .action-link').click();
    const chart = page.locator('#chronos-chart svg');
    await chart.waitFor();
    assert.equal(await chart.locator('path[fill="none"][stroke]').count(), 2);
    assert.match(await page.locator('#chronos-event-count').textContent(), /^21 candidate events/);
    await page.locator('#chronos-event-list button').first().click();
    await page.locator('#chronos-context-chart svg').waitFor();
    assert.match(await page.locator('#chronos-event').textContent(), /Observed at peak.*Expected at peak.*Peak raw score/);
    assert.deepEqual(errors, []);
    console.log('PASS cached CSV upgrade, automatic loading of three committed CSVs, five meters, and E2451 chart and event investigation.');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
