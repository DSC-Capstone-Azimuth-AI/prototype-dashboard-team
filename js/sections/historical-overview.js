(function () {
  'use strict';
  const DC=window.DC,H=DC.history,S=H.session,el=DC.el;
  const redraw=()=>DC.setState({});
  const fmt=v=>v===null?'Unavailable':DC.fmt.kw(v);
  const RANK={review:0,none:1,check:2,unscored:3,usable:4,clear:5};
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  const table=(heads,rows)=>el('div',{class:'table-wrap'},el('table',{},el('thead',{},el('tr',{},heads.map(text=>el('th',{scope:'col',text})))),el('tbody',{},rows)));
  const row=(i,step)=>el('tr',{class:'static','data-attention':i.key},el('td',{class:'mono',text:i.key}),
    el('td',{},el('span',{class:'attention-status '+i.kind,text:i.status})),el('td',{text:i.reason}),el('td',{},step));
  const action=i=>i.onclick?el('button',{class:'btn',type:'button','data-attention-step':i.key,text:i.step,onclick:i.onclick}):el('span',{class:'muted',text:i.step});
  // Chronos-2 candidates: hourly total power per meter, detection period only. Unverified, unclassified.
  function candidates(){
    const M=DC.chronosBuildings,bundle=M.bundle;
    return bundle.meters.map(meter=>{
      const scope=bundle.select(meter,S.from,S.to),events=scope.events.slice().sort((a,b)=>b.start-a.start);
      if(!scope.scoredHours)return {key:meter,kind:'unscored',status:'Not scored',reason:'No scored detection hours in these dates.',step:'Choose dates in the detection period'};
      if(!events.length)return {key:meter,kind:'clear',status:'No candidates',reason:`${plural(scope.scoredHours,'scored detection hour')}, none flagged.`,step:'No action needed'};
      const longest=Math.max(...events.map(e=>e.duration)),latest=events[0];
      return {key:meter,kind:'review',count:events.length,status:'Review candidates',
        reason:`${plural(events.length,'candidate event')} · longest ${longest} h · latest ${H.stamp(latest.start)}.`,
        step:'Review latest candidate',onclick:()=>M.openEvent(meter,latest.id)};
    }).sort((a,b)=>RANK[a.kind]-RANK[b.kind]||(b.count||0)-(a.count||0)||a.key.localeCompare(b.key));
  }
  // Data checks for loaded phase exports. Thresholds come from each export's own minimum coverage.
  function dataCheck(p){
    const key=p.meter_id+'/'+p.channel,rows=H.select(p,S.from,S.to),summary=H.summarize(rows),conflicts=rows.filter(r=>r.quality==='export_conflict').length;
    const pct=v=>DC.fmt.pct(v,1),open=()=>{S.select(key);DC.navigate('historical');};
    if(!summary.usable)return {key,kind:'none',coverage:-1,status:'No usable data',
      reason:!rows.length?'No intervals in these dates.':conflicts?`All ${rows.length} intervals in these dates are missing, rejected or conflict between loaded exports (${conflicts} conflicting).`:`All ${rows.length} intervals in these dates are missing or rejected.`,
      step:rows.length?'Check the meter or its export':'Choose dates that have data',onclick:rows.length?open:null};
    const reasons=[];
    if(summary.coverage<p.minimum_coverage)reasons.push(`Coverage ${pct(summary.coverage)} is below the export's ${pct(p.minimum_coverage)} minimum.`);
    if(conflicts)reasons.push(`${plural(conflicts,'interval')} conflict between loaded exports.`);
    if(reasons.length)return {key,kind:'check',coverage:summary.coverage,status:'Check data',reason:reasons.join(' '),step:'Check the meter data',onclick:open};
    return {key,kind:'usable',coverage:summary.coverage,status:'Usable',reason:`Coverage ${pct(summary.coverage)} · ${plural(summary.unavailable,'unavailable interval')}.`,step:'No data action needed'};
  }
  function attentionPanel(){
    const M=DC.chronosBuildings,c=DC.ui.card('Needs attention','What to look at first in the selected dates',{span:12});
    c.card.id='historical-attention';
    const model=M.status==='ready'?candidates():null;
    const checks=S.products.map(dataCheck).sort((a,b)=>RANK[a.kind]-RANK[b.kind]||a.coverage-b.coverage||a.key.localeCompare(b.key));
    const review=model?model.filter(i=>i.kind==='review').length:0,flagged=checks.filter(i=>i.kind!=='usable').length;
    const parts=[];
    if(model)parts.push(review?`${plural(review,'meter')} ${review===1?'has':'have'} model-flagged candidates to review`:'No meter has model-flagged candidates');
    if(checks.length)parts.push(flagged?`${flagged} of ${checks.length} loaded series need a data check`:`all ${checks.length} loaded series have usable data`);
    if(parts.length)c.body.append(el('p',{id:'historical-attention-summary',text:parts.join('; ').replace(/^./,ch=>ch.toUpperCase())+'.'}));
    const modelPart=el('section',{id:'attention-candidates'},el('h3',{text:'Model-flagged candidates'}),
      el('p',{class:'muted',text:'Chronos-2, hourly total power per meter. Candidates are unverified and unclassified; facilities records are needed to confirm them.'}));
    if(model)modelPart.append(table(['Meter','Status','Why','Next step'],model.map(i=>row(i,action(i)))));
    else modelPart.append(el('p',{class:'empty',id:'attention-candidates-status',text:M.status==='unavailable'?'Model candidates are unavailable. Load the Chronos-2 CSVs in Buildings → Real DERCONNECT → Advanced data management.':'Loading model candidates…'}));
    const dataPart=el('section',{id:'attention-data-checks'},el('h3',{text:'Data checks'}),
      el('p',{class:'muted',text:'Loaded phase exports. These are data-quality checks, not equipment faults.'}));
    if(checks.length)dataPart.append(table(['Meter / phase','Status','Why','Next step'],checks.map(i=>row(i,action(i)))));
    else dataPart.append(el('p',{class:'empty',id:'attention-data-empty',text:'No phase exports loaded. Load them in Historical Monitoring to add data checks.'}));
    c.body.append(modelPart,dataPart);
    return c.card;
  }
  function render(root){
    root.append(el('div',{class:'section-head'},el('h2',{id:'h-overview',text:'Historical DERCONNECT Overview'}),el('p',{text:'Historical phase-level measurements, not live data. No whole-building or campus totals are inferred.'})));
    root.append(el('details',{class:'disclosure',id:'historical-overview-help'},el('summary',{text:'Need Help?'}),el('p',{text:'Synthetic Demo shows simulated buildings, forecasts and events. Historical DERCONNECT summarizes only the historical exports loaded in this browser session. They are historical, not live. Load files in Historical Monitoring or Buildings; each load adds to the shared catalog, retaining selection and dates. Invalid loads retain the prior validated catalog with a notice. Clear loaded exports to start a new catalog. Measurements are never uploaded or saved to localStorage and clear on reload.'}),el('p',{text:'Select one device and active-power phase, then inclusive campus dates in America/Los_Angeles. The same selection is used in Historical Monitoring; choosing another product retains the global date range, including unavailable periods. Comparison-panel selections remain separate. This is phase power, not whole-building demand. Missing or rejected intervals remain chart gaps, never zero-filled.'}),el('p',{text:'Valid-slot coverage counts finite noncolliding observations, including those in whole bins rejected for quality reasons. Usable-bin counts apply the stricter whole-bin policy. Coverage can round close to 100% with unavailable bins; inspect the exact numerator and denominator. No forecasts, anomaly counts, combined totals, energy, savings or costs are calculated from these exports. Large changes and telemetry issues are not confirmed equipment faults.'})));
    root.append(el('p',{id:'historical-session-notice',role:'status',text:S.notice}));
    DC.chronosBuildings.start();
    root.append(attentionPanel());
    const d=S.selected;
    if(!d){root.append(el('p',{id:'historical-overview-empty',class:'empty',text:'No historical export is loaded. Open Historical Monitoring and choose a validated JSON export. Synthetic data will not be substituted.'}),el('a',{class:'btn',href:'#historical',text:'Load data in Historical Monitoring'}));return;}
    root.append(el('p',{id:'historical-overview-origin',class:'csv-status',text:d.measurement_kind==='synthetic_fixture'?'Synthetic historical test fixture — not actual DERCONNECT measurements.':'Historical DERCONNECT measurements — schema validated; not live or independently calibrated.'}));
    const controls=el('div',{class:'history-controls'},S.productControl('overview-history-product',redraw));
    for(const [label,key,value] of [['From campus date','from',S.from],['Through campus date','to',S.to]])controls.append(el('label',{class:'filter'},el('span',{text:label}),el('input',{type:'date',id:'overview-history-'+key,value,onchange:evt=>{S.scope(key==='from'?evt.target.value:S.from,key==='to'?evt.target.value:S.to);redraw();document.querySelector('#overview-history-'+key)?.focus({preventScroll:true});}})));
    controls.append(el('button',{class:'btn',type:'button',text:'Full historical range',onclick:()=>{S.scope('','');redraw();}}));root.append(controls);
    const rows=H.select(d,S.from,S.to),summary=H.summarize(rows),lastObserved=d.records.findLast(r=>r.quality==='ok');
    root.append(el('div',{class:'card',id:'historical-overview-scope'},el('p',{text:`${d.meter_id} / ${d.channel} / ${d.display_unit} / ${d.aggregation_minutes}-minute bins. Facility classification: ${d.facility_type || 'Unavailable'}; no verified building identity.`}),el('p',{text:`Available product range: [${H.stamp(d.start_utc)}, ${H.stamp(d.end_utc)}) (end exclusive). Selected campus dates: ${S.from||'available start'} through ${S.to||'available end'} (inclusive).`}),el('p',{text:`Last available observed-bin timestamp (not a live update): ${lastObserved?H.stamp(lastObserved.timestamp_utc):'Unavailable — no usable observations'}.`}),el('p',{text:`Selected actual coverage: ${rows.length?'['+H.stamp(rows[0].timestamp_utc)+', '+H.stamp(new Date(H.timestamp(rows.at(-1).timestamp_utc)+d.aggregation_minutes*60000).toISOString().replace('.000Z','Z'))+')':'No intervals'}.`})),el('p',{id:'historical-detector-unavailable',class:'note-box',text:'Anomaly detection not connected for these measurements. No detector events, forecasts or confirmed-fault counts are available.'}));
    if(!rows.length)root.append(el('p',{id:'historical-overview-empty-range',class:'empty',text:'No historical intervals match these campus dates. Check date order or select Full historical range.'}));
    else{
      const facts=[['Mean observed phase power',fmt(summary.mean)],['Maximum observed sample in usable bins',fmt(summary.peak)],['Valid-slot coverage',DC.fmt.pct(summary.coverage,4)+` (${summary.valid}/${summary.expected} slots)`],['Usable / unavailable intervals',`${summary.usable} / ${summary.unavailable}`]];
      root.append(el('div',{class:'facts summary-facts'},...facts.map(([label,value])=>el('div',{class:'fact'},el('div',{class:'k',text:label}),el('div',{class:'v','data-overview-history-fact':label,text:value})))));
      const chart=DC.ui.card('Observed phase power','Observed bin means in kW; gaps are missing or rejected — no expected-demand line',{span:12}),node=el('div',{class:'chart history-chart',id:'overview-history-chart'});chart.body.append(node);root.append(chart.card);
      requestAnimationFrame(()=>{if(node.isConnected)DC.sections.historical.chart(node,rows,false,d);});
      root.append(el('div',{class:'card',id:'historical-overview-quality'},el('h3',{text:'Telemetry quality — not demand anomalies'}),el('p',{text:Object.entries(summary.reasons).map(([reason,n])=>`${reason.replaceAll('_',' ')}: ${n}`).join(' · ')}),el('p',{text:'Valid-slot coverage and usable intervals have different denominators. Whole-bin rejection can withhold otherwise finite samples. Missing/rejected values stay gaps; large demand changes are not diagnosed faults.'})));
    }
    root.append(el('a',{class:'btn',href:'#historical',id:'overview-history-detail',text:'Investigate these observed measurements in Historical Monitoring'}));
    if(S.canCompare())root.append(el('button',{class:'btn',type:'button',id:'overview-history-compare',text:'Compare compatible loaded measurements',onclick:()=>{DC.historyComparison.useSharedSelection();S.requestComparison();DC.navigate('historical');}}));
    root.append(el('details',{class:'disclosure'},el('summary',{text:'Selected product provenance'}),el('pre',{class:'technical-json',text:JSON.stringify(d.provenance,null,2)})));
  }
  DC.historicalOverview={render};
})();
