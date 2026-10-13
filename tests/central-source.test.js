import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
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
