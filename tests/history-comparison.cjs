const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./fixtures/history-comparison.cjs');
const ctx={Intl,Date,URL,TextEncoder,console,DC:{fmt:{kw:v=>v+' kW'}}};ctx.window=ctx;vm.createContext(ctx);for(const p of ['js/real-data.js','js/history-comparison.js'])vm.runInContext(fs.readFileSync(p,'utf8'),ctx);
const C=ctx.DC.historyComparison,H=ctx.DC.history,a=fixture(),b=fixture({phase:'B',offset:100});
assert.equal(C.validate([a,b])[0],a);
assert.throws(()=>C.validate([a,a]),/Duplicate/);
assert.throws(()=>C.validate([a,fixture({phase:'B',minutes:5})]),/resolution/);
const units=fixture({phase:'C'});units.display_unit='VA';assert.throws(()=>C.validate([a,units]),/units/);
const shift=fixture({phase:'C'});shift.start_utc='2026-01-01T08:01:00Z';assert.throws(()=>C.validate([a,shift]),/complete UTC bins/);
const actual=fixture({phase:'C'});actual.measurement_kind='actual_measurements';assert.throws(()=>C.validate([a,actual]),/measurement kind/);
let r=C.compare([a,b],'phases','E2451','',[]);assert.equal(r.times.length,192);assert.equal(r.series[2].data,null);assert.match(C.reading(r.series[2],r.times[0]),/no export/);assert.match(C.reading(r.series[0],r.times[1]),/Unavailable.*missing/);assert.match(C.reading(r.series[0],r.times[3]),/cadence collision/);assert.equal(r.series[0].records[5].mean_kw,0);assert(r.domain[0]<-5&&r.domain[1]>100);assert.equal(r.series[0].records[0],a.records[0]);
const later=fixture({phase:'B',start:'2026-01-02T08:00:00Z'});r=C.compare([a,later],'phases','E2451','',[]);assert.equal(r.times.length,96);assert.equal(r.series[0].records[0],a.records[96]);assert.equal(r.series[1].records[0],later.records[0]);
const absent=fixture({phase:'B',start:'2026-02-01T08:00:00Z'});assert.equal(C.compare([a,absent],'phases','E2451','',[]).times.length,0);
assert.equal(C.compare([a,b],'phases','E2451','',[],'2027-01-01').times.length,0);
const empty=fixture({phase:'B'});empty.records=[];r=C.compare([a,empty],'phases','E2451','',[]);assert.match(C.reading(r.series[1],r.times[0]),/exact UTC bin/);
for(const [start,date,n] of [['2026-03-08T08:00:00Z','2026-03-08',92],['2026-11-01T07:00:00Z','2026-11-01',100]]){const d=fixture({start,bins:n});assert.equal(C.compare([d],'phases','E2451','',[],date,date).times.length,n);}
const devices=['E2451','E3020','E3510','E7080'];const p=devices.map(meter=>fixture({meter}));assert.throws(()=>C.compare(p,'meters','','Active_Power_A',devices),/1 to 3/);assert.equal(C.compare(p,'meters','','Active_Power_A',devices.slice(0,3)).series.length,3);
assert.equal(a.records.length,192);console.log('PASS historical comparison contract validation, duplicates/mixed types/units/resolutions/alignment, gaps/zero/negative values, exact overlap, missing phases/records, date scope/DST and meter cap.');
