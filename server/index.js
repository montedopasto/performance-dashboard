import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.js';
import {makeAuth,hashPin,verifyPin,digest,publicUser} from './auth.js';
import {fail,Problem,validateTemplate,validateResults,calculate,canManage,canRead,workflow,states,clone} from './domain.js';
export function createApp({dbPath='data/mdp.sqlite',origin='http://localhost:3000',production=false,tenantId=process.env.MS_TENANT_ID,clientId=process.env.MS_CLIENT_ID,clientSecret=process.env.MS_CLIENT_SECRET}={}) {
  if(production) fail(origin.startsWith('https://'),'PUBLIC_ORIGIN deve usar HTTPS em produção.');
  const store=openStore(dbPath),auth=makeAuth(store,{origin,production,tenantId,clientId,clientSecret});
  const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  const catalog=['departments','roles','objectives','kpis','templates','users'];
  const text=(v,max=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
  const admin=u=>fail(u.role==='ADMIN','Acesso reservado ao administrador.',403);
  const scoped=(u,e)=>canManage(u,e)||u.id===e.id;
  function validateEntity(kind,b,old) {
    fail(text(b.name),'Nome em falta.');
    if(['templates','objectives','kpis'].includes(kind)) {
      fail(states.includes(b.status),'Estado inválido.');
      if(!old)fail(b.status==='definition','Criar em definição antes da validação.');
      else if(b.status!==old.status)fail(b.status==='archived'||states.indexOf(b.status)===states.indexOf(old.status)+1&&old.status!=='archived'||b.status==='definition'&&old.status!=='archived','Transição de indicador/modelo inválida.');
      // A new version of an already approved/active definition must be validated again.
      if(old&&['approved','active'].includes(old.status)&&b.status===old.status) {
        const omit=x=>JSON.stringify(Object.fromEntries(Object.entries(x).filter(([key])=>!['id','version','updatedAt','expectedVersion','status'].includes(key)).sort(([a],[c])=>a.localeCompare(c))));
        fail(omit(old)===omit(b),'Alterar regras aprovadas requer devolver esta nova versão a Em definição. Avaliações anteriores mantêm-se.');
      }
    }
    if(kind==='users') {
      fail(['ADMIN','DIRECAO','CHEFIA','COLABORADOR'].includes(b.role)&&typeof b.active==='boolean','Perfil inválido.');
      fail(text(b.username)&&/^[a-zA-Z0-9._-]{1,80}$/.test(b.username),'Identificador de acesso inválido.');
      fail(!store.list('users').some(u=>u.id!==b.id&&u.username.toLowerCase()===b.username.toLowerCase()),'Identificador já existe.');
      fail(!b.oid || /^[a-f0-9-]{36}$/i.test(b.oid),'Object ID Microsoft inválido.');
      fail(!b.oid || !store.list('users').some(u=>u.id!==b.id&&u.oid===b.oid),'Identidade Microsoft já associada.');
      if(b.managerId) {const manager=store.get('users',b.managerId);fail(manager?.active&&['ADMIN','CHEFIA'].includes(manager.role)&&b.managerId!==b.id,'Chefia inválida.');let next=manager;const seen=new Set([b.id]);while(next){fail(!seen.has(next.id),'Ciclo de chefias inválido.');seen.add(next.id);next=next.managerId?store.get('users',next.managerId):null;}}
      if(b.departmentId)fail(store.get('departments',b.departmentId),'Departamento inválido.');
      if(b.roleId)fail(store.get('roles',b.roleId),'Função inválida.');
      if(old?.role==='ADMIN'&&old.active&&(b.role!=='ADMIN'||!b.active))fail(store.list('users').some(u=>u.id!==b.id&&u.active&&u.role==='ADMIN'),'Deve existir um administrador ativo.');
      b={id:b.id,name:b.name,username:b.username,role:b.role,active:b.active,departmentId:b.departmentId||'',roleId:b.roleId||'',managerId:b.managerId||'',oid:b.oid||''};
    }
    if(kind==='templates'){validateTemplate(b);fail(store.get('roles',b.roleId),'Função inválida.');for(const o of b.objectives) for(const id of o.strategicIds||[])fail(store.get('objectives',id),'Objetivo estratégico inválido.');fail(states.includes(b.status),'Estado inválido.');}
    if(kind==='objectives') {fail(['corporate','department'].includes(b.scope)&&states.includes(b.status),'Objetivo inválido.');if(b.scope==='department'){fail(store.get('departments',b.departmentId),'Departamento inválido.');fail(store.get('objectives',b.parentId)?.scope==='corporate','Associar a objetivo corporativo.');}}
    if(kind==='kpis') {fail(store.get('objectives',b.objectiveId),'Objetivo inválido.');fail(states.includes(b.status)&&['higher','lower','zero','manual'].includes(b.direction),'Indicador inválido.');if(['active','approved'].includes(b.status))fail(b.definition&&b.unit&&(b.direction==='manual'||Number.isFinite(b.target)&&(b.direction==='zero'?b.target===0:b.target>0)),'Definir unidade, regra e meta antes da aprovação.');}
    return b;
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      const url=new URL(req.url,origin),parts=url.pathname.split('/').filter(Boolean),method=req.method;
      if(url.pathname.startsWith('/auth/microsoft')&&method==='GET'){fail(['/auth/microsoft','/auth/microsoft/callback'].includes(url.pathname),'Página inexistente.',404);return await auth.microsoft(req,res,url);}
      if(parts[0]!=='api') {
        fail(method==='GET','Método inválido.',405);
        const allowed=['index.html','dashboard.html','equipa.html','colaborador.html','avaliacao.html','bsc.html','admin.html','ui.js','style.css','logo-monte-do-pasto.png'];
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);fail(allowed.includes(file),'Página inexistente.',404);
        const data=readFileSync(new URL('../public/'+file,import.meta.url));const ext=file.split('.').pop();res.writeHead(200,{'Content-Type':({html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',png:'image/png'})[ext]});res.end(data);return;
      }
      let b={};
      if(['POST','PUT','DELETE'].includes(method)) {
        fail(req.headers.origin===origin,'Origem inválida.',403);fail(req.headers['content-type']?.startsWith('application/json'),'Enviar JSON.',415);
        let data='';for await(const chunk of req){data+=chunk;fail(Buffer.byteLength(data)<=1024*1024,'Pedido demasiado grande.',413);}try{b=JSON.parse(data||'{}');}catch{throw new Problem(400,'JSON inválido.');}
      }
      if(url.pathname==='/api/config'&&method==='GET')return send(res,200,{microsoftEnabled:auth.enabled});
      if(url.pathname==='/api/login'&&method==='POST')return send(res,200,await auth.login(req,res,b));
      const session=auth.session(req);fail(session,'Inicie sessão.',401);const u=session.user;
      if(method!=='GET')fail(req.headers['x-csrf-token']===session.csrf,'Sessão inválida.',403);
      if(url.pathname==='/api/me'&&method==='GET')return send(res,200,{user:publicUser(u),csrf:session.csrf,mustChange:session.mustChange,hasLocalPin:!!store.db.prepare('SELECT 1 FROM credentials WHERE user_id=?').get(u.id)});
      if(url.pathname==='/api/logout'&&method==='POST') {store.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(auth.cookies(req).mdp_session));res.setHeader('Set-Cookie',auth.cookie('mdp_session','',0));return send(res,200,{ok:true});}
      if(url.pathname==='/api/pin'&&method==='POST') {
        const credential=store.db.prepare('SELECT * FROM credentials WHERE user_id=?').get(u.id);fail(credential,'Conta sem PIN local.');fail(await verifyPin(String(b.currentPin||''),credential.hash),'PIN atual incorreto.');const hash=await hashPin(b.pin);
        store.db.prepare('UPDATE credentials SET hash=?,must_change=0,failures=0,locked_until=0 WHERE user_id=?').run(hash,u.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);store.audit(u.id,'pin.change',u.id);return send(res,200,auth.issue(res,u));
      }
      fail(!session.mustChange,'Altere o PIN inicial antes de continuar.',403);
      if(url.pathname==='/api/catalog'&&method==='GET') {
        const result={};for(const kind of catalog) {let rows=store.list(kind);if(kind==='users')rows=rows.filter(e=>scoped(u,e)).map(publicUser);if(!['ADMIN','DIRECAO','CHEFIA'].includes(u.role)&&kind!=='users')rows=rows.filter(e=>kind==='roles'?e.id===u.roleId:kind==='departments'?e.id===u.departmentId: false);result[kind]=rows;}return send(res,200,result);
      }
      if(parts[1]==='catalog'&&catalog.includes(parts[2])&&['POST','PUT'].includes(method)) {
        admin(u);const kind=parts[2],id=method==='POST'?randomUUID():parts[3],old=store.get(kind,id);if(method==='PUT')fail(old&&old.version===b.expectedVersion,'Versão mudou. Recarregue.',409);
        const clean=validateEntity(kind,{...b,id},old);delete clean.expectedVersion;
        const saved=store.transaction(()=>store.save(kind,clean,u.id));if(kind==='users')store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return send(res,200,saved);
      }
      if(parts[1]==='users'&&parts[3]==='pin'&&method==='POST') {admin(u);fail(store.get('users',parts[2]),'Colaborador inexistente.',404);const hash=await hashPin(b.pin);store.transaction(()=>{store.db.prepare('INSERT OR REPLACE INTO credentials(user_id,hash,must_change) VALUES(?,?,1)').run(parts[2],hash);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(parts[2]);store.audit(u.id,'pin.reset',parts[2]);});return send(res,200,{ok:true});}
      if(parts[1]==='versions'&&method==='GET') {admin(u);fail(catalog.includes(parts[2]),'Tipo inválido.');return send(res,200,store.db.prepare('SELECT body FROM entities WHERE kind=? AND id=? ORDER BY version').all(parts[2],parts[3]).map(r=>JSON.parse(r.body)));}
      if(url.pathname==='/api/audit'&&method==='GET'){admin(u);return send(res,200,store.db.prepare('SELECT * FROM audit ORDER BY at DESC LIMIT 500').all());}
      if(url.pathname==='/api/self-assessments'&&method==='GET')return send(res,200,store.list('evaluations').filter(e=>e.employeeId===u.id).map(e=>({id:e.id,version:e.version,period:e.period,state:e.state,template:e.template,selfAssessment:e.selfAssessment,employee:e.employee})));
      if(parts[1]==='evaluations') {
        if(method==='GET') {let rows=store.list('evaluations').filter(e=>{const emp=store.get('users',e.employeeId);return emp&&canRead(u,e,emp);});if(parts[2]){const e=rows.find(e=>e.id===parts[2]);fail(e,'Avaliação não disponível.',404);return send(res,200,e);}return send(res,200,rows);}
        if(method==='POST'&&!parts[2]) {
          const employee=store.get('users',b.employeeId),template=store.get('templates',b.templateId);
          fail(employee?.active&&canManage(u,employee),'Sem permissão para avaliar este colaborador.',403);
          fail(template?.status==='active'&&template.roleId===employee.roleId,'Modelo ativo da função em falta.');validateTemplate(template);
          fail(/^\d{4}-(M(0[1-9]|1[0-2])|Q[1-4]|A)$/.test(b.period),'Período: AAAA-M01, AAAA-Q1 ou AAAA-A.');
          fail(!store.list('evaluations').some(e=>e.employeeId===employee.id&&e.period===b.period),'Já existe uma avaliação para este período.',409);
          const e={id:randomUUID(),employeeId:employee.id,employee:publicUser(employee),period:b.period,template:clone(template),state:'draft',results:{},selfAssessment:{},comment:'',improvementPlan:'',seriousIncident:false,incidentReview:'',calculation:calculate(template,{}),acknowledgement:null};
          return send(res,201,store.transaction(()=>store.save('evaluations',e,u.id)));
        }
        const old=store.get('evaluations',parts[2]);fail(old,'Avaliação inexistente.',404);const employee=store.get('users',old.employeeId);fail(employee,'Colaborador inexistente.',404);
        fail(old.version===b.expectedVersion,'A avaliação mudou. Recarregue.',409);
        if(parts[3]==='acknowledge'&&method==='POST') {fail(u.id===employee.id&&old.state==='published','Só pode confirmar a própria avaliação publicada.',403);fail(!old.acknowledgement,'Tomada de conhecimento já registada.',409);fail(typeof b.comment==='string'&&b.comment.length<=10000,'Observação inválida.');return send(res,200,store.transaction(()=>store.save('evaluations',{...old,acknowledgement:{at:new Date().toISOString(),userId:u.id,comment:b.comment}},u.id)));}
        if(parts[3]==='self'&&method==='POST') {fail(u.id===employee.id&&['draft','evaluation','published'].includes(old.state),'Autoavaliação indisponível nesta fase.',403);validateResults(old.template,b.results);return send(res,200,store.transaction(()=>store.save('evaluations',{...old,selfAssessment:clone(b.results)},u.id)));}
        fail(canManage(u,employee),'Sem permissão para avaliar.',403);
        if(parts[3]==='reopen'&&method==='POST') {admin(u);fail(['validation','approved'].includes(old.state),'Só pode reabrir avaliações em validação ou aprovadas.');fail(text(b.reason,10000),'Registe o motivo da reabertura.');return send(res,200,store.transaction(()=>store.save('evaluations',{...old,state:'evaluation',reopened:{at:new Date().toISOString(),by:u.id,reason:b.reason}},u.id)));}
        if(parts[3]==='transition'&&method==='POST') {
          const current=workflow.indexOf(old.state),next=workflow.indexOf(b.state);fail(current<4&&next===current+1,'Transição inválida.');
          if(next>=3)admin(u);
          if(next>=3){fail(old.calculation.complete,'Avaliação incompleta: indicadores pendentes ou N/A.');fail(!old.seriousIncident||text(old.incidentReview,10000),'Registar revisão explícita de incidente grave antes de aprovar.');}
          return send(res,200,store.transaction(()=>store.save('evaluations',{...old,state:b.state,...(b.state==='published'?{publishedAt:new Date().toISOString(),publishedBy:u.id}:{})},u.id)));
        }
        if(method==='PUT'&&!parts[3]) {
          fail(['draft','evaluation'].includes(old.state),'Avaliação bloqueada após submissão.');validateResults(old.template,b.results);
          fail(typeof b.comment==='string'&&typeof b.improvementPlan==='string'&&b.comment.length<=10000&&b.improvementPlan.length<=10000,'Comentários inválidos.');
          return send(res,200,store.transaction(()=>store.save('evaluations',{...old,results:clone(b.results),comment:b.comment,improvementPlan:b.improvementPlan,seriousIncident:!!b.seriousIncident,incidentReview:String(b.incidentReview||'').slice(0,10000),calculation:calculate(old.template,b.results)},u.id)));
        }
      }
      if(parts[1]==='bsc-results') {
        fail(['ADMIN','DIRECAO','CHEFIA'].includes(u.role),'Sem acesso a resultados BSC.',403);
        const allowed=k=> {const o=store.get('objectives',k.objectiveId);return u.role!=='CHEFIA'||o?.scope==='department'&&o.departmentId===u.departmentId;};
        if(method==='GET')return send(res,200,store.list('bsc-results').filter(r=>allowed(r.kpi)));
        if(method==='POST') {fail(u.role!=='DIRECAO','Perfil de consulta.',403);const k=store.get('kpis',b.kpiId);fail(k?.status==='active'&&allowed(k),'Indicador indisponível.',403);fail(/^\d{4}-(M(0[1-9]|1[0-2])|Q[1-4]|A)$/.test(b.period),'Período inválido.');validateResults({objectives:[{criteria:[{...k,id:k.id}]}]},{[k.id]:b.result});
          const id=k.id+':'+b.period,old=store.get('bsc-results',id);fail(!old||old.version===b.expectedVersion,'Resultado alterado. Recarregue.',409);
          return send(res,200,store.transaction(()=>store.save('bsc-results',{id,kpi:clone(old?.kpi||k),period:b.period,result:clone(b.result)},u.id)));
        }
      }
      throw new Problem(404,'Operação inexistente.');
    }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir a operação.'});else res.end();}
  });
  return {server,store,auth};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||3000);const app=createApp({dbPath:process.env.DB_PATH||'data/mdp.sqlite',origin:process.env.PUBLIC_ORIGIN||`http://localhost:${port}`,production:process.env.NODE_ENV==='production'});app.server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`MDP Performance 360: porta ${port}`));
}
