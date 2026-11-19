/* Session-only historical catalog. Measurement objects are shared by reference, never persisted. */
(function () {
  'use strict';
  const DC=window.DC,H=DC.history;
  const state={products:[],id:'',from:'',to:'',source:'synthetic',notice:'',comparisonRequested:false,version:0};
  const key=d=>d.meter_id+'/'+d.channel;
  H.session={
    get products(){return state.products;}, get selected(){return state.products.find(d=>key(d)===state.id)||null;},
    get from(){return state.from;},get to(){return state.to;},get source(){return state.source;},get notice(){return state.notice;},get version(){return state.version;},
    replace(products,origin){
      products=H.catalog.build(products);
      state.version++;state.products=products;state.id=key(products[0]);state.from='';state.to='';
      state.notice=`Loaded ${products.length} series from ${origin}. Replaced the shared catalog; selected the first product and reset dates to its full range. Comparison-panel scope is separate.`;
    },
    add(exports,origin){
      // Build first: invalid/incompatible additions leave the entire session intact.
      const originals=state.products.flatMap(d=>d.source_exports),previous=state.id;
      const products=H.catalog.build([...originals,...exports]);
      state.products=products;state.version++;state.id=products.some(d=>key(d)===previous)?previous:key(products[0]);
      state.notice=`Added ${exports.length} export(s) from ${origin}; ${products.length} loaded series. Selection and dates retained. Identical overlap bins count once; conflicting bins are withheld.`;
    },
    clear(){state.products=[];state.id='';state.from='';state.to='';state.version++;state.notice='Cleared the shared historical catalog.';},
    failed(message){state.notice='Load failed: '+message+'. Previous validated shared catalog retained.';},
    select(id){if(!state.products.some(d=>key(d)===id))throw Error('Historical product is not loaded.');state.version++;state.id=id;state.notice='Selected '+id+'; global date scope retained.';},
    scope(from,to){for(const day of [from,to])if(day)H.timestamp(day+'T00:00:00Z');state.version++;state.from=from;state.to=to;},
    setSource(source){if(!['synthetic','historical'].includes(source))throw Error('Unknown overview source.');state.source=source;},
    canCompare(){return state.products.some((a,i)=>state.products.slice(i+1).some(b=>a.meter_id===b.meter_id||a.channel===b.channel));},
    requestComparison(){state.comparisonRequested=true;},
    takeComparisonRequest(){const requested=state.comparisonRequested;state.comparisonRequested=false;return requested;},
    productControl(id,changed){
      const input=DC.el('select',{id,'aria-label':'Loaded historical device and phase',onchange:evt=>{H.session.select(evt.target.value);changed();}},state.products.map(d=>DC.el('option',{value:key(d),text:`${d.meter_id} / ${d.channel} / ${d.aggregation_minutes} min`})));input.value=state.id;
      return DC.el('label',{class:'filter'},DC.el('span',{text:'Loaded device / phase'}),input);
    }
  };
})();
