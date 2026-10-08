import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openStore} from './store.js';
import {seed} from './bootstrap.js';
import {calculate,fail,validateTemplate} from './domain.js';
export function importLegacy(store,data,actor='migration') {
 const required=['UtilizadoresDashboard','ConfiguracaoFuncoes','HistoricoKPIs','HistoricoSoftSkills'];
 for(const name of required)fail(Array.isArray(data[name]),'Exportação incompleta: '+name);
 const fields=name=>data[name].map(item=>({...item.fields,_sourceId:item.id}));
 const users=fields('UtilizadoresDashboard'),configs=fields('ConfiguracaoFuncoes'),kpis=fields('HistoricoKPIs'),skills=fields('HistoricoSoftSkills');
 fail(users.every(u=>u.NumeroColaborador!==undefined&&u.NomeColaborador&&u.Funcao),'Colaboradores sem identificador, nome ou função.');
 fail(new Set(users.map(u=>String(u.NumeroColaborador))).size===users.length,'Números de colaborador duplicados.');
 const roleId=name=>'legacy-role-'+createHash('sha256').update(String(name)).digest('hex').slice(0,16);
 const employeeId=n=>'legacy-user-'+String(n);
 const clean=value=>{if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(^pin$|password|token|secret)/i.test(k)).map(([k,v])=>[k,clean(v)]));return value;};
 const imported=[];
 return store.transaction(()=>{
  seed(store);
  for(const name of new Set(users.map(u=>u.Funcao)))if(!store.get('roles',roleId(name)))store.save('roles',{id:roleId(name),name},actor);
  for(const u of users) {
   const id=employeeId(u.NumeroColaborador);if(store.get('users',id))continue;
   store.save('users',{id,name:u.NomeColaborador,username:String(u.NumeroColaborador),role:['ADMIN','CHEFIA','DIRECAO'].includes(u.TipoUtilizador)?u.TipoUtilizador:'COLABORADOR',active:true,roleId:roleId(u.Funcao),departmentId:'',managerId:u.ManagerID&&users.some(x=>String(x.NumeroColaborador)===String(u.ManagerID))?employeeId(u.ManagerID):'',oid:'',legacy:clean(u),migrationReviewRequired:true},actor);
  }
  const official=x=>x.SnapshotOficial===true||String(x.SnapshotOficial).toLowerCase()==='sim';
  const keys=new Set([...kpis,...skills].filter(x=>official(x)&&x.AvaliacaoID).map(x=>String(x.ColaboradorID)+'|'+x.AvaliacaoID));
  for(const key of keys) {
   const [number,...rest]=key.split('|'),evaluationId=rest.join('|'),user=store.get('users',employeeId(number));fail(user,'Histórico aponta para colaborador inexistente: '+number);
   const id='legacy-evaluation-'+createHash('sha256').update(key).digest('hex').slice(0,24);if(store.get('evaluations',id))continue;
   const kr=kpis.filter(x=>String(x.ColaboradorID)===number&&x.AvaliacaoID===evaluationId&&official(x));const sr=skills.filter(x=>String(x.ColaboradorID)===number&&x.AvaliacaoID===evaluationId&&official(x));
   fail(kr.length>0,'Avaliação sem KPIs: '+evaluationId);
   const criterion=(row,i,skill=false)=>({id:(skill?'skill-':'kpi-')+i,name:row.NomeKPI||row.NomeSkill||'Referência '+i,group:skill?'skill':'result',weight:Number(skill?row.PesoSkill:row.PesoKPI),status:'active',direction:'manual',target:100,unit:'pontos',definition:'Pontuação histórica registada na aplicação anterior. Meta original e peso preservados no registo de origem.',originalTarget:row.Meta,legacy:clean(row)});
   const cs=kr.map((r,i)=>criterion(r,i)),ss=sr.map((r,i)=>({...criterion(r,i,true),weight:Number(r.PesoSkill)>0?Number(r.PesoSkill):1}));
   // Never replace missing historical weights with current ConfiguracaoFuncoes weights.
   fail(cs.every(c=>Number.isFinite(c.weight)&&c.weight>0),'Pesos históricos em falta. Corrigir a exportação, sem usar pesos atuais: '+evaluationId);
   const snapshot={id:'legacy-snapshot-'+id,name:'Modelo histórico importado',version:1,roleId:user.roleId,status:'archived',method:'legacy',objectives:[{id:'legacy-objectives',name:'Indicadores históricos',weight:100,criteria:cs}],skills:ss,legacyEvaluationId:evaluationId};validateTemplate(snapshot);
   const results={};[...kr,...sr].forEach((r,i)=>{const cid=i<kr.length?'kpi-'+i:'skill-'+(i-kr.length);const value=r.ValorAtual;const number=value===null||value===undefined||value===''?NaN:Number(value);if(Number.isFinite(number)&&number>=0&&number<=100)results[cid]={actual:number,na:false,evidence:'SharePoint · '+String(r._sourceId||''),reason:''};});
   const date=kr[0].DataAtualizacao;fail(date&&!Number.isNaN(Date.parse(date)),'Data histórica inválida: '+evaluationId);const year=new Date(date).getUTCFullYear();
   const e=store.save('evaluations',{id,employeeId:user.id,employee:{id:user.id,name:user.name,roleId:user.roleId},period:`${year}-H-${evaluationId}`,legacyDate:date,legacyEvaluationId:evaluationId,template:snapshot,state:'draft',results,selfAssessment:{},comment:'Importação histórica. Rever antes de aprovar e publicar.',improvementPlan:'',calculation:calculate(snapshot,results),acknowledgement:null,migrationReviewRequired:true},actor);imported.push(e.id);
  }
  const archiveId='legacy-source-'+createHash('sha256').update(JSON.stringify(clean(data))).digest('hex');if(!store.get('legacy-import',archiveId))store.save('legacy-import',{id:archiveId,source:clean(data),imported},actor);
  // Current configuration is retained for review, never applied to historic evaluations.
  for(const name of new Set(users.map(u=>u.Funcao))) {
   const id='legacy-template-'+roleId(name);if(store.get('templates',id))continue;
   const rows=configs.filter(c=>c.NomeFuncao===name&&(c.Ativo===true||String(c.Ativo).toLowerCase()==='sim'));
   const cs=rows.filter(c=>c.TipoConfiguracao==='KPI').map((c,i)=>({id:'legacy-kpi-'+i,name:c.NomeReferencia,group:'result',weight:Number(c.Peso)||0,status:'definition',direction:'manual',target:100,unit:'pontos',definition:'Rever configuração importada antes de ativar.',legacy:clean(c)}));
   const ss=rows.filter(c=>c.TipoConfiguracao==='SOFTSKILL').map((c,i)=>({id:'legacy-skill-'+i,name:c.NomeReferencia,group:'skill',weight:Number(c.Peso)||1,status:'definition',direction:'manual',target:100,unit:'pontos',definition:'Rever competência importada.',legacy:clean(c)}));
   if(cs.length)store.save('templates',{id,name:name+' — configuração anterior',roleId:roleId(name),status:'definition',method:'legacy',objectives:[{id:'legacy-all',name:'Indicadores',weight:100,criteria:cs}],skills:ss,migrationReviewRequired:true},actor);
  }
  store.audit(actor,'legacy.import',archiveId);return {imported:imported.length,users:users.length};
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {fail(process.argv[2],'Indicar ficheiro JSON exportado.');const data=JSON.parse(readFileSync(process.argv[2],'utf8'));const store=openStore(process.env.DB_PATH||'data/mdp.sqlite');console.log(importLegacy(store,data));store.db.close();}
