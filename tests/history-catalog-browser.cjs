/* Synthetic-only multi-month end-to-end checks. No actual measurements required. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fixture=require('./fixtures/history-comparison.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto((process.env.DASHBOARD_URL||'http://127.0.0.1:8000')+'/#historical');await page.waitForSelector('#history-unconfigured');
  const synthetic=await page.evaluate(()=>JSON.stringify([DC.D,DC.state,DC.D.events.map(e=>[e.id,DC.statusStore.get(e.id),DC.statusStore.note(e.id)])]));
  async function upload(ds,valid=true){const version=await page.evaluate(()=>DC.history.session.version);await page.locator('#history-file').setInputFiles(ds.map((d,i)=>({name:'synthetic-'+i+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))})));if(valid)await page.waitForFunction(v=>DC.history.session.version>v,version);else await page.waitForSelector('#history-error');}
  const jan=fixture({start:'2026-01-01T08:00:00Z',bins:31*96,gaps:false}),mar=fixture({start:'2026-03-01T08:00:00Z',bins:31*96-4,gaps:false});
  await upload([jan,mar,fixture({meter:'E3020',start:'2026-01-01T08:00:00Z',bins:31*96,gaps:false}),fixture({phase:'B',start:'2026-01-01T08:00:00Z',bins:31*96,gaps:false})]);
  await page.waitForSelector('#history-chart svg');assert.equal(await page.locator('#history-product option').count(),3);
  assert.match(await page.locator('#history-month').textContent(),/2026-02 · no export loaded/);
  await page.selectOption('#history-month','2026-02');assert.match(await page.locator('[data-history-fact="Mean observed power"]').textContent(),/Unavailable/);
  assert.equal(await page.locator('#history-chart [data-history-gap]').count(),1);assert.equal(await page.locator('#history-chart [data-history-point]').count(),0);
  await page.locator('#history-from').fill('2026-01-31');await page.locator('#history-to').fill('2026-03-01');
  await page.selectOption('#history-product','E3020/Active_Power_A');assert.equal(await page.inputValue('#history-from'),'2026-01-31');assert.equal(await page.inputValue('#history-to'),'2026-03-01');
  await page.selectOption('#history-product','E2451/Active_Power_A');await page.getByRole('button',{name:'Full export range',exact:true}).click();
  await page.locator('#history-patterns > summary').click();await page.waitForSelector('#history-month-pattern svg');
  assert.equal(await page.locator('#history-patterns table').count(),2);assert.match(await page.locator('#history-patterns').innerText(),/2026-02\s+Unavailable/);
  await page.getByText('Compare historical exports',{exact:true}).click();await page.waitForSelector('[data-comparison-chart] svg');
  await page.locator('#comparison-cursor').focus();await page.keyboard.press('End');assert.match(await page.locator('#comparison-timestamp').textContent(),/Jan 31, 2026.*2026-02-01T07:45:00/);
  const conflict=structuredClone(jan);conflict.records[0].mean_kw+=.5;await upload([jan,conflict]);assert.match(await page.locator('#history-warning').innerText(),/1 conflicting overlap bins/);
  assert.equal(await page.evaluate(()=>DC.history.session.selected.records[0].quality),'export_conflict');
  await upload([{...jan,display_unit:'kWh'}],false);assert.equal(await page.locator('#history-product option').count(),1);assert(await page.locator('#history-chart svg').isVisible());
  await upload([jan,structuredClone(jan)]);assert.equal(await page.evaluate(()=>DC.history.session.selected.catalog.identical_overlap_bins),31*96);
  // Six independent monthly files: 52k five-minute bins with bounded SVG output.
  const large=[];for(let m=1;m<=6;m++){const start=new Date(Date.UTC(2026,m-1,1,8)),stop=new Date(Date.UTC(2026,m,1,8));large.push(fixture({start:start.toISOString().replace('.000Z','Z'),minutes:5,bins:(stop-start)/300000,gaps:false}));}
  const began=Date.now();await upload(large);await page.waitForSelector('#history-chart svg');
  assert(await page.locator('#history-chart [data-history-point]').count()<5000);assert(Date.now()-began<20000);
  console.log('Large synthetic browser load/render ms:',Date.now()-began);
  for(const theme of ['dark','light']){if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme-toggle').click();await page.setViewportSize({width:390,height:844});await page.waitForSelector('#history-chart svg');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);}
  assert.equal(await page.evaluate(()=>JSON.stringify([DC.D,DC.state,DC.D.events.map(e=>[e.id,DC.statusStore.get(e.id),DC.statusStore.note(e.id)])])),synthetic);
  if(process.env.SCREENSHOT_DIR){const fs=require('node:fs');fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.SCREENSHOT_DIR+'/history-catalog-mobile.png',fullPage:true});}
  await page.reload();await page.waitForSelector('#history-unconfigured');assert.deepEqual(errors,[]);
  console.log('PASS multi-month browser: batch loading, meter/phase selection, retained global dates, missing months, period summaries, shared comparisons/keyboard, conflicts/duplicates, failed-load retention, large rendering, themes/mobile, synthetic isolation, reload and no console/page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
