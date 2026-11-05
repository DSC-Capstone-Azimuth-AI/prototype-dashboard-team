const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('fs');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {await page.goto((process.env.DASHBOARD_URL||'http://127.0.0.1:8001')+'/#export');await page.waitForSelector('#report-download');assert(await page.locator('#report-download').isDisabled());
assert.equal(await page.locator('#report-from').count(),0);
await page.selectOption('#report-preset','custom');assert(await page.locator('#report-from').isVisible());assert(await page.locator('#report-to').isVisible());
await page.selectOption('#report-preset','3');assert.equal(await page.locator('#report-from').count(),0);
await page.selectOption('#report-preset','1');
await page.getByRole('button',{name:'Use latest available data',exact:true}).click();assert(await page.locator('#report-download').isEnabled());
const dir=process.env.REPORT_QA_DIR||process.env.TEMP+'/derconnect-report-qa';fs.mkdirSync(dir,{recursive:true});
await page.selectOption('#report-preset','30');
for(const type of ['snapshot','building','anomaly']){await page.selectOption('#report-type',type);if(type!=='anomaly'){const latest=page.getByRole('button',{name:'Use latest available data',exact:true});if(await latest.count())await latest.click();else assert.match(await page.locator('#report-date-scope').textContent(),/Historical latest-data anchor/);}if(type==='building')assert(await page.locator('#report-from').isVisible());if(type==='anomaly'){assert.equal(await page.locator('#report-from').count(),0);await page.selectOption('#report-preset','custom');assert(await page.locator('#report-from').isVisible());await page.selectOption('#report-preset','all');assert.equal(await page.locator('#report-from').count(),0);await page.check('#report-notes');await page.evaluate(()=>{const id=document.querySelector('#report-event').value;DC.notesStore.set(id,'Long note with café and temperature °C. '.repeat(50));});await page.check('#report-labels');}
const [download]=await Promise.all([page.waitForEvent('download'),page.click('#report-download')]);await download.saveAs(dir+'/'+type+'.pdf');assert(fs.readFileSync(dir+'/'+type+'.pdf').subarray(0,4).toString()==='%PDF');}
await page.selectOption('#report-detector','rolling_mad');
await page.selectOption('#report-building','LIB');
assert(await page.locator('#report-event').isDisabled());
assert.match(await page.locator('#report-event').textContent(), /No anomalies match these filters/);
assert(await page.locator('#report-no-events').isVisible());
assert(await page.locator('#report-download').isDisabled());
await page.selectOption('#report-building','all');await page.selectOption('#report-meter','all');await page.selectOption('#report-preset','all');
assert.equal(await page.locator('#report-event option').count(),25);
assert(await page.locator('#report-event').isEnabled());assert(await page.locator('#report-download').isEnabled());
assert.equal(await page.locator('#report-no-events').count(),0);
await page.screenshot({path:dir+'/desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:dir+'/mobile.png',fullPage:true});
for(const section of ['overview','buildings','investigate','models','upload','export']){await page.evaluate(s=>location.hash='#'+s,section);await page.waitForTimeout(400);assert(await page.locator('#sec-'+section).isVisible());}
await page.reload();await page.waitForSelector('#report-download');assert(await page.locator('#report-download').isDisabled());
assert.deepEqual(errors,[]);console.log('PASS report downloads, opt-ins, empty range, latest-data choice, mobile fit, six sections, reload; '+dir);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
