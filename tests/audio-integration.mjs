import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const origin='http://127.0.0.1:8795',chunkSize=512*1024;
const credentials=JSON.parse(await fs.readFile('.local/test-credentials.json','utf8'));
const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'engineer',password:credentials.password})});
const cookie=login.headers.get('set-cookie').split(';')[0];
async function call(path,body,method=body?'POST':'GET'){
  const r=await fetch(origin+'/api'+path,{method,headers:{Cookie:cookie,Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;
}
const before=await call('/storage'),title='Audio boundary test '+Date.now(),p=await call('/projects',{title,client:'Disposable test'}),base='/projects/'+p.id;
try{
  const bytes=Buffer.alloc(chunkSize+1000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const u=await call(base+'/uploads',{fileName:'boundary.wav',bytes:bytes.length,duration:90,label:'Boundary fixture'}),parts=[];
  assert.equal((await call('/storage')).bytes,before.bytes+bytes.length,'capacity reserves pending uploads');
  for(let i=0;i<2;i++){
    const r=await fetch(origin+'/api'+base+'/uploads/'+u.id+'/'+(i+1),{method:'PUT',headers:{Cookie:cookie,Origin:origin},body:bytes.subarray(i*chunkSize,(i+1)*chunkSize)});
    assert.equal(r.status,200);parts.push(await r.json());
  }
  const retry=await fetch(origin+'/api'+base+'/uploads/'+u.id+'/1',{method:'PUT',headers:{Cookie:cookie,Origin:origin},body:bytes.subarray(0,chunkSize)});
  assert.equal((await retry.json()).etag,parts[0].etag,'same chunk retry is idempotent');
  const v=await call(base+'/uploads/'+u.id+'/complete',{parts}),audio=origin+'/api'+base+'/versions/'+v.id+'/audio';
  const cross=await fetch(audio,{headers:{Cookie:cookie,Range:'bytes='+(chunkSize-20)+'-'+(chunkSize+19)}});
  assert.equal(cross.status,206);assert.deepEqual(Buffer.from(await cross.arrayBuffer()),bytes.subarray(chunkSize-20,chunkSize+20),'range crosses chunk boundary without corruption');
  const suffix=await fetch(audio,{headers:{Cookie:cookie,Range:'bytes=-500'}});assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),bytes.subarray(bytes.length-500));
  const full=await fetch(audio,{headers:{Cookie:cookie}});const downloaded=Buffer.from(await full.arrayBuffer());assert.deepEqual(downloaded,bytes,'full audio streams all chunks');assert.equal(createHash('sha256').update(downloaded).digest('hex'),createHash('sha256').update(bytes).digest('hex'),'original and download SHA-256 match');assert.equal(full.headers.get('X-Content-SHA256'),createHash('sha256').update(bytes).digest('hex'));
  const invalid=await fetch(audio,{headers:{Cookie:cookie,Range:'bytes='+bytes.length+'-'}});assert.equal(invalid.status,416);
  const incomplete=await call(base+'/uploads',{fileName:'abort.wav',bytes:100,duration:1,label:'Abort fixture'});
  await fetch(origin+'/api'+base+'/uploads/'+incomplete.id+'/1',{method:'PUT',headers:{Cookie:cookie,Origin:origin},body:Buffer.alloc(100)});
  await call(base+'/uploads/'+incomplete.id,{},'DELETE');
  assert.equal((await call('/storage')).bytes,before.bytes+bytes.length,'aborted upload releases reservation');
  const request=await call(base+'/messages',{text:'Keep this chat after deleting a file'});
  await call(base+'/versions/'+v.id,{},'DELETE');
  assert.equal((await call('/storage')).bytes,before.bytes,'individual file deletion releases capacity');
  assert.equal((await fetch(audio,{headers:{Cookie:cookie}})).status,404,'deleted file is no longer downloadable');
  const room=await call(base);assert.equal(room.versions.length,0);assert.equal(room.messages.length,1,'deleting audio preserves chat');
  console.log('PASS original byte identity, SHA-256, capacity, chunk retry, Range, abort and individual deletion');
}finally{
  await call(base+'/close',{confirm:title,keepAudio:false});await fetch(origin+'/cdn-cgi/local/scheduled');
}
assert.equal((await call('/storage')).bytes,before.bytes,'closure releases every stored chunk');
console.log('PASS customer removal deletes audio manifests and releases storage');
