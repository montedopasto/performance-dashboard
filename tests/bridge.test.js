import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const state='123e4567-e89b-42d3-a456-426614174000'.repeat(2);
function bridge(referrer,opener=true){
 const elements={continue:{},status:{}},messages=[];
 const ctx=vm.createContext({URL,location:{href:'https://montedopasto.github.io/performance-dashboard/microsoft-local-bridge.html?state='+state},document:{referrer,getElementById:id=>elements[id]},window:{opener:opener?{postMessage:(data,origin)=>messages.push({data,origin})}:null},CONFIG:{localPortalOrigin:'https://n-example-0lu-script.googleusercontent.com'},msal:{PublicClientApplication:class{async loginPopup(){return {account:{}};}async acquireTokenSilent(){return {accessToken:'test-token'};}}}});
 vm.runInContext(fs.readFileSync('microsoft-local-bridge.js','utf8'),ctx);return {elements,messages};
}
test('Microsoft bridge sends credentials only to an allowed Google origin with the matching challenge',async()=>{
 const b=bridge('https://n-example-0lu-script.googleusercontent.com/userCodeAppPanel');await b.elements.continue.onclick();assert.equal(b.messages.length,1);assert.equal(b.messages[0].origin,'https://n-example-0lu-script.googleusercontent.com');assert.equal(b.messages[0].data.state,state);assert.equal(b.messages[0].data.token,'test-token');
 for(const origin of ['https://attacker.example/','https://script.google.com.attacker.example/','https://script.google.com/','https://other-script.googleusercontent.com/','']){const denied=bridge(origin);await denied.elements.continue.onclick();assert.equal(denied.messages.length,0);}
 const noOpener=bridge('https://n-example-0lu-script.googleusercontent.com/',false);await noOpener.elements.continue.onclick();assert.equal(noOpener.messages.length,0);
});
test('Google portal client script has valid JavaScript syntax',()=>{
 const html=fs.readFileSync('google-local/Portal.html','utf8');const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(code));
});

test('Company portal client script has valid JavaScript syntax',()=>{const html=fs.readFileSync('google-local/Performance.html','utf8');assert.doesNotThrow(()=>new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]));});
