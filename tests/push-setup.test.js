import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('login offers opt-in only when needed and guides iPhone installation',()=>{
  const source=fs.readFileSync(new URL('../public/push-setup.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replaceAll('export ','');
  const context={};vm.createContext(context);vm.runInContext(source,context);
  const mode=context.pushSetupMode,base={supported:true,ios:false,installed:true,permission:'default',subscribed:false};
  assert.equal(mode(base),'offer');assert.equal(mode({...base,permission:'granted',subscribed:true}),'connected');assert.equal(mode({...base,permission:'granted'}),'offer');assert.equal(mode({...base,ios:true,installed:false}),'install');assert.equal(mode({...base,permission:'denied'}),'blocked');assert.equal(mode({...base,supported:false}),'unsupported');
});
test('window API still runs with an active worker or a failing worker lookup',async()=>{
  const source=fs.readFileSync(new URL('../public/badges.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replaceAll('export ','');
  const calls=[],messages=[],events={};
  const context={APP_BASE:'https://example.test/mixroom/',navigator:{setAppBadge:async n=>calls.push(n),clearAppBadge:async()=>calls.push(0),serviceWorker:{addEventListener(){},getRegistration:async()=>({active:{postMessage:m=>messages.push(m)}})}},document:{visibilityState:'visible',addEventListener(){}},window:{addEventListener:(name,fn)=>events[name]=fn}};
  vm.createContext(context);vm.runInContext(source,context);
  await context.syncAppBadge(2,100,'client:a');assert.deepEqual(calls,[2]);assert.equal(messages.length,1);
  await context.syncAppBadge(9,90,'client:a');assert.deepEqual(calls,[2]);
  context.navigator.serviceWorker.getRegistration=async()=>{throw Error('worker unavailable')};await context.syncAppBadge(3,101,'client:a');assert.deepEqual(calls,[2,3]);
  await context.syncAppBadge(0,0,'',true);assert.equal(calls.at(-1),0);
});
