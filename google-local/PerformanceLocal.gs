function performanceEnsureLocalTables_() {
  const db=SpreadsheetApp.openById(DB_ID);
  for(const name of ['PublicationData','Tasks','TaskData','SelfAssessments'])if(!db.getSheetByName(name)){const s=db.insertSheet(name);s.appendRow(TABLES[name]);s.setFrozenRows(1);}
}
function performanceWriteData_(table,id,json) {
  for(let i=0;i<json.length;i+=28000)append_(table,{id,index:i/28000,chunk:json.slice(i,i+28000)});
}
function performanceReadData_(table,id) {
  const chunks=rows_(table).filter(r=>r.id===id).sort((a,b)=>Number(a.index)-Number(b.index));
  if(!chunks.length)throw new Error('Registo indisponível.');
  if(chunks.some((r,i)=>Number(r.index)!==i))throw new Error('Registo incompleto.');
  return chunks.map(r=>r.chunk).join('');
}
function performanceMirrorTask_(e) {
  const number=String(e.employee.number||''),u=rows_('Users').find(u=>String(u.number)===number);
  if(!u)return;
  performanceEnsureLocalTables_();
  const previous=rows_('Tasks').filter(t=>t.evaluationId===e.id&&t.userId===u.id);
  if(previous.some(t=>Number(t.companyVersion)===e.version))return;
  const id=Utilities.getUuid(),json=JSON.stringify({template:e.template,employee:e.employee});
  performanceWriteData_('TaskData',id,json);
  append_('Tasks',{id,evaluationId:e.id,userId:u.id,period:e.period,companyVersion:e.version,state:e.state,dataId:id,created:new Date().toISOString()});
}
function performanceMirrorPublication_(e,actor) {
  const number=String(e.employee.number||''),u=rows_('Users').find(u=>String(u.number)===number&&u.active===true);
  if(!u||e.state!=='published')return;
  performanceEnsureLocalTables_();
  const sourceId='MDP360:'+e.id,previous=rows_('Publications').filter(p=>p.userId===u.id&&p.sourceId===sourceId);
  if(previous.length)return; // Publication is immutable; acknowledgement/self-assessment do not republish results.
  const snapshot={sourceId,name:e.employee.name,number,role:e.template.name,department:'',date:e.publishedAt,period:e.period,kpis:e.calculation.objectives.flatMap(o=>o.criteria.map(c=>({name:c.name,value:c.result?c.result.actual:null,target:c.target,weight:c.weight,objective:o.name,objectiveWeight:o.weight,group:c.group,score:c.score,unit:c.unit}))),competencies:e.calculation.skills.map(c=>({name:c.name,value:c.result?c.result.actual:null,target:c.target,weight:c.weight,score:c.score,unit:c.unit})),overallScore:e.calculation.score,calculation:'Pontuação calculada com as regras e pesos guardados nesta avaliação.',template:e.template,results:e.results,selfAssessment:e.selfAssessment,comment:e.comment,improvementPlan:e.improvementPlan};
  const id=Utilities.getUuid();performanceWriteData_('PublicationData',id,JSON.stringify(snapshot));
  append_('Publications',{id,userId:u.id,sourceId,version:1,publishedAt:e.publishedAt,publishedBy:actor,snapshot:JSON.stringify({dataId:id})});audit_(actor,'publishCompanyEvaluation',id);
}
function performanceReadPublication_(e) {
  const stored=JSON.parse(e.snapshot);return stored.dataId?JSON.parse(performanceReadData_('PublicationData',stored.dataId)):stored;
}
function performanceLocalTasks_(u) {
  performanceEnsureLocalTables_();
  const own=rows_('Tasks').filter(t=>t.userId===u.id),latest={};
  for(const t of own)if(!latest[t.evaluationId]||Number(latest[t.evaluationId].companyVersion)<Number(t.companyVersion))latest[t.evaluationId]=t;
  return Object.values(latest).map(t=>{const data=JSON.parse(performanceReadData_('TaskData',t.dataId));const answers=rows_('SelfAssessments').filter(a=>a.userId===u.id&&a.evaluationId===t.evaluationId).sort((a,b)=>Number(a.version)-Number(b.version)).pop();return {evaluationId:t.evaluationId,period:t.period,state:t.state,template:data.template,version:answers?Number(answers.version):0,results:answers?JSON.parse(answers.answers):{}};});
}
function performanceLocalSelf_(request,u) {
  const tasks=performanceLocalTasks_(u),task=tasks.find(t=>t.evaluationId===request.evaluationId);
  pFail_(task&&['draft','evaluation'].includes(task.state),'A autoavaliação não está aberta.');
  pFail_(task.version===request.expectedVersion,'A autoavaliação foi alterada. Recarregue.');
  pValidateResults_(task.template,request.results);
  const answers=JSON.stringify(request.results);pFail_(answers.length<45000,'A autoavaliação é demasiado extensa.');
  append_('SelfAssessments',{evaluationId:task.evaluationId,userId:u.id,version:task.version+1,at:new Date().toISOString(),answers});audit_(u.id,'selfAssessment',task.evaluationId);
  return {version:task.version+1};
}
function performanceMergeSelf_(e) {
  const u=rows_('Users').find(u=>String(u.number)===String(e.employee.number||''));
  if(!u)return e;
  performanceEnsureLocalTables_();
  const answer=rows_('SelfAssessments').filter(a=>a.userId===u.id&&a.evaluationId===e.id).sort((a,b)=>Number(a.version)-Number(b.version)).pop();
  let result=answer&&['draft','evaluation'].includes(e.state)?{...e,selfAssessment:JSON.parse(answer.answers),localSelfVersion:Number(answer.version)}:e;
  const publication=rows_('Publications').find(p=>p.userId===u.id&&p.sourceId==='MDP360:'+e.id);
  const ack=publication&&rows_('Acknowledgements').find(a=>a.userId===u.id&&a.publicationId===publication.id);
  if(ack)result={...result,acknowledgement:{at:ack.at,userId:e.employeeId,comment:ack.comment}};
  return result;
}
function performanceLinkLocal_(u,token,actor) {
  const store=performanceStore_(token,false);if(!store.initialized)return;
  let employee=store.list('users').find(e=>String(e.number)===String(u.number));
  if(!employee)employee=store.save('users',{id:'legacy-'+String(u.number),name:u.name,username:String(u.number),number:String(u.number),role:'COLABORADOR',active:u.active,roleId:'',departmentId:'',managerId:'',oid:''},actor);
  for(const e of store.list('evaluations').filter(e=>e.employeeId===employee.id)){performanceMirrorTask_(e);if(e.state==='published')performanceMirrorPublication_(e,actor);}
}
