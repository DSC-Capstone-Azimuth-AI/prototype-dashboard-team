/* Optional historical comparisons: validated products, exact UTC bins, no totals. */
(function () {
  'use strict';
  const DC = window.DC, H = DC.history, el = DC.el;
  const key = d => d.meter_id + '/' + d.channel;
  function validate(products) {
    if (!Array.isArray(products) || !products.length || products.length > 9) throw Error('Choose between 1 and 9 historical exports.');
    products.forEach(d => H.validate(d));
    const first = products[0], seen = new Set();
    for (const d of products) {
      if (seen.has(key(d))) throw Error('Duplicate meter/channel product: ' + key(d) + '. Choose one export for each pair.');
      seen.add(key(d));
      if (d.display_unit !== first.display_unit || d.source_unit !== first.source_unit || d.aggregation_minutes !== first.aggregation_minutes || d.cadence_seconds !== first.cadence_seconds || d.measurement_kind !== first.measurement_kind) throw Error('Comparison exports need matching units, resolution, cadence and measurement kind. Do not mix actual measurements with test fixtures.');
      const step = first.aggregation_minutes * 60000;
      if ((H.timestamp(d.start_utc) - H.timestamp(first.start_utc)) % step) throw Error('Comparison UTC bins must align.');
    }
    return products;
  }
  function compare(products, mode, meter, channel, meters, from = '', to = '') {
    validate(products);
    if (!['phases', 'meters'].includes(mode)) throw Error('Unknown comparison mode.');
    if (mode === 'meters' && (!meters.length || meters.length > 3 || new Set(meters).size !== meters.length)) throw Error('Select 1 to 3 distinct meters.');
    const slots = mode === 'phases' ? ['A','B','C'].map(p => ({ meter, channel: 'Active_Power_' + p })) : meters.map(m => ({ meter: m, channel }));
    const series = slots.map(s => ({ ...s, data: products.find(d => d.meter_id === s.meter && d.channel === s.channel) || null }));
    const available = series.filter(s => s.data);
    if (!available.length) return { series, times: [], domain: [0, 1] };
    const step = available[0].data.aggregation_minutes * 60000;
    const start = Math.max(...available.map(s => H.timestamp(s.data.start_utc))), end = Math.min(...available.map(s => H.timestamp(s.data.end_utc)));
    const times = [];
    for (let t = start; t < end; t += step) { const day = H.localDay(t); if ((!from || day >= from) && (!to || day <= to)) times.push(t); }
    let low = 0, high = 0;
    for (const s of series) {
      s.index = new Map((s.data?.records || []).map(r => [H.timestamp(r.timestamp_utc), r]));
      s.records = times.map(t => s.index.get(t) || null);
      for (const r of s.records) if (r?.quality === 'ok') { low = Math.min(low, r.mean_kw); high = Math.max(high, r.mean_kw); }
    }
    const pad = (high - low || 1) * .08;
    return { series, times, step, start, end, domain: [low - pad, high + pad] };
  }
  function reading(series, time) {
    if (!series.data) return 'Unavailable — no export loaded for this phase/channel.';
    const r = series.index?.get(time);
    if (!r) return 'Unavailable — no record at this exact UTC bin.';
    if (r.quality !== 'ok') return 'Unavailable — ' + r.quality.replaceAll('_', ' ') + `; ${r.valid_observations}/${r.expected_slots} valid slots.`;
    return `Observed bin mean ${DC.fmt.kw(r.mean_kw)}; raw-sample min / max ${DC.fmt.kw(r.min_kw)} / ${DC.fmt.kw(r.max_kw)}; ${r.valid_observations}/${r.expected_slots} valid slots.`;
  }
  let activeHost = null;
  let products = [], error = '', loading = false, token = 0, mode = 'phases', meter = '', channel = 'Active_Power_A', meters = [], from = '', to = '', cursor = 0;
  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); parent.append(n); return n; }
  function chart(node, s, result, onCursor) {
    const W = Math.max(240, node.clientWidth || 700), height = 210, left = 56, right = W-14, top = 10, bottom = 157;
    const x = t => left + (t-result.times[0]) / (result.times.length*result.step) * (right-left);
    const y = v => bottom - (v-result.domain[0]) / (result.domain[1]-result.domain[0]) * (bottom-top);
    const root = svg('svg',{viewBox:`0 0 ${W} ${height}`,width:W,height,role:'img','aria-label':`${s.meter} ${s.channel}: observed means in kW; gaps are unavailable`, 'data-comparison-domain':result.domain.join(',')},node);
    const axis = svg('g',{class:'ax'},root);
    for(let i=0;i<=4;i++){const v=result.domain[0]+(result.domain[1]-result.domain[0])*i/4;svg('line',{x1:left,x2:right,y1:y(v),y2:y(v),class:'gridline'},axis);svg('text',{x:left-6,y:y(v)+3,'text-anchor':'end'},axis).textContent=DC.fmt.one(v);}
    const labels = W<450 ? 2 : 4;
    for(let i=0;i<labels;i++){const t=result.times[Math.round((result.times.length-1)*i/(labels-1))];const text=svg('text',{x:x(t),y:180,'text-anchor':i===0?'start':i===labels-1?'end':'middle'},axis);H.axisStamp(t).forEach((value,j)=>{svg('tspan',{x:x(t),dy:j?14:0},text).textContent=value;});}
    let path='',previous=false;
    s.records.forEach((r,i)=>{const t=result.times[i];if(!r||r.quality!=='ok'){previous=false;svg('rect',{x:x(t),y:top,width:Math.max(1,(right-left)/result.times.length),height:bottom-top,fill:DC.css('--ink-2'),opacity:.16,'data-comparison-gap':r?.quality||'no_record'},root);return;}path+=`${previous?'L':'M'}${x(t)},${y(r.mean_kw)}`;previous=true;svg('circle',{cx:x(t),cy:y(r.mean_kw),r:result.times.length<200?2:1,fill:DC.css('--actual')},root);});
    svg('path',{d:path,fill:'none',stroke:DC.css('--actual'),'stroke-width':2,'data-comparison-line':''},root);
    const cross=svg('line',{x1:x(result.times[0]),x2:x(result.times[0]),y1:top,y2:bottom,stroke:DC.css('--accent'),'stroke-width':1,'data-comparison-cursor':''},root);
    const hit=svg('rect',{x:left,y:top,width:right-left,height:bottom-top,fill:'transparent','data-comparison-hit':''},root);
    hit.addEventListener('pointermove',evt=>{const box=root.getBoundingClientRect();const px=(evt.clientX-box.left)*W/box.width;onCursor(Math.max(0,Math.min(result.times.length-1,Math.floor((px-left)/(right-left)*result.times.length))));});
    return t=>{cross.setAttribute('x1',x(t));cross.setAttribute('x2',x(t));};
  }
  function render(host) {
    activeHost = host;
    DC.clear(host);
    host.append(el('h3',{text:'Synchronized comparisons'}), el('p',{text:'Optional: load separate validated phase-power exports. Compare phases or up to three meters; no phase or meter totals are calculated.'}));
    host.append(el('details',{class:'disclosure',id:'comparison-help'},el('summary',{text:'Need Help?'}),el('p',{text:'Compare phases to inspect A/B/C within one meter. Compare meters to inspect the same phase across devices. Units, resolution and UTC bin alignment must match so readings describe the same interval. Select compatible JSON exports together; only the overlapping time range is shown by default. Dates use America/Los_Angeles, including DST.'}),el('p',{text:'Charts share the same kW scale and time axis. Move over any chart or use the timestamp slider with arrow keys, Home and End to compare the exact same UTC bin across panels. Solid lines show observed bin means; readouts distinguish raw-sample min/max. Shaded gaps remain unavailable: values are never filled, interpolated or changed to zero.'}),el('p',{text:'Similar timing does not establish a shared cause or electrical relationship. We do not know verified parent/child or building relationships, so we do not calculate a combined total. These are observed channels, not detector outputs or confirmed faults. Each product retains its own quality and provenance. Schema validation does not independently reconcile the export against raw data.'})));
    host.append(el('label',{},el('span',{text:'Choose comparison JSON exports (1–9, maximum 30 MB combined)'}),el('input',{type:'file',id:'comparison-files',multiple:true,accept:'.json,application/json',onchange:async evt=>{
      const files=Array.from(evt.target.files);if(!files.length)return;const mine=++token;loading=true;error='';products=[];render(host);
      try{if(files.length>9||files.reduce((n,f)=>n+f.size,0)>30*1024*1024||files.some(f=>f.size>H.MAX_BYTES))throw Error('Choose at most 9 files, each ≤10 MB and ≤30 MB combined.');const next=validate(await Promise.all(files.map(async f=>JSON.parse(await f.text()))));if(mine!==token)return;products=next;meter=next[0].meter_id;channel=next[0].channel;meters=[...new Set(next.filter(d=>d.channel===channel).map(d=>d.meter_id))].slice(0,3);from='';to='';cursor=0;}catch(e){if(mine===token)error=e instanceof SyntaxError?'Comparison file is not valid JSON.':e.message;}finally{if(mine===token){loading=false;if(activeHost?.isConnected)render(activeHost);}}
    }})));
    if(loading)host.append(el('p',{role:'status',text:'Loading comparison exports…'}));
    if(error)host.append(el('p',{role:'alert',id:'comparison-error',text:error}));
    if(!products.length)return;
    host.append(el('p',{id:'comparison-kind',text:products[0].measurement_kind==='synthetic_fixture'?'Synthetic test fixtures — not actual DERConnect measurements.':'DERConnect historical measurements — no detector outputs; source calibration and electrical relationships remain unverified.'}));
    const controls=el('div',{class:'history-controls'});host.append(controls);
    function select(label,id,value,options,change){const input=el('select',{id,onchange:evt=>{change(evt.target.value);from='';to='';cursor=0;render(host);host.querySelector('#'+id)?.focus({preventScroll:true});}},options.map(([v,text])=>el('option',{value:v,text})));input.value=value;controls.append(el('label',{},el('span',{text:label}),input));}
    select('Comparison mode','comparison-mode',mode,[['phases','Phases within one meter'],['meters','Selected meters — same phase']],v=>{mode=v;});
    const ids=[...new Set(products.map(d=>d.meter_id))];
    if(mode==='phases') select('Comparison meter','comparison-meter',meter,ids.map(id=>[id,id]),v=>{meter=v;});
    else {
      select('Comparison phase','comparison-channel',channel,['A','B','C'].map(p=>['Active_Power_'+p,'Phase '+p+' (kW)']),v=>{channel=v;meters=ids.filter(id=>products.some(d=>d.meter_id===id&&d.channel===v)).slice(0,3);});
      const group=el('fieldset',{},el('legend',{text:'Select up to three meters'}));host.append(group);
      for(const id of ids){const available=products.some(d=>d.meter_id===id&&d.channel===channel);group.append(el('label',{class:'comparison-choice'},el('input',{type:'checkbox',checked:meters.includes(id),disabled:!available||(!meters.includes(id)&&meters.length>=3),'data-comparison-meter':id,onchange:evt=>{meters=evt.target.checked?[...meters,id]:meters.filter(m=>m!==id);from='';to='';cursor=0;render(host);host.querySelector('[data-comparison-meter="'+id+'"]')?.focus({preventScroll:true});}}),el('span',{text:id+(available?'':' — phase export unavailable')})));}
      if(!meters.length){host.append(el('p',{class:'empty',text:'Select a meter with an export for this phase.'}));return;}
    }
    const result=compare(products,mode,meter,channel,meters,from,to);
    for(const [label,id,value] of [['From campus date','comparison-from',from],['Through campus date','comparison-to',to]]) controls.append(el('label',{},el('span',{text:label}),el('input',{type:'date',id,value,onchange:evt=>{if(id==='comparison-from')from=evt.target.value;else to=evt.target.value;cursor=0;render(host);host.querySelector('#'+id)?.focus({preventScroll:true});}})));
    controls.append(el('button',{class:'btn',type:'button',text:'Common export range',onclick:()=>{from='';to='';cursor=0;render(host);}}));
    for(const s of result.series){
      if(!s.data){host.append(el('p',{class:'empty','data-comparison-missing-phase':s.channel,text:`${s.meter} / ${s.channel}: Unavailable — no export loaded.`}));continue;}
      host.append(el('details',{class:'disclosure'},el('summary',{text:`${key(s.data)} — coverage and provenance`}),el('p',{text:`${s.data.facility_type} (classification only, not building identity). Product coverage [${s.data.start_utc}, ${s.data.end_utc}); ${s.data.aggregation_minutes}-minute bins; ${s.data.minimum_coverage*100}% minimum coverage.`}),el('pre',{class:'technical-json',text:JSON.stringify(s.data.provenance,null,2)})));
    }
    if(!result.times.length){host.append(el('p',{class:'empty',id:'comparison-empty',text:'No common time range or intervals in these campus dates. Choose overlapping products or reset to Common export range. No values are fabricated.'}));return;}
    host.append(el('p',{id:'comparison-range',text:`Common product window [${new Date(result.start).toISOString()}, ${new Date(result.end).toISOString()}); selected bins ${H.stamp(result.times[0])} through ${H.stamp(result.times.at(-1))}. Shared kW scale; solid observed means; shaded unavailable bins. No totals.`}));
    const stamp=el('p',{id:'comparison-timestamp',role:'status'}),updates=[],readouts=[];
    const slider=el('input',{id:'comparison-cursor',type:'range',min:0,max:result.times.length-1,step:1,value:Math.min(cursor,result.times.length-1),'aria-label':'Comparison timestamp (arrow keys, Home and End)',oninput:evt=>update(Number(evt.target.value))});
    host.append(el('label',{},el('span',{text:'Synchronized timestamp — arrow keys, Home / End'}),slider),stamp);
    function update(i){cursor=i;slider.value=i;const time=result.times[i];slider.setAttribute('aria-valuetext',H.stamp(time)+'; '+new Date(time).toISOString());stamp.textContent=H.stamp(time)+' / '+new Date(time).toISOString();updates.forEach(fn=>fn(time));readouts.forEach(([node,s])=>{node.textContent=reading(s,time);});}
    for(const s of result.series.filter(s=>s.data)){
      const selected=s.records.filter(Boolean),summary=H.summarize(selected),card=DC.ui.card(`${s.meter} / ${s.channel}`,`${s.data.facility_type} · kW · ${s.data.aggregation_minutes}-minute observed bins`,{span:12});host.append(card.card);
      const node=el('div',{class:'chart history-chart','data-comparison-chart':key(s.data)}),readout=el('p',{'data-comparison-readout':key(s.data)});card.body.append(node,readout,el('p',{text:`This product: ${summary.usable} usable / ${summary.unavailable} unavailable bins; ${summary.valid}/${summary.expected} valid slots (${DC.fmt.pct(summary.coverage,3)}). Rounded slot coverage and whole-bin eligibility differ; no imputation or fault inference.`}));readouts.push([readout,s]);
      requestAnimationFrame(()=>{if(node.isConnected){updates.push(chart(node,s,result,update));update(Math.min(cursor,result.times.length-1));}});
    }
    update(Math.min(cursor,result.times.length-1));
  }
  DC.historyComparison={validate,compare,reading,render};
})();
