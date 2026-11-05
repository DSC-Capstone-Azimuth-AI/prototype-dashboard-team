const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));const dir=process.env.TEMP+'/derconnect-custom-notes-qa';fs.mkdirSync(dir,{recursive:true});
try{await page.goto('http://127.0.0.1:8001/#export');const saved=await page.evaluate(()=>DC.D.events.map(e=>[e.id,DC.statusStore.note(e.id)]));
await page.getByRole('button',{name:'Use latest available data',exact:true}).click();
for(const type of ['snapshot','building','anomaly']){await page.selectOption('#report-type',type);if(type!=='snapshot')assert.equal(await page.inputValue('#report-custom-notes'),'');
const note=`${type.toUpperCase()} CUSTOM COMMENT café\n<img src=x onerror=alert(1)> plain text.\n`+'Long reviewer comment about demand, not a confirmed diagnosis. '.repeat(65);
await page.fill('#report-custom-notes',note);assert.equal(await page.inputValue('#report-custom-notes'),note);assert.equal(await page.locator('#report-custom-notes-preview img').count(),0);assert.equal(await page.locator('#report-custom-notes-preview .report-note-text').textContent(),note.trim());
await page.locator('#theme-toggle').click();assert.equal(await page.inputValue('#report-custom-notes'),note);
const [download]=await Promise.all([page.waitForEvent('download'),page.click('#report-download')]);await download.saveAs(dir+'/'+type+'.pdf');}
await page.selectOption('#report-type','snapshot');assert.match(await page.inputValue('#report-custom-notes'),/^SNAPSHOT/);
await page.getByRole('button',{name:'Clear custom notes',exact:true}).click();assert.equal(await page.inputValue('#report-custom-notes'),'');assert(await page.locator('#report-custom-notes-preview').isHidden());
await page.selectOption('#report-type','anomaly');assert.match(await page.inputValue('#report-custom-notes'),/^ANOMALY/);
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:dir+'/mobile.png',fullPage:true});
assert.deepEqual(await page.evaluate(()=>DC.D.events.map(e=>[e.id,DC.statusStore.note(e.id)])),saved);
await page.reload();assert.equal(await page.inputValue('#report-custom-notes'),'');assert.deepEqual(errors,[]);console.log('PASS custom notes live preview, plain text, per-type drafts, theme redraw, clearing, three PDF downloads, saved-note independence, mobile and reload; '+dir);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
