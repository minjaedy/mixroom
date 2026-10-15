import test from 'node:test';import assert from 'node:assert/strict';
import {comparisonSelection} from '../public/comparison.js';
test('original recordings do not manufacture a revision or comparison',()=>{
  assert.deepEqual(comparisonSelection([{id:'original',uploaded_by:'client'}]),{compare:false,a:'original',b:'original'});
  assert.deepEqual(comparisonSelection([{id:'new',uploaded_by:'client'},{id:'old',uploaded_by:'client'}]),{compare:false,a:'new',b:'new'});
  assert.deepEqual(comparisonSelection([]),{compare:false,a:undefined,b:undefined});
});
test('comparison becomes available only with a real engineer version and another file',()=>{
  assert.deepEqual(comparisonSelection([{id:'mix',uploaded_by:'engineer'},{id:'source',uploaded_by:'client'}]),{compare:true,a:'source',b:'mix'});
  assert.deepEqual(comparisonSelection([{id:'mix'}]),{compare:false,a:'mix',b:'mix'});
});
