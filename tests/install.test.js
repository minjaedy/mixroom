import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/install.js',import.meta.url),'utf8');
function fixture(standalone=false){
  const events={},documentEvents={},button={},routes=[],mode={matches:standalone,addEventListener(){}};
  const scope={URL,navigator:{userAgent:'Chrome',platform:'Win32'},location:{assign:url=>routes.push(url)},matchMedia:()=>mode,MutationObserver:class{observe(){}},window:{addEventListener:(name,fn)=>events[name]=fn},document:{currentScript:{src:'https://minjaedy.github.io/mixroom/install.js?v=test'},querySelectorAll:()=>[button],addEventListener:(name,fn)=>documentEvents[name]=fn}};
  vm.runInNewContext(source,scope);documentEvents.DOMContentLoaded();
  const click=()=>documentEvents.click({target:{closest:()=>button}});
  return {events,button,routes,click};
}
test('install opens the captured prompt once and hides after installation',async()=>{
  const f=fixture();let prompts=0,prevented=0;
  f.events.beforeinstallprompt({preventDefault:()=>prevented++,prompt:async()=>prompts++,userChoice:Promise.resolve({outcome:'accepted'})});
  f.click();f.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(prompts,1);assert.equal(prevented,1);assert.equal(f.button.disabled,false);
  f.events.appinstalled();assert.equal(f.button.hidden,true);f.click();assert.equal(f.routes.length,0);
});
test('non-installable browsers reach the guide and standalone apps hide the button',()=>{
  const f=fixture();f.click();assert.deepEqual(f.routes,['https://minjaedy.github.io/mixroom/guide.html#guide-install-desktop']);
  const app=fixture(true);assert.equal(app.button.hidden,true);app.click();assert.equal(app.routes.length,0);
});
test('dismissed install prompt is consumed and a new browser offer can be used',async()=>{
  const f=fixture();let prompts=0;
  const offer=()=>f.events.beforeinstallprompt({preventDefault(){},prompt:async()=>prompts++,userChoice:Promise.resolve({outcome:'dismissed'})});
  offer();f.click();await new Promise(resolve=>setImmediate(resolve));f.click();assert.equal(f.routes.length,1);
  offer();f.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(prompts,2);
});
