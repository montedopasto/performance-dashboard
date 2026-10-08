import {readFileSync,existsSync} from 'node:fs';
import {openStore} from './store.js';
import {hashPin} from './auth.js';
import {fail,validateTemplate} from './domain.js';
import {fileURLToPath} from 'node:url';
export function seed(store, sourcePath=process.env.SOURCE_CATALOG_PATH||'data/source-catalog.json') {
 if(!existsSync(sourcePath))return {loaded:false};
 const catalog=JSON.parse(readFileSync(sourcePath,'utf8'));
 for(const kind of ['objectives','kpis','roles','templates'])fail(Array.isArray(catalog[kind]),'Catálogo privado inválido: '+kind);
 for(const kind of ['objectives','kpis','roles','templates'])for(const row of catalog[kind]) {
  fail(row.id&&row.name,'Registo de origem sem ID ou nome.');
  if(kind!=='roles')fail(row.status==='definition','Os dados de origem têm de entrar Em definição.');
  if(kind==='templates')validateTemplate(row);
  if(!store.get(kind,row.id))store.save(kind,row,'source-import');
 }
 return {loaded:true};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const store=openStore(process.env.DB_PATH||'data/mdp.sqlite');
 fail(process.env.ADMIN_USERNAME&&process.env.ADMIN_NAME&&process.env.ADMIN_PIN,'Definir ADMIN_USERNAME, ADMIN_NAME e ADMIN_PIN (8–12 algarismos).');
 fail(store.list('users').length===0,'Bootstrap permitido apenas numa base sem utilizadores.');
 const hash=await hashPin(process.env.ADMIN_PIN);
 store.transaction(()=>{seed(store);store.save('users',{id:'bootstrap-admin',name:process.env.ADMIN_NAME,username:process.env.ADMIN_USERNAME,role:'ADMIN',active:true,roleId:'',departmentId:'',managerId:'',oid:process.env.ADMIN_OID||''});store.db.prepare('INSERT INTO credentials(user_id,hash,must_change) VALUES(?,?,1)').run('bootstrap-admin',hash);});
 console.log('Base inicializada. Altere o PIN no primeiro acesso. Nenhum indicador foi ativado.');store.db.close();
}
