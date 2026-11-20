const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const fixture = require('./fixtures/chronos2.cjs');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const real = process.env.CHRONOS_REAL === '1';
const first = real ? 'chronos2-ft-5k-E7080-025' : 'E2451-test-event';
const second = real ? 'chronos2-ft-5k-E2451-007' : 'E3020-test-event';
const hash = id => '#investigate/' + encodeURIComponent('real:' + id);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const observe = async page => {
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (!real) for (const [key, file] of Object.entries(fixture.files)) await page.route('**/' + file, route => route.fulfill({ contentType: 'text/csv', body: fixture.bundle()[key] }));
    };
    await observe(page);
    const review = page.locator('#real-operator-review');
    const field = label => review.getByLabel(label, { exact: true });
    const save = () => review.getByRole('button', { name: 'Save review', exact: true }).click();
    const go = async id => { await page.evaluate(id => DC.chronos2.session.open(id), id); await review.waitFor(); await page.waitForFunction(id => DC.state.routeId === 'real:' + id, id); };
    await page.goto(base + '/' + hash(first)); await review.getByRole('button', { name: 'Save review' }).waitFor();
    const original = await page.evaluate(() => {
      DC.statusStore.set('CR-030', 'investigating', 'Synthetic review sentinel.');
      return { data: JSON.stringify(DC.D), synthetic: JSON.stringify(DC.D.events.map(e => [e.id, DC.statusStore.get(e.id), DC.statusStore.note(e.id)])),
        real: JSON.stringify(DC.chronos2.session.bundle.meters.map(m => DC.chronos2.session.full(m).rows)) };
    });
    const deviation = page.locator('#real-event-detail [data-fact="Deviation at Score Peak (kW)"]');
    const raw = await page.evaluate(() => { const s = DC.chronos2.session, e = s.event(s.state.selected), f = s.eventFacts(e); return { delta: f.delta, actual: f.peak.actual, expected: f.peak.q.q50, score: e.score }; });
    assert(Number.isFinite(raw.delta));
    assert.match(await deviation.textContent(), real ? /17\.98 kW above expected.*131\.03 kW.*113\.05 kW/ : /39\.00 kW above expected.*55\.00 kW.*16\.00 kW/);
    assert(Math.abs(Number(await deviation.locator('.v').getAttribute('title')) - raw.delta) < 1e-9);
    assert.equal(await deviation.locator('.metric-icon[aria-hidden="true"]').count(), 1);
    const details = page.locator('[data-detection-details="' + first + '"]');
    assert.equal(await details.evaluate(n => n.open), false);
    await details.locator('summary').click();
    assert.equal(Number((await details.locator('[data-fact="Exported normalized event peak score"] .v').getAttribute('title'))), raw.score);
    assert.match(await details.textContent(), /not probabilities, severity or kW.*never reconstructed/);
    if (real) {
      assert.equal(raw.score, 18885080.086); assert(Math.abs(raw.delta - 17.9828) < 1e-9);
      assert.equal(await details.locator('[data-fact="Raw prediction score"] .v').textContent(), '0.1889');
      assert.equal(await details.locator('[data-fact="Prediction threshold"] .v').textContent(), '0');
    }
    assert.match(await review.textContent(), /browser.*localStorage.*not shared multi-user/);
    assert.equal(await field('Review status').inputValue(), 'not_reviewed'); assert.equal(await field('Assessment').inputValue(), 'uncertain');
    assert.match(await page.locator('#real-review-last-saved').textContent(), /Never saved/);
    await field('Review status').selectOption('follow_up'); await field('Assessment').selectOption('possible_measurement_issue');
    await field('Review notes').fill('Observed departure <b>literal text</b>; compare operating context.');
    await field('Follow-up action').fill('Check meter communications and the operating log.');
    await field('Reviewer name (optional)').fill('Example operator');
    assert.match(await page.locator('#real-review-dirty').textContent(), /Unsaved changes/);
    await save(); assert.match(await page.locator('#real-review-feedback').textContent(), /saved in this browser only/);
    assert.match(await page.locator('#real-review-dirty').textContent(), /No unsaved/);
    assert.doesNotMatch(await page.locator('#real-review-last-saved').textContent(), /Never saved/);
    const key = await review.getAttribute('data-review-key');
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(stored.identity.meter, real ? 'E7080' : 'E2451'); assert.equal(stored.identity.event, first); assert.match(stored.identity.run, /^sha256:/);
    await go(second); assert.equal(await field('Review notes').inputValue(), ''); assert.equal(await field('Reviewer name (optional)').inputValue(), '');
    assert.equal(await field('Review status').inputValue(), 'not_reviewed');
    await field('Review notes').fill('Second event only.'); await save();
    await page.goBack(); await review.waitFor(); assert.equal(await page.evaluate(() => DC.chronos2.session.state.selected), first);
    assert.match(await field('Review notes').inputValue(), /^Observed departure/); assert.equal(await field('Assessment').inputValue(), 'possible_measurement_issue');
    await field('Review notes').fill('Unsaved first-event draft.');
    await go(second); assert.equal(await field('Review notes').inputValue(), 'Second event only.');
    await page.goBack(); await review.waitFor(); assert.equal(await field('Review notes').inputValue(), 'Unsaved first-event draft.');
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      await page.setViewportSize({ width: 390, height: 1000 }); await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      assert.equal(await field('Review notes').inputValue(), 'Unsaved first-event draft.');
      if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/review-' + theme + '-390.png', fullPage: true }); }
    }
    // Same event ID, new bundle identity: old textarea IDs must not be copied into the new run by ui.refresh.
    if (!real) {
      const oldIdentity = await page.evaluate(() => DC.chronos2.session.bundle.reviewIdentity.run);
      const replacement = fixture.bundle(); replacement.events += '\n';
      await page.evaluate(async texts => { const A = DC.chronos2; await A.session.load(() => A.withReviewIdentity(A.parse(texts), texts)); }, replacement);
      assert.notEqual(await page.evaluate(() => DC.chronos2.session.bundle.reviewIdentity.run), oldIdentity);
      assert.equal(await field('Review notes').inputValue(), ''); assert.equal(await field('Review status').inputValue(), 'not_reviewed');
      await field('Review notes').fill('Different run only.'); await save();
      await page.evaluate(async texts => { const A = DC.chronos2; await A.session.load(() => A.withReviewIdentity(A.parse(texts), texts)); }, fixture.bundle());
      assert.equal(await field('Review notes').inputValue(), 'Unsaved first-event draft.');
      assert.equal(await review.getAttribute('data-review-key'), key);
    }
    // Reload must request a warning and Cancel must retain the draft.
    const dialogPromise = page.waitForEvent('dialog');
    const reloading = page.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
    const dialog = await dialogPromise; assert.equal(dialog.type(), 'beforeunload'); await dialog.dismiss(); await reloading;
    assert.equal(await field('Review notes').inputValue(), 'Unsaved first-event draft.');
    await save(); await page.reload(); await review.getByRole('button', { name: 'Save review' }).waitFor();
    assert.equal(await field('Review notes').inputValue(), 'Unsaved first-event draft.'); assert.equal(await field('Reviewer name (optional)').inputValue(), 'Example operator');
    assert.equal(await field('Review status').inputValue(), 'follow_up'); assert.equal(await field('Assessment').inputValue(), 'possible_measurement_issue');
    assert.equal(await field('Follow-up action').inputValue(), 'Check meter communications and the operating log.');
    await field('Review status').selectOption('reviewed'); await field('Assessment').selectOption('expected_operation');
    await field('Follow-up action').fill('Recheck the next recorded operating period.');
    await field('Reviewer name (optional)').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Save review');
    await page.keyboard.press('Enter'); assert.match(await page.locator('#real-review-feedback').textContent(), /saved in this browser only/);
    await page.goForward(); // No future entry is required; ordinary event links remain the source of navigation.
    await go(second); await page.goBack(); await review.waitFor(); assert.equal(await field('Review status').inputValue(), 'reviewed');
    const unchanged = await page.evaluate(() => ({ data: JSON.stringify(DC.D), synthetic: JSON.stringify(DC.D.events.map(e => [e.id, DC.statusStore.get(e.id), DC.statusStore.note(e.id)])), real: JSON.stringify(DC.chronos2.session.bundle.meters.map(m => DC.chronos2.session.full(m).rows)) }));
    assert.deepEqual(unchanged, original, 'Reviews cannot modify predictions, events, labels or synthetic reviews');

    for (const mode of ['blocked', 'quota']) {
      const failed = await browser.newPage(); await observe(failed);
      await failed.addInitScript(mode => {
        if (mode === 'blocked') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
        else Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
      }, mode);
      await failed.goto(base + '/' + hash(first)); const panel = failed.locator('#real-operator-review'); await panel.getByLabel('Review notes', { exact: true }).waitFor();
      await panel.getByLabel('Review notes', { exact: true }).fill('Retained when storage fails.'); await panel.getByRole('button', { name: 'Save review' }).click();
      assert.match(await failed.locator('#real-review-feedback').textContent(), /not saved.*storage/);
      assert.match(await failed.locator('#real-review-dirty').textContent(), /Unsaved changes/); assert.match(await failed.locator('#real-review-last-saved').textContent(), /Never saved/);
      assert.equal(await panel.getByLabel('Review notes', { exact: true }).inputValue(), 'Retained when storage fails.');
      await failed.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS real review saving/reopen/edit/reload, keyed drafts and unload protection, run/event/synthetic isolation, quota/blocked storage, keyboard/themes/mobile and score-peak evidence (' + (real ? 'committed export' : 'fixture') + ').');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
