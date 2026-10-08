class pProblem_ extends Error { constructor(status, message) { super(message); this.status = status; } }
const pFail_ = (condition, message, status = 400) => { if (!condition) throw new pProblem_(status, message); };
const pClone_ = x => JSON.parse(JSON.stringify(x));
const pStates_ = ['definition', 'validation', 'approved', 'active', 'archived'];
const pWorkflow_ = ['draft', 'evaluation', 'validation', 'approved', 'published'];
function pValidateTemplate_(t) {
  pFail_(t.name && t.roleId && Array.isArray(t.objectives) && t.objectives.length, 'Modelo requer nome, função e objetivos.');
  pFail_(['leadlag','legacy'].includes(t.method), 'Método inválido.');
  pFail_(t.objectives.every(o => o.id && o.name && Number.isFinite(o.weight) && o.weight > 0 && Array.isArray(o.criteria) && o.criteria.length), 'Objetivos ou pesos inválidos.');
  pFail_(new Set(t.objectives.map(o=>o.id)).size === t.objectives.length, 'IDs de objetivos repetidos.');
  pFail_(Math.abs(t.objectives.reduce((s,o)=>s+o.weight,0)-100)<0.001, 'Pesos dos objetivos devem totalizar 100%.');
  const criteria = [...t.objectives.flatMap(o=>o.criteria), ...(t.skills||[])];
  pFail_(new Set(criteria.map(c=>c.id)).size===criteria.length,'IDs de critérios repetidos.');
  if (t.method === 'leadlag') pFail_(Number.isFinite(t.leadWeight) && t.leadWeight>=0 && t.leadWeight<=100,'Peso Lead inválido.');
  for (const c of criteria) {
    pFail_(c.id && c.name && ['lead','lag','skill','result'].includes(c.group) && pStates_.includes(c.status),'Critério inválido.');
    pFail_(['higher','lower','zero','manual'].includes(c.direction),'Regra de cálculo inválida.');
    pFail_(Number.isFinite(c.weight) && c.weight>0, 'Peso do critério inválido.');
    if (c.status==='active' || c.status==='approved') {
      pFail_(c.definition && c.unit, 'Critérios aprovados requerem definição e unidade.');
      pFail_(c.direction==='manual' || (Number.isFinite(c.target) && (c.direction==='zero' ? c.target===0 : c.target>0)), 'Meta em falta ou inválida.');
    }
  }
  if(t.method==='leadlag') for(const o of t.objectives) {
    pFail_(o.criteria.every(c=>['lead','lag'].includes(c.group)), 'Modelo Lead/Lag só admite critérios Lead e Lag.');
    pFail_(o.criteria.some(c=>c.group==='lead') && o.criteria.some(c=>c.group==='lag'),'Cada objetivo requer Lead e Lag.');
  }
}
function pAttainment_(c, result) {
  if(c.status !== 'active' || !result || result.na || !Number.isFinite(result.actual)) return null;
  const a=result.actual; if(a<0) return null;
  if(c.direction==='manual') return a<=100 ? a : null;
  if(c.direction==='zero') return a===0 ? 100 : 0;
  if(!Number.isFinite(c.target) || c.target<=0) return null;
  return c.direction==='higher' ? Math.min(100,a/c.target*100) : a<=c.target ? 100 : c.target/a*100;
}
function pCalculate_(template, results) {
  const objectives = template.objectives.map(o => {
    const criteria=o.criteria.map(c=>({...c, result: results[c.id] || null, score:pAttainment_(c,results[c.id])}));
    // Pending and N/A measures keep their weights. No silent renormalisation.
    const avg = group => { const cs=criteria.filter(c=>!group || c.group===group); return !cs.length || cs.some(c=>c.score===null) ? null : cs.reduce((s,c)=>s+c.score*c.weight,0)/cs.reduce((s,c)=>s+c.weight,0); };
    let score=avg();
    if(template.method==='leadlag') {const lead=avg('lead'),lag=avg('lag'); score=lead===null||lag===null?null:lead*template.leadWeight/100+lag*(100-template.leadWeight)/100;}
    return {...o,criteria,score};
  });
  const complete=objectives.every(o=>o.score!==null);
  return {objectives,skills:(template.skills||[]).map(c=>({...c,result:results[c.id]||null,score:pAttainment_(c,results[c.id])})),complete,score:complete?objectives.reduce((s,o)=>s+o.score*o.weight/100,0):null};
}
function pCanManage_(user, employee) {return user.role==='ADMIN' || user.role==='CHEFIA' && employee.managerId===user.id && employee.id!==user.id;}
function pCanRead_(user, evaluation, employee) {return pCanManage_(user,employee) || user.id===employee.id && evaluation.state==='published';}
function pValidateResults_(template, results) {
  const ids=new Set([...template.objectives.flatMap(o=>o.criteria),...(template.skills||[])].map(c=>c.id));
  for(const [id,r] of Object.entries(results)) {
    pFail_(ids.has(id),'Critério desconhecido.');
    pFail_(r && typeof r==='object' && typeof r.na==='boolean','Resultado inválido.');
    pFail_(r.na || Number.isFinite(r.actual) && r.actual>=0,'Resultado requer valor numérico ou N/A.');
    if(r.na) pFail_(typeof r.reason==='string' && r.reason.trim(),'N/A requer justificação.');
    const criterion=[...template.objectives.flatMap(o=>o.criteria),...(template.skills||[])].find(c=>c.id===id);
    if(criterion.direction==='manual' && !r.na) pFail_(r.actual<=100,'Pontuação deve ser de 0 a 100.');
    pFail_(!r.evidence || typeof r.evidence==='string','Evidência inválida.');
  }
}

function pRandomUUID_(){return Utilities.getUuid();}
function pPublicUser_(u){return {id:u.id,name:u.name,role:u.role,roleId:u.roleId,departmentId:u.departmentId,managerId:u.managerId,active:u.active,username:u.username,oid:u.oid,number:u.number,version:u.version};}

function pDefinitionFingerprint_(value) {
  const omitted=new Set(['id','version','updatedAt','updatedBy','expectedVersion','status']);
  function normalized(v,top){if(Array.isArray(v))return v.map(x=>normalized(x,false));if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).filter(k=>k!=='status'&&!(top&&omitted.has(k))).sort().map(k=>[k,normalized(v[k],false)]));return v;}
  return JSON.stringify(normalized(value,true));
}
