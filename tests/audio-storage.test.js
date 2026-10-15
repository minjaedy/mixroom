import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRange} from '../worker/audio-storage.js';

test('audio byte ranges cover bounded, open and suffix requests',()=>{
  assert.equal(parseRange(null,100),null);
  assert.deepEqual(parseRange('bytes=20-39',100),{offset:20,length:20});
  assert.deepEqual(parseRange('bytes=90-',100),{offset:90,length:10});
  assert.deepEqual(parseRange('bytes=-15',100),{offset:85,length:15});
  assert.deepEqual(parseRange('bytes=95-200',100),{offset:95,length:5});
  assert.deepEqual(parseRange('bytes=-200',100),{offset:0,length:100});
});
test('unsatisfiable or malformed audio ranges cannot produce invalid streams',()=>{
  for(const value of ['bytes=100-','bytes=40-20','bytes=-0','bytes=-','bytes=1-2,4-5','bytes=99999999999999999-'])assert.throws(()=>parseRange(value,100),{status:416});
});
