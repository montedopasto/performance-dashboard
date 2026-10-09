import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const channel='123e4567-e89b-42d3-a456-426614174000'.repeat(2);
const requestId='00000000-0000-4000-8000-000000000001';
test('API relay accepts only the company origin, top window and matching per-load channel',()=>{
  let listener,handler;const calls=[],replies=[];
  const top={postMessage:(data,origin)=>replies.push({data,origin})};
  const runner={withSuccessHandler(fn){handler=fn;return this;},withFailureHandler(){return this;},localApi(request){calls.push(request);}};
  const source=fs.readFileSync('google-local/ApiRelay.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= JSON.stringify(channel) ?>',JSON.stringify(channel));
  vm.runInNewContext(source,{window:{top,addEventListener:(name,fn)=>listener=fn},google:{script:{run:runner}},Set,JSON});
  assert.equal(replies[0].data.type,'mdp:ready');assert.equal(replies[0].origin,'https://montedopasto.github.io');
  const event={origin:'https://montedopasto.github.io',source:top,data:{type:'mdp:request',channel,id:requestId,request:{action:'performance',path:'/me',adminToken:'unit-test'}}};
  for(const invalid of [{...event,origin:'https://attacker.example'},{...event,source:{}},{...event,data:{...event.data,channel:'wrong'}},{...event,data:{...event.data,id:'wrong'}},{...event,data:{...event.data,request:[]}}])listener(invalid);
  assert.equal(calls.length,0);listener(event);listener(event);assert.equal(calls.length,1);
  handler({ok:true,data:{user:{name:'Unit test'}}});assert.equal(replies[1].data.id,requestId);assert.equal(replies[1].data.channel,channel);
});
test('GitHub transport binds responses to the exact relay origin, source, channel and request',async()=>{
  let listener,iframe;let sequence=0;const sent=[];
  const relay={postMessage:(data,origin)=>sent.push({data,origin})};
  const ctx={CONFIG:{localPortalOrigin:'https://n-project-script.googleusercontent.com',localPortalUrl:'https://script.google.com/macros/s/test/exec'},crypto:{randomUUID:()=>sequence++<2?'123e4567-e89b-42d3-a456-426614174000':requestId},URL,Map,Promise,Error,setTimeout,clearTimeout,document:{readyState:'complete',createElement:()=>({}),body:{append:f=>iframe=f}},window:{addEventListener:(name,fn)=>listener=fn}};
  vm.runInNewContext(fs.readFileSync('transport.js','utf8'),ctx);
  assert.equal(iframe.hidden,true);assert.equal(new URL(iframe.src).searchParams.get('mode'),'relay');
  listener({origin:ctx.CONFIG.localPortalOrigin,source:relay,data:{type:'mdp:ready',channel}});
  const result=ctx.window.MDPRpc.call({action:'performance',path:'/me'});await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(sent.length,1);assert.equal(sent[0].origin,ctx.CONFIG.localPortalOrigin);
  const event={origin:ctx.CONFIG.localPortalOrigin,source:relay,data:{type:'mdp:response',channel,id:requestId,result:{ok:true,data:{allowed:true}}}};
  for(const invalid of [{...event,origin:'https://attacker.example'},{...event,source:{}},{...event,data:{...event.data,channel:'wrong'}},{...event,data:{...event.data,id:'unknown'}}])listener(invalid);
  listener(event);assert.equal((await result).allowed,true);
});
test('Unified public clients compile and old entry URLs lead to the new workspace',()=>{
  for(const path of ['app.js','transport.js','microsoft-auth.js','local-access.js'])assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path,'utf8')));
  const dashboard=fs.readFileSync('dashboard.html','utf8');assert.match(dashboard,/index.html#inicio/);assert.doesNotMatch(dashboard,/KPIsDashboard|renovarToken|68 Pontos/);
});
