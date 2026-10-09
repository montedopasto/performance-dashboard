const PERFORMANCE_LIST = 'MDP360Entities';
function performanceGraph_(path,token,method,body) {
  if(typeof token!=='string'||token.length<100||token.length>16000) throw new Error('Entre novamente com Microsoft.');
  const url='https://graph.microsoft.com/v1.0/'+path;
  const r=UrlFetchApp.fetch(url,{method:method||'get',headers:{Authorization:'Bearer '+token},contentType:'application/json',...(body?{payload:JSON.stringify(body)}:{}),muteHttpExceptions:true});
  const status=r.getResponseCode();let data={};try{data=JSON.parse(r.getContentText()||'{}');}catch(e){}
  if(status!==404&&(status<200||status>=300))throw new Error(status===401?'A sessão Microsoft terminou. Entre novamente.':'SharePoint: HTTP '+status+' · '+String(data.error?.code||'erro')+' · '+String(data.error?.message||'Não foi possível aceder aos dados da empresa.').slice(0,300));
  return {status,data};
}
function performanceIdentity_(token) {
  const me=graph_('me?$select=id,mail,userPrincipalName',token);
  const emails=[me.mail,me.userPrincipalName].filter(Boolean).map(e=>e.toLowerCase());
  const people=list_('UtilizadoresDashboard',token);
  const matches=people.filter(i=>emails.includes(String(i.fields.EmailMicrosoft||'').toLowerCase()));
  if(matches.length!==1||matches[0].fields.Ativo===false)throw new Error('O acesso Microsoft não está associado a um colaborador ativo.');
  const f=matches[0].fields;
  if(f.NumeroColaborador===undefined||f.NumeroColaborador===null)throw new Error('Número de colaborador em falta no registo da empresa.');
  if(people.filter(i=>String(i.fields.NumeroColaborador)===String(f.NumeroColaborador)).length!==1)throw new Error('O número de colaborador está repetido no registo da empresa.');
  return {id:'legacy-'+String(f.NumeroColaborador),oid:me.id,name:f.NomeColaborador,username:String(f.NumeroColaborador),number:String(f.NumeroColaborador),role:['ADMIN','CHEFIA','DIRECAO'].includes(f.TipoUtilizador)?f.TipoUtilizador:'COLABORADOR',active:true,roleId:'',departmentId:'',managerId:''};
}
function performanceStore_(token,create,verifiedIdentity) {
  let info=performanceGraph_('sites/'+SITE+'/lists/'+PERFORMANCE_LIST+'?$select=id,displayName',token),initialized=info.status!==404;
  if(!initialized&&create){info=performanceGraph_('sites/'+SITE+'/lists',token,'post',{displayName:PERFORMANCE_LIST,list:{template:'genericList'},columns:[{name:'EntityKind',text:{}},{name:'EntityId',text:{}},{name:'EntityVersion',number:{decimalPlaces:'none'}},{name:'Payload',text:{allowMultipleLines:true,textType:'plain'}}]});initialized=true;}
  const raw=initialized?list_(info.data.id,token):[],records=[],bundles={};
  for(const item of raw){
    const f=item.fields;let value;try{value=JSON.parse(f.Payload);}catch(e){throw new Error('Existe um registo de versões inválido.');}
    if(value.format==='mdp360-chunk-v1'){
      const key=value.bundle; if(!bundles[key])bundles[key]={parts:{},commit:null};
      if(value.commit)bundles[key].commit={fields:f,meta:value,itemId:item.id};else bundles[key].parts[value.index]=value.text;
    } else records.push({kind:f.EntityKind,id:f.EntityId,version:Number(f.EntityVersion),body:value,itemId:item.id});
  }
  for(const bundle of Object.values(bundles)){
    if(!bundle.commit)continue;
    const {fields:f,meta:m,itemId}=bundle.commit;
    let json='';for(let i=0;i<m.total;i++){if(typeof bundle.parts[i]!=='string')throw new Error('A versão guardada está incompleta.');json+=bundle.parts[i];}
    if(digest_(json)!==m.digest)throw new Error('A versão guardada não passou a verificação de integridade.');
    const body=JSON.parse(json);if(body.id!==f.EntityId||body.version!==Number(f.EntityVersion))throw new Error('Metadados de versão inconsistentes.');
    records.push({kind:f.EntityKind,id:f.EntityId,version:Number(f.EntityVersion),body,itemId});
  }
  const identity=verifiedIdentity||performanceIdentity_(token);
  const pointer=id=>records.filter(r=>r.kind==='evaluations'&&r.id===id).sort((a,b)=>a.version-b.version).map(r=>r.body).pop();
  const history=(kind,id)=>{if(kind==='evaluations'){const p=pointer(id);if(!p)return [];pFail_(p.format==='mdp360-private-v1','A avaliação está num armazenamento sem isolamento. Migração necessária.');return performancePrivateLoad_(p,token,identity);}return records.filter(r=>r.kind===kind&&r.id===id).sort((a,b)=>a.version-b.version).map(r=>JSON.parse(JSON.stringify(r.body)));};
  const get=(kind,id)=>{const body=history(kind,id).pop()||null;return kind==='evaluations'&&body?performanceMergeSelf_(performancePrivateMerge_(body,pointer(id),token)):body;};
  const list=kind=>[...new Set(records.filter(r=>r.kind===kind).map(r=>r.id))].map(id=>get(kind,id)).filter(Boolean);
  let staged=null;
  const save=(kind,body,actor)=>{
    if(!initialized)throw new Error('A estrutura da empresa ainda não foi inicializada.');
    const old=get(kind,body.id),b={...JSON.parse(JSON.stringify(body)),version:(old?old.version:0)+1,updatedAt:new Date().toISOString(),updatedBy:actor};
    const record={kind,id:b.id,version:b.version,body:b};
    if(staged){staged.push(record);return b;}
    commit(record);return b;
  };
  function commit(r){
    let payload=r.body;
    if(r.kind==='evaluations'){
      const result=performancePrivateSave_(r.body,pointer(r.id),token,list('users'),identity);
      Object.assign(r.body,result.body);payload={...result.pointer,version:r.body.version};r.version=r.body.version;
      // Self-assessment writes go only to the employee's own response file.
      if(identity.number===String(r.body.employee.number)&&!performancePrivateRead_(result.pointer.master,token))return;
    }
    const json=JSON.stringify(payload);if(json.length>950000)throw new Error('O registo é demasiado extenso.');
    const bundle=Utilities.getUuid(),total=Math.ceil(json.length/28000);
    const base={EntityKind:r.kind,EntityId:r.id,EntityVersion:r.version};
    for(let i=0;i<total;i++)performanceGraph_('sites/'+SITE+'/lists/'+info.data.id+'/items',token,'post',{fields:{...base,Title:r.kind+':'+r.id+':v'+r.version+':'+i,Payload:JSON.stringify({format:'mdp360-chunk-v1',bundle,index:i,text:json.slice(i*28000,(i+1)*28000)})}});
    const saved=performanceGraph_('sites/'+SITE+'/lists/'+info.data.id+'/items',token,'post',{fields:{...base,Title:r.kind+':'+r.id+':v'+r.version,Payload:JSON.stringify({format:'mdp360-chunk-v1',bundle,commit:true,total,digest:digest_(json)})}});
    r.itemId=saved.data.id;records.push({...r,body:payload});if(r.kind==='evaluations')performanceMirrorTask_(r.body);
  }
  function transaction(fn){if(staged)throw new Error('Operação sobreposta.');staged=[];try{const result=fn(),pending=staged;staged=null;if(pending.length!==1)throw new Error('Uma operação tem de guardar exatamente uma versão.');commit(pending[0]);return result;}finally{staged=null;}}
  const auditLog=()=>records.slice().reverse().slice(0,500).map(r=>({id:r.itemId,at:r.body.updatedAt,actor:r.body.updatedBy,action:r.kind+'.save',entity:r.id}));
  return {initialized,get,list,save,transaction,versions:history,auditLog};
}
function performanceSetup_(token,identity) {
  pFail_(identity.role==='ADMIN','Acesso reservado à administração.',403);
  const store=performanceStore_(token,true,identity);
  const proposals=performanceProposals_();
  for(const kind of ['objectives','kpis','roles','templates'])for(const original of proposals[kind]){
    const row=JSON.parse(JSON.stringify(original));
    pFail_(kind==='roles'||row.status==='definition','Os indicadores de origem devem ficar Em definição.');
    if(kind==='templates')pValidateTemplate_(row);
    if(!store.get(kind,row.id))store.save(kind,row,identity.id);
  }
  const people=list_('UtilizadoresDashboard',token);
  const numbers=people.map(i=>i.fields.NumeroColaborador).filter(n=>n!==undefined&&n!==null).map(String);
  pFail_(new Set(numbers).size===numbers.length,'Existem números de colaborador repetidos. Corrija a origem antes da importação.');
  for(const item of people){
    const f=item.fields;if(f.NumeroColaborador===undefined||f.NumeroColaborador===null)continue;
    const id='legacy-'+String(f.NumeroColaborador);if(store.get('users',id))continue;
    const name=String(f.Funcao||'').trim();let role=store.list('roles').find(r=>r.name===name);
    if(name&&!role){role=store.save('roles',{id:'legacy-role-'+digest_(name).slice(0,16),name},identity.id);}
    store.save('users',{id,name:String(f.NomeColaborador||f.Title||''),username:String(f.NumeroColaborador),number:String(f.NumeroColaborador),role:['ADMIN','CHEFIA','DIRECAO'].includes(f.TipoUtilizador)?f.TipoUtilizador:'COLABORADOR',active:f.Ativo!==false,roleId:role?role.id:'',departmentId:'',managerId:'',oid:''},identity.id);
  }
  for(const local of rows_('Users'))performanceLinkLocal_(local,token,identity.id);
  return {objectives:store.list('objectives').length,kpis:store.list('kpis').length,templates:store.list('templates').length,users:store.list('users').length};
}
function performanceDispatch_(request) {
  pFail_(typeof request.path==='string'&&request.path.length<300,'Pedido inválido.');
  pFail_(JSON.stringify(request.body||{}).length<1000000,'Pedido demasiado extenso.');
  const identity=performanceIdentity_(request.adminToken);
  if(request.path==='/setup'&&request.method==='POST')return performanceSetup_(request.adminToken,identity);
  const store=performanceStore_(request.adminToken,false,identity);
  const saved=store.get('users',identity.id)||store.list('users').find(e=>e.number===identity.number);
  const u={...identity,...(saved?{id:saved.id,roleId:saved.roleId,departmentId:saved.departmentId,managerId:saved.managerId,version:saved.version}:{}),initialized:store.initialized};
  pFail_(!saved||saved.active,'O perfil de avaliação está inativo.',403);
  if(request.path==='/bootstrap'&&(!request.method||request.method==='GET')){
    const session={user:pPublicUser_(u),csrf:'rpc-token',mustChange:false,hasLocalPin:false,initialized:store.initialized};
    if(!store.initialized)return session;
    const read=path=>performanceApi_({...request,path,method:'GET'},u,store);
    return {...session,catalog:read('/catalog'),evaluations:read('/evaluations')};
  }
  if(request.path==='/me')return {user:pPublicUser_(u),csrf:'rpc-token',mustChange:false,hasLocalPin:false,initialized:store.initialized};
  pFail_(store.initialized,'A estrutura da empresa ainda não está inicializada.');
  return performanceApi_(request,u,store);
}
