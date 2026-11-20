/* Preserve the Git-reference Buildings UI while using explicit synthetic contract
   fixtures for import edge cases. Optional local real exports never enter Git. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process'),fixture=require('./fixtures/history-comparison.cjs');
const base=process.env.DASHBOARD_URL||'http://127.0.0.1:8000';
const originalRevision='e42bc946e28e5a20f96e938772989da5ef2aec7a';
(async()=>{
  if(process.env.SCREENSHOT_DIR)fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),reference=await context.newPage(),errors=[];
    for(const p of [page,reference]){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.emulateMedia({reducedMotion:'reduce'});}
    // Exercise the existing phase-only workflow with the model bundle unconfigured.
    await page.route(url=>url.pathname===new URL(base).pathname,async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text()).replace(/<meta name="derconnect-chronos2"[^>]+>/,'')});
    });
    // Compare with actual pre-integration components, not a newly invented reference.
    for(const file of ['js/sections/buildings.js','js/charts.js','js/ui.js'])await reference.route('**/'+file,route=>route.fulfill({contentType:'application/javascript',body:execFileSync('git',['show',originalRevision+':'+file],{encoding:'utf8'})}));
    const go=async(section,p=page)=>{await p.locator(`.tabs a[data-section="${section}"]`).click();await p.waitForFunction(s=>DC.state.section===s&&!document.querySelector('#main-content').hasAttribute('aria-busy'),section);};
    const openMeter=async meter=>{await go('buildings');await page.locator(`[data-real-meter="${meter}"] .action-link`).click();await page.waitForSelector('#building-demand svg');};
    const controls=async()=>{await page.locator('#buildings-controls').waitFor();};
    const upload=async(selector,products,valid=true)=>{if(selector.startsWith('#buildings'))await controls();const version=await page.evaluate(()=>DC.history.session.version);await page.locator(selector).setInputFiles(products.map((d,i)=>({name:`synthetic-${i}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))})));if(valid)await page.waitForFunction(v=>DC.history.session.version>v,version);else await page.waitForSelector('#buildings-history-error');};
    const dom=p=>p.locator('#sec-buildings').evaluate(n=>{const copy=n.cloneNode(true);copy.querySelector('#buildings-controls')?.remove();return copy.innerHTML;});
    await Promise.all([page.goto(base+'/#buildings'),reference.goto(base+'/#buildings')]);
    await page.waitForSelector('.building-card');await reference.waitForSelector('.building-card');
    assert.equal(await page.locator('#buildings-controls').count(),1);
    assert(await page.locator('#buildings-controls').evaluate(n=>n.previousElementSibling.classList.contains('section-head')&&n.firstElementChild.id==='buildings-source'));
    assert.equal(await page.locator('#buildings-source button[aria-pressed="true"]').textContent(),'Prototype Data');
    assert.equal(await page.locator('#buildings-history-files').count(),0);assert(await page.locator('#filters').isHidden());
    for(const width of [1440,900,390]){
      await page.setViewportSize({width,height:1000});await reference.setViewportSize({width,height:1000});
      await Promise.all([page.waitForTimeout(200),reference.waitForTimeout(200)]);
      // Align the new panel's allowed vertical space in the reference page;
      // original card pixels are compared at the same screen coordinates.
      await reference.evaluate(html=>{document.querySelector('#buildings-controls')?.remove();document.querySelector('#sec-buildings .section-head').insertAdjacentHTML('afterend',html);},await page.locator('#buildings-controls').evaluate(n=>n.outerHTML));
      assert.equal(await dom(page),await dom(reference),'Demo directory DOM must match Git original');
      assert((await page.locator('.building-directory').screenshot()).equals(await reference.locator('.building-directory').screenshot()),`Demo card pixels must match original at ${width}px`);
    }
    await page.setViewportSize({width:1440,height:1000});await reference.setViewportSize({width:1440,height:1000});
    await page.locator('.building-directory a').first().click();await reference.locator('.building-directory a').first().click();await page.waitForSelector('#building-demand svg');await reference.waitForSelector('#building-demand svg');
    assert.equal(await dom(page),await dom(reference),'Demo profile and SVG markup must match Git original');
    const scope=await page.evaluate(()=>({range:DC.state.range,t0:DC.state.t0,t1:DC.state.t1}));
    const dates=await page.evaluate(()=>[DC.time.isoDate(DC.state.t0+24),DC.time.isoDate(DC.state.t1-25)]);
    await page.locator('#buildings-prototype-from').fill(dates[0]);await page.locator('#buildings-prototype-to').fill(dates[1]);
    assert.deepEqual(await page.evaluate(()=>[DC.state.t0,DC.state.t1,DC.state.range]),[scope.t0+24,scope.t1-24,'custom']);
    await page.evaluate(s=>DC.setState(s),scope);
    const synthetic=await page.evaluate(()=>JSON.stringify([DC.D,DC.D.events.map(e=>[e.id,DC.statusStore.get(e.id),DC.statusStore.note(e.id)])]));
    await go('buildings');await page.locator('#buildings-source').getByRole('button',{name:'Real DERCONNECT',exact:true}).click();assert(await page.locator('#buildings-history-empty').isVisible());assert.equal(await page.locator('.building-card').count(),0);assert(await page.locator('.building-directory').isVisible());assert.equal(await page.locator('#buildings-history-product, #sec-buildings table').count(),0);
    assert(await page.locator('#buildings-history-from').isDisabled());assert(await page.locator('#buildings-history-to').isDisabled());
    assert(await page.locator('#buildings-history-files').evaluate(n=>n.multiple&&n.closest('#buildings-controls')));
    const a=fixture(),unknown=fixture({meter:'E9000',offset:20});unknown.facility_type=null;
    await upload('#buildings-history-files',[a,fixture({phase:'B',offset:100}),unknown]);assert.equal(await page.locator('.building-card').count(),2);
    assert.equal(await page.inputValue('#buildings-history-from'),'2026-01-01');assert.equal(await page.inputValue('#buildings-history-to'),'2026-01-02');
    assert.match(await page.locator('#buildings-loaded-meters').textContent(),/E2451.*E9000.*3 export/);
    const shape=await page.locator('.building-card').first().evaluate(n=>Array.from(n.children,(x,i)=>x.tagName+'.'+(i===3?'status':x.className)));
    assert.deepEqual(shape,await reference.evaluate(()=>{DC.navigate('buildings');return null;}).then(async()=>{await reference.waitForSelector('.building-card');return reference.locator('.building-card').first().evaluate(n=>Array.from(n.children,(x,i)=>x.tagName+'.'+(i===3?'status':x.className)));}));
    assert.match(await page.locator('[data-real-meter="E2451"]').textContent(),/2 loaded phases/);
    await page.getByRole('searchbox',{name:'Search buildings'}).fill('9000');assert.equal(await page.locator('.building-card').count(),1);await page.getByRole('searchbox').fill('');
    await openMeter('E2451');assert.equal(await page.locator('.kpis .kpi').count(),4);assert.match(await page.locator('#building-anomalies').textContent(),/not connected/);
    assert.equal(await page.locator('#buildings-history-chart svg path[stroke]').evaluateAll(ns=>ns.filter(n=>n.getAttribute('fill')==='none'&&n.getAttribute('d')).map(n=>(n.getAttribute('d').match(/M/g)||[]).length).reduce((a,b)=>a+b,0)),3);
    assert(await page.locator('#buildings-history-profile svg').isVisible());
    await controls();await page.locator('#buildings-history-from').fill('2026-01-02');await page.locator('#buildings-history-to').fill('2026-01-02');
    await page.getByRole('button',{name:'Active_Power_B',exact:true}).click();assert.match(await page.locator('[data-buildings-history-fact="Average observed power"]').textContent(),/106/);
    await openMeter('E9000');assert.match(await page.locator('#buildings-history-available').textContent(),/classification: unavailable/);assert.equal(await page.inputValue('#buildings-history-from'),'2026-01-02');
    assert.equal(await page.locator('[data-buildings-history-fact="Average observed power"]').textContent(),'26.5 kW');
    await go('historical');assert.equal(await page.inputValue('#history-product'),'E9000/Active_Power_A');assert.equal(await page.inputValue('#history-from'),'2026-01-02');
    await upload('#history-file',[fixture({meter:'E3020'})]);await go('buildings');assert.equal(await page.locator('.building-card').count(),3);
    await upload('#buildings-history-files',[a]);assert.equal(await page.evaluate(()=>DC.history.session.products.find(d=>d.meter_id==='E2451'&&d.channel==='Active_Power_A').catalog.identical_overlap_bins),192);
    const conflict=structuredClone(a);conflict.records[100].mean_kw+=.5;await upload('#buildings-history-files',[conflict]);await openMeter('E2451');assert.match(await page.locator('#buildings-history-quality').textContent(),/export_conflict: 1/);
    await upload('#buildings-history-files',[{...a,display_unit:'kWh'}],false);assert.equal(await page.evaluate(()=>DC.history.session.products.length),4);
    await page.locator('#buildings-history-compare').click();await page.waitForSelector('[data-comparison-chart] svg');assert.equal(await page.locator('[data-comparison-chart]').count(),3);await page.locator('#comparison-cursor').focus();await page.keyboard.press('End');
    await openMeter('E9000');await controls();await page.locator('#buildings-history-from').fill('2027-01-01');assert(await page.locator('#buildings-history-empty-range').isVisible());await page.getByRole('button',{name:'Full available range',exact:true}).click();
    // Retain all original advanced panel slots, with unavailable states instead of fake context.
    await go('buildings');await page.getByText('Advanced building & sub-grid analysis',{exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.analysis-group').length===5);
    await reference.getByText('Advanced building & sub-grid analysis',{exact:true}).click();await reference.waitForFunction(()=>document.querySelectorAll('.analysis-group').length===5);
    assert.equal(await page.locator('.analysis-group .card').count(),await reference.locator('.analysis-group .card').count());
    await page.locator('#sec-buildings .analysis-group > summary').filter({hasText:/^Peak demand$/}).click();await page.waitForSelector('.analysis-group:has-text("Peak demand analysis") svg');
    for(const theme of ['dark','light']){if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme-toggle').click();for(const width of [1440,900,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);const cols=await page.locator('.building-directory').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);assert.equal(cols,width>1100?3:width>640?2:1);assert.equal(await page.locator('.buildings-date-range').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),2);if(process.env.SCREENSHOT_DIR){await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.locator('#buildings-controls').screenshot({path:process.env.SCREENSHOT_DIR+`/controls-${theme}-${width}.png`});}}}
    await openMeter('E9000');const realRoute=page.url();await go('buildings');await page.goBack();await page.waitForSelector('#building-demand svg');assert.equal(page.url(),realRoute);
    await page.reload();await page.waitForSelector('#buildings-history-empty');assert.equal(await page.locator('.building-card').count(),0);assert.equal(await page.locator('#buildings-source button[aria-pressed="true"]').textContent(),'Real DERCONNECT');
    await page.locator('#buildings-source').getByRole('button',{name:'Prototype Data',exact:true}).click();await page.waitForSelector('.building-card');assert.equal(await page.locator('.building-card').count(),8);
    for(const section of ['overview','investigate','models']){await go(section);assert(await page.locator('#sec-'+section+' svg').count()>0);}
    assert.equal(await page.evaluate(()=>JSON.stringify([DC.D,DC.D.events.map(e=>[e.id,DC.statusStore.get(e.id),DC.statusStore.note(e.id)])])),synthetic);
    // Initialize against nonempty source ranges before rendering metrics, including
    // an explicitly empty older export that expands the derived catalog grid.
    await go('historical');await page.locator('#history-clear').click();const empty=fixture();empty.records=[];
    await upload('#history-file',[empty,fixture({meter:'E3020',start:'2026-02-01T08:00:00Z',gaps:false})]);
    await go('buildings');await page.locator('#buildings-source').getByRole('button',{name:'Real DERCONNECT',exact:true}).click();
    assert.equal(await page.inputValue('#buildings-history-from'),'2026-02-01');assert.equal(await page.inputValue('#buildings-history-to'),'2026-02-02');
    assert.match(await page.locator('[data-real-meter="E3020"]').textContent(),/100\.0% data coverage/);
    if(process.env.REAL_HISTORY_DIR){await go('historical');await page.locator('#history-clear').click();const files=fs.readdirSync(process.env.REAL_HISTORY_DIR).filter(n=>/-\d+min\.json$/.test(n)).map(n=>process.env.REAL_HISTORY_DIR+'/'+n);await page.locator('#history-file').setInputFiles(files);await page.waitForSelector('#history-chart svg');await go('buildings');await page.locator('#buildings-source').getByRole('button',{name:'Real DERCONNECT',exact:true}).click();assert.equal(await page.locator('.building-card').count(),5);for(const file of files){const d=JSON.parse(fs.readFileSync(file,'utf8'));await openMeter(d.meter_id);const expected=await page.evaluate(()=>DC.fmt.kw(DC.history.summarize(DC.history.session.selected.records).mean));assert.equal(await page.locator('[data-buildings-history-fact="Average observed power"]').textContent(),expected);}console.log('PASS five local real exports: distinct cards, profiles and accurate summaries.');}
    assert.deepEqual(errors,[]);console.log('PASS Git-original demo DOM/profile/SVG/pixels; real card grid/search/routes/phases, no duplicate meter cards, shared loading/dates, gaps/conflicts/failures, all advanced panels, comparisons, responsive themes, reload and anomaly isolation.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
