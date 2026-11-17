/* All measurements below are explicitly synthetic contract fixtures. */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const fixture = require('./fixtures/history-comparison.cjs');
const ctx = { Intl, Date, URL, TextEncoder, console, DC: { state: { building: 'ENG' }, fmt: { kw: v => v + ' kW' } } };
ctx.window = ctx; vm.createContext(ctx);
for (const file of ['js/real-data.js', 'js/history-catalog.js', 'js/history-comparison.js', 'js/history-session.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
const H = ctx.DC.history, C = H.catalog, S = H.session;
const jan = fixture({start:'2026-01-01T08:00:00Z',bins:31*96,gaps:false});
const feb = fixture({start:'2026-02-01T08:00:00Z',bins:28*96,gaps:false});
const mar = fixture({start:'2026-03-01T08:00:00Z',bins:31*96-4,gaps:false});
let [d] = C.build([jan,feb]);
assert.equal(d.records.length,59*96);assert.equal(H.summarize(d.records).mean,6.5);assert.equal(H.summarize(d.records).expected,59*96*450);assert.equal(d.source_exports[0],jan);assert.equal(d.source_exports[1],feb);
assert.equal(d.records[0],jan.records[0]);assert.equal(H.select(d,'2026-01-31','2026-02-01').length,192);
assert.throws(()=>H.validate(d),/schema/);assert.equal(C.validateProduct(d),d);
assert.throws(()=>C.validateProduct({...d}),/schema/); // A serialized derived catalog is not a trusted export.
assert.equal(d.series_id,C.build([feb])[0].series_id);
[d] = C.build([jan,mar]);
assert.equal(C.months(d).length,3);assert.equal(C.months(d)[1].loaded,0);
const missing=H.select(d,'2026-02-01','2026-02-28');assert.equal(missing.length,28*96);
assert(missing.every(r=>r.mean_kw===null&&r.catalog_status==='no_export'));
assert.equal(H.summarize(missing).coverage,0);assert.equal(C.periods(d.records,'month')[1].mean,null);
const short=fixture({gaps:false}), copy=structuredClone(short);
[d]=C.build([short,copy]);assert.equal(d.records.length,short.records.length);assert.equal(d.catalog.identical_overlap_bins,short.records.length);
assert.equal(H.summarize(d.records).support,H.summarize(short.records).support);
copy.records[0].mean_kw+=.5;
[d]=C.build([short,copy]);assert.equal(d.catalog.conflicting_bins,1);assert.equal(d.records[0].quality,'export_conflict');assert.equal(d.records[0].mean_kw,null);
assert.equal(d.catalog.conflicts[0].source_indices.length,2);assert.equal(d.source_exports[1].records[0].mean_kw,copy.records[0].mean_kw);
const reverse=C.build([copy,short])[0];assert.equal(JSON.stringify(d.records),JSON.stringify(reverse.records));
const rejected=fixture();[d]=C.build([rejected]);assert.equal(d.records[3].quality,'cadence_collision');assert.equal(d.records[3],rejected.records[3]);
for (const edit of [x=>x.display_unit='VA',x=>x.aggregation_minutes=60,x=>x.meter_id='LIB',x=>x.records.reverse(),x=>x.provenance.inputs[0].sha256='invalid',x=>x.records[1].timestamp_utc=x.records[0].timestamp_utc]) {
 const bad=structuredClone(feb);edit(bad);assert.throws(()=>C.build([jan,bad]));
}
for(const edit of [x=>x.provenance.mapping_sha256='0'.repeat(64),x=>x.provenance.code_sha256['export_derconnect_history.py']='0'.repeat(64),x=>x.minimum_coverage=.9,x=>x.measurement_kind='actual_measurements']){
 const bad=structuredClone(feb);edit(bad);assert.throws(()=>C.build([jan,bad]),/matching/);
}
assert.throws(()=>C.build([jan,fixture({minutes:5})]),/resolution/);
S.replace([jan,feb,fixture({meter:'E3020'}),fixture({phase:'B'})],'synthetic tests');
S.scope('2026-01-31','2026-02-01');S.select('E3020/Active_Power_A');assert.equal(S.from,'2026-01-31');assert.equal(S.to,'2026-02-01');
assert.equal(H.select(S.selected,S.from,S.to).length,192);assert.equal(H.summarize(H.select(S.selected,S.from,S.to)).mean,null);
const previous=S.products;assert.throws(()=>S.replace([{...jan,display_unit:'energy'}],'invalid'));assert.equal(S.products,previous);
assert.equal(JSON.stringify(ctx.DC.state),JSON.stringify({building:'ENG'}));
for(const [start,date,n] of [['2026-03-08T08:00:00Z','2026-03-08',92],['2026-11-01T07:00:00Z','2026-11-01',100]]){
 [d]=C.build([fixture({start,bins:n,gaps:false})]);assert.equal(H.select(d,date,date).length,n);assert.equal(H.profile(d,d.records).available,true);
 assert.equal(H.summarize(d.records).expected,n*450);
}
// 12 independently valid monthly exports at five-minute resolution (~105k bins).
const year=[];
for(let m=1;m<=12;m++){const start=new Date(Date.UTC(2026,m-1,1,8)),stop=new Date(Date.UTC(2026,m,1,8));year.push(fixture({start:start.toISOString().replace('.000Z','Z'),minutes:5,bins:(stop-start)/300000,gaps:false}));}
const began=performance.now();[d]=C.build(year);const summary=H.summarize(d.records),plotted=C.plotRecords(d.records,1000);
assert.equal(d.records.length,365*288);assert.equal(summary.unavailable,0);assert(plotted.length<=4000);assert(performance.now()-began<8000);
// Retain a one-bin rejected interval and extrema through chart reduction.
const rows=d.records.slice();rows[50000]={...rows[50000],quality:'export_conflict',mean_kw:null};rows[70000]={...rows[70000],mean_kw:9999};
const reduced=C.plotRecords(rows,1000);assert(reduced.includes(rows[50000]));assert(reduced.includes(rows[49999]));assert(reduced.includes(rows[50001]));assert(reduced.includes(rows[70000]));
assert.throws(()=>C.build(Array(121).fill(short)),/120/);
assert.throws(()=>C.build([jan,fixture({start:'2030-01-01T08:00:00Z'})]),/large/);
(async()=>{
 const files=[jan,feb].map(d=>({size:JSON.stringify(d).length,text:async()=>JSON.stringify(d)}));assert.equal((await C.readFiles(files)).length,2);
 await assert.rejects(C.readFiles([{size:H.MAX_BYTES+1}]),/10 MB/);
 await assert.rejects(C.readFiles(Array(7).fill({size:H.MAX_BYTES})),/60 MB/);
 await assert.rejects(C.readFiles([{size:2,text:async()=>'{'}]),{name:'SyntaxError'});
 console.log('PASS monthly catalog: independent validation/provenance, meters/channels, date boundaries, missing months, overlap deduplication/conflict withholding, immutable source evidence, transactional failure, DST, 105120-bin performance and gap/extrema-preserving chart reduction.');
})().catch(e=>{console.error(e);process.exitCode=1;});
