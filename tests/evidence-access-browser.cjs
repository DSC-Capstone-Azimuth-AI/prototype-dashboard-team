/* Phase 1/2 regression: serve the repository, then run with Playwright and CHROMIUM_PATH. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:8000';
const shots = process.env.SCREENSHOT_DIR;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const settled = () => page.waitForFunction(() => !document.querySelector('#main-content').hasAttribute('aria-busy'));
    const go = async section => {
      if (await page.locator('#navigation-toggle').isVisible()) await page.locator('#navigation-toggle').click();
      await page.locator('.tabs a[data-section="' + section + '"]').click();
      await page.waitForFunction(section => DC.state.section === section && !document.querySelector('#main-content').hasAttribute('aria-busy'),section);
    };
    const capture = async name => {
      if (!shots) return;
      fs.mkdirSync(shots, { recursive: true });
      await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true, animations: 'disabled' });
    };
    const before = (a, b) => page.evaluate(([a,b]) => Boolean(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING), [a,b]);
    const metrics = () => page.evaluate(() => { const m=DC.chronos2.session.overviewMetrics(); return [m.count,m.affected,m.largest?.delta,m.longest?.id,m.flagged,m.eligible]; });
    await page.goto(base + '/#overview'); await settled();
    for (const detector of await page.locator('#f-detector option').evaluateAll(ns => ns.map(n => n.value))) {
      await page.evaluate(value => DC.setState({ detector: value }), detector); await settled();
      assert(await page.locator('#sec-overview .chart svg').count());
    }
    await page.locator('#overview-source').selectOption('historical');
    await page.locator('#real-overview-chart svg').first().waitFor();
    const original = await metrics();
    assert.equal(original[0],106);
    const chartLegendBefore = () => page.evaluate(() => {
      const chart=document.querySelector('#real-overview-chart');
      return Boolean(chart.parentElement.querySelector('.legend').compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert(await chartLegendBefore());
    assert.match(await page.locator('[data-overview-chart-meter="E2451"] .chart-scope').textContent(), /May 25/);
    const inspection = page.getByRole('group', { name: 'Overview chart inspection window' });
    await inspection.getByRole('button', { name: 'Full selected range' }).click();
    assert.match(await page.locator('[data-overview-chart-meter="E2451"] .chart-scope').textContent(), /Jan 15/);
    assert.deepEqual(await metrics(),original,'inspection never changes metrics/list scope');
    await inspection.getByRole('button', { name: 'Last 30 days' }).click();
    assert.deepEqual(await metrics(),original);
    await page.locator('#f-meter').selectOption('E2451');
    assert.equal(await page.locator('[data-overview-chart-meter]').count(),1);
    await page.locator('#f-range').selectOption('custom');
    await page.locator('#f-from').fill('2030-01-01'); await page.locator('#f-from').press('Tab');
    await page.locator('#f-to').fill('2030-01-02'); await page.locator('#f-to').press('Tab');
    await page.locator('#real-no-analysis').waitFor();
    assert(await before('#real-no-analysis','[data-real-metric="events"]'));
    assert.equal(await page.locator('[data-real-metric="events"] .value').textContent(),'Unavailable');
    await page.locator('#real-no-analysis').getByRole('button', { name:'Use loaded dates' }).click();
    assert.equal(await page.locator('#real-no-analysis').count(),0);
    const quietDay = await page.evaluate(() => {
      const S=DC.chronos2.session;
      return [...new Set(S.full('E2451').rows.filter(r=>r.period==='detection').map(r=>r.day))].find(day=>{
        const scope=S.bundle.select('E2451',day,day); return scope.scoredHours>0 && scope.events.length===0;
      });
    });
    assert(quietDay);
    await page.evaluate(day=>{DC.chronos2.session.filter({from:day,to:day});DC.setState({});},quietDay);
    assert.equal(await page.locator('[data-real-metric="events"] .value').textContent(),'0','analyzed quiet days retain valid zero');
    assert.equal(await page.locator('#real-no-analysis').count(),0);
    await page.locator('#f-reset').click(); await settled();
    await capture('real-overview-desktop');
    const eventId = await page.locator('#real-overview-queue-table button').first().getAttribute('data-event-id');
    await page.locator('#real-overview-queue-table button').first().click();
    await page.locator('#real-event-chart svg').waitFor();
    assert(await before('#real-event-detail .legend','#real-event-chart'));
    assert(await before('#real-event-chart','[data-detection-details]'));
    await page.getByRole('button',{name:'Review this event',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'real-operator-review');
    const status=page.getByLabel('Review status',{exact:true});
    await status.selectOption('in_review');
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#real-review-feedback')?.textContent.includes('saved'));
    await page.reload(); await page.locator('#real-event-chart svg').waitFor();
    assert.equal(await page.getByLabel('Review status',{exact:true}).inputValue(),'in_review');
    assert((await page.url()).includes(encodeURIComponent('real:'+eventId)));
    await page.locator('#real-return-meter').click(); await page.locator('#chronos-chart svg').waitFor();
    assert.match(await page.locator('#chronos-range').textContent(),/Selected event context/);
    assert.equal(await page.locator('.saved-window-summary').getAttribute('open'),null);
    assert(await before('#chronos-chart','.saved-window-summary'));
    assert(await before('#chronos-analysis .legend','#chronos-chart'));
    await page.locator('#chronos-restore-range').click();
    assert.match(await page.locator('#chronos-range').textContent(),/Saved chart window/);
    const geometry = [];
    for (const width of [1440,800,390]) {
      await page.setViewportSize({width,height:width===390?844:1000});
      await go('overview'); await page.locator('#real-overview-chart svg').first().waitFor();
      for (const theme of ['light','dark']) {
        if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('#theme-toggle').click();
        await settled();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        if(width===390){
          const height=await page.locator('.app-header').evaluate(n=>n.getBoundingClientRect().height);
          assert(height<=72,'compact phone navigation');
          assert.equal(await page.locator('.tabs').isVisible(),false);
          await page.locator('#navigation-toggle').focus();await page.keyboard.press('Enter');
          assert.equal(await page.locator('#navigation-toggle').getAttribute('aria-expanded'),'true');
          assert.equal(await page.locator('.tabs a:visible').count(),7);
          await page.keyboard.press('Escape');
          assert.equal(await page.evaluate(()=>document.activeElement.id),'navigation-toggle');
          assert.equal(await page.locator('.tabs').isVisible(),false);
          await page.locator('#navigation-toggle').click();
          await page.locator('.tabs a').first().focus();
          await page.locator('#f-range').focus();
          assert.equal(await page.locator('.tabs').isVisible(),false,'menu closes when keyboard focus leaves the header');
          await capture('real-overview-mobile-'+theme);
        }
        await page.locator('#real-overview-queue-table button').first().click();await page.locator('#real-event-chart svg').waitFor();
        geometry.push(await page.evaluate(()=>({width:innerWidth,theme:document.documentElement.dataset.theme,header:document.querySelector('.app-header').getBoundingClientRect().height,chart:document.querySelector('#real-event-chart').getBoundingClientRect().top+scrollY})));
        if(width===390)assert(geometry.at(-1).chart<1000,'event evidence precedes extended interpretation');
        await capture('real-event-'+width+'-'+theme);
        await go('overview');await page.locator('#real-overview-chart svg').first().waitFor();
      }
    }
    for (const section of ['investigate','buildings','models','upload','export','historical','overview']) {await go(section);assert(await page.locator('#sec-'+section+'.active h2').count());}
    await page.locator('#overview-source').selectOption('synthetic');
    await page.goto(base+'/#investigate/CR-030');await page.locator('#event-detail .chart svg').first().waitFor();
    await page.getByRole('button',{name:'Jump to operator review'}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'synthetic-operator-review');
    await capture('synthetic-event-mobile');
    assert.deepEqual(errors,[]);
    console.log('PASS evidence access: menu/focus/all routes, themes/widths, empty vs analyzed-zero scope, unchanged metrics, 7/30/full plots, legend order, event/review/deep-link persistence, focused vs saved scopes.');
    console.log(JSON.stringify(geometry));
    await context.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
