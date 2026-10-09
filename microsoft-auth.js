'use strict';
window.MDPAuth=(()=>{
  const instance=new msal.PublicClientApplication({auth:{clientId:CONFIG.clientId,authority:CONFIG.authority,redirectUri:CONFIG.redirectUri},cache:{cacheLocation:'sessionStorage'}});
  async function token(account){const result=await instance.acquireTokenSilent({scopes:CONFIG.scopes,account});return result.accessToken;}
  return {
    async signIn(){const result=await instance.loginPopup({scopes:CONFIG.scopes});instance.setActiveAccount(result.account);return token(result.account);},
    async restore(){const accounts=instance.getAllAccounts(),account=instance.getActiveAccount()||(accounts.length===1?accounts[0]:null);if(!account)return '';try{return await token(account);}catch{return '';}},
    async signOut(){await instance.logoutRedirect({onRedirectNavigate:()=>false});for(const key of ['accessToken','account','userEmail','tipoLogin','numeroLocal'])localStorage.removeItem(key);}
  };
})();
