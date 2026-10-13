// Central operational data is read once, never entered per employee/KPI.
// Shared source data is linked to a responsible person once, not repeated per KPI.
const PERFORMANCE_CENTRAL_HEADERS=['Início da semana','Fornecedor / grupo ligado','Perfil / categoria','Animais entregues','Animais conformes','Kg vivos aceites','Custo líquido animais (€)','Preço transporte (€/kg)','Lotes recebidos','Lotes com documentos válidos'];
function performanceCentralDate_(value){
  pFail_(typeof value==='number'&&Number.isInteger(value)&&value>=32874&&value<=73415,'Data da semana inválida: use uma data Excel.');
  const d=new Date(Date.UTC(1899,11,30)+value*86400000);
  pFail_(d.getUTCDay()===1,'O início da semana deve ser uma segunda-feira.');return d.toISOString().slice(0,10);
}
function performanceCentralPreview_(rows,file){
  const groups=new Map(),issues=[],keys=new Set();
  for(const row of rows){const v=row.values;
    if(!Array.isArray(v)){issues.push({row:row.sheetRow,message:'Linha inválida.'});continue;}
    if(v.slice(0,10).every(x=>x===null||x===undefined||x===''))continue;
    let week;try{week=performanceCentralDate_(v[0]);}catch(error){issues.push({row:row.sheetRow,message:error.message});continue;}
    if(!groups.has(week))groups.set(week,{week,rows:[],issues:[],derivedWeight:false});
    const group=groups.get(week),key=JSON.stringify([week,String(v[1]||'').trim(),String(v[2]||'').trim()]);
    if(!String(v[1]||'').trim()){group.issues.push('Fornecedor em falta.');continue;}
    if(keys.has(key)){group.issues.push('Há linhas repetidas para a mesma semana, origem e categoria.');continue;}keys.add(key);
    const clean=x=>x===null||x===undefined||x===''?null:x;
    const nums=[v[3],v[4],v[5],v[7],v[8],v[9]].map(clean);
    if(nums.some(x=>x!==null&&(typeof x!=='number'||!Number.isFinite(x)||x<0))||[0,1,4,5].some(i=>nums[i]!==null&&!Number.isSafeInteger(nums[i]))){group.issues.push('Quantidades/preço inválidos: use números positivos ou zero confirmado.');continue;}
    const [received,conforming,kg,rate,lots,validLots]=nums;
    if(received!==null&&conforming!==null&&conforming>received||lots!==null&&validLots!==null&&validLots>lots){group.issues.push('Conformes ou lotes válidos excedem o total correspondente.');continue;}
    if(typeof row.formulas?.[5]==='string'&&row.formulas[5].startsWith('='))group.derivedWeight=true;
    group.rows.push({received,conforming,kg,rate,lots,validLots});
  }
  const weeks=[...groups.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(g=>{
    const sum=k=>g.rows.reduce((s,r)=>s+r[k],0),ready=keys=>g.rows.length&&!g.issues.length&&g.rows.every(r=>keys.every(k=>r[k]!==null));
    const ratio=(num,den,keys)=>!ready(keys)?null:sum(den)?100*sum(num)/sum(den):null;
    const freightReady=ready(['kg','rate','received','conforming'])&&g.rows.every(r=>r.received===r.conforming);
    const cost=freightReady?g.rows.reduce((s,r)=>s+r.kg*r.rate,0):null;
    return {week:g.week,lineCount:g.rows.length,received:ready(['received'])?sum('received'):null,totals:{received:ready(['received'])?sum('received'):null,conforming:ready(['received','conforming'])?sum('conforming'):null,lots:ready(['lots'])?sum('lots'):null,validLots:ready(['lots','validLots'])?sum('validLots'):null},conformity:ratio('conforming','received',['conforming','received']),traceability:ratio('validLots','lots',['validLots','lots']),transportCost:cost,transportPerAnimal:cost!==null&&sum('received')?cost/sum('received'):null,weightCalculated:g.derivedWeight,issues:g.issues,
      warnings:[...(g.derivedWeight?['O peso vem de fórmulas na folha; confirme a base antes de usar o transporte numa avaliação.']:[]),...(!freightReady?['Transporte pendente: confirmar peso, preço e correspondência com os animais entregues.']:[]),'Resumo apenas desta semana. Não é uma avaliação completa do mês/trimestre.']};
  });
  return {format:'central-preview-v1',fileName:file.name,webUrl:file.webUrl,weeks,issues,readOnly:true};
}
function performanceCentralRead_(path,token){
  pFail_(typeof path==='string'&&path.length<500&&!/[\\?#:]/.test(path)&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&path.toLowerCase().endsWith('.xlsx'),'Indique um ficheiro Excel no site da app.');
  const file=performanceExcelFile_({path},token),base='items/'+encodeURIComponent(file.id)+'/workbook/';
  const tables=performanceExcelRequest_(base+'tables?$select=id,name',token);
  pFail_(Array.isArray(tables.value)&&tables.value.length<=50&&!tables['@odata.nextLink'],'Estrutura de tabelas inesperada.');
  let match=null;
  for(const table of tables.value){const header=performanceExcelRequest_(base+'tables/'+encodeURIComponent(table.id)+'/headerRowRange?$select=values,rowIndex',token);
    if(JSON.stringify(header.values?.[0]?.slice(0,10))===JSON.stringify(PERFORMANCE_CENTRAL_HEADERS)){pFail_(!match,'Há duas tabelas de receções reais. Identifique uma única origem.');match={id:table.id,rowIndex:header.rowIndex};}}
  pFail_(match,'Tabela de receções reais não encontrada: confirme os cabeçalhos da Base central.');
  const range=performanceExcelRequest_(base+'tables/'+encodeURIComponent(match.id)+'/dataBodyRange?$select=values,formulas',token);
  pFail_(Array.isArray(range.values)&&range.values.length<=20000,'Tabela de receções inválida ou demasiado extensa.');
  const rows=range.values.map((values,i)=>({values,formulas:range.formulas?.[i],sheetRow:match.rowIndex+2+i}));
  return {file,preview:performanceCentralPreview_(rows,file)};
}
const PERFORMANCE_CENTRAL_LINKS=[{id:'B2-2',unit:'%',direction:'higher',numerator:'conforming',denominator:'received',factor:100},{id:'B4-3',unit:'€/animal recebido',direction:'lower',numerator:'transportCost',denominator:'received',factor:1},{id:'B5-2',unit:'%',direction:'higher',numerator:'validLots',denominator:'lots',factor:100}];
function performanceCentralBounds_(period){
  const m=/^(\d{4})-(M(0[1-9]|1[0-2])|Q([1-4])|A)$/.exec(period);pFail_(m,'Período: AAAA-M01, AAAA-Q1 ou AAAA-A.');
  const month=m[3]?Number(m[3])-1:m[4]?(Number(m[4])-1)*3:0,count=m[3]?1:m[4]?3:12;
  return [Date.UTC(Number(m[1]),month,1),Date.UTC(Number(m[1]),month+count,1)];
}
function performanceCentralDigest_(r){return digest_(JSON.stringify({actual:r.actual,na:r.na,reason:r.reason||'',evidence:r.evidence||'',provisional:!!r.source?.provisional}));}
function performanceCentralCanReplace_(r,fileId,configId){return !r||r.source?.type==='central-excel'&&r.source.fileId===fileId&&r.source.configId===configId&&r.source.resultDigest===performanceCentralDigest_(r);}
function performanceCentralPlan_(preview,file,config,evaluation){
  const next=pClone_(evaluation),report={imported:0,cleared:0,protected:0,pending:0,issues:[],weeks:[]};
  if(!['draft','evaluation'].includes(next.state)){report.protected=PERFORMANCE_CENTRAL_LINKS.length;return {next,report,changed:false};}
  pFail_(next.employeeId===config.employeeId&&next.template.id===config.templateId,'A ligação não corresponde à avaliação.');
  const [start,end]=performanceCentralBounds_(next.period),overlap=preview.weeks.filter(w=>{const t=Date.parse(w.week+'T00:00:00Z');return t<end&&t+7*86400000>start;});
  const weeks=overlap.filter(w=>{const t=Date.parse(w.week+'T00:00:00Z');return t>=start&&t+7*86400000<=end;});
  const ambiguous=overlap.length!==weeks.length;
  report.weeks=weeks.map(w=>w.week);
  if(ambiguous)report.issues.push('Há uma semana que atravessa o período. É necessário separar os dados por período antes de obter resultados finais.');
  if(preview.issues.length)report.issues.push('Existem datas/linhas inválidas no Excel; os resultados dependentes ficam pendentes.');
  const provisional=!config.coverageConfirmed||ambiguous||Date.now()<end;
  const criteria=next.template.objectives.flatMap(o=>o.criteria);
  for(const link of PERFORMANCE_CENTRAL_LINKS){
    const c=criteria.find(c=>c.id===link.id),old=next.results[link.id];
    if(!c||c.status!=='active'||c.unit!==link.unit||c.direction!==link.direction){report.pending++;report.issues.push('Regra/unidade da versão da avaliação incompatível: '+link.id+'.');continue;}
    if(!performanceCentralCanReplace_(old,file.id,config.id)){report.protected++;continue;}
    const get=(w,k)=>k==='transportCost'?w.transportCost:w.totals[k];
    const available=weeks.length&&!preview.issues.length&&weeks.every(w=>!w.issues.length&&get(w,link.numerator)!==null&&get(w,link.denominator)!==null);
    if(!available){report.pending++;if(old){delete next.results[link.id];report.cleared++;}continue;}
    const numerator=weeks.reduce((n,w)=>n+get(w,link.numerator),0),denominator=weeks.reduce((n,w)=>n+get(w,link.denominator),0);
    const weightPending=link.id==='B4-3'&&weeks.some(w=>w.weightCalculated)&&!config.weightsConfirmed;
    const r={actual:denominator?link.factor*numerator/denominator:null,na:!denominator,reason:denominator?'':'Sem população elegível nas semanas registadas.',evidence:'Excel central: '+file.name+'; semanas '+report.weeks.join(', ')+'. '+(provisional?'Período ainda incompleto/provisório. ':'Cobertura do período confirmada. ')+(weightPending?'Peso calculado na folha, por confirmar.':''),source:{type:'central-excel',fileId:file.id,configId:config.id,ruleVersion:1,code:link.id,provisional:provisional||weightPending,inputTag:file.eTag||'',importedAt:new Date().toISOString()}};
    r.source.resultDigest=performanceCentralDigest_(r);
    if(old&&performanceCentralDigest_(old)===r.source.resultDigest)continue;
    next.results[link.id]=r;report.imported++;
  }
  pValidateResults_(next.template,next.results);next.calculation=pCalculate_(next.template,next.results);
  return {next,report,changed:!!(report.imported||report.cleared)};
}
function performanceCentralSync_(request,u,store,config){
  pFail_(config?.enabled,'Ligue primeiro o Excel central.');
  const employee=store.get('users',config.employeeId),template=store.get('templates',config.templateId);
  pFail_(employee?.active&&employee.roleId===template?.roleId,'O responsável ou a função mudou. Reveja a ligação.');
  const matches=store.list('evaluations').filter(e=>e.employeeId===employee.id&&e.period===config.period);pFail_(matches.length<=1,'Avaliações duplicadas para o mesmo período.');
  let evaluation=matches[0];
  const properties=PropertiesService.getScriptProperties(),last=()=>JSON.parse(properties.getProperty('MDP_CENTRAL_LAST_REPORT')||'null');
  if(evaluation&&!['draft','evaluation'].includes(evaluation.state)){const report={imported:0,protected:3,period:config.period,evaluationId:evaluation.id,at:new Date().toISOString(),issues:['Avaliação submetida: os resultados foram preservados.']};properties.setProperty('MDP_CENTRAL_LAST_REPORT',JSON.stringify(report));return report;}
  const file=performanceExcelFile_({path:config.path},request.adminToken);pFail_(file.id===config.fileId,'O ficheiro foi substituído. Confirme novamente a ligação.');
  const signature=digest_(JSON.stringify([file.id,file.eTag,config.version,evaluation?.id,evaluation?.version,employee.active,employee.roleId]));
  if(!request.body?.force&&properties.getProperty('MDP_CENTRAL_SIGNATURE')===signature)return {...last(),cached:true};
  const data=performanceCentralRead_(config.path,request.adminToken);pFail_(data.file.id===config.fileId,'Origem alterada durante a leitura.');
  if(!evaluation){
    pFail_(template?.status==='active','Modelo de Compras ativo em falta.');
    evaluation=performanceApi_({...request,path:'/evaluations',method:'POST',body:{employeeId:employee.id,templateId:template.id,period:config.period}},u,store);
  }
  const plan=performanceCentralPlan_(data.preview,data.file,config,evaluation);
  const saved=plan.changed?store.transaction(()=>store.save('evaluations',plan.next,u.id)):evaluation;
  const report={...plan.report,period:config.period,evaluationId:saved.id,evaluationVersion:saved.version,employeeName:employee.name,at:new Date().toISOString(),provisional:!config.coverageConfirmed||Date.now()<performanceCentralBounds_(config.period)[1]||Object.values(saved.results).some(r=>r.source?.type==='central-excel'&&r.source.provisional)};
  properties.setProperty('MDP_CENTRAL_SIGNATURE',digest_(JSON.stringify([data.file.id,data.file.eTag,config.version,saved.id,saved.version,employee.active,employee.roleId])));
  properties.setProperty('MDP_CENTRAL_LAST_REPORT',JSON.stringify(report));return report;
}
function performanceCentralApi_(request,u,store){
  pFail_(u.role==='ADMIN','A base central está reservada à administração.',403);
  const method=request.method||'GET',b=request.body||{};
  if(request.path==='/central-source/preview'){pFail_(method==='POST','Operação inválida.');return performanceCentralRead_(b.path,request.adminToken).preview;}
  const old=store.get('central-source','company');
  if(request.path==='/central-source'&&method==='GET')return {config:old,lastSync:JSON.parse(PropertiesService.getScriptProperties().getProperty('MDP_CENTRAL_LAST_REPORT')||'null')};
  if(request.path==='/central-source'&&method==='PUT'){
    pFail_((old?.version||0)===b.expectedVersion,'A ligação mudou. Recarregue.',409);
    if(old&&b.enabled===false)return store.transaction(()=>store.save('central-source',{...old,enabled:false},u.id));
    performanceCentralBounds_(b.period);
    const employee=store.get('users',b.employeeId),template=store.get('templates',b.templateId);
    pFail_(template?.id==='template-B'&&template.status==='active'&&employee?.active&&employee.roleId===template.roleId,'Escolha o responsável de Compras com o modelo ativo.');
    pFail_(!old||old.employeeId===employee.id,'Para mudar de responsável é necessário definir o âmbito dos dados históricos.');
    const data=performanceCentralRead_(b.path,request.adminToken);performanceExcelRestrict_(data.file,request.adminToken);
    const saved=store.transaction(()=>store.save('central-source',{id:'company',path:b.path,enabled:b.enabled===true,fileId:data.file.id,webUrl:data.file.webUrl,employeeId:employee.id,templateId:template.id,period:b.period,coverageConfirmed:b.coverageConfirmed===true,weightsConfirmed:b.weightsConfirmed===true},u.id));
    PropertiesService.getScriptProperties().setProperty('MDP_CENTRAL_SIGNATURE','');return saved;
  }
  pFail_(request.path==='/central-source/sync'&&method==='POST','Operação inválida.');return performanceCentralSync_(request,u,store,old);
}
