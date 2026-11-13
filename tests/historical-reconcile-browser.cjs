/* Optional local real-export check, gated on an independently reconciled report. */
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const file=process.env.HISTORY_EXPORT, reportFile=process.env.HISTORY_REPORT;
if(!file||!reportFile) throw Error('Set HISTORY_EXPORT and HISTORY_REPORT to local private files.');
const bytes=fs.readFileSync(file),data=JSON.parse(bytes),report=JSON.parse(fs.readFileSync(reportFile));
assert.equal(report.validation,'PASS');assert.equal(report.export_sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.DASHBOARD_URL||'http://127.0.0.1:8000')+'/#historical');
  await page.locator('#history-file').setInputFiles(file);await page.waitForSelector('#history-chart svg');
  const actual=await page.evaluate(d=>({summary:DC.history.summarize(d.records),profile:DC.history.profile(d,d.records)}),data);
  const near=(a,b)=>{if(b===null)assert.equal(a,null);else assert(Math.abs(a-b)<=1e-8+1e-9*Math.abs(b),`${a} != ${b}`);};
  for(const key of ['mean','peak','coverage','usable','unavailable','support','valid','expected'])near(actual.summary[key],report.summary[key]);
  for(let i=0;i<24;i++)for(const key of ['mean','valid','expected','bins','coverage'])near(actual.profile.hours[i][key],report.profile.hours[i][key]);
  assert.equal(actual.profile.available,report.profile.available);
  const fact=label=>page.locator(`[data-history-fact="${label}"]`).innerText();
  assert.equal(await fact('Usable / unavailable intervals'),`${report.summary.usable} / ${report.summary.unavailable}`);
  const formatted=await page.evaluate(s=>({mean:DC.fmt.kw(s.mean),peak:DC.fmt.kw(s.peak),coverage:DC.fmt.pct(s.coverage,1)}),report.summary);
  assert.equal(await fact('Mean observed power'),formatted.mean);assert.equal(await fact('Maximum observed sample in usable bins'),formatted.peak);assert.equal(await fact('Valid-slot coverage'),formatted.coverage);
  assert.match(await page.getByLabel('Meter / facility').innerText(),/E2451/);assert.match(await page.getByLabel('Channel',{exact:true}).innerText(),/Active_Power_A.*kW/);
  assert.match(await page.locator('#history-kind').innerText(),data.measurement_kind==='synthetic_fixture'?/Synthetic test fixture/:/DERConnect historical measurements/);
  assert.equal(await page.locator('[data-history-point]').count(),report.summary.usable);
  assert.equal(await page.locator('[data-history-hour]').count(),report.profile.available?report.profile.hours.filter(h=>h.mean!==null).length:0);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);console.log('PASS browser UI and adapter reconciled with independently computed raw-ZIP report; '+data.measurement_kind);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
