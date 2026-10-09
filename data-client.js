'use strict';
// Page memory only: never persist employee data or credentials in browser storage.
window.MDPData=(()=>{
  const cache=new Map(),pending=new Map();let identity='',generation=0;
  const ttl=60000,copy=value=>structuredClone(value);
  function clear(){generation++;cache.clear();pending.clear();}
  function seed(path,value){cache.set(path,{value:copy(value),expires:Date.now()+ttl});}
  return {clear,async call(token,path,method='GET',body={}){
    if(identity!==token){clear();identity=token;}
    const read=method==='GET'&&(/^\/(bootstrap|catalog|evaluations|bsc-results|self-assessments)$/.test(path)||path.startsWith('/legacy-history/'));
    if(method!=='GET')clear();
    if(read){const saved=cache.get(path);if(saved&&saved.expires>Date.now())return copy(saved.value);if(pending.has(path))return copy(await pending.get(path));}
    const revision=generation;
    const request=MDPRpc.call({action:'performance',adminToken:token,path,method,body}).then(value=>{
      if(read&&revision===generation){seed(path,value);if(path==='/bootstrap'&&value.initialized){seed('/catalog',value.catalog);seed('/evaluations',value.evaluations);}}
      return value;
    });
    if(read)pending.set(path,request);
    try{return copy(await request);}finally{if(pending.get(path)===request)pending.delete(path);if(method!=='GET')clear();}
  }};
})();
