// A configurable source workbook feeds existing indicators; no role-specific code.
const PERFORMANCE_EXCEL_HEADERS=['Período','N.º colaborador','Código indicador','Indicador','Unidade','Valor realizado','Evidência','Observação','Estado'];
function performanceExcelCatalog_(store) {
  const rows=[],roles=store.list('roles'),states={definition:'Em definição',validation:'Em validação',approved:'Aprovado',active:'Ativo',archived:'Arquivado'};
  for(const k of store.list('kpis'))rows.push(['EMP/'+k.id,k.name,k.unit||'','Empresa','',states[k.status]||k.status,k.version]);
  for(const t of store.list('templates'))for(const c of [...t.objectives.flatMap(o=>o.criteria),...(t.skills||[])])rows.push(['IND/'+t.id+'/'+c.id,c.name,c.unit||'','Individual',roles.find(r=>r.id===t.roleId)?.name||t.name,states[c.status]||c.status,t.version]);
  return rows;
}
function performanceExcelRequest_(path,token,method,body) {
  const r=performanceGraph_('sites/'+SITE+'/drive/'+path,token,method,body);
  pFail_(r.status!==404,'Ficheiro ou tabela Excel não encontrado. Confirme o ficheiro-base no SharePoint.');return r.data;
}
function performanceExcelFile_(config,token) {
  const path=config.path.split('/').map(encodeURIComponent).join('/');
  const file=performanceExcelRequest_('root:/'+path+'?$select=id,name,webUrl,eTag,file,parentReference',token);
  pFail_(file.id&&file.file&&String(file.name).toLowerCase().endsWith('.xlsx'),'Escolha um ficheiro Excel .xlsx neste site SharePoint.');return file;
}
function performanceExcelRestrict_(file,token) {
  const recipients=performancePrivateRecipients_({employee:{number:'__excel_source__'}},[],token),base='items/'+encodeURIComponent(file.id)+'/';
  const grants=performanceExcelRequest_(base+'invite',token,'post',{recipients:recipients.writers.map(email=>({email})),roles:['write'],requireSignIn:true,sendInvitation:false,retainInheritedPermissions:false});
  pFail_(Array.isArray(grants.value)&&grants.value.length&&!grants.value.some(p=>p.error),'Não foi possível restringir o ficheiro-base aos administradores.');
  const ids=[recipients.current.id];for(const p of grants.value)for(const x of [p.grantedToV2,p.grantedTo].filter(Boolean))if(x.user?.id&&recipients.writers.includes(String(x.user.email||'').toLowerCase()))ids.push(x.user.id);
  let actual=performanceExcelRequest_(base+'permissions',token);pFail_(Array.isArray(actual.value)&&actual.value.length,'Não foi possível verificar os acessos do ficheiro-base.');
  for(const p of actual.value)if(!performancePrivatePermissionAllowed_(p,ids,recipients.writers)&&!performanceImplicitOwnerPermission_(p)){
    pFail_(p.id&&!p.inheritedFrom,'O ficheiro-base mantém acessos herdados. Restrinja os acessos no SharePoint.');performanceExcelRequest_(base+'permissions/'+encodeURIComponent(p.id),token,'delete');
  }
  actual=performanceExcelRequest_(base+'permissions',token);pFail_(Array.isArray(actual.value)&&actual.value.length&&actual.value.every(p=>performancePrivatePermissionAllowed_(p,ids,recipients.writers)||performanceImplicitOwnerPermission_(p)),'O ficheiro-base mantém acessos não autorizados.');
}
function performanceExcelRows_(file,token) {
  const base='items/'+encodeURIComponent(file.id)+'/workbook/tables/Resultados/';
  const header=performanceExcelRequest_(base+'headerRowRange?$select=values',token);
  pFail_(JSON.stringify(header.values?.[0])===JSON.stringify(PERFORMANCE_EXCEL_HEADERS),'As colunas da tabela Resultados foram alteradas. Utilize os cabeçalhos do ficheiro-base.');
  const rows=[];let skip=0;
  while(true){const page=performanceExcelRequest_(base+'rows?$top=250&$skip='+skip,token);pFail_(Array.isArray(page.value),'Tabela de resultados inválida.');rows.push(...page.value.map((r,i)=>({index:Number.isInteger(r.index)?r.index:skip+i,sheetRow:(header.rowIndex??5)+2+(Number.isInteger(r.index)?r.index:skip+i),values:r.values?.[0]})));if(page.value.length<250)break;skip+=250;pFail_(skip<20000,'O ficheiro excede 20 000 linhas; divida os períodos por ficheiro.');}
  return rows;
}
function performanceExcelResultDigest_(r){return digest_(JSON.stringify({actual:r.actual,na:r.na,reason:r.reason||'',evidence:r.evidence||''}));}
function performanceExcelCanReplace_(old,file,code) {
  if(!old)return true;
  return old.source?.type==='excel'&&old.source.fileId===file.id&&old.source.code===code&&old.source.resultDigest===performanceExcelResultDigest_(old);
}
function performanceExcelPlan_(rows,file,store,evaluationRows) {
  const report={ready:0,imported:0,unchanged:0,pending:0,protected:0,issueCount:0,issues:[]},entries=[],counts=new Map(),updates=new Map();
  const users=store.list('users'),evaluations=evaluationRows||store.list('evaluations');
  const issue=(row,message)=>{report.issueCount++;if(report.issues.length<25)report.issues.push({row:row.sheetRow??row.index+7,message:String(message).slice(0,200)});};
  for(const row of rows){const v=row.values;if(!Array.isArray(v)){issue(row,'Linha inválida.');continue;}if(String(v[8]||'').trim()!=='Pronto')continue;
    const [period,number,code]=[v[0],v[1],v[2]].map(x=>String(x??'').trim()),key=JSON.stringify([period,number,code]);counts.set(key,(counts.get(key)||0)+1);entries.push({row,v,period,number,code,key});}
  for(const entry of entries){const {row,v,period,number,code,key}=entry;report.ready++;
    if(counts.get(key)>1){issue(row,'Há mais de uma linha Pronto para o mesmo indicador, colaborador e período.');continue;}
    if(!/^\d{4}-(M(0[1-9]|1[0-2])|Q[1-4]|A)$/.test(period)){issue(row,'Período inválido: utilize AAAA-M01, AAAA-Q1 ou AAAA-A.');continue;}
    if(typeof v[5]!=='number'||!Number.isFinite(v[5])||v[5]<0){issue(row,'Preencha um valor numérico; vazio não significa zero.');continue;}
    if([v[6],v[7]].some(x=>x!==null&&x!==undefined&&typeof x!=='string'||typeof x==='string'&&x.length>5000)){issue(row,'Evidência ou observação inválida ou demasiado longa.');continue;}
    const result={actual:v[5],na:false,reason:'',evidence:[v[6],v[7]].filter(x=>typeof x==='string'&&x.trim()).join('\n')};
    let kind,id,old,target,criterion;
    if(code.startsWith('EMP/')){
      if(number){issue(row,'Num indicador da empresa, deixe o número de colaborador vazio.');continue;}
      criterion=store.get('kpis',code.slice(4));if(!criterion){issue(row,'Código indicador desconhecido. Atualize a lista de indicadores.');continue;}
      if(criterion.status!=='active'){report.pending++;continue;}
      if(criterion.targetPeriod&&criterion.targetPeriod!==period){issue(row,'A meta deste indicador aplica-se apenas a '+criterion.targetPeriod+'.');continue;}
      kind='bsc-results';id=criterion.id+':'+period;old=store.get(kind,id);target=old||{id,kpi:pClone_(criterion),objective:pClone_(store.get('objectives',criterion.objectiveId)),period};
      criterion=target.kpi;
    } else if(code.startsWith('IND/')){
      const parts=code.split('/');if(parts.length!==3||!number){issue(row,'Indique o número do colaborador e um código individual válido.');continue;}
      const matches=users.filter(u=>String(u.number)===number&&u.active);if(matches.length!==1){issue(row,'O número não corresponde a um único colaborador ativo na app.');continue;}
      const matchesEval=evaluations.filter(e=>e.employeeId===matches[0].id&&e.period===period);
      if(matchesEval.length!==1){report.pending++;issue(row,'Crie primeiro o rascunho desta avaliação na app.');continue;}
      old=matchesEval[0];if(!['draft','evaluation'].includes(old.state)){report.protected++;continue;}
      if(old.template.id!==parts[1]){issue(row,'O código pertence a outro modelo de avaliação.');continue;}
      criterion=[...old.template.objectives.flatMap(o=>o.criteria),...(old.template.skills||[])].find(c=>c.id===parts[2]);
      if(!criterion){issue(row,'Este indicador não faz parte da versão do modelo guardada nesta avaliação.');continue;}
      if(criterion.status!=='active'){report.pending++;continue;}
      kind='evaluations';id=old.id;target={...old,results:pClone_(old.results)};
    } else {issue(row,'Código indicador desconhecido. Atualize a lista de indicadores.');continue;}
    if(String(v[4]||'').trim()!==String(criterion.unit||'').trim()){issue(row,'A unidade do Excel não corresponde à unidade da avaliação. Atualize a lista de indicadores.');continue;}
    try{pValidateResults_({objectives:[{criteria:[criterion]}]}, {[criterion.id]:result});}catch(e){issue(row,e.message);continue;}
    const previous=kind==='evaluations'?old.results[criterion.id]:old?.result;
    const digest=performanceExcelResultDigest_(result);
    if(previous&&performanceExcelResultDigest_(previous)===digest){report.unchanged++;continue;}
    if(!performanceExcelCanReplace_(previous,file,code)){report.protected++;issue(row,'Resultado preenchido manualmente na app: foi preservado.');continue;}
    result.source={type:'excel',fileId:file.id,code,row:row.sheetRow??row.index+7,resultDigest:digest,importedAt:new Date().toISOString()};
    const updateKey=kind+':'+id;if(!updates.has(updateKey))updates.set(updateKey,{kind,target,rows:0});
    const update=updates.get(updateKey);if(kind==='evaluations')update.target.results[criterion.id]=result;else update.target.result=result;update.rows++;
  }
  for(const update of updates.values())if(update.kind==='evaluations'){pValidateResults_(update.target.template,update.target.results);update.target.calculation=pCalculate_(update.target.template,update.target.results);}
  return {report,updates:[...updates.values()]};
}
function performanceExcelApi_(request,u,store) {
  pFail_(u.role==='ADMIN','A ligação ao ficheiro-base está reservada à administração.',403);
  const method=request.method||'GET',body=request.body||{},config=store.get('data-source','company');
  if(request.path==='/data-source'){
    if(method==='GET')return {config,lastSync:JSON.parse(PropertiesService.getScriptProperties().getProperty('MDP_EXCEL_LAST_REPORT')||'null')};
    pFail_(method==='PUT','Operação inválida.');
    pFail_((config?.version||0)===body.expectedVersion,'A ligação mudou. Recarregue.',409);
    pFail_(typeof body.path==='string'&&body.path.length<500&&!/[\\?#:]/.test(body.path)&&!body.path.split('/').some(p=>!p||p==='.'||p==='..')&&body.path.toLowerCase().endsWith('.xlsx'),'Indique o caminho de um ficheiro .xlsx neste site SharePoint.');
    const candidate={id:'company',path:body.path.trim(),enabled:body.enabled===true};
    if(candidate.enabled){const file=performanceExcelFile_(candidate,request.adminToken);performanceExcelRows_(file,request.adminToken);performanceExcelRestrict_(file,request.adminToken);candidate.fileId=file.id;candidate.webUrl=file.webUrl;}
    PropertiesService.getScriptProperties().setProperty('MDP_EXCEL_LAST_SIGNATURE','');return store.transaction(()=>store.save('data-source',candidate,u.id));
  }
  pFail_(config?.enabled,'Ligue primeiro o ficheiro-base na administração.');
  const file=performanceExcelFile_(config,request.adminToken);
  pFail_(file.id===config.fileId,'O ficheiro foi substituído. Volte a guardar a ligação para confirmar a nova origem.');
  if(request.path==='/data-source/catalog'){
    pFail_(method==='POST','Operação inválida.');
    const rows=performanceExcelCatalog_(store),prefix='items/'+encodeURIComponent(file.id)+'/workbook/';
    const current=[];let skip=0;
    while(true){const page=performanceExcelRequest_(prefix+'tables/Indicadores/rows?$top=250&$skip='+skip,request.adminToken);pFail_(Array.isArray(page.value),'Lista de indicadores inválida.');current.push(...page.value.map(r=>r.values?.[0]));if(page.value.length<250)break;skip+=250;pFail_(skip<5000,'A lista excede 5000 indicadores.');}
    pFail_(current.every(r=>Array.isArray(r)&&r.length===7),'A estrutura da lista de indicadores foi alterada.');
    const codes=new Set(current.map(r=>r[0])),added=rows.filter(r=>!codes.has(r[0])),latest=new Map(rows.map(r=>[r[0],r]));
    const values=[...current.map(r=>latest.get(r[0])||[...r.slice(0,5),'Arquivado',r[6]]),...added];pFail_(values.length<=5000,'A lista excede 5000 indicadores.');
    for(let i=0;i<added.length;i+=250)performanceExcelRequest_(prefix+'tables/Indicadores/rows/add',request.adminToken,'post',{values:added.slice(i,i+250)});
    if(values.length)performanceExcelRequest_(prefix+"worksheets/Indicadores/range(address='A7:G"+(values.length+6)+"')",request.adminToken,'patch',{values});
    PropertiesService.getScriptProperties().setProperty('MDP_EXCEL_LAST_SIGNATURE','');return {indicators:rows.length};
  }
  pFail_(request.path==='/data-source/sync'&&method==='POST','Operação inválida.');
  const properties=PropertiesService.getScriptProperties();
  const evaluations=store.list('evaluations'),evaluationContext=e=>[e.id,e.period,e.state,e.template.id,e.template.version,e.version];
  const context={file:file.id,etag:file.eTag,catalog:performanceExcelCatalog_(store),users:store.list('users').map(x=>[x.id,x.number,x.active]),evaluations:evaluations.map(evaluationContext)};
  const signature=digest_(JSON.stringify(context));
  if(!body.force&&properties.getProperty('MDP_EXCEL_LAST_SIGNATURE')===signature)return {...JSON.parse(properties.getProperty('MDP_EXCEL_LAST_REPORT')||'{}'),cached:true};
  const plan=performanceExcelPlan_(performanceExcelRows_(file,request.adminToken),file,store,evaluations),savedEvaluations=new Map();
  for(const update of plan.updates.slice(0,3)){const saved=store.transaction(()=>store.save(update.kind,update.target,u.id));if(update.kind==='evaluations')savedEvaluations.set(saved.id,saved);plan.report.imported+=update.rows;}
  const remaining=plan.updates.length>3,report={...plan.report,remaining,at:new Date().toISOString(),fileName:file.name};
  if(!remaining){const after={...context,evaluations:evaluations.map(e=>evaluationContext(savedEvaluations.get(e.id)||e))};properties.setProperty('MDP_EXCEL_LAST_SIGNATURE',digest_(JSON.stringify(after)));}
  // Validation messages contain row numbers, never employee names or actual values.
  // This runtime property is private and exposed only by the ADMIN endpoint.
  properties.setProperty('MDP_EXCEL_LAST_REPORT',JSON.stringify(report));return report;
}
