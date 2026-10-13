// Central operational data is read once, never entered per employee/KPI.
// First step: a read-only administrative preview; no evaluation is changed.
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
    return {week:g.week,lineCount:g.rows.length,received:ready(['received'])?sum('received'):null,conformity:ratio('conforming','received',['conforming','received']),traceability:ratio('validLots','lots',['validLots','lots']),transportCost:cost,transportPerAnimal:cost!==null&&sum('received')?cost/sum('received'):null,weightCalculated:g.derivedWeight,issues:g.issues,
      warnings:[...(g.derivedWeight?['O peso vem de fórmulas na folha; confirme a base antes de usar o transporte numa avaliação.']:[]),...(!freightReady?['Transporte pendente: confirmar peso, preço e correspondência com os animais entregues.']:[]),'Resumo apenas desta semana. Não é uma avaliação completa do mês/trimestre.']};
  });
  return {format:'central-preview-v1',fileName:file.name,webUrl:file.webUrl,weeks,issues,readOnly:true};
}
function performanceCentralApi_(request,u){
  pFail_(u.role==='ADMIN','A base central está reservada à administração.',403);
  pFail_(request.method==='POST','Operação inválida.');
  const path=request.body?.path;
  pFail_(typeof path==='string'&&path.length<500&&!/[\\?#:]/.test(path)&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&path.toLowerCase().endsWith('.xlsx'),'Indique um ficheiro Excel no site da app.');
  const file=performanceExcelFile_({path},request.adminToken),base='items/'+encodeURIComponent(file.id)+'/workbook/';
  const tables=performanceExcelRequest_(base+'tables?$select=id,name',request.adminToken);
  pFail_(Array.isArray(tables.value)&&tables.value.length<=50&&!tables['@odata.nextLink'],'Estrutura de tabelas inesperada.');
  let match=null;
  for(const table of tables.value){const header=performanceExcelRequest_(base+'tables/'+encodeURIComponent(table.id)+'/headerRowRange?$select=values,rowIndex',request.adminToken);
    if(JSON.stringify(header.values?.[0]?.slice(0,10))===JSON.stringify(PERFORMANCE_CENTRAL_HEADERS)){pFail_(!match,'Há duas tabelas de receções reais. Identifique uma única origem.');match={id:table.id,rowIndex:header.rowIndex};}}
  pFail_(match,'Tabela de receções reais não encontrada: confirme os cabeçalhos da Base central.');
  const range=performanceExcelRequest_(base+'tables/'+encodeURIComponent(match.id)+'/dataBodyRange?$select=values,formulas',request.adminToken);
  pFail_(Array.isArray(range.values)&&range.values.length<=20000,'Tabela de receções inválida ou demasiado extensa.');
  const rows=range.values.map((values,i)=>({values,formulas:range.formulas?.[i],sheetRow:match.rowIndex+2+i}));
  return performanceCentralPreview_(rows,file);
}
