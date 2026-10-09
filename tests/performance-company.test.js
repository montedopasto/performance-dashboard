import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
const token=who=>'authorized-'+who+'x'.repeat(110);
const actor={admin:{id:'admin-oid',mail:'admin@company.test'},chief:{id:'chief-oid',mail:'chief@company.test'},alice:{id:'alice-oid',mail:'alice@company.test'},bob:{id:'bob-oid',mail:'bob@company.test'}};
function fixture(){
 const tables={},props=new Map(),records=[],files=new Map();let exists=false,failCommit=false,unsafePermissions=false,fetches=0;
 const people=Object.entries(actor).map(([name,a],i)=>({id:String(i+1),fields:{NumeroColaborador:i+1,NomeColaborador:name,Funcao:'Known function',EmailMicrosoft:a.mail,TipoUtilizador:name==='admin'?'ADMIN':name==='chief'?'CHEFIA':'COLABORADOR',Ativo:true}}));
 function sheet(name){return {getLastRow:()=>tables[name].length,appendRow:r=>tables[name].push([...r]),setFrozenRows(){},getDataRange:()=>({getValues:()=>tables[name].map(r=>[...r])}),getRange:r=>({setValues:v=>{tables[name][r-1]=[...v[0]];}})};}
 const db={getSheetByName:n=>tables[n]?sheet(n):null,insertSheet:n=>{tables[n]=[];return sheet(n)}};
 const response=(code,body)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(body)});
 const ctx=vm.createContext({Date,JSON,Math,Uint8Array,Int32Array,console,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},SpreadsheetApp:{openById:()=>db},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},hasLock:()=>true})},
 Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,v)=>Array.from(crypto.createHash(a).update(v).digest()),computeHmacSha256Signature:(v,k)=>Array.from(crypto.createHmac('sha256',k).update(v).digest())},
 UrlFetchApp:{fetch:(url,opt)=>{
  fetches++;
  const bearer=opt.headers.Authorization.slice(7),who=Object.keys(actor).find(k=>bearer===token(k));if(!who)return response(401,{});
  if(url.includes('/drive/')){
    const path=url.split('/drive/')[1];
    if(path.startsWith('root:/')&&opt.method==='put'){const id=crypto.randomUUID();const file={id,content:JSON.parse(opt.payload),permissions:[{id:'creator',roles:['write'],grantedToV2:{user:actor[who]}}]};files.set(id,file);return response(201,{id});}
    const [,id,operation]=path.split('/'),file=files.get(id);if(!file)return response(404,{});
    const permission=file.permissions.find(p=>p.grantedToV2.user.id===actor[who].id);if(!permission)return response(403,{});
    if(operation==='invite'){if(!permission.roles.includes('write'))return response(403,{});const body=JSON.parse(opt.payload);assert.equal(body.sendInvitation,false);assert.equal(body.requireSignIn,true);const value=body.recipients.map(r=>({id:crypto.randomUUID(),roles:body.roles,grantedToV2:{user:Object.values(actor).find(a=>a.mail===r.email)&&{...Object.values(actor).find(a=>a.mail===r.email),email:r.email}}}));if(!body.retainInheritedPermissions)file.permissions=[{id:'creator',roles:['write'],grantedToV2:{user:actor[who]}}];file.permissions.push(...value);return response(200,{value});}
    if(operation==='permissions')return response(200,{value:[...file.permissions,...(unsafePermissions?[{id:'broad',roles:['read'],grantedToV2:{siteGroup:{id:'everyone'}}}]:[])]});
    if(operation==='content'){if(opt.method==='put'){if(!permission.roles.includes('write'))return response(403,{});file.content=JSON.parse(opt.payload);return response(200,{id});}return response(200,file.content);}
  }
  if(url.includes('/me?'))return response(200,actor[who]);
  if(url.includes('/lists/UtilizadoresDashboard/items'))return response(200,{value:people});
  if(url.includes('/lists/entities-list/items')){
    if(opt.method==='post'){const body=JSON.parse(opt.payload);if(failCommit&&JSON.parse(body.fields.Payload).commit)return response(500,{});const row={id:String(records.length+1),fields:body.fields};records.push(row);return response(201,{id:row.id});}
    return response(200,{value:records});
  }
  if(url.includes('/lists?$select=id,displayName'))return response(200,{value:exists?[{id:'entities-list',displayName:'MDP360Entities'}]:[]});
  if(url.includes('/lists/MDP360Entities?'))return response(exists?200:404,exists?{id:'entities-list'}:{});
  if(url.endsWith('/lists')&&opt.method==='post'){exists=true;return response(201,{id:'entities-list'});}
  return response(200,{value:[]});
 }}});
 for(const f of ['Bcrypt.gs','Code.gs','PerformanceDomain.gs','PerformanceApi.gs','PerformanceStore.gs','PerformanceLocal.gs','PerformancePrivate.gs','PerformanceSource.gs'])vm.runInContext(fs.readFileSync('google-local/'+f,'utf8'),ctx);
 const criterion={id:'c',name:'Approved test criterion',group:'result',weight:1,status:'definition',direction:'manual',target:100,unit:'points',definition:'Defined test rule'};
 const proposals={roles:[{id:'known-role',name:'Known function'}],objectives:[{id:'corp',name:'Provided source objective',scope:'corporate',perspective:'F',status:'definition',definition:'Source proposal'}],kpis:[{id:'k',name:'Provided source KPI',objectiveId:'corp',status:'definition',direction:'higher',target:null,unit:'',definition:''}],templates:[{id:'t',name:'Provided role proposal',roleId:'known-role',status:'definition',method:'legacy',objectives:[{id:'o',name:'Provided objective',weight:100,strategicIds:['corp'],criteria:[criterion]}],skills:[]}]};
 ctx.performanceProposals_=()=>JSON.parse(JSON.stringify(proposals));ctx.setup_();
 const api=(who,path,method='GET',body={})=>JSON.parse(JSON.stringify(ctx.localApi({action:'performance',adminToken:token(who),path,method,body})));
 return {api,ctx,records,tables,files,proposals,fetchCount:()=>fetches,unsafePermissions:flag=>{unsafePermissions=flag},local:r=>JSON.parse(JSON.stringify(ctx.localApi(r))),failCommit:flag=>{failCommit=flag}};
}
function ok(r){assert.equal(r.ok,true,r.error);return r.data;}
function update(f,kind,id,patch){const catalog=ok(f.api('admin','/catalog'));const old=catalog[kind].find(r=>r.id===id);return ok(f.api('admin','/catalog/'+kind+'/'+id,'PUT',{...old,...patch,expectedVersion:old.version}));}
test('SharePoint-backed company API preserves scopes, approval, immutable assessments and local self-assessment/publication',()=>{
 const f=fixture();assert.equal(f.api('alice','/setup','POST').ok,false);ok(f.api('admin','/setup','POST'));const cat=ok(f.api('admin','/catalog'));assert.equal(cat.objectives[0].status,'definition');assert.equal(cat.kpis[0].target,null);assert.equal(cat.templates[0].status,'definition');
 const dept=ok(f.api('admin','/catalog/departments','POST',{name:'Actual test department'}));update(f,'users','legacy-2',{departmentId:dept.id});update(f,'users','legacy-3',{departmentId:dept.id,managerId:'legacy-2'});
 assert.equal(ok(f.api('chief','/catalog')).users.some(u=>u.id==='legacy-4'),false);assert.equal(f.api('alice','/catalog/departments','POST',{name:'Unauthorized'}).ok,false);
 let t=update(f,'templates','t',{status:'validation'});t.objectives[0].criteria[0].status='approved';t=update(f,'templates','t',{status:'approved',objectives:t.objectives});
 const tampered=structuredClone(t);tampered.status='active';tampered.objectives[0].criteria[0].status='active';tampered.objectives[0].criteria[0].target=80;assert.equal(f.api('admin','/catalog/templates/t','PUT',{...tampered,expectedVersion:t.version}).ok,false);
 t.objectives[0].criteria[0].status='active';t=update(f,'templates','t',{status:'active',objectives:t.objectives});
 const initial='initial-password-test';const localUser=ok(f.local({action:'createUser',adminToken:token('admin'),username:'alice-local',number:'3',name:'alice',password:initial}));const session=ok(f.local({action:'login',username:'alice-local',password:initial}));ok(f.local({action:'changePassword',token:session.token,currentPassword:initial,password:'changed-password-test'}));
 let e=ok(f.api('chief','/evaluations','POST',{employeeId:'legacy-3',templateId:'t',period:'2026-Q3'}));assert.equal(ok(f.api('alice','/evaluations')).length,0);assert.equal(f.api('bob','/evaluations/'+e.id).ok,false);
 const pointer=JSON.parse(f.records.filter(r=>r.fields.EntityKind==='evaluations'&&JSON.parse(r.fields.Payload).commit).length?f.records.filter(r=>r.fields.EntityKind==='evaluations'&&!JSON.parse(r.fields.Payload).commit).map(r=>JSON.parse(r.fields.Payload).text).join(''):'{}');
 assert.equal(pointer.format,'mdp360-private-v1');assert.equal(JSON.stringify(f.records).includes('Manager feedback'),false);
 const raw=f.ctx.performancePrivateRead_(pointer.master,token('alice'));assert.equal(raw,null);assert.equal(f.ctx.performancePrivateRead_(pointer.master,token('bob')),null);
 assert.equal(f.ctx.performancePrivateRead_(pointer.task,token('alice')).evaluation.results.c,undefined);
 const selfTask=ok(f.api('alice','/self-assessments'))[0];assert.equal(selfTask.id,e.id);
 ok(f.api('alice','/evaluations/'+e.id+'/self','POST',{expectedVersion:e.version,results:{c:{actual:55,na:false,reason:'',evidence:'Microsoft own answer'}}}));assert.equal(ok(f.api('chief','/evaluations/'+e.id)).selfAssessment.c.actual,55);
 const task=ok(f.local({action:'myTasks',token:session.token})).tasks[0];assert.equal(task.evaluationId,e.id);assert.equal(task.results.c,undefined);assert.equal(JSON.stringify(task).includes('calculation'),false);
 ok(f.local({action:'selfAssessment',token:session.token,evaluationId:e.id,expectedVersion:0,results:{c:{actual:60,na:false,reason:'',evidence:'Own response'}}}));
 e=ok(f.api('chief','/evaluations/'+e.id,'PUT',{expectedVersion:e.version,results:{c:{actual:80,na:false,reason:'',evidence:'Reviewed evidence'}},comment:'Manager feedback',improvementPlan:'Development action',seriousIncident:false,incidentReview:''}));assert.equal(e.selfAssessment.c.actual,60);assert.equal(JSON.stringify(f.records).includes('Manager feedback'),false);assert.equal(f.ctx.performancePrivateRead_(pointer.published,token('alice')).evaluation,undefined);
 e=ok(f.api('chief','/evaluations/'+e.id+'/transition','POST',{expectedVersion:e.version,state:'evaluation'}));e=ok(f.api('chief','/evaluations/'+e.id+'/transition','POST',{expectedVersion:e.version,state:'validation'}));assert.equal(f.api('chief','/evaluations/'+e.id+'/transition','POST',{expectedVersion:e.version,state:'approved'}).ok,false);
 e=ok(f.api('admin','/evaluations/'+e.id+'/transition','POST',{expectedVersion:e.version,state:'approved'}));e=ok(f.api('admin','/evaluations/'+e.id+'/transition','POST',{expectedVersion:e.version,state:'published'}));
 const pubs=ok(f.local({action:'myEvaluations',token:session.token})).evaluations;assert.equal(pubs.length,1);assert.equal(pubs[0].snapshot.overallScore,80);assert.equal(pubs[0].snapshot.comment,'Manager feedback');assert.equal(pubs[0].snapshot.selfAssessment.c.actual,60);
 assert.equal(f.api('chief','/evaluations/'+e.id,'PUT',{expectedVersion:e.version,results:{c:{actual:100,na:false}},comment:'',improvementPlan:''}).ok,false);
 t=update(f,'templates','t',{status:'definition'});t.objectives[0].criteria[0].target=50;update(f,'templates','t',{objectives:t.objectives});assert.equal(ok(f.api('alice','/evaluations/'+e.id)).template.objectives[0].criteria[0].target,100);assert.equal(ok(f.local({action:'myEvaluations',token:session.token})).evaluations[0].snapshot.template.objectives[0].criteria[0].target,100);
 ok(f.local({action:'acknowledge',token:session.token,publicationId:pubs[0].id,comment:'Acknowledged'}));assert.equal(ok(f.api('chief','/evaluations/'+e.id)).acknowledgement.comment,'Acknowledged');
});
test('SharePoint chunk storage ignores interrupted versions, preserves old versions, and detects corrupted data',()=>{
 const f=fixture();ok(f.api('admin','/setup','POST'));const store=f.ctx.performanceStore_(token('admin'),false);
 const first=store.save('test',{id:'large',content:'original'.repeat(11000)},'legacy-1');assert.equal(first.version,1);
 f.failCommit(true);assert.throws(()=>store.save('test',{id:'large',content:'replacement'.repeat(11000)},'legacy-1'));f.failCommit(false);
 const reloaded=f.ctx.performanceStore_(token('admin'),false);assert.equal(reloaded.get('test','large').content,first.content);assert.equal(reloaded.versions('test','large').length,1);
 const broken=f.records.find(r=>r.fields.EntityId==='large'&&!JSON.parse(r.fields.Payload).commit);const p=JSON.parse(broken.fields.Payload);p.text='corrupted'+p.text;broken.fields.Payload=JSON.stringify(p);assert.throws(()=>f.ctx.performanceStore_(token('admin'),false),/integridade/);
});

test('A broad or inherited file permission prevents writing any individual assessment',()=>{
 const f=fixture();ok(f.api('admin','/setup','POST'));f.unsafePermissions(true);
 const fake={employeeId:'legacy-3',employee:{number:'3'}};
 assert.throws(()=>f.ctx.performancePrivateSave_(fake,null,token('admin'),[{id:'legacy-3',number:'3'}],{number:'1',role:'ADMIN'}),/acesso herdado/);
 assert.equal(f.files.size,1);assert.deepEqual([...f.files.values()][0].content,{});
});

 test('bootstrap reads the company once and preserves per-user authorization',()=>{
 const f=fixture();ok(f.api('admin','/setup','POST'));
 const before=f.fetchCount(),boot=ok(f.api('admin','/bootstrap'));
 assert.equal(f.fetchCount()-before,4);assert.equal(boot.user.role,'ADMIN');assert.equal(boot.catalog.objectives.length,1);assert.equal(boot.evaluations.length,0);
 const own=ok(f.api('alice','/bootstrap'));assert.deepEqual(own.catalog.users.map(u=>u.id),['legacy-3']);assert.equal(own.catalog.templates.length,0);
 assert.equal(f.ctx.localApi({action:'performance',adminToken:'invalid',path:'/bootstrap',method:'GET'}).ok,false);
 });
test('source enrichment is scoped, repeatable, append-only and preserves manual and approved fields',()=>{
 const f=fixture();ok(f.api('admin','/setup','POST'));const enriched=structuredClone(f.proposals);
 enriched.kpis[0]={...enriched.kpis[0],target:100,unit:'%',direction:'higher',targetText:'Source value'};
 enriched.templates[0].objectives[0].criteria[0].target=90;
 f.ctx.performanceSourceEnrichment_=()=>({baseline:f.proposals,enriched});
 assert.equal(f.api('alice','/source-enrichment').ok,false);
 update(f,'kpis','k',{target:75});
 const plan=ok(f.api('admin','/source-enrichment'));assert.equal(plan.pending.length,2);
 const result=ok(f.api('admin','/source-enrichment','POST',{items:plan.pending}));assert.equal(result.saved.length,2);
 const cat=ok(f.api('admin','/catalog'));assert.equal(cat.kpis[0].target,75);assert.equal(cat.kpis[0].unit,'%');assert.equal(cat.kpis[0].status,'definition');
 assert.equal(cat.templates[0].objectives[0].criteria[0].target,90);
 assert.equal(ok(f.api('admin','/source-enrichment')).pending.length,0);
 assert.equal(ok(f.api('admin','/versions/kpis/k'))[0].target,null);
 update(f,'templates','t',{status:'validation'});enriched.templates[0].objectives[0].criteria[0].target=50;
 assert.equal(ok(f.api('admin','/source-enrichment')).pending.length,0);
});
