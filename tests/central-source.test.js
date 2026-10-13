import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
const ctx=vm.createContext({Date,Map,Set,JSON,Number,Error,encodeURIComponent,pFail_:(ok,message)=>{if(!ok)throw Error(message);}});
vm.runInContext(fs.readFileSync('google-local/PerformanceCentral.gs','utf8'),ctx);
const row=(changes={})=>({sheetRow:36,values:[46307,'Supplier','1',10,10,2000,null,.2,1,1],formulas:[null,null,null,null,null,'=D36*200'],...changes});
const preview=rows=>ctx.performanceCentralPreview_(rows,{name:'Test.xlsx',webUrl:'https://company.test/file'});
test('central source calculates three weekly measures without employee-specific rows',()=>{
 const rows=[row(),row({values:[46307,'Supplier2','1',20,20,6000,null,.1,2,2]})];
 const r=preview(rows),w=r.weeks[0];assert.equal(w.received,30);assert.equal(w.conformity,100);assert.equal(w.traceability,100);assert.ok(Math.abs(w.transportCost-1000)<1e-8);assert.ok(Math.abs(w.transportPerAnimal-1000/30)<1e-8);assert.equal(w.weightCalculated,true);assert.equal(r.readOnly,true);
});
test('blank versus zero and mismatched populations do not produce invented results',()=>{
 let r=row();r.values[4]=null;let w=preview([r]).weeks[0];assert.equal(w.conformity,null);assert.equal(w.transportCost,null);
 r=row();r.values[4]=9;w=preview([r]).weeks[0];assert.equal(w.transportCost,null);
 r=row();r.values[3]=r.values[4]=r.values[5]=0;r.values[8]=r.values[9]=0;w=preview([r]).weeks[0];assert.equal(w.conformity,null);assert.equal(w.transportPerAnimal,null);assert.equal(w.traceability,null);
 assert.equal(preview([{values:Array(11).fill(null)}]).weeks.length,0);
});
test('duplicates and invalid quantities block affected weekly calculations',()=>{
 assert.equal(preview([row(),row()]).weeks[0].conformity,null);const r=row();r.values[4]=11;assert.equal(preview([r]).weeks[0].conformity,null);
 r.values[0]=46308;assert.equal(preview([r]).issues.length,1);
});
test('administrative preview refuses unauthorized access before reading or writing',()=>{
 let reads=0;ctx.performanceExcelFile_=()=>{reads++;throw Error('unexpected');};
 assert.throws(()=>ctx.performanceCentralApi_({method:'POST',body:{path:'Test.xlsx'}},{role:'COLABORADOR'}),/administração/);
 assert.equal(reads,0);
});

function linkFixture(){
 const c=vm.createContext({Date:class extends Date{static now(){return Date.UTC(2028,0,1);}},JSON,Map,Set,Number,Error,encodeURIComponent,digest_:s=>crypto.createHash('sha256').update(s).digest('hex')});
 for(const f of ['PerformanceDomain.gs','PerformanceCentral.gs'])vm.runInContext(fs.readFileSync('google-local/'+f,'utf8'),c);
 const template={id:'template-B',version:5,method:'legacy',objectives:[{id:'o',weight:100,criteria:[['B2-2','%','higher'],['B4-3','€/animal recebido','lower'],['B5-2','%','higher']].map(([id,unit,direction])=>({id,unit,direction,status:'active',target:1,weight:1,group:'result'}))}]};
 const evaluation={id:'e',employeeId:'person',period:'2026-Q4',version:1,state:'draft',template,results:{},selfAssessment:{},comment:'keep',improvementPlan:'keep'};
 const config={id:'company',employeeId:'person',templateId:'template-B',coverageConfirmed:false,weightsConfirmed:false};
 const file={id:'source',name:'Test.xlsx',eTag:'v1'};
 return {c,evaluation,config,file,preview:rows=>c.performanceCentralPreview_(rows,file),plan:(p,e=evaluation,cfg=config)=>c.performanceCentralPlan_(p,file,cfg,e)};
}
test('linking imports base quantities into matching snapshots and keeps partial data out of scoring',()=>{
 const f=linkFixture(),p=f.plan(f.preview([row()]));assert.equal(p.report.imported,3);assert.equal(p.next.results['B2-2'].actual,100);assert.equal(p.next.calculation.complete,false);assert.equal(p.next.results['B4-3'].source.provisional,true);assert.equal(p.next.template.version,5);assert.equal(p.next.comment,'keep');
 const again=f.plan(f.preview([row()]),p.next);assert.equal(again.changed,false);
});
test('aggregate source ratios use summed numerators and denominators, never average percentages',()=>{
 const f=linkFixture(),a=row(),b=row({values:[46314,'Second','1',20,10,4000,null,.2,2,0]});
 const p=f.plan(f.preview([a,b]));assert.ok(Math.abs(p.next.results['B2-2'].actual-20/30*100)<1e-10);assert.equal(p.next.results['B5-2'].actual,100/3);assert.equal(p.next.results['B4-3'],undefined);
});
test('other periods, changed units and manual/imported results cannot receive this source accidentally',()=>{
 const f=linkFixture();let e=structuredClone(f.evaluation);e.period='2026-Q1';assert.equal(f.plan(f.preview([row()]),e).report.imported,0);
 e=structuredClone(f.evaluation);e.results['B2-2']={actual:81,na:false,evidence:'manual'};const p=f.plan(f.preview([row()]),e);assert.equal(p.next.results['B2-2'].actual,81);assert.equal(p.report.protected,1);
 e=structuredClone(f.evaluation);e.template.objectives[0].criteria[1].unit='€/kg';assert.equal(f.plan(f.preview([row()]),e).next.results['B4-3'],undefined);
});
test('missing/deleted source inputs invalidate only this source, and submitted evaluations remain unchanged',()=>{
 const f=linkFixture(),initial=f.plan(f.preview([row()])).next;
 const blank=f.plan(f.preview([]),initial);assert.equal(Object.keys(blank.next.results).length,0);assert.equal(blank.report.cleared,3);
 for(const state of ['validation','approved','published']){const e=structuredClone(initial);e.state=state;const p=f.plan(f.preview([]),e);assert.equal(p.changed,false);assert.equal(p.report.protected,3);assert.deepEqual(JSON.parse(JSON.stringify(p.next.results)),e.results);}
});
test('final scoring needs a closed period, confirmed coverage and confirmed calculated weights',()=>{
 const f=linkFixture(),p=f.plan(f.preview([row()]),f.evaluation,{...f.config,coverageConfirmed:true,weightsConfirmed:true});assert.equal(p.next.calculation.complete,true);
 const q=f.plan(f.preview([row()]),f.evaluation,{...f.config,coverageConfirmed:true});assert.equal(q.next.calculation.complete,false);assert.equal(q.next.results['B4-3'].source.provisional,true);
});
test('boundary weeks and duplicate source rows cannot become final assessment results',()=>{
 const f=linkFixture(),r=row({values:[46293,'Boundary','1',10,10,2000,null,.2,1,1]});
 const p=f.plan(f.preview([r,row()]),f.evaluation,{...f.config,coverageConfirmed:true,weightsConfirmed:true});assert.equal(p.next.results['B2-2'].source.provisional,true);assert.equal(p.next.calculation.complete,false);
 const invalid=f.plan(f.preview([row(),row()]));assert.equal(invalid.report.imported,0);
});
