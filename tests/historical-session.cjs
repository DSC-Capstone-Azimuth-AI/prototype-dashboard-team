const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./fixtures/history-comparison.cjs');
const ctx={Intl,Date,URL,TextEncoder,DC:{state:{building:'ENG'},fmt:{}},console};ctx.window=ctx;vm.createContext(ctx);for(const file of ['js/real-data.js','js/history-catalog.js','js/history-comparison.js','js/history-session.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const H=ctx.DC.history,S=H.session,a=fixture(),b=fixture({phase:'B'});
assert.equal(S.selected,null);assert.equal(S.source,'synthetic');S.setSource('historical');assert.equal(S.selected,null);
S.replace([a,b],'test');assert.equal(S.selected.source_exports[0],a);assert.equal(S.selected.records[0],a.records[0]);S.scope('2026-01-02','2026-01-02');assert.equal(H.select(S.selected,S.from,S.to).length,96);
S.select('E2451/Active_Power_B');assert.equal(S.selected.source_exports[0],b);assert.equal(S.from,'2026-01-02');assert.equal(S.to,'2026-01-02');assert(S.canCompare());
for(const invalid of [[{...a,schema_version:'invalid'}],[a,fixture({phase:'B',minutes:5})],[{...a,display_unit:'VA'}]]){assert.throws(()=>S.replace(invalid,'test'));assert.equal(S.selected.source_exports[0],b);}
S.failed('invalid export');assert.match(S.notice,/Previous validated/);assert.equal(S.selected.source_exports[0],b);
S.replace([a],'single');assert.equal(S.products.length,1);assert.equal(S.selected.source_exports[0],a);assert(!S.canCompare());S.requestComparison();assert(S.takeComparisonRequest());assert(!S.takeComparisonRequest());
assert.equal(JSON.stringify(ctx.DC.state),JSON.stringify({building:'ENG'}));assert.throws(()=>S.select('missing'));assert.throws(()=>S.setSource('live'));
// Incremental loads retain product/date selection and original record references.
S.replace([a],'initial');S.scope('2026-01-02','2026-01-02');S.add([b],'additional');
assert.equal(S.products.length,2);assert.equal(S.selected.meter_id,'E2451');assert.equal(S.selected.channel,'Active_Power_A');assert.equal(S.from,'2026-01-02');
S.add([a],'identical');assert.equal(S.selected.catalog.identical_overlap_bins,a.records.length);assert.equal(S.selected.records[0],a.records[0]);
const conflict=structuredClone(a);conflict.records[0].mean_kw+=.5;S.add([conflict],'conflict');assert.equal(S.selected.records[0].quality,'export_conflict');
const before=S.products;assert.throws(()=>S.add([fixture({minutes:5})],'incompatible'));assert.equal(S.products,before);assert.equal(S.from,'2026-01-02');
const unknown=fixture({meter:'E9000'});unknown.facility_type=null;S.add([unknown],'undocumented');assert(S.products.some(d=>d.meter_id==='E9000'&&d.facility_type===null));
for(const meter of ['../x','__proto__','', 'x'.repeat(65)]){assert.throws(()=>H.validate({...unknown,meter_id:meter}));}
assert.throws(()=>H.validate({...unknown,facility_type:'Office'}));
S.clear();assert.equal(S.products.length,0);assert.equal(S.selected,null);assert.equal(S.from,'');
for(const [start,date,n] of [['2026-03-08T08:00:00Z','2026-03-08',92],['2026-11-01T07:00:00Z','2026-11-01',100]]){S.replace([fixture({start,bins:n})],'DST');S.scope(date,date);assert.equal(H.select(S.selected,S.from,S.to).length,n);}
console.log('PASS historical session identity/reference, replacement/date retention, failed-load retention, validation, shared dates/DST, source isolation and comparison request.');
