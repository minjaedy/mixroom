import test from 'node:test';import assert from 'node:assert/strict';
import {updateCoordinator} from '../public/updates.js';
test('updates wait for work to finish and for matching HTML to become available',async()=>{
  let busy=true,published=false,reloads=0,notices=0;
  const update=updateCoordinator({current:'old',latest:async()=>'new',ready:async()=>published?'new-url':null,isBusy:()=>busy,reload:()=>reloads++,onPending:()=>notices++});
  await update.check();await update.check();await update.apply();assert.equal(reloads,0);assert.equal(notices,1);
  busy=false;await update.apply();assert.equal(reloads,0);
  published=true;await update.apply();await update.apply();assert.equal(reloads,1);
});
test('work begun during publication checks prevents reload; network failures keep the app open',async()=>{
  let busy=false,reloads=0,fail=false;
  const update=updateCoordinator({current:'old',latest:async()=>{if(fail)throw Error('offline');return 'new';},ready:async()=>{busy=true;return 'new-url';},isBusy:()=>busy,reload:()=>reloads++});
  await update.check();await update.apply();assert.equal(reloads,0);fail=true;await update.check();assert.equal(reloads,0);
});
