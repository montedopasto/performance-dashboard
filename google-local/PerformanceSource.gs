// Source data is private. Only unchanged proposal fields are filled; versions remain append-only.
function performanceSourceMerge_(current,baseline,enriched,kind) {
  if(!current||current.status!=='definition')return null;
  const next=pClone_(current),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const merge=(to,from,provided,keys)=>{for(const key of keys)if(!(key==='targetPeriod'&&!equal(to.target,from.target)&&!equal(to.target,provided.target))&&!equal(provided[key],from[key])&&equal(to[key],from[key])&&provided[key]!==undefined)to[key]=pClone_(provided[key]);};
  const keys=['target','unit','direction','definition','confirmation','targetText','targetPeriod','sourceConflict'];
  if(kind==='templates'){
    for(const o of next.objectives||[]){const old=baseline.objectives.find(x=>x.id===o.id),supplied=enriched.objectives.find(x=>x.id===o.id);if(!old||!supplied)continue;
      for(const c of o.criteria){const original=old.criteria.find(x=>x.id===c.id),provided=supplied.criteria.find(x=>x.id===c.id);if(original&&provided&&c.status==='definition')merge(c,original,provided,keys);}
    }
    pValidateTemplate_(next);
  }else merge(next,baseline,enriched,keys);
  return equal(next,current)?null:next;
}
function performanceSourceImport_(request,u,store) {
  pFail_(u.role==='ADMIN','Acesso reservado à administração.',403);
  const source=performanceSourceEnrichment_(),pending=[];
  for(const kind of ['objectives','kpis','templates'])for(const provided of source.enriched[kind]){
    const baseline=source.baseline[kind].find(x=>x.id===provided.id),current=store.get(kind,provided.id);
    const next=baseline&&performanceSourceMerge_(current,baseline,provided,kind);
    if(next)pending.push({kind,id:provided.id,name:current.name,next});
  }
  if((request.method||'GET')==='GET')return {pending:pending.map(({kind,id,name})=>({kind,id,name}))};
  pFail_(request.method==='POST'&&Array.isArray(request.body?.items)&&request.body.items.length<=4,'Lote de importação inválido.');
  const saved=[];
  for(const item of request.body.items){const row=pending.find(p=>p.kind===item.kind&&p.id===item.id);if(!row)continue;
    const value=store.save(row.kind,row.next,u.id);saved.push({kind:row.kind,id:row.id,version:value.version});
  }
  return {saved};
}
