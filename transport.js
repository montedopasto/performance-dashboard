'use strict';
// Tokens and passwords travel only to the exact deployed private API origin.
window.MDPRpc=(()=>{
  const channel=crypto.randomUUID()+crypto.randomUUID(),pending=new Map();
  let relay=null,frame,readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  // A catch avoids an unhandled rejection while the user is still on the entry screen.
  ready.catch(()=>{});
  const bootTimer=setTimeout(()=>readyReject(Error('A ligação ao sistema demorou demasiado. Atualize a página e tente novamente.')),30000);
  window.addEventListener('message',event=>{
    const m=event.data;
    if(event.origin!==CONFIG.localPortalOrigin||!m||m.channel!==channel||!event.source)return;
    if(m.type==='mdp:ready'&&!relay){relay=event.source;clearTimeout(bootTimer);readyResolve();return;}
    if(event.source!==relay||m.type!=='mdp:response')return;
    const request=pending.get(m.id);if(!request)return;
    pending.delete(m.id);clearTimeout(request.timer);
    if(m.result?.ok)request.resolve(m.result.data);else request.reject(Error(m.result?.error||'Pedido não concluído.'));
  });
  function mount(){
    frame=document.createElement('iframe');frame.hidden=true;frame.title='Ligação protegida ao sistema';frame.referrerPolicy='strict-origin';
    const url=new URL(CONFIG.localPortalUrl);if(url.origin!=='https://script.google.com'||!url.pathname.endsWith('/exec'))throw Error('Ligação inválida.');
    url.searchParams.set('mode','relay');url.searchParams.set('channel',channel);frame.src=url.href;document.body.append(frame);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  return {async call(request){
    await ready;const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('O pedido demorou demasiado. Verifique o resultado antes de repetir.'));},request.path==='/setup'?350000:120000);
      pending.set(id,{resolve,reject,timer});
      try{relay.postMessage({type:'mdp:request',channel,id,request},CONFIG.localPortalOrigin);}catch{clearTimeout(timer);pending.delete(id);reject(Error('A ligação foi interrompida. Atualize a página.'));}
    });
  }};
})();
