import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness({gate=null,fail=false,unsupported=false}={}){
  const handlers={},badges=[],shown=[],opened=[];
  const nav=unsupported?{}:{setAppBadge:async n=>badges.push(n),clearAppBadge:async()=>badges.push(0)};
  const self={location:{href:'https://minjaedy.github.io/mixroom/sw.js'},
    registration:{async showNotification(title,options){if(gate)await gate;if(fail)throw Error('notification unavailable');shown.push({title,...options});}},
    clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url),claim:async()=>{}},
    skipWaiting(){},addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const context={self,navigator:nav,URL,Response};vm.createContext(context);
  context.importScripts=()=>vm.runInContext(fs.readFileSync(new URL('../public/badge-core.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
  function push(badge){let work;handlers.push({data:{json:()=>({body:'test',badge,url:'https://minjaedy.github.io/mixroom/?notification=test'})},waitUntil:p=>{work=p;}});return work;}
  return {push,badges,shown,opened};
}

test('closed-window push applies badge after notification completes, without opening a page',async()=>{
  let finish;const gate=new Promise(resolve=>{finish=resolve});const h=harness({gate});
  const pending=h.push({recipient:'client:a',count:7,at:10});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.badges,[]);
  finish();await pending;assert.deepEqual(h.badges,[7]);assert.equal(h.shown.length,1);assert.deepEqual(h.opened,[]);
  await h.push({recipient:'client:a',count:3,at:9});assert.deepEqual(h.badges,[7]);
  await h.push({recipient:'client:b',count:9,at:11});assert.deepEqual(h.badges,[7]);
});

test('notification and badge failures do not prevent the other operation',async()=>{
  const failed=harness({fail:true});
  await assert.rejects(failed.push({recipient:'client:a',count:2,at:10}),/notification unavailable/);
  assert.deepEqual(failed.badges,[2]);
  const unsupported=harness({unsupported:true});await unsupported.push({recipient:'client:a',count:2,at:10});assert.equal(unsupported.shown.length,1);
});
