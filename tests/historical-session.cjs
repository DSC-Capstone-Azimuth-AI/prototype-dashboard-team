const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./fixtures/history-comparison.cjs');
const ctx={Intl,Date,URL,TextEncoder,DC:{state:{building:'ENG'},fmt:{}},console};ctx.window=ctx;vm.createContext(ctx);for(const file of ['js/real-data.js','js/history-comparison.js','js/history-session.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const H=ctx.DC.history,S=H.session,a=fixture(),b=fixture({phase:'B'});
assert.equal(S.selected,null);assert.equal(S.source,'synthetic');S.setSource('historical');assert.equal(S.selected,null);
S.replace([a,b],'test');assert.equal(S.products[0],a);assert.equal(S.selected,a);S.scope('2026-01-02','2026-01-02');assert.equal(H.select(S.selected,S.from,S.to).length,96);
S.select('E2451/Active_Power_B');assert.equal(S.selected,b);assert.equal(S.from,'');assert.equal(S.to,'');assert(S.canCompare());
for(const invalid of [[a,a],[a,fixture({phase:'B',minutes:5})],[{...a,display_unit:'VA'}]]){assert.throws(()=>S.replace(invalid,'test'));assert.equal(S.selected,b);}
S.failed('invalid export');assert.match(S.notice,/Previous validated/);assert.equal(S.selected,b);
S.replace([a],'single');assert.equal(S.products.length,1);assert.equal(S.selected,a);assert(!S.canCompare());S.requestComparison();assert(S.takeComparisonRequest());assert(!S.takeComparisonRequest());
assert.equal(JSON.stringify(ctx.DC.state),JSON.stringify({building:'ENG'}));assert.throws(()=>S.select('missing'));assert.throws(()=>S.setSource('live'));
for(const [start,date,n] of [['2026-03-08T08:00:00Z','2026-03-08',92],['2026-11-01T07:00:00Z','2026-11-01',100]]){S.replace([fixture({start,bins:n})],'DST');S.scope(date,date);assert.equal(H.select(S.selected,S.from,S.to).length,n);}
console.log('PASS historical session identity/reference, replacement/reset, failed-load retention, validation, shared dates/DST, source isolation and comparison request.');
