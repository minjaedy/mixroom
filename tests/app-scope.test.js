import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const base='https://minjaedy.github.io/mixroom/';
function fixture(){
  const handlers={},notices=[],opened=[],navigated=[],clients=[];
  const self={location:{href:base+'sw.js',origin:new URL(base).origin},registration:{showNotification:async(title,options)=>notices.push(options)},MixroomBadge:{update:async()=>{}},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url),claim:async()=>{}},skipWaiting(){},addEventListener:(name,fn)=>handlers[name]=fn};
  vm.runInNewContext(source,{self,URL,Response,importScripts(){},fetch:async()=>new Response('ok')});
  async function fire(name,extra){const work=[];handlers[name]({...extra,waitUntil:p=>work.push(p)});await Promise.all(work);}
  return {notices,opened,navigated,clients,handlers,fire};
}
test('notification URLs cannot open sibling apps on the same origin',async()=>{
  const f=fixture();
  for(const url of ['https://minjaedy.github.io/dydy/','https://minjaedy.github.io/cale/','https://minjaedy.github.io/mixroom-other/','https://example.com/mixroom/','http://[']){
    await f.fire('push',{data:{json:()=>({url})}});assert.equal(f.notices.at(-1).data.url,base);
    await f.fire('notificationclick',{notification:{data:{url},close(){}}});assert.equal(f.opened.length,0);
  }
  f.clients.push({url:'https://minjaedy.github.io/dydy/',navigate:async()=>{throw Error('must not reuse sibling app')}});
  await f.fire('notificationclick',{notification:{data:{url:base+'#project'},close(){}}});assert.deepEqual(f.opened,[base+'#project']);
  f.clients.push({url:base,navigate:async url=>f.navigated.push(url),focus:async()=>{}});
  await f.fire('notificationclick',{notification:{data:{url:base+'#chat'},close(){}}});assert.deepEqual(f.navigated,[base+'#chat']);
});
test('offline navigation fallback only handles this app scope',async()=>{
  const f=fixture();let handled=0;
  for(const url of ['https://minjaedy.github.io/dydy/','https://minjaedy.github.io/cale/'])f.handlers.fetch({request:{mode:'navigate',url},respondWith(){handled++;}});
  assert.equal(handled,0);
  let response;f.handlers.fetch({request:{mode:'navigate',url:base},respondWith(p){response=p;handled++;}});
  assert.equal(handled,1);assert.equal((await response).status,200);
});
