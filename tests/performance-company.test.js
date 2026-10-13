import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
const token=who=>'authorized-'+who+'x'.repeat(110);
const actor={admin:{id:'admin-oid',mail:'admin@company.test'},chief:{id:'chief-oid',mail:'chief@company.test'},alice:{id:'alice-oid',mail:'alice@company.test'},bob:{id:'bob-oid',mail:'bob@company.test'}};
function fixture(options={}){
 const tables={},props=new Map([['COMPANY_SITE_ID','montedopastopt.sharepoint.com,8c2379e3-75a3-4dc7-a6d1-2e1ba1d18db9,6673446f-32ef-467c-8bfc-0c8177bdb154']]),records=[],files=new Map();let exists=false,failCommit=false,unsafePermissions=false,residualOwner=false,fetches=0,excelRows=[],excelCatalog=[],excelTag='tag-1';
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
  if(url.includes('/workbook/')){
    if(url.includes('Resultados/headerRowRange'))return response(200,{rowIndex:5,values:[['Período','N.º colaborador','Código indicador','Indicador','Unidade','Valor realizado','Evidência','Observação','Estado']]});
    if(url.includes('Resultados/rows?')){const skip=Number(new URL(url).searchParams.get('$skip')||0);return response(200,{value:excelRows.slice(skip,skip+250).map((v,i)=>({index:skip+i,values:[v]}))});}
    if(url.includes('Indicadores/rows?')){const skip=Number(new URL(url).searchParams.get('$skip')||0);return response(200,{value:excelCatalog.slice(skip,skip+250).map((v,i)=>({index:skip+i,values:[v]}))});}
    if(url.includes('Indicadores/rows/add')){excelCatalog.push(...JSON.parse(opt.payload).values);return response(200,{});}
    if(url.includes('worksheets/Indicadores/range(')&&opt.method==='patch'){excelCatalog=JSON.parse(opt.payload).values;return response(200,{});}
    return response(404,{});
  }
  if(url.includes('/drive/root:/base.xlsx?'))return response(200,{id:'source-xlsx',name:'base.xlsx',webUrl:'https://company.test/base.xlsx',eTag:excelTag,file:{mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  if(url.includes('/drive/')){
    const path=url.split('/drive/')[1];
    if(path.startsWith('root:/')&&opt.method==='put'){const id=crypto.randomUUID();const file={id,content:JSON.parse(opt.payload),permissions:[{id:'creator',roles:['write'],grantedToV2:{user:actor[who]}}]};files.set(id,file);return response(201,{id});}
    const [,id,operation]=path.split('/'),file=files.get(id);if(!file)return response(404,{});
    const permission=file.permissions.find(p=>p.grantedToV2.user?.id===actor[who].id);if(!permission)return response(403,{});
    if(operation==='invite'){if(!permission.roles.includes('write'))return response(403,{});const body=JSON.parse(opt.payload);assert.equal(body.sendInvitation,false);assert.equal(body.requireSignIn,true);const value=body.recipients.map(r=>({id:crypto.randomUUID(),roles:body.roles,grantedToV2:{user:Object.values(actor).find(a=>a.mail===r.email)&&{...Object.values(actor).find(a=>a.mail===r.email),email:r.email}}}));if(!body.retainInheritedPermissions)file.permissions=[{id:'creator',roles:['write'],grantedToV2:{user:actor[who]}},...(residualOwner?[{id:'residual-owner',roles:['owner'],grantedToV2:{group:{id:residualOwner==='implicit'?'c5f2ff7b-95a0-4b74-8b4e-16affc3f3fe3':'site-owners'}}}]:[])];file.permissions.push(...value);return response(200,{value});}
    if(operation==='permissions'&&opt.method==='delete'){const pid=decodeURIComponent(path.split('/')[3]);if(pid==='residual-owner'){file.permissions=file.permissions.filter(p=>p.id!==pid);return response(204,{});}return response(403,{});}
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
 for(const f of ['PerformanceCrypto.gs','Bcrypt.gs','Code.gs','PerformanceDomain.gs','PerformanceApi.gs','PerformanceStore.gs','PerformanceLocal.gs','PerformancePrivate.gs','PerformanceSource.gs','PerformanceExcel.gs','PerformanceCentral.gs'])vm.runInContext(fs.readFileSync('google-local/'+f,'utf8'),ctx);
 const criterion={id:'c',name:'Approved test criterion',group:'result',weight:1,status:'definition',direction:'manual',target:100,unit:'points',definition:'Defined test rule'};
 const proposals={roles:[{id:'known-role',name:'Known function'}],objectives:[{id:'corp',name:'Provided source objective',scope:'corporate',perspective:'F',status:'definition',definition:'Source proposal'}],kpis:[{id:'k',name:'Provided source KPI',objectiveId:'corp',status:'definition',direction:'higher',target:null,unit:'',definition:''}],templates:[{id:'t',name:'Provided role proposal',roleId:'known-role',status:'definition',method:'legacy',objectives:[{id:'o',name:'Provided objective',weight:100,strategicIds:['corp'],criteria:[criterion]}],skills:[]}]};
 if(options.central){proposals.templates[0].id='template-B';proposals.templates[0].objectives[0].criteria=[['B2-2','%',100,'higher'],['B4-3','€/animal recebido',1,'lower'],['B5-2','%',100,'higher']].map(([id,unit,target,direction])=>({...criterion,id,unit,target,direction}));}
 ctx.performanceProposals_=()=>JSON.parse(JSON.stringify(proposals));ctx.setup_();
 const api=(who,path,method='GET',body={})=>JSON.parse(JSON.stringify(ctx.localApi({action:'performance',adminToken:token(who),path,method,body})));
 return {api,ctx,records,tables,files,proposals,excel:rows=>{excelRows=rows;excelTag=crypto.randomUUID();files.set('source-xlsx',{id:'source-xlsx',content:{},permissions:[{id:'creator',roles:['write'],grantedToV2:{user:actor.admin}}]});},excelCatalog:()=>excelCatalog,fetchCount:()=>fetches,unsafePermissions:flag=>{unsafePermissions=flag},residualOwner:flag=>{residualOwner=flag},local:r=>JSON.parse(JSON.stringify(ctx.localApi(r))),failCommit:flag=>{failCommit=flag}};
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
 assert.throws(()=>f.ctx.performancePrivateSave_(fake,null,token('admin'),[{id:'legacy-3',number:'3'}],{number:'1',role:'ADMIN'}),/restringir|acesso herdado/);
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
 enriched.kpis[0]={...enriched.kpis[0],target:100,unit:'%',direction:'higher',targetText:'Source value',targetPeriod:'2028-A',definition:'Explicit source definition'};
 enriched.templates[0].objectives[0].criteria[0].target=90;
 f.ctx.performanceSourceEnrichment_=()=>({baseline:f.proposals,enriched});
 assert.equal(f.api('alice','/source-enrichment').ok,false);
 update(f,'kpis','k',{target:75});
 const plan=ok(f.api('admin','/source-enrichment'));assert.equal(plan.pending.length,2);
 const result=ok(f.api('admin','/source-enrichment','POST',{items:plan.pending}));assert.equal(result.saved.length,2);
 const cat=ok(f.api('admin','/catalog'));assert.equal(cat.kpis[0].target,75);assert.equal(cat.kpis[0].unit,'%');assert.equal(cat.kpis[0].targetPeriod,undefined);assert.equal(cat.kpis[0].status,'definition');
 assert.equal(cat.templates[0].objectives[0].criteria[0].target,90);
 assert.equal(ok(f.api('admin','/source-enrichment')).pending.length,0);
 assert.equal(ok(f.api('admin','/versions/kpis/k'))[0].target,null);
 update(f,'templates','t',{status:'validation'});enriched.templates[0].objectives[0].criteria[0].target=50;
 assert.equal(ok(f.api('admin','/source-enrichment')).pending.length,0);
 update(f,'kpis','k',{targetPeriod:'2028-A'});update(f,'kpis','k',{status:'validation'});update(f,'kpis','k',{status:'approved'});update(f,'kpis','k',{status:'active'});
 assert.equal(f.api('admin','/bsc-results','POST',{kpiId:'k',period:'2026-A',result:{actual:75,na:false}}).ok,false);
 assert.equal(f.api('admin','/bsc-results','POST',{kpiId:'k',period:'2028-A',result:{actual:75,na:false}}).ok,true);
});

test('company strategy image is private to strategy profiles, admin-editable and versioned',()=>{
 const f=fixture();ok(f.api('admin','/setup','POST'));
 assert.equal(ok(f.api('admin','/strategy-map')),null);
 const png='data:image/png;base64,iVBORw0KGgoAAA==';
 const first=ok(f.api('admin','/strategy-map','PUT',{name:'Source map',description:'Objectives and arrows',imageData:png,expectedVersion:0}));
 assert.equal(first.version,1);assert.equal(ok(f.api('chief','/strategy-map')).imageData,png);
 assert.equal(f.api('alice','/strategy-map').ok,false);
 assert.equal(f.api('chief','/strategy-map','PUT',{...first,expectedVersion:1}).ok,false);
 for(const imageData of ['data:image/svg+xml;base64,PHN2Zz4=','https://public.example/map.png','data:image/png;base64,SGVsbG8='])assert.equal(f.api('admin','/strategy-map','PUT',{name:'Invalid',description:'',imageData,expectedVersion:1}).ok,false);
 assert.equal(f.api('admin','/strategy-map','PUT',{name:'Too large',description:'',imageData:png+'A'.repeat(800000),expectedVersion:1}).ok,false);
 const second=ok(f.api('admin','/strategy-map','PUT',{name:'Replacement',description:'New map',imageData:png,expectedVersion:1}));assert.equal(second.version,2);
 assert.equal(f.api('admin','/strategy-map','PUT',{name:'Stale',description:'',imageData:png,expectedVersion:1}).ok,false);
 const store=f.ctx.performanceStore_(token('admin'),false);assert.equal(store.versions('strategy-map','company').length,2);assert.equal(store.versions('strategy-map','company')[0].name,'Source map');
});

test('one-action model activation preserves server workflow, versions and assessment snapshots',async()=>{
 const f=fixture();ok(f.api('admin','/setup','POST'));
 f.ctx.window={};f.ctx.structuredClone=structuredClone;
 vm.runInContext(fs.readFileSync('model-activation.js','utf8'),f.ctx);
 const models=f.ctx.window.MDPModels;
 const initial=ok(f.api('admin','/catalog')).templates.find(t=>t.id==='t');
 const history=[];
 const persist=b=>{history.push(b.status);return Promise.resolve(ok(f.api('admin','/catalog/templates/t','PUT',b)));};
 const active=await models.activate(initial,initial.status,persist);
 assert.equal(active.status,'active');assert.deepEqual(history,['validation','approved','active']);
 assert.equal(active.version,initial.version+3);
 assert.equal(active.objectives[0].criteria[0].status,'active');
 assert.equal(initial.status,'definition');
 const evaluation=ok(f.api('admin','/evaluations','POST',{employeeId:'legacy-3',templateId:'t',period:'2026-A'}));
 const changed=structuredClone(active);changed.objectives[0].criteria[0].target=80;
 history.length=0;
 const replacement=await models.activate(changed,active.status,persist);
 assert.deepEqual(history,['definition','validation','approved','active']);
 assert.equal(replacement.objectives[0].criteria[0].target,80);
 assert.equal(ok(f.api('admin','/evaluations/'+evaluation.id)).template.objectives[0].criteria[0].target,initial.objectives[0].criteria[0].target);
 assert.equal(ok(f.api('admin','/versions/templates/t')).length,replacement.version);
 const forbidden=f.api('alice','/catalog/templates/t','PUT',{...replacement,expectedVersion:replacement.version});assert.equal(forbidden.ok,false);
});

test('activation names all incomplete criteria before writing and permits retry after a partial save',async()=>{
 const f=fixture();ok(f.api('admin','/setup','POST'));
 f.ctx.window={};f.ctx.structuredClone=structuredClone;
 vm.runInContext(fs.readFileSync('model-activation.js','utf8'),f.ctx);
 const models=f.ctx.window.MDPModels;
 let input=ok(f.api('admin','/catalog')).templates.find(t=>t.id==='t');
 const broken=structuredClone(input);broken.objectives[0].criteria[0].unit='';broken.objectives[0].criteria[0].definition='';broken.objectives[0].criteria[0].direction='higher';broken.objectives[0].criteria[0].target=null;
 let writes=0;
 await assert.rejects(models.activate(broken,input.status,()=>{writes++;}),error=>error.message.includes(broken.objectives[0].criteria[0].name)&&error.message.includes('unidade')&&error.message.includes('definição')&&error.message.includes('meta'));
 assert.equal(writes,0);
 await assert.rejects(models.activate(input,input.status,async b=>{if(b.status==='approved')throw Error('Temporary failure');return ok(f.api('admin','/catalog/templates/t','PUT',b));},saved=>{input=saved;}),/Temporary failure/);
 assert.equal(input.status,'validation');
 const active=await models.activate(input,input.status,b=>Promise.resolve(ok(f.api('admin','/catalog/templates/t','PUT',b))));
 assert.equal(active.status,'active');
});

test('private permission checks accept resolved named invitations and SharePoint membership identities, never broad or unresolved access',()=>{
 const f=fixture();const ids=['admin-oid'],emails=['admin@company.test'];
 const allowed=p=>f.ctx.performancePrivatePermissionAllowed_(p,ids,emails);
 assert.equal(allowed({grantedToV2:{user:{id:'admin-oid'}},invitation:{email:'admin@company.test',signInRequired:true}}),true);
 assert.equal(allowed({grantedToV2:{user:{id:'site-local-id'},siteUser:{loginName:'i:0#.f|membership|admin@company.test'}}}),true);
 for(const p of [
  {grantedToV2:{user:{id:'bob-oid'}},invitation:{email:'bob@company.test',signInRequired:true}},
  {grantedToV2:{user:{id:'admin-oid'}},invitation:{email:'admin@company.test',signInRequired:false}},
  {invitation:{email:'admin@company.test',signInRequired:true}},
  {grantedToV2:{user:{id:'admin-oid'}},link:{scope:'anonymous'}},
  {grantedToV2:{user:{id:'admin-oid'}},inheritedFrom:{id:'folder'}},
  {grantedToV2:{siteGroup:{id:'everyone'}}},
  {grantedToV2:{user:{id:'unknown',displayName:'admin@company.test'}}},
  {grantedToV2:{user:{id:'admin-oid'},group:{id:'everyone'}}},
  {grantedToV2:{user:{id:'admin-oid'}},grantedTo:{user:{id:'bob-oid'}}}
 ])assert.equal(allowed(p),false);
});


test('private files remove residual site-owner grants while still empty before storing assessments',()=>{
 const f=fixture();f.residualOwner(true);
 const recipients={writers:['admin@company.test'],employeeEmail:'alice@company.test',current:actor.admin};
 const id=f.ctx.performancePrivateFile_(token('admin'),recipients,'read');
 const file=f.files.get(id);assert.deepEqual(file.content,{});
 assert.equal(file.permissions.some(p=>p.grantedToV2.group),false);
 assert.equal(file.permissions.some(p=>p.grantedToV2.user.id===actor.admin.id),true);
 assert.equal(file.permissions.some(p=>p.grantedToV2.user.id===actor.alice.id),true);
 f.unsafePermissions(true);assert.throws(()=>f.ctx.performancePrivateFile_(token('admin'),recipients,'read'),/restringir/);
});


test('implicit owner claim is limited to the exact company group and encrypted files remain unreadable',()=>{
 const f=fixture(),id='c5f2ff7b-95a0-4b74-8b4e-16affc3f3fe3';
 const owner={roles:['owner'],grantedToV2:{group:{id},siteUser:{loginName:'c:0o.c|federateddirectoryclaimprovider|'+id+'_o'}},grantedTo:{user:{id}}};
 assert.equal(f.ctx.performanceImplicitOwnerPermission_(owner),true);
 for(const p of [{...owner,roles:['write']},{...owner,link:{}},{...owner,inheritedFrom:{}},{...owner,grantedTo:{user:{id:'other'}}},{...owner,grantedToV2:{group:{id:'other'}}}])assert.equal(f.ctx.performanceImplicitOwnerPermission_(p),false);
 const confidential={versions:[{employeeId:'alice',score:75,comment:'private assessment'}]};
 const sealed=JSON.parse(JSON.stringify(f.ctx.performancePrivateSeal_('file-1',confidential)));
 assert.equal(JSON.stringify(sealed).includes('private assessment'),false);
 assert.equal(JSON.stringify(sealed).includes('alice'),false);
 assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.performancePrivateOpen_('file-1',sealed))),confidential);
 const key=crypto.createHmac('sha256',f.ctx.pepper_()).update('mdp360-file-mac-v1:encryption-key').digest();
 const decipher=crypto.createDecipheriv('aes-256-cbc',key,Buffer.from(sealed.iv,'hex'));
 assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext,'base64')),decipher.final()]).toString('utf8')),confidential);
 assert.equal(sealed.mac,crypto.createHmac('sha256',f.ctx.pepper_()).update('mdp360-file-mac-v1:file-1:'+sealed.iv+':'+sealed.ciphertext).digest('hex'));
 assert.notEqual(sealed.iv,f.ctx.performancePrivateSeal_('file-1',confidential).iv);
 assert.throws(()=>f.ctx.performancePrivateOpen_('file-2',sealed),/integridade/);
 assert.throws(()=>f.ctx.performancePrivateOpen_('file-1',{...sealed,ciphertext:'A'+sealed.ciphertext.slice(1)}),/integridade/);
 assert.throws(()=>f.ctx.performancePrivateOpen_('file-1',{...sealed,iv:'0'.repeat(32)}),/integridade/);
 assert.throws(()=>f.ctx.performancePrivateOpen_('file-1',confidential),/inválido/);
});


test('SharePoint implicit owners do not block a draft and only ciphertext is stored',()=>{
 const f=fixture();f.residualOwner('implicit');
 const id=f.ctx.performancePrivateFile_(token('admin'),{writers:['admin@company.test'],employeeEmail:'alice@company.test',current:actor.admin},'read');
 f.ctx.performancePrivateWrite_(id,{versions:[{comment:'confidential detail'}]},token('admin'));
 const file=f.files.get(id);assert.equal(file.permissions.some(p=>p.grantedToV2.group),true);
 assert.equal(file.content.format,'mdp360-encrypted-v1');assert.equal(JSON.stringify(file.content).includes('confidential detail'),false);
 assert.equal(f.ctx.performancePrivateRead_(id,token('admin')).versions[0].comment,'confidential detail');
 assert.equal(f.ctx.performancePrivateRead_(id,token('bob')),null);
});


function excelDraftFixture(){
 const f=fixture();ok(f.api('admin','/setup','POST'));
 update(f,'users','legacy-3',{roleId:'known-role',managerId:'legacy-2'});
 let t=ok(f.api('admin','/catalog')).templates[0];t.objectives[0].criteria[0].status='active';
 for(const status of ['validation','approved','active'])t=update(f,'templates','t',{...t,status});
 const e=ok(f.api('admin','/evaluations','POST',{employeeId:'legacy-3',templateId:'t',period:'2026-Q1'}));
 f.excel([['2026-Q1','3','IND/t/c','Test KPI','points',50,'Source evidence','','Pronto']]);
 ok(f.api('admin','/data-source','PUT',{path:'base.xlsx',enabled:true,expectedVersion:0}));return {f,e};
}
test('Excel source imports confirmed rows, records provenance, updates changed imports and preserves manual overrides',()=>{
 const {f,e}=excelDraftFixture();assert.equal(f.api('alice','/data-source').ok,false);assert.equal(f.api('chief','/data-source/sync','POST').ok,false);
 let report=ok(f.api('admin','/data-source/sync','POST'));assert.equal(report.imported,1);
 let saved=ok(f.api('admin','/evaluations/'+e.id));assert.equal(saved.results.c.actual,50);assert.equal(saved.calculation.score,50);assert.equal(saved.state,'draft');assert.equal(saved.results.c.source.code,'IND/t/c');
 assert.equal(ok(f.api('admin','/data-source/sync','POST')).cached,true);
 f.excel([['2026-Q1','3','IND/t/c','Test KPI','points',0,'Zero is actual','','Pronto']]);
 assert.equal(ok(f.api('admin','/data-source/sync','POST')).imported,1);saved=ok(f.api('admin','/evaluations/'+e.id));assert.equal(saved.results.c.actual,0);
 ok(f.api('admin','/evaluations/'+e.id,'PUT',{expectedVersion:saved.version,results:{c:{actual:25,na:false,evidence:'Manual'}},comment:'',improvementPlan:'',seriousIncident:false,incidentReview:''}));
 f.excel([['2026-Q1','3','IND/t/c','Test KPI','points',60,'Changed source','','Pronto']]);report=ok(f.api('admin','/data-source/sync','POST'));assert.equal(report.protected,1);assert.equal(ok(f.api('admin','/evaluations/'+e.id)).results.c.actual,25);
 assert.equal(ok(f.api('admin','/versions/templates/t'))[0].status,'definition');
});
test('Excel rejects duplicates, missing values, wrong units, unrecognized collaborators and unavailable criteria without writing',()=>{
 const {f,e}=excelDraftFixture(),row=['2026-Q1','3','IND/t/c','Test KPI','points',50,'','','Pronto'];
 for(const rows of [[row,row],[[...row.slice(0,5),null,...row.slice(6)]],[[...row.slice(0,4),'%',...row.slice(5)]],[[row[0],'missing',...row.slice(2)]],[[row[0],row[1],'IND/t/new',...row.slice(3)]]]){
  f.excel(rows);const report=ok(f.api('admin','/data-source/sync','POST'));assert.equal(report.imported,0);assert.equal(report.issues.length>0,true);assert.deepEqual(ok(f.api('admin','/evaluations/'+e.id)).results,{});
 }
 f.excel([[...row.slice(0,8),'Em preparação']]);assert.equal(ok(f.api('admin','/data-source/sync','POST')).ready,0);
 assert.equal(f.api('admin','/data-source','PUT',{path:'https://external.test/data.xlsx',enabled:true,expectedVersion:1}).ok,false);
});
test('Excel catalog supports additional roles and criteria without hardcoded templates; submitted assessments remain intact',()=>{
 const {f,e}=excelDraftFixture();let report=ok(f.api('admin','/data-source/catalog','POST'));assert.equal(report.indicators,2);
 const role=ok(f.api('admin','/catalog/roles','POST',{name:'Future role'}));
 const old=ok(f.api('admin','/catalog')).templates[0],newModel={...old,id:undefined,name:'Future model',roleId:role.id,status:'definition',objectives:[{...old.objectives[0],criteria:[{...old.objectives[0].criteria[0],id:'future-kpi',name:'Future defined KPI',status:'definition'}]}]};
 const created=ok(f.api('admin','/catalog/templates','POST',newModel));report=ok(f.api('admin','/data-source/catalog','POST'));assert.equal(report.indicators,3);assert.equal(f.excelCatalog().some(r=>r[0]==='IND/'+created.id+'/future-kpi'),true);
 let future=created;future.objectives[0].criteria[0].status='active';for(const status of ['validation','approved','active'])future=update(f,'templates',created.id,{...future,status});
 update(f,'users','legacy-4',{roleId:role.id});const futureEvaluation=ok(f.api('admin','/evaluations','POST',{employeeId:'legacy-4',templateId:created.id,period:'2026-M01'}));
 f.excel([['2026-M01','4','IND/'+created.id+'/future-kpi','Future defined KPI','points',88,'Future source','','Pronto']]);assert.equal(ok(f.api('admin','/data-source/sync','POST')).imported,1);assert.equal(ok(f.api('admin','/evaluations/'+futureEvaluation.id)).results['future-kpi'].actual,88);
 f.excel([['2026-Q1','3','IND/t/c','Test KPI','points',50,'Source','','Pronto']]);
 let saved=ok(f.api('admin','/evaluations/'+e.id));saved=ok(f.api('admin','/evaluations/'+e.id+'/transition','POST',{expectedVersion:saved.version,state:'evaluation'}));saved=ok(f.api('admin','/evaluations/'+e.id+'/transition','POST',{expectedVersion:saved.version,state:'validation'}));
 report=ok(f.api('admin','/data-source/sync','POST'));assert.equal(report.protected,1);assert.deepEqual(ok(f.api('admin','/evaluations/'+e.id)).results,{});
});


test('Excel corporate imports retain KPI snapshots and do not aggregate periods or percentages',()=>{
 const {f}=excelDraftFixture();let k=update(f,'kpis','k',{target:1.5,unit:'%',direction:'lower',definition:'Supplied cohort ratio',targetPeriod:'2026-Q1'});
 for(const status of ['validation','approved','active'])k=update(f,'kpis','k',{...k,status});
 f.excel([['2026-Q1','','EMP/k','Test company KPI','%',1.2,'Same period cohort','','Pronto'],['2026-Q2','','EMP/k','Test company KPI','%',2,'Different period','','Pronto']]);
 const report=ok(f.api('admin','/data-source/sync','POST'));assert.equal(report.imported,1);assert.equal(report.issues.length,1);
 const saved=ok(f.api('admin','/bsc-results'))[0];assert.equal(saved.result.actual,1.2);assert.equal(saved.kpi.target,1.5);assert.equal(saved.period,'2026-Q1');
});

test('central workbook connection creates only the matched draft, versions updates and preserves manual/submitted results',()=>{
 const f=fixture({central:true});ok(f.api('admin','/setup','POST'));update(f,'users','legacy-3',{roleId:'known-role',managerId:'legacy-2'});
 let template=ok(f.api('admin','/catalog')).templates[0];template.objectives[0].criteria.forEach(c=>c.status='active');
 for(const status of ['validation','approved','active'])template=update(f,'templates','template-B',{...template,status});
 f.excel([]);let rows=[{sheetRow:36,values:[46307,'Supplier','1',10,10,2000,null,.2,1,1],formulas:[]}];
 f.ctx.performanceCentralRead_=()=>({file:{id:'source-xlsx',name:'base.xlsx',eTag:'central-tag',webUrl:'https://company.test/base.xlsx'},preview:f.ctx.performanceCentralPreview_(rows,{name:'base.xlsx'})});
 assert.equal(f.api('chief','/central-source').ok,false);
 const cfg=ok(f.api('admin','/central-source','PUT',{expectedVersion:0,path:'base.xlsx',employeeId:'legacy-3',templateId:'template-B',period:'2026-Q4',enabled:true}));
 assert.equal(f.api('admin','/central-source','PUT',{expectedVersion:0,path:'base.xlsx'}).ok,false);
 let report=ok(f.api('admin','/central-source/sync','POST',{force:true}));assert.equal(report.imported,3);
 let e=ok(f.api('admin','/evaluations/'+report.evaluationId));assert.equal(e.period,'2026-Q4');assert.equal(e.employeeId,'legacy-3');assert.equal(e.template.version,template.version);assert.equal(e.state,'draft');assert.equal(e.calculation.complete,false);assert.equal(e.results['B2-2'].source.provisional,true);
 const version=e.version;report=ok(f.api('admin','/central-source/sync','POST',{force:true}));assert.equal(report.imported,0);assert.equal(ok(f.api('admin','/evaluations/'+e.id)).version,version);
 assert.equal(f.api('alice','/central-source/sync','POST',{force:true}).ok,false);
 const results=structuredClone(e.results);results['B2-2']={actual:81,na:false,evidence:'Manual override'};
 e=ok(f.api('admin','/evaluations/'+e.id,'PUT',{expectedVersion:e.version,results,comment:'',improvementPlan:'',seriousIncident:false,incidentReview:''}));
 rows[0].values[7]=.3;report=ok(f.api('admin','/central-source/sync','POST',{force:true}));assert.equal(report.protected,1);e=ok(f.api('admin','/evaluations/'+e.id));assert.equal(e.results['B2-2'].actual,81);assert.equal(e.results['B4-3'].actual,60);
 for(const state of ['evaluation','validation'])e=ok(f.api('admin','/evaluations/'+e.id+'/transition','POST',{expectedVersion:e.version,state}));
 const frozen=e.version;rows[0].values[7]=.4;report=ok(f.api('admin','/central-source/sync','POST',{force:true}));assert.equal(report.protected,3);assert.equal(ok(f.api('admin','/evaluations/'+e.id)).version,frozen);
 assert.equal(ok(f.api('admin','/evaluations')).length,1);
});
