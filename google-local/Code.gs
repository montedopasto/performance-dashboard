const DB_ID = '1FkOjkLUWDvZQybzgsE9UQrkFru3I7nV-ycduaVHUZdU';
const SITE = 'montedopastopt.sharepoint.com,8c2379e3-75a3-4dc7-a6d1-2e1ba1d18db9,6673446f-32ef-467c-8bfc-0c8177bdb154';
const TABLES = {
  Users: ['id','username','name','number','department','role','active','revision','created'],
  Credentials: ['userId','hash','mustChange','revision','failures','lockedUntil'],
  Sessions: ['digest','userId','revision','expires'],
  Publications: ['id','userId','sourceId','version','publishedAt','publishedBy','snapshot'],
  Acknowledgements: ['publicationId','userId','at','comment'],
  Audit: ['at','actor','action','target']
};
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Portal').setTitle('MDP Performance 360');
}
function setup_() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid());
    const db = SpreadsheetApp.openById(DB_ID);
    Object.keys(TABLES).forEach(name => {
      let s = db.getSheetByName(name);
      if (!s) s = db.insertSheet(name);
      if (s.getLastRow() === 0) {s.appendRow(TABLES[name]); s.setFrozenRows(1);}
    });
  } finally {lock.releaseLock();}
}
function store_(name) {
  const s = SpreadsheetApp.openById(DB_ID).getSheetByName(name);
  if (!s) throw new Error('Acesso ainda em preparação.');
  return s;
}
function rows_(name) {
  const v = store_(name).getDataRange().getValues();
  return v.slice(1).filter(r=>r[0] !== '').map((r,i)=>Object.assign({_row:i+2}, Object.fromEntries(TABLES[name].map((k,j)=>[k,r[j]]))));
}
function append_(name, obj) {store_(name).appendRow(TABLES[name].map(k=>safeCell_(obj[k])));}
function replace_(name,obj) {store_(name).getRange(obj._row,1,1,TABLES[name].length).setValues([TABLES[name].map(k=>safeCell_(obj[k]))]);}
function safeCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'"+v;
  return v;
}
function audit_(actor,action,target) {append_('Audit',{at:new Date().toISOString(),actor,action,target});}
function text_(v,max) {if(typeof v !== 'string' || v.length > max) throw new Error('Dados inválidos.'); return v.trim();}
function digest_(v) {return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function pepper_() {const p=PropertiesService.getScriptProperties().getProperty('PEPPER'); if(!p) throw new Error('Acesso ainda em preparação.'); return p;}
function passwordInput_(v) {
  if(typeof v!=='string'||v.length<12||v.length>128) throw new Error('A palavra-passe deve ter entre 12 e 128 caracteres.');
  return Utilities.computeHmacSha256Signature(v,pepper_(),Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
}
function hash_(v) {
  dcodeIO.bcrypt.setRandomFallback(n=>{
    let out=[]; while(out.length<n) out=out.concat(Utilities.computeHmacSha256Signature(Utilities.getUuid()+Utilities.getUuid(),pepper_(),Utilities.Charset.UTF_8).map(b=>b&255)); return out.slice(0,n);
  });
  return dcodeIO.bcrypt.hashSync(passwordInput_(v),10);
}
function verify_(password, hash) {try{return dcodeIO.bcrypt.compareSync(passwordInput_(password),hash);}catch(e){return false;}}
function graph_(path,token) {
  if(typeof token!=='string'||token.length<100||token.length>16000) throw new Error('Entre novamente com Microsoft.');
  const url=path.startsWith('https://')?path:'https://graph.microsoft.com/v1.0/'+path;
  if(!url.startsWith('https://graph.microsoft.com/v1.0/')) throw new Error('Origem inválida.');
  const r=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});
  if(r.getResponseCode()!==200) throw new Error('Não foi possível validar o acesso Microsoft.');
  return JSON.parse(r.getContentText());
}
function list_(name,token) {
  let url='sites/'+SITE+'/lists/'+encodeURIComponent(name)+'/items?$expand=fields',out=[];
  for(let p=0;url && p<200;p++) {const d=graph_(url,token);out=out.concat(d.value||[]);url=d['@odata.nextLink'];}
  if(url) throw new Error('A lista excede o limite de leitura.'); return out;
}
function admin_(token) {
  const me=graph_('me?$select=id,mail,userPrincipalName',token);
  const emails=[me.mail,me.userPrincipalName].filter(Boolean).map(e=>e.toLowerCase());
  const matches=list_('UtilizadoresDashboard',token).filter(i=>emails.includes(String(i.fields.EmailMicrosoft||'').toLowerCase()));
  if(matches.length!==1 || matches[0].fields.TipoUtilizador!=='ADMIN' || matches[0].fields.Ativo===false) throw new Error('Acesso reservado à administração.');
  return {id:me.id,name:matches[0].fields.NomeColaborador||me.userPrincipalName};
}
function publicUser_(u) {return {id:u.id,username:u.username,name:u.name,number:String(u.number),department:u.department,role:u.role,active:u.active===true};}
function session_(token,allowChange) {
  if(typeof token!=='string'||token.length<60||token.length>100) throw new Error('Sessão terminada. Volte a entrar.');
  const s=rows_('Sessions').find(s=>s.digest===digest_(token));
  const u=s&&rows_('Users').find(u=>u.id===s.userId&&u.active===true);
  const c=u&&rows_('Credentials').find(c=>c.userId===u.id);
  if(!s||!u||!c||Number(s.expires)<=Date.now()||Number(c.revision)!==Number(s.revision)) throw new Error('Sessão terminada. Volte a entrar.');
  if(c.mustChange===true&&!allowChange) throw new Error('Altere a palavra-passe inicial para consultar a avaliação.');
  return {u,c,s};
}
function source_(u,token) {
  const map={};
  [['HistoricoKPIs','kpis'],['HistoricoSoftSkills','competencies']].forEach(pair=>{
    list_(pair[0],token).filter(i=>String(i.fields.ColaboradorID)===String(u.number)&&i.fields.SnapshotOficial===true).forEach(i=>{
      const f=i.fields,id=String(f.AvaliacaoID||''); if(!id) return;
      if(!map[id]) map[id]={sourceId:id,name:u.name,number:String(u.number),role:u.role,department:u.department,date:String(f.DataAtualizacao||''),kpis:[],competencies:[],source:'SharePoint',calculation:'Resultados históricos; não recalculados com regras atuais.'};
      map[id][pair[1]].push({sourceItemId:String(i.id),name:String(f.NomeKPI||f.NomeSkill||''),value:f.ValorAtual===undefined?null:f.ValorAtual,target:f.Meta===undefined?null:f.Meta,weight:pair[1]==='kpis'?(f.PesoKPI===undefined?null:f.PesoKPI):(f.PesoSkill===undefined?null:f.PesoSkill),category:String(f.CategoriaAvaliacao||''),state:String(f.CorEstado||'')});
    });
  });
  return Object.values(map).sort((a,b)=>b.date.localeCompare(a.date));
}
function localApi(request) {
  // One RPC entry point; helpers ending in _ cannot be invoked by the client.
  const lock=LockService.getScriptLock();
  try {
    if(!request||typeof request!=='object') throw new Error('Pedido inválido.');
    const action=request.action;
    lock.waitLock(30000);
    if(action==='login') {
      const p=PropertiesService.getScriptProperties(),minute=Math.floor(Date.now()/60000),key='RATE';
      const rate=JSON.parse(p.getProperty(key)||'{}');
      if(rate.minute!==minute){rate.minute=minute;rate.count=0;}
      if(++rate.count>30) throw new Error('Muitas tentativas. Aguarde um minuto.'); p.setProperty(key,JSON.stringify(rate));
      const username=typeof request.username==='string'?request.username.trim().toLowerCase():'';
      const u=rows_('Users').find(u=>u.username===username&&u.active===true);
      const c=u&&rows_('Credentials').find(c=>c.userId===u.id);
      let dummy=p.getProperty('DUMMY'); if(!dummy){dummy=hash_(Utilities.getUuid()+Utilities.getUuid());p.setProperty('DUMMY',dummy);}
      const good=verify_(request.password,c?c.hash:dummy);
      if(!c||!good||Number(c.lockedUntil)>Date.now()) {
        if(c && Number(c.lockedUntil)<=Date.now()) {c.failures=Number(c.failures||0)+1;if(c.failures>=5){c.lockedUntil=Date.now()+15*60000;c.failures=0;}replace_('Credentials',c);}
        throw new Error('Utilizador ou palavra-passe inválidos, ou acesso temporariamente bloqueado.');
      }
      c.failures=0;c.lockedUntil=0;replace_('Credentials',c);
      const token=Utilities.getUuid()+Utilities.getUuid();
      append_('Sessions',{digest:digest_(token),userId:u.id,revision:c.revision,expires:Date.now()+6*60*60000});audit_(u.id,'login',u.id);
      return {ok:true,data:{token,user:publicUser_(u),mustChange:c.mustChange===true}};
    }
    if(action==='logout') {
      const {s}=session_(request.token,true);s.expires=0;replace_('Sessions',s);return {ok:true,data:{}};
    }
    if(action==='changePassword') {
      const {u,c,s}=session_(request.token,true);
      if(!verify_(request.currentPassword,c.hash)) throw new Error('Palavra-passe atual inválida.');
      if(request.password===request.currentPassword) throw new Error('Escolha uma palavra-passe diferente.');
      c.hash=hash_(request.password);c.mustChange=false;c.revision=Number(c.revision)+1;c.failures=0;c.lockedUntil=0;replace_('Credentials',c);
      s.revision=c.revision;replace_('Sessions',s);audit_(u.id,'passwordChanged',u.id);return {ok:true,data:{}};
    }
    if(action==='myEvaluations') {
      const {u}=session_(request.token,false);
      const acknowledgements=rows_('Acknowledgements').filter(a=>a.userId===u.id);
      const evaluations=rows_('Publications').filter(e=>e.userId===u.id).map(e=>({id:e.id,version:e.version,publishedAt:e.publishedAt,snapshot:JSON.parse(e.snapshot),acknowledged:acknowledgements.some(a=>a.publicationId===e.id)}));
      return {ok:true,data:{user:publicUser_(u),evaluations:evaluations.reverse()}};
    }
    if(action==='acknowledge') {
      const {u}=session_(request.token,false);
      const e=rows_('Publications').find(e=>e.id===request.publicationId&&e.userId===u.id);
      if(!e) throw new Error('Avaliação indisponível.');
      if(!rows_('Acknowledgements').some(a=>a.publicationId===e.id&&a.userId===u.id)) append_('Acknowledgements',{publicationId:e.id,userId:u.id,at:new Date().toISOString(),comment:text_(request.comment||'',1000)});
      audit_(u.id,'acknowledge',e.id);return {ok:true,data:{}};
    }
    const admin=admin_(request.adminToken);
    if(action==='adminUsers') return {ok:true,data:{admin:admin.name,users:rows_('Users').map(publicUser_)}};
    if(action==='createUser') {
      const username=text_(request.username,80).toLowerCase();
      if(!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error('Utilizador: 3 a 80 letras, números, pontos, traços ou sublinhados.');
      const existing=rows_('Users');if(existing.some(u=>u.username===username)) throw new Error('Este utilizador já existe.');
      const number=text_(request.number,30);if(!/^[1-9][0-9]{0,14}$/.test(number)) throw new Error('Número de colaborador inválido.');
      if(existing.some(u=>String(u.number)===number)) throw new Error('Este colaborador já tem conta.');
      // Password is hashed before any profile row is written; no plaintext goes into Sheets.
      const hash=hash_(request.password),u={id:Utilities.getUuid(),username,name:text_(request.name,120),number,department:text_(request.department||'',120),role:text_(request.role||'',120),active:true,revision:1,created:new Date().toISOString()};
      if(!u.name) throw new Error('Preencha o nome.');
      append_('Credentials',{userId:u.id,hash,mustChange:true,revision:1,failures:0,lockedUntil:0});append_('Users',u);audit_(admin.id,'createUser',u.id);
      return {ok:true,data:publicUser_(u)};
    }
    const u=rows_('Users').find(u=>u.id===request.userId);if(!u) throw new Error('Colaborador não encontrado.');
    if(action==='setActive') {
      if(typeof request.active!=='boolean') throw new Error('Estado inválido.');
      const c=rows_('Credentials').find(c=>c.userId===u.id);c.revision=Number(c.revision)+1;replace_('Credentials',c);u.active=request.active;replace_('Users',u);audit_(admin.id,'setActive',u.id);return {ok:true,data:{}};
    }
    if(action==='resetPassword') {
      const c=rows_('Credentials').find(c=>c.userId===u.id);c.hash=hash_(request.password);c.revision=Number(c.revision)+1;c.mustChange=true;c.failures=0;c.lockedUntil=0;replace_('Credentials',c);audit_(admin.id,'resetPassword',u.id);return {ok:true,data:{}};
    }
    if(action==='sourceEvaluations') return {ok:true,data:{evaluations:source_(u,request.adminToken)}};
    if(action==='publish') {
      if(!u.active) throw new Error('O colaborador está inativo.');
      const snapshot=source_(u,request.adminToken).find(e=>e.sourceId===request.sourceId);
      if(!snapshot || (!snapshot.kpis.length&&!snapshot.competencies.length)) throw new Error('Avaliação de origem indisponível.');
      if(snapshot.kpis.concat(snapshot.competencies).some(c=>c.value===null||c.weight===null||!Number.isFinite(Number(c.value))||!Number.isFinite(Number(c.weight)))) throw new Error('Existem resultados ou pesos históricos em falta. Reveja a origem antes de publicar.');
      const json=JSON.stringify(snapshot);if(json.length>45000) throw new Error('A avaliação excede o tamanho permitido.');
      const previous=rows_('Publications').filter(e=>e.userId===u.id&&e.sourceId===snapshot.sourceId);
      if(previous.some(e=>e.snapshot===json)) throw new Error('Esta versão já está publicada.');
      const e={id:Utilities.getUuid(),userId:u.id,sourceId:snapshot.sourceId,version:previous.length+1,publishedAt:new Date().toISOString(),publishedBy:admin.id,snapshot:json};append_('Publications',e);audit_(admin.id,'publish',e.id);
      return {ok:true,data:{id:e.id,version:e.version}};
    }
    throw new Error('Pedido inválido.');
  } catch(e) {return {ok:false,error:String(e.message||'Não foi possível concluir o pedido.')};}
  finally {if(lock.hasLock())lock.releaseLock();}
}
