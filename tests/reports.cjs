const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
function load(labels=true){const c={console,Intl,Date,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};c.window=c;vm.createContext(c);for(const f of ['data/derconnect-data.js',...(labels?['data/synthetic-labels.js']:[]),'js/util.js','js/store.js','js/reports.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);return c.DC;}
const dc=load(),r=dc.reports;
assert.equal(JSON.stringify(r.preset(3,false,new Date('2026-11-05T01:00:00Z'))),JSON.stringify({from:'2026-11-02',to:'2026-11-04'}));
const s={type:'snapshot',building:'all',detector:dc.D.detectors[0].id,...r.preset(30,true)};
const report=r.build(s);assert(report);const original=JSON.stringify(report);dc.setState({...dc.DEFAULT,building:dc.D.buildings[0].id,detector:dc.D.detectors[1].id});assert.equal(JSON.stringify(r.build(s)),original);
assert.equal(r.build({...s,from:'2030-01-01',to:'2030-01-01'}),null);assert.equal(r.build({...s,from:'bad'}),null);assert.equal(r.build({...s,building:'unknown'}),null);
for(const d of dc.D.detectors)assert(r.build({...s,detector:d.id}));
for(const e of dc.D.events){const a=r.build({...s,type:'anomaly',event:e.id});assert(a);assert.equal(a.a,e.start);assert.equal(a.b,e.end);assert.equal(a.sections.some(x=>x[0].includes('Operator notes')),false);assert.equal(a.sections.some(x=>x[0].includes('Research appendix')),false);}
const e=dc.D.events[0];dc.notesStore.set(e.id,'private note');assert(!JSON.stringify(r.build({...s,type:'anomaly',event:e.id})).includes('private note'));assert(JSON.stringify(r.build({...s,type:'anomaly',event:e.id,notes:true})).includes('private note'));
const absent=load(false);assert(absent.reports.build({...s,type:'anomaly',event:e.id,labels:true}));
const noContext=load(); delete noContext.D.weather; delete noContext.buildingById[e.building].occupancy; const emptyContext=noContext.reports.build({...s,type:'anomaly',event:e.id});assert(emptyContext.sections.find(x=>x[0].startsWith('Available context'))[2].every(x=>x[1]==='Unavailable'));
assert.equal(r.range('2026-02-31','2026-03-02'),null);
console.log('PASS date presets, invalid/empty scope, independent filters, all detectors/161 events, note privacy, missing labels.');

for(const type of ['snapshot','building','anomaly']) { const config={...s,type,building:'ENG',event:dc.D.events[0].id,customNotes:'  Author comment <b>café</b>\nSecond line  '};const draft=r.build(config);assert(draft.sections.some(x=>x[0].startsWith('Custom report notes')&&x[2][0][0]==='Author comment <b>café</b>\nSecond line'));assert(!r.build({...config,customNotes:'   '}).sections.some(x=>x[0].startsWith('Custom report notes')));assert.equal(r.build({...config,customNotes:'x'.repeat(5001)}),null); }
console.log('PASS custom report notes across report types, plain text/newlines, blank omission and length validation.');
