import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
function fixture(){
 const tables={},props=new Map();
 function sheet(name){return {getLastRow:()=>tables[name].length,appendRow:r=>tables[name].push([...r]),setFrozenRows(){},getDataRange:()=>({getValues:()=>tables[name].map(r=>[...r])}),getRange:r=>({setValues:v=>{tables[name][r-1]=[...v[0]];}})};}
 const db={getSheetByName:n=>tables[n]?sheet(n):null,insertSheet:n=>{tables[n]=[];return sheet(n)}};
 let sourceValue=73,sourceWeight=100,adminRole='ADMIN';
 const ctx=vm.createContext({console,Date,JSON,Math,Uint8Array,Int32Array,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
 SpreadsheetApp:{openById:()=>db},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},hasLock:()=>true})},
 Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,v)=>Array.from(crypto.createHash(a).update(v).digest()),computeHmacSha256Signature:(v,k)=>Array.from(crypto.createHmac('sha256',k).update(v).digest())},
 UrlFetchApp:{fetch:(url,options)=>{
  const token=options.headers.Authorization.slice(7);let value;
  if(!token.startsWith('authorized'))return {getResponseCode:()=>401,getContentText:()=>''};
  if(url.includes('/me?'))value={id:'admin-oid',mail:'admin@example.com'};
  else if(url.includes('UtilizadoresDashboard'))value={value:[{fields:{EmailMicrosoft:'admin@example.com',TipoUtilizador:adminRole,NomeColaborador:'Admin'}}]};
  else if(url.includes('HistoricoKPIs'))value={value:[{id:'1',fields:{ColaboradorID:101,SnapshotOficial:true,AvaliacaoID:'2026-Q3',NomeKPI:'Approved criterion',ValorAtual:sourceValue,PesoKPI:sourceWeight,Meta:80,DataAtualizacao:'2026-09-30'}}]};
  else value={value:[]};
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(value)};
 }}});
 vm.runInContext(fs.readFileSync('google-local/Bcrypt.gs','utf8'),ctx);vm.runInContext(fs.readFileSync('google-local/Code.gs','utf8'),ctx);ctx.setup_();
 return {api:r=>JSON.parse(JSON.stringify(ctx.localApi(r))),tables,setSource:(v,w=100)=>{sourceValue=v;sourceWeight=w},setRole:v=>adminRole=v};
}
const adminToken='authorized'+'x'.repeat(110);
const initial='initial-password-test',changed='changed-password-test';
function create(f,n,number){return f.api({action:'createUser',adminToken,username:n,number,name:n,password:initial}).data;}
function login(f,n,p=initial){return f.api({action:'login',username:n,password:p});}
test('Google local: authenticated administration, private accounts, forced change and immutable publications',()=>{
 const f=fixture();assert.equal(f.api({action:'adminUsers',adminToken:'forged'+'x'.repeat(110)}).ok,false);
 f.setRole('CHEFIA');assert.equal(f.api({action:'adminUsers',adminToken}).ok,false);f.setRole('ADMIN');
 const a=create(f,'alice','101'),b=create(f,'bob','102');assert.ok(a.id&&b.id);assert.ok(!JSON.stringify(f.tables).includes(initial));
 const la=login(f,'alice');assert.equal(la.ok,true);assert.equal(la.data.mustChange,true);
 assert.equal(f.api({action:'myEvaluations',token:la.data.token}).ok,false);
 assert.equal(f.api({action:'changePassword',token:la.data.token,currentPassword:initial,password:changed}).ok,true);
 const lb=login(f,'bob');f.api({action:'changePassword',token:lb.data.token,currentPassword:initial,password:changed});
 const pub=f.api({action:'publish',adminToken,userId:a.id,sourceId:'2026-Q3'});assert.equal(pub.ok,true);
 assert.equal(f.api({action:'publish',adminToken,userId:a.id,sourceId:'2026-Q3'}).ok,false);
 assert.equal(f.api({action:'myEvaluations',token:lb.data.token,userId:a.id}).data.evaluations.length,0);
 assert.equal(f.api({action:'acknowledge',token:lb.data.token,publicationId:pub.data.id}).ok,false);
 const own=f.api({action:'myEvaluations',token:la.data.token}).data.evaluations;assert.equal(own[0].snapshot.kpis[0].value,73);
 f.setSource(95);assert.equal(f.api({action:'publish',adminToken,userId:a.id,sourceId:'2026-Q3'}).data.version,2);
 const history=f.api({action:'myEvaluations',token:la.data.token}).data.evaluations;assert.equal(history[1].snapshot.kpis[0].value,73);assert.equal(history[0].snapshot.kpis[0].value,95);
 f.setSource(96,undefined); // explicit null is the missing-weight representation
 f.setSource(96,null);assert.equal(f.api({action:'publish',adminToken,userId:a.id,sourceId:'2026-Q3'}).ok,false);
 assert.equal(f.api({action:'acknowledge',token:la.data.token,publicationId:pub.data.id,comment:'Reviewed'}).ok,true);
 f.api({action:'resetPassword',adminToken,userId:a.id,password:'replacement-password'});assert.equal(f.api({action:'myEvaluations',token:la.data.token}).ok,false);
 assert.equal(login(f,'alice',changed).ok,false);assert.equal(login(f,'alice','replacement-password').data.mustChange,true);
 f.api({action:'setActive',adminToken,userId:b.id,active:false});assert.equal(f.api({action:'myEvaluations',token:lb.data.token}).ok,false);
});
test('Google local: repeated invalid passwords cause a temporary lock and duplicate accounts are rejected',()=>{
 const f=fixture();create(f,'alice','101');assert.equal(f.api({action:'createUser',adminToken,username:'other',number:'101',name:'Other',password:initial}).ok,false);
 for(let i=0;i<5;i++)assert.equal(login(f,'alice','incorrect-password').ok,false);
 assert.equal(login(f,'alice').ok,false);
 assert.equal(login(f,'unknown').ok,false);
});
