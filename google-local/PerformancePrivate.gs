// Individual assessments never enter the shared catalogue list. Files start empty,
// inheritance is removed and every permission is checked before HR data is written.
function performanceFileRequest_(path,token,method,body) {
  const r=UrlFetchApp.fetch('https://graph.microsoft.com/v1.0/sites/'+SITE+'/drive/'+path,{method:method||'get',headers:{Authorization:'Bearer '+token},contentType:'application/json',...(body!==undefined?{payload:JSON.stringify(body)}:{}),muteHttpExceptions:true});
  const status=r.getResponseCode();let data;try{data=JSON.parse(r.getContentText()||'{}');}catch(e){throw new Error('Ficheiro de avaliação inválido.');}
  if(status===403||status===404)return null;
  if(status<200||status>=300)throw new Error('Não foi possível guardar a avaliação privada.');
  return data;
}
function performancePrivateRecipients_(e,users,token) {
  const directory=list_('UtilizadoresDashboard',token),emails=[];
  const current=graph_('me?$select=id,mail,userPrincipalName',token);
  const add=f=>{const email=String(f.EmailMicrosoft||'').trim().toLowerCase();if(email&&!emails.includes(email))emails.push(email);};
  directory.filter(i=>i.fields.Ativo!==false&&i.fields.TipoUtilizador==='ADMIN').forEach(i=>add(i.fields));
  const employee=users.find(u=>u.id===e.employeeId),manager=employee&&users.find(u=>u.id===employee.managerId);
  if(manager){const matches=directory.filter(i=>String(i.fields.NumeroColaborador)===String(manager.number)&&i.fields.Ativo!==false&&['ADMIN','CHEFIA'].includes(i.fields.TipoUtilizador));pFail_(matches.length===1,'A chefia não tem um acesso Microsoft válido.');add(matches[0].fields);}
  pFail_(emails.length>0,'É necessário um administrador Microsoft ativo.');
  const own=directory.filter(i=>String(i.fields.NumeroColaborador)===String(e.employee.number)&&i.fields.Ativo!==false);
  pFail_(own.length<=1,'Número de colaborador repetido.');
  return {writers:emails,employeeEmail:own.length?String(own[0].fields.EmailMicrosoft||'').trim().toLowerCase():'',current};
}
function performancePrivateFile_(token,recipients,employeeRole) {
  const empty=performanceFileRequest_('root:/mdp360-'+Utilities.getUuid()+'.json:/content',token,'put',{});
  pFail_(empty&&empty.id,'Não foi possível criar o ficheiro privado.');
  const grants=[];
  function invite(emails,role,retain){if(!emails.length)return;const result=performanceFileRequest_('items/'+empty.id+'/invite',token,'post',{recipients:emails.map(email=>({email})),roles:[role],requireSignIn:true,sendInvitation:false,retainInheritedPermissions:retain});pFail_(result&&Array.isArray(result.value)&&result.value.length>0&&!result.value.some(p=>p.error),'Não foi possível restringir o acesso à avaliação.');grants.push(...result.value);}
  invite(recipients.writers,'write',false);
  if(employeeRole&&recipients.employeeEmail&&!recipients.writers.includes(recipients.employeeEmail))invite([recipients.employeeEmail],employeeRole,true);
  let actual=performanceFileRequest_('items/'+empty.id+'/permissions',token);const allowedEmails=[...recipients.writers,...(employeeRole?[recipients.employeeEmail]:[])],allowedIds=[recipients.current.id];
  const principals=p=>[p.grantedToV2,p.grantedTo,...(p.grantedToIdentitiesV2||[]),...(p.grantedToIdentities||[])].filter(Boolean);
  for(const p of grants)for(const principal of principals(p)){const user=principal.user;if(user&&(allowedEmails.includes(String(user.email||'').toLowerCase())||p.invitation?.signInRequired===true&&allowedEmails.includes(String(p.invitation.email||'').toLowerCase()))&&user.id)allowedIds.push(user.id);}
  pFail_(actual&&Array.isArray(actual.value)&&actual.value.length>0,'Não foi possível verificar as permissões privadas.');
  // SharePoint may retain the site owners group even after invite removes inherited
  // permissions. Restrict only this newly-created, still-empty file, then verify again.
  for(const p of actual.value)if(!performancePrivatePermissionAllowed_(p,allowedIds,allowedEmails)) {
    pFail_(p.id&&!p.inheritedFrom,'O SharePoint não permite restringir os acessos herdados da avaliação.');
    pFail_(performanceFileRequest_('items/'+empty.id+'/permissions/'+encodeURIComponent(p.id),token,'delete'),'O SharePoint não permitiu restringir o acesso ao ficheiro da avaliação.');
  }
  actual=performanceFileRequest_('items/'+empty.id+'/permissions',token);
  pFail_(actual&&Array.isArray(actual.value)&&actual.value.length>0,'Não foi possível confirmar as permissões privadas.');
  for(const p of actual.value)pFail_(performancePrivatePermissionAllowed_(p,allowedIds,allowedEmails),'O ficheiro mantém acesso herdado ou acesso não autorizado. Não foi escrita informação de avaliação.');
  return empty.id;
}
function performancePrivatePermissionAllowed_(p,allowedIds,allowedEmails) {
  // Microsoft Graph retains invitation metadata on redeemed, named permissions.
  // This is not a sharing link. Verify its recipient and mandatory sign-in as well
  // as every resolved identity; never infer identity from a display name.
  if(p.link||p.inheritedFrom)return false;
  if(p.invitation&&(p.invitation.signInRequired!==true||!allowedEmails.includes(String(p.invitation.email||'').trim().toLowerCase())))return false;
  const principals=[p.grantedToV2,p.grantedTo,...(p.grantedToIdentitiesV2||[]),...(p.grantedToIdentities||[])].filter(Boolean);
  return principals.length>0&&principals.every(x=>{
    if(x.group||x.siteGroup||x.application||!x.user)return false;
    const email=String(x.user.email||x.siteUser?.email||'').trim().toLowerCase();
    const login=String(x.siteUser?.loginName||'').trim().toLowerCase();
    const membership=login.startsWith('i:0#.f|membership|')?login.slice('i:0#.f|membership|'.length):'';
    return allowedIds.includes(x.user.id)||allowedEmails.includes(email)||!!membership&&allowedEmails.includes(membership);
  });
}
function performancePrivateRead_(id,token){return id?performanceFileRequest_('items/'+id+'/content',token):null;}
function performancePrivateWrite_(id,data,token){pFail_(performanceFileRequest_('items/'+id+'/content',token,'put',data),'Sem permissão para guardar a avaliação privada.');}
function performancePrivateLoad_(pointer,token,identity) {
  const master=performancePrivateRead_(pointer.master,token);
  if(master&&Array.isArray(master.versions))return master.versions;
  if(String(pointer.number)!==identity.number)return [];
  const published=performancePrivateRead_(pointer.published,token),task=performancePrivateRead_(pointer.task,token);
  return published&&published.evaluation?[published.evaluation]:task&&task.evaluation?[task.evaluation]:[];
}
function performanceSelfSignature_(entry){const copy={...entry};delete copy.signature;return Utilities.computeHmacSha256Signature('mdp360-self-v1:'+JSON.stringify(copy),pepper_(),Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function performancePrivateMerge_(e,pointer,token) {
  const self=performancePrivateRead_(pointer.self,token);if(!self||!Array.isArray(self.entries))return e;
  // The employee can edit their own response file. Treat every entry as untrusted.
  let result=e;
  for(const item of self.entries.slice(-100)){if(item.employeeId!==e.employeeId||item.evaluationId!==e.id||item.signature!==performanceSelfSignature_(item))continue;
    try{if(item.results&&['draft','evaluation'].includes(e.state)){pValidateResults_(e.template,item.results);result={...result,selfAssessment:pClone_(item.results)};}
      if(item.acknowledgement&&e.state==='published'&&typeof item.acknowledgement.comment==='string'&&item.acknowledgement.comment.length<=10000&&typeof item.acknowledgement.at==='string')result={...result,acknowledgement:{...item.acknowledgement,userId:e.employeeId}};
    }catch(ignore){}
  }
  return result;
}
function performancePrivateSave_(e,pointer,token,users,identity) {
  if(pointer&&identity.number===String(e.employee.number)&&!performancePrivateRead_(pointer.master,token)){
    const current=performancePrivateLoad_(pointer,token,identity).pop();pFail_(current,'Avaliação indisponível.');
    const data=performancePrivateRead_(pointer.self,token)||{entries:[]};pFail_(Array.isArray(data.entries),'Autoavaliação inválida.');
    const entry={employeeId:e.employeeId,evaluationId:e.id,results:e.selfAssessment,acknowledgement:e.acknowledgement,at:new Date().toISOString()};entry.signature=performanceSelfSignature_(entry);data.entries.push(entry);pFail_(JSON.stringify(data).length<900000,'Histórico de autoavaliação demasiado extenso.');
    performancePrivateWrite_(pointer.self,data,token);return {pointer,body:{...current,selfAssessment:e.selfAssessment,acknowledgement:e.acknowledgement}};
  }
  const recipients=performancePrivateRecipients_(e,users,token);
  if(!pointer){pointer={format:'mdp360-private-v1',id:e.id,number:String(e.employee.number),employeeId:e.employeeId,master:performancePrivateFile_(token,recipients,null)};
    if(recipients.employeeEmail){pointer.task=performancePrivateFile_(token,recipients,'read');pointer.self=performancePrivateFile_(token,recipients,'write');pointer.published=performancePrivateFile_(token,recipients,'read');performancePrivateWrite_(pointer.self,{entries:[]},token);}
  }
  const stored=performancePrivateRead_(pointer.master,token);const master=stored&&Object.keys(stored).length?stored:{versions:[]};pFail_(Array.isArray(master.versions),'Histórico privado inválido.');
  pFail_(!master.versions.length||master.versions[master.versions.length-1].version===e.version-1,'A avaliação mudou. Recarregue.');
  master.versions.push(e);pFail_(JSON.stringify(master).length<8000000,'Histórico privado demasiado extenso.');performancePrivateWrite_(pointer.master,master,token);
  if(pointer.task)performancePrivateWrite_(pointer.task,{evaluation:{id:e.id,employeeId:e.employeeId,employee:e.employee,period:e.period,version:e.version,state:e.state,template:e.template,selfAssessment:e.selfAssessment,results:{},calculation:{},acknowledgement:null}},token);
  if(pointer.published&&e.state==='published'){const pub=performancePrivateRead_(pointer.published,token);if(!pub||!pub.evaluation)performancePrivateWrite_(pointer.published,{evaluation:e},token);}
  return {pointer,body:e};
}
