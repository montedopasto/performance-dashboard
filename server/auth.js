import {randomBytes,createHash,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {fail,Problem} from './domain.js';
const scrypt=promisify(rawScrypt);
export const digest=x=>createHash('sha256').update(x).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export async function hashPin(pin) {fail(typeof pin==='string' && pin.length>=8 && pin.length<=128,'A palavra-passe deve ter entre 8 e 128 caracteres.'); const salt=secret();return `${salt}:${Buffer.from(await scrypt(pin,salt,64)).toString('hex')}`;}
export async function verifyPin(pin,hash) {const [salt,hex]=hash.split(':');const key=Buffer.from(await scrypt(String(pin),salt,64));const expected=Buffer.from(hex,'hex');return expected.length===key.length&&timingSafeEqual(expected,key);}
export const publicUser=u=>({id:u.id,name:u.name,role:u.role,roleId:u.roleId,departmentId:u.departmentId,managerId:u.managerId,active:u.active,username:u.username,oid:u.oid,version:u.version});

export async function verifyMicrosoftIdentity(token,key,{tenantId,clientId,nonce}) {
 const {payload}=await jwtVerify(token,key,{issuer:`https://login.microsoftonline.com/${tenantId}/v2.0`,audience:clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub']});
 fail(payload.tid===tenantId&&payload.nonce===nonce&&typeof payload.oid==='string','Identidade Microsoft inválida.',401);return payload;
}
export function makeAuth(store,config) {
  store.db.exec('CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,nonce TEXT,verifier TEXT,expires INTEGER)');
  const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));
  const cookie=(name,value,maxAge)=>`${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${config.production?'; Secure':''}`;
  const session=(req)=> {
    const sid=cookies(req).mdp_session; if(!sid) return null;
    const row=store.db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(digest(sid),Date.now());
    if(!row)return null;const user=store.get('users',row.user_id);if(!user?.active)return null;
    return {user,csrf:row.csrf,mustChange:!!store.db.prepare('SELECT must_change FROM credentials WHERE user_id=?').get(user.id)?.must_change};
  };
  const issue=(res,user)=>{const sid=secret(),csrf=secret();store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(sid),user.id,csrf,Date.now()+8*3600000);res.setHeader('Set-Cookie',cookie('mdp_session',sid,8*3600));store.audit(user.id,'login',user.id);return {user:publicUser(user),csrf};};
  const rate=key=>{const now=Date.now();const old=store.db.prepare('SELECT * FROM attempts WHERE key=?').get(key);const count=old?.expires>now?old.count+1:1;store.db.prepare('INSERT OR REPLACE INTO attempts VALUES(?,?,?)').run(key,count,old?.expires>now?old.expires:now+15*60000);fail(count<=20,'Demasiadas tentativas. Aguarde 15 minutos.',429);};
  const dummy=hashPin('91827463');
  async function login(req,res,b) {
    rate('ip:'+digest(req.socket.remoteAddress||'unknown'));
    fail(typeof b.username==='string'&&b.username.length<=80&&typeof b.pin==='string'&&b.pin.length>=8&&b.pin.length<=128,'Credenciais inválidas.',401);const username=String(b.username||'').trim().toLowerCase();rate('name:'+digest(username));
    const user=store.list('users').find(u=>u.username?.toLowerCase()===username&&u.active);
    const cred=user?store.db.prepare('SELECT * FROM credentials WHERE user_id=?').get(user.id):null;
    const ok=await verifyPin(String(b.pin||''),cred?.hash||await dummy);
    if(!cred || !ok || cred.locked_until>Date.now()) {
      if(cred) {const count=cred.failures+1;store.db.prepare('UPDATE credentials SET failures=?,locked_until=? WHERE user_id=?').run(count,count>=5?Date.now()+15*60000:0,user.id);}
      throw new Problem(401,'Credenciais inválidas ou acesso temporariamente bloqueado.');
    }
    store.db.prepare('UPDATE credentials SET failures=0,locked_until=0 WHERE user_id=?').run(user.id);
    return {...issue(res,user),mustChange:!!cred.must_change};
  }
  const enabled=!!(config.tenantId&&config.clientId&&config.clientSecret);
  const authority=`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`;
  const jwks=enabled?createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`)):null;
  async function microsoft(req,res,url) {
    fail(enabled,'A autenticação Microsoft ainda não está configurada.',503);
    if(url.pathname==='/auth/microsoft') {
      const state=secret(),nonce=secret(),verifier=secret();store.db.prepare('DELETE FROM oauth WHERE expires<?').run(Date.now());store.db.prepare('INSERT INTO oauth VALUES(?,?,?,?)').run(digest(state),nonce,verifier,Date.now()+10*60000);
      res.setHeader('Set-Cookie',cookie('mdp_oauth',state,600));
      const params=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:config.origin+'/auth/microsoft/callback',scope:'openid profile',state,nonce,code_challenge:Buffer.from(createHash('sha256').update(verifier).digest()).toString('base64url'),code_challenge_method:'S256'});
      res.writeHead(302,{Location:authority+'/authorize?'+params});res.end();return;
    }
    const state=url.searchParams.get('state');fail(state&&state===cookies(req).mdp_oauth,'Sessão Microsoft inválida.',401);
    const txn=store.db.prepare('SELECT * FROM oauth WHERE state=? AND expires>?').get(digest(state),Date.now());fail(txn,'Sessão Microsoft expirada.',401);
    store.db.prepare('DELETE FROM oauth WHERE state=?').run(digest(state));
    const code=url.searchParams.get('code');fail(code,'Login Microsoft cancelado.',401);
    const response=await fetch(authority+'/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'authorization_code',code,code_verifier:txn.verifier,redirect_uri:config.origin+'/auth/microsoft/callback'}),signal:AbortSignal.timeout(15000)});
    fail(response.ok,'Não foi possível validar o login Microsoft.',401);const token=await response.json();
    const payload=await verifyMicrosoftIdentity(token.id_token,jwks,{tenantId:config.tenantId,clientId:config.clientId,nonce:txn.nonce});
    const user=store.list('users').find(u=>u.oid===payload.oid&&u.active);fail(user,'Colaborador Microsoft não associado. Contacte o administrador.',403);
    issue(res,user);res.writeHead(302,{Location:'/dashboard.html'});res.end();
  }
  return {session,issue,login,microsoft,enabled,cookie,cookies};
}
