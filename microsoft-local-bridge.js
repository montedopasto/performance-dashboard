'use strict';
const state = new URL(location.href).searchParams.get('state');
let origin;
try {origin = new URL(document.referrer).origin;} catch {origin = '';}
const allowed = /^https:\/\/([a-z0-9-]+\.googleusercontent\.com|script\.google\.com)$/.test(origin);
const instance = new msal.PublicClientApplication({auth:{clientId:CONFIG.clientId,authority:CONFIG.authority,redirectUri:CONFIG.redirectUri}});
document.getElementById('continue').onclick = async () => {
  const status=document.getElementById('status');
  if (!allowed || !window.opener || !/^[a-f0-9-]{72}$/.test(state||'')) {status.textContent='Abra a administração através do portal MDP Performance 360.';return;}
  try {
    const result=await instance.loginPopup({scopes:CONFIG.scopes});
    const token=await instance.acquireTokenSilent({scopes:CONFIG.scopes,account:result.account});
    window.opener.postMessage({state,token:token.accessToken},origin);
    status.textContent='Sessão validada. Pode regressar ao portal.';
  } catch(e) {status.textContent='Não foi possível entrar com Microsoft. Tente novamente.';}
};
