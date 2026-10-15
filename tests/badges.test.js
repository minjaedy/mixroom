import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const scope={self:{}};vm.runInNewContext(fs.readFileSync(new URL('../public/badge-core.js',import.meta.url),'utf8'),scope);
const next=scope.self.MixroomBadge.nextState;

test('badge applies an exact count then clears, with unsupported browser fallback',async()=>{
  const calls=[],context={self:{},navigator:{setAppBadge:async n=>calls.push(n),clearAppBadge:async()=>calls.push('clear')}};
  vm.runInNewContext(fs.readFileSync(new URL('../public/badge-core.js',import.meta.url),'utf8'),context);
  await context.self.MixroomBadge.update({count:121,at:1,recipient:'engineer'},'page');
  await context.self.MixroomBadge.update({count:0,at:2,recipient:'engineer'},'page');
  await context.self.MixroomBadge.update({count:121,at:1,recipient:'engineer'},'push');
  await context.self.MixroomBadge.update(null,'reset');
  assert.deepEqual(calls,[121,'clear','clear']);
  context.navigator={};await context.self.MixroomBadge.update({count:1,at:3,recipient:'engineer'},'page');
});
test('app badge keeps exact unread count and rejects stale delayed pushes',()=>{
  const state=next(null,{count:120,at:100,recipient:'engineer'},'push');assert.equal(state.count,120);
  const cleared=next(state,{count:0,at:110,recipient:'engineer'},'page');assert.equal(cleared.count,0);
  assert.equal(next(cleared,{count:120,at:100,recipient:'engineer'},'push'),null);
});
test('badge reset prevents old account pushes until the next login snapshot',()=>{
  const reset=next(null,null,'reset');assert.equal(reset.blocked,true);
  assert.equal(next(reset,{count:5,at:120,recipient:'engineer'},'push'),null);
  const client=next(reset,{count:2,at:130,recipient:'client:p'},'page');assert.equal(client.count,2);
  assert.equal(next(client,{count:5,at:140,recipient:'engineer'},'push'),null);
  assert.equal(next(client,{count:-1,at:140,recipient:'client:p'},'push'),null);
  assert.equal(next(client,undefined,'push'),null);
});
