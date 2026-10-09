'use strict';
// Keep the server's validation and version history; the administrator performs one action.
window.MDPModels=(()=>{
  function problems(t){
    const errors=[];
    if(!t.name?.trim())errors.push('Modelo: preencha o nome.');
    if(!t.roleId)errors.push('Modelo: escolha a função.');
    if(t.status==='archived')errors.push('Modelo arquivado: crie um novo modelo.');
    if(!['leadlag','legacy'].includes(t.method))errors.push('Modelo: escolha o método.');
    if(!t.objectives?.length)errors.push('Modelo: adicione pelo menos um objetivo.');
    if(Math.abs((t.objectives||[]).reduce((sum,o)=>sum+o.weight,0)-100)>=0.001)errors.push('Objetivos: os pesos devem somar 100%.');
    if(t.method==='leadlag'&&(!Number.isFinite(t.leadWeight)||t.leadWeight<0||t.leadWeight>100))errors.push('Modelo: o peso Lead deve estar entre 0 e 100%.');
    for(const [i,o] of (t.objectives||[]).entries()){
      const name=o.name?.trim()||`Objetivo ${i+1}`;
      if(!o.name?.trim())errors.push(`${name}: preencha o nome.`);
      if(!Number.isFinite(o.weight)||o.weight<=0)errors.push(`${name}: indique um peso superior a zero.`);
      if(!o.criteria?.length)errors.push(`${name}: adicione critérios.`);
      if(t.method==='leadlag'&&(!o.criteria?.some(c=>c.group==='lead')||!o.criteria?.some(c=>c.group==='lag')||o.criteria.some(c=>!['lead','lag'].includes(c.group))))errors.push(`${name}: deve ter critérios Lead e Lag.`);
    }
    const criteria=[...(t.objectives||[]).flatMap(o=>o.criteria||[]),...(t.skills||[])];
    for(const [i,c] of criteria.entries()){
      const name=c.name?.trim()||`Critério ${i+1}`;
      if(!c.name?.trim())errors.push(`${name}: preencha o nome.`);
      if(!c.definition?.trim())errors.push(`${name}: preencha a definição.`);
      if(!c.unit?.trim())errors.push(`${name}: preencha a unidade.`);
      if(!Number.isFinite(c.weight)||c.weight<=0)errors.push(`${name}: indique um peso superior a zero.`);
      if(!['higher','lower','zero','manual'].includes(c.direction))errors.push(`${name}: escolha a regra de cálculo.`);
      else if(c.direction!=='manual'&&(!Number.isFinite(c.target)||(c.direction==='zero'?c.target!==0:c.target<=0)))errors.push(`${name}: ${c.direction==='zero'?'a meta deve ser zero':'preencha uma meta superior a zero'}.`);
      if(!['lead','lag','skill','result'].includes(c.group))errors.push(`${name}: escolha o grupo.`);
    }
    return errors;
  }
  async function activate(input,savedStatus,persist,onSaved=()=>{}){
    let next=structuredClone(input);
    const errors=problems(next);
    if(errors.length)throw new Error('Não foi possível ativar o modelo:\n'+errors.join('\n'));
    for(const c of [...next.objectives.flatMap(o=>o.criteria),...(next.skills||[])])c.status='active';
    // Approved definitions cannot be edited in place. Start a new definition before approval.
    const states=!next.id?['definition','validation','approved','active']:['approved','active'].includes(savedStatus)?['definition','validation','approved','active']:savedStatus==='validation'?['validation','approved','active']:['validation','approved','active'];
    for(const status of states){
      next=await persist({...next,status,expectedVersion:next.version});
      onSaved(structuredClone(next));
    }
    return next;
  }
  return {problems,activate};
})();
