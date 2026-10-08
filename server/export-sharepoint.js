import {writeFileSync} from 'node:fs';
import {fail} from './domain.js';
const token=process.env.GRAPH_EXPORT_TOKEN,site=process.env.SHAREPOINT_SITE_ID||'montedopastopt.sharepoint.com,8c2379e3-75a3-4dc7-a6d1-2e1ba1d18db9,6673446f-32ef-467c-8bfc-0c8177bdb154';
fail(token&&process.argv[2],'Definir GRAPH_EXPORT_TOKEN e caminho de saída. Use um token delegado de leitura autorizado.');
const data={};
for(const name of ['UtilizadoresDashboard','ConfiguracaoFuncoes','HistoricoKPIs','HistoricoSoftSkills','KPIsDashboard','SoftSkillsDashboard','FuncoesDashboard']) {
 let next=`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(site)}/lists/${name}/items?$expand=fields&$top=200`;const rows=[];
 while(next) {fail(new URL(next).origin==='https://graph.microsoft.com','URL de paginação inesperada.');const response=await fetch(next,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});fail(response.ok,`Falha ao exportar ${name}: HTTP ${response.status}. Não importar uma exportação parcial.`);const page=await response.json();fail(Array.isArray(page.value),'Resposta Graph inválida.');rows.push(...page.value);next=page['@odata.nextLink'];}
 data[name]=rows;
}
// Remove plaintext PINs at the export boundary. Issue new credentials through the administrator.
for(const item of data.UtilizadoresDashboard) delete item.fields.PIN;
writeFileSync(process.argv[2],JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
console.log('Exportação completa de sete listas. PINs removidos.');
