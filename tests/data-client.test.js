import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){let now=1000;const calls=[];const ctx={window:{},structuredClone,Map,Date:{now:()=>now},MDPRpc:{call:request=>new Promise((resolve,reject)=>calls.push({request,resolve,reject}))}};vm.runInNewContext(fs.readFileSync('data-client.js','utf8'),ctx);return {api:ctx.window.MDPData,calls,advance:()=>now+=60001};}
test('one bootstrap serves repeated navigation, with copies and a bounded lifetime',async()=>{
 const f=fixture(),a=f.api.call('one','/bootstrap'),b=f.api.call('one','/bootstrap');assert.equal(f.calls.length,1);
 f.calls[0].resolve({initialized:true,catalog:{users:[{name:'Original'}]},evaluations:[]});await Promise.all([a,b]);
 const cat=await f.api.call('one','/catalog');cat.users[0].name='Edited';assert.equal((await f.api.call('one','/catalog')).users[0].name,'Original');
 await f.api.call('one','/evaluations');await f.api.call('one','/bootstrap');assert.equal(f.calls.length,1);
 f.advance();const refreshed=f.api.call('one','/bootstrap');assert.equal(f.calls.length,2);f.calls[1].resolve({initialized:false});await refreshed;
});
test('account changes, mutations and explicit refresh invalidate cached reads',async()=>{
 const f=fixture();let p=f.api.call('one','/catalog');f.calls[0].resolve({users:['one']});await p;
 p=f.api.call('two','/catalog');assert.equal(f.calls.length,2);f.calls[1].resolve({users:['two']});await p;
 const write=f.api.call('two','/catalog/users/id','PUT',{});f.calls[2].resolve({});await write;
 p=f.api.call('two','/catalog');assert.equal(f.calls.length,4);f.calls[3].resolve({users:[]});await p;
 f.api.clear();p=f.api.call('two','/catalog');assert.equal(f.calls.length,5);f.calls[4].resolve({users:[]});await p;
});
test('failed and obsolete in-flight reads never populate a later session cache',async()=>{
 const f=fixture();const obsolete=f.api.call('one','/catalog');f.api.clear();const fresh=f.api.call('one','/catalog');
 f.calls[1].resolve({version:2});await fresh;f.calls[0].resolve({version:1});await obsolete;assert.equal((await f.api.call('one','/catalog')).version,2);
 f.api.clear();const failed=f.api.call('one','/catalog');f.calls[2].reject(Error('denied'));await assert.rejects(failed,/denied/);
 const retry=f.api.call('one','/catalog');assert.equal(f.calls.length,4);f.calls[3].resolve({});await retry;
});
