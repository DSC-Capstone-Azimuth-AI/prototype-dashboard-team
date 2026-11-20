const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const fixture = require('./fixtures/chronos2.cjs');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const real = process.env.CHRONOS_REAL === '1';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (!real) for (const [key, file] of Object.entries(fixture.files)) await page.route('**/' + file, route => route.fulfill({ contentType: 'text/csv', body: fixture.bundle()[key] }));
    await page.goto(base + '/#overview');
    await page.locator('#overview-source').selectOption('historical');
    await page.locator('#real-overview-chart svg').first().waitFor();
    await page.locator('.tabs a[data-section="investigate"]').click();
    const table = page.locator('#real-investigate-log-table');
    await table.waitFor();
    assert.deepEqual(await table.locator('th').allTextContents(), ['Start', 'Duration', 'Peak detector score', 'Direction', 'Action']);
    assert.match(await page.locator('#real-event-score-help').textContent(), /exported normalized.*not severity, probability or a kW deviation/);
    assert.match(await table.locator('th').nth(2).getAttribute('title'), /normalized.*not severity/);
    assert.equal(await page.locator('#real-operator-review').count(), 0);
    const initial = await page.evaluate(() => DC.chronos2.session.scope().events.map(e => ({ id: e.id, meter: e.meter, score: e.score })));
    assert.equal(await table.locator('tbody tr').count(), initial.length);
    const first = initial[0], row = table.locator('tr[data-event-id="' + first.id + '"]');
    const formatted = await row.locator('td').allTextContents();
    const timestamp = await row.locator('time').textContent();
    assert.equal(await row.locator('td').nth(2).textContent(), await page.evaluate(v => DC.ui.rawNumber(v), first.score));
    assert.equal(await row.locator('a').getAttribute('href'), '#investigate/' + encodeURIComponent('real:' + first.id));
    await page.evaluate(() => { const open = DC.chronos2.session.open; window.opens = 0; DC.chronos2.session.open = (...args) => { window.opens++; return open(...args); }; });
    for (const entry of ['link', 'row', 'inspect', 'enter', 'space', 'button-enter']) {
      await page.evaluate(() => { window.opens = 0; });
      if (entry === 'link') await row.locator('a').click();
      else if (entry === 'row') await row.locator('td').nth(1).click();
      else if (entry === 'inspect') await row.getByRole('button').click();
      else if (entry === 'button-enter') { await row.getByRole('button').focus(); await page.keyboard.press('Enter'); }
      else { await row.focus(); await page.keyboard.press(entry === 'enter' ? 'Enter' : 'Space'); }
      await page.locator('#real-event-chart svg').waitFor();
      assert.equal(await page.evaluate(() => DC.state.routeId), 'real:' + first.id);
      assert.equal(await page.evaluate(() => window.opens), 1, entry + ' navigates once');
      assert.equal(await page.locator('#real-operator-review').count(), 1);
      if (entry === 'inspect') {
        await page.reload(); await page.locator('#real-event-chart svg').waitFor();
        assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), first.id);
        await page.evaluate(() => { const open = DC.chronos2.session.open; window.opens = 0; DC.chronos2.session.open = (...args) => { window.opens++; return open(...args); }; });
      }
      await page.goBack(); await table.waitFor();
      if (entry === 'row') { await page.goForward(); await page.locator('#real-event-chart svg').waitFor(); await page.goBack(); await table.waitFor(); }
    }
    // Compare the same event in the existing meter-profile table, including its wrapper.
    const wrapper = table.locator('..');
    const style = await wrapper.evaluate(n => ({ className: n.className, maxHeight: getComputedStyle(n).maxHeight }));
    await page.evaluate(meter => { location.hash = '#buildings/' + encodeURIComponent('derconnect:' + meter); }, first.meter);
    const building = page.locator('#chronos-event-list'); await building.waitFor();
    const buildingRow = building.locator('tr[data-event-id="' + first.id + '"]');
    assert.equal(await buildingRow.locator('time').textContent(), timestamp);
    assert.deepEqual((await buildingRow.locator('td').allTextContents()).slice(2, 5), formatted.slice(1, 4));
    assert.deepEqual(await building.locator('..').evaluate(n => ({ className: n.className, maxHeight: getComputedStyle(n).maxHeight })), style);
    await page.goBack(); await table.waitFor();
    // Shared filters drive this list; date range deliberately contains the event's start day.
    await page.locator('#f-meter').selectOption(first.meter);
    await page.locator('#f-range').selectOption('custom');
    const day = await page.evaluate(id => DC.chronos2.session.full(DC.chronos2.session.event(id).meter).rows.find(r => r.time === DC.chronos2.session.event(id).start).day, first.id);
    await page.locator('#f-from').fill(day); await page.locator('#f-from').dispatchEvent('change');
    await page.locator('#f-to').fill(day); await page.locator('#f-to').dispatchEvent('change');
    const ids = await page.evaluate(() => DC.chronos2.session.scope().events.map(e => e.id));
    assert(ids.includes(first.id));
    assert.deepEqual(await table.locator('tbody tr').evaluateAll(nodes => nodes.map(n => n.dataset.eventId)), ids);
    await row.getByRole('button').click(); await page.locator('#real-event-chart svg').waitFor();
    await page.getByRole('link', { name: '← Back to candidate events', exact: true }).click(); await table.waitFor();
    assert.equal(await page.inputValue('#f-meter'), first.meter); assert.equal(await page.inputValue('#f-from'), day); assert.equal(await page.inputValue('#f-to'), day);
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        assert(await row.getByRole('button').isVisible());
        assert.equal(await row.locator('td').last().evaluate(n => getComputedStyle(n).position), width === 390 ? 'sticky' : 'static');
        if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/event-list-' + theme + '-' + width + '.png', fullPage: true }); }
      }
    }
    await page.locator('#f-from').fill('2099-01-01'); await page.locator('#f-from').dispatchEvent('change');
    await page.locator('#f-to').fill('2099-01-02'); await page.locator('#f-to').dispatchEvent('change');
    assert.equal(await table.count(), 0); assert.match(await page.locator('#real-investigate-log').textContent(), /No grouped candidate events/);
    assert.deepEqual(errors, []);
    console.log('PASS shared Buildings table formatting, normalized score, exact single navigation, keyboard, filters/history/reload, empty scope, themes and mobile (' + (real ? 'committed export' : 'fixture') + ').');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
