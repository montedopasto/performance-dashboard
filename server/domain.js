export class Problem extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (condition, message, status = 400) => { if (!condition) throw new Problem(status, message); };
export const clone = x => JSON.parse(JSON.stringify(x));
export const states = ['definition', 'validation', 'approved', 'active', 'archived'];
export const workflow = ['draft', 'evaluation', 'validation', 'approved', 'published'];
export function validateTemplate(t) {
  fail(t.name && t.roleId && Array.isArray(t.objectives) && t.objectives.length, 'Modelo requer nome, função e objetivos.');
  fail(['leadlag','legacy'].includes(t.method), 'Método inválido.');
  fail(t.objectives.every(o => o.id && o.name && Number.isFinite(o.weight) && o.weight > 0 && Array.isArray(o.criteria) && o.criteria.length), 'Objetivos ou pesos inválidos.');
  fail(new Set(t.objectives.map(o=>o.id)).size === t.objectives.length, 'IDs de objetivos repetidos.');
  fail(Math.abs(t.objectives.reduce((s,o)=>s+o.weight,0)-100)<0.001, 'Pesos dos objetivos devem totalizar 100%.');
  const criteria = [...t.objectives.flatMap(o=>o.criteria), ...(t.skills||[])];
  fail(new Set(criteria.map(c=>c.id)).size===criteria.length,'IDs de critérios repetidos.');
  if (t.method === 'leadlag') fail(Number.isFinite(t.leadWeight) && t.leadWeight>=0 && t.leadWeight<=100,'Peso Lead inválido.');
  for (const c of criteria) {
    fail(c.id && c.name && ['lead','lag','skill','result'].includes(c.group) && states.includes(c.status),'Critério inválido.');
    fail(['higher','lower','zero','manual'].includes(c.direction),'Regra de cálculo inválida.');
    fail(Number.isFinite(c.weight) && c.weight>0, 'Peso do critério inválido.');
    if (c.status==='active' || c.status==='approved') {
      fail(c.definition && c.unit, 'Critérios aprovados requerem definição e unidade.');
      fail(c.direction==='manual' || (Number.isFinite(c.target) && (c.direction==='zero' ? c.target===0 : c.target>0)), 'Meta em falta ou inválida.');
    }
  }
  if(t.method==='leadlag') for(const o of t.objectives) {
    fail(o.criteria.every(c=>['lead','lag'].includes(c.group)), 'Modelo Lead/Lag só admite critérios Lead e Lag.');
    fail(o.criteria.some(c=>c.group==='lead') && o.criteria.some(c=>c.group==='lag'),'Cada objetivo requer Lead e Lag.');
  }
}
export function attainment(c, result) {
  if(c.status !== 'active' || !result || result.na || !Number.isFinite(result.actual)) return null;
  const a=result.actual; if(a<0) return null;
  if(c.direction==='manual') return a<=100 ? a : null;
  if(c.direction==='zero') return a===0 ? 100 : 0;
  if(!Number.isFinite(c.target) || c.target<=0) return null;
  return c.direction==='higher' ? Math.min(100,a/c.target*100) : a<=c.target ? 100 : c.target/a*100;
}
export function calculate(template, results) {
  const objectives = template.objectives.map(o => {
    const criteria=o.criteria.map(c=>({...c, result: results[c.id] || null, score:attainment(c,results[c.id])}));
    // Pending and N/A measures keep their weights. No silent renormalisation.
    const avg = group => { const cs=criteria.filter(c=>!group || c.group===group); return !cs.length || cs.some(c=>c.score===null) ? null : cs.reduce((s,c)=>s+c.score*c.weight,0)/cs.reduce((s,c)=>s+c.weight,0); };
    let score=avg();
    if(template.method==='leadlag') {const lead=avg('lead'),lag=avg('lag'); score=lead===null||lag===null?null:lead*template.leadWeight/100+lag*(100-template.leadWeight)/100;}
    return {...o,criteria,score};
  });
  const complete=objectives.every(o=>o.score!==null);
  return {objectives,skills:(template.skills||[]).map(c=>({...c,result:results[c.id]||null,score:attainment(c,results[c.id])})),complete,score:complete?objectives.reduce((s,o)=>s+o.score*o.weight/100,0):null};
}
export function canManage(user, employee) {return user.role==='ADMIN' || user.role==='CHEFIA' && employee.managerId===user.id && employee.id!==user.id;}
export function canRead(user, evaluation, employee) {return canManage(user,employee) || user.id===employee.id && evaluation.state==='published';}
export function validateResults(template, results) {
  const ids=new Set([...template.objectives.flatMap(o=>o.criteria),...(template.skills||[])].map(c=>c.id));
  for(const [id,r] of Object.entries(results)) {
    fail(ids.has(id),'Critério desconhecido.');
    fail(r && typeof r==='object' && typeof r.na==='boolean','Resultado inválido.');
    fail(r.na || Number.isFinite(r.actual) && r.actual>=0,'Resultado requer valor numérico ou N/A.');
    if(r.na) fail(typeof r.reason==='string' && r.reason.trim(),'N/A requer justificação.');
    const criterion=[...template.objectives.flatMap(o=>o.criteria),...(template.skills||[])].find(c=>c.id===id);
    if(criterion.direction==='manual' && !r.na) fail(r.actual<=100,'Pontuação deve ser de 0 a 100.');
    fail(!r.evidence || typeof r.evidence==='string','Evidência inválida.');
  }
}
