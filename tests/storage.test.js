import test from 'node:test';
import assert from 'node:assert/strict';
import {storageFiles,storageHTML,fileSize} from '../public/storage.js';
test('storage filters and sorting preserve source list and project boundaries',()=>{
  const files=[{id:'a',project_id:'one',bytes:10,created_at:2},{id:'b',project_id:'two',bytes:100,created_at:1},{id:'c',project_id:'one',bytes:20,created_at:3}];
  assert.deepEqual(storageFiles(files,'one','size').map(v=>v.id),['c','a']);
  assert.deepEqual(storageFiles(files,'','oldest').map(v=>v.id),['b','a','c']);
  assert.deepEqual(files.map(v=>v.id),['a','b','c']);assert.equal(fileSize(1024),'1.0 KB');
});
test('storage view escapes uploaded file names and reports pending cleanup separately',()=>{
  const html=storageHTML({usage:{bytes:4096,capacity:8192,deletingBytes:1024},files:[{id:'x',project_id:'p',label:'<script>',file_name:'<img>',project_title:'"Project"',bytes:100,created_at:0}],projectId:'',sort:'size'});
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img&gt;'));assert.ok(html.includes('삭제 처리 중'));assert.ok(!html.includes('<script>'));
});
