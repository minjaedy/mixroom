import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import wrangler from 'wrangler';
const {getPlatformProxy,unstable_splitSqlQuery:splitSqlQuery}=wrangler;
import {D1AudioStorage,AUDIO_CAPACITY,CHUNK} from '../worker/audio-storage.js';
import {expireRecords,RETENTION_MS} from '../worker/retention.js';
import worker from '../worker/index.js';
const proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:false,remoteBindings:false,envFiles:[]});
const env={...proxy.env,FIREBASE_ACCOUNT:undefined,VAPID_PUBLIC_KEY:undefined,VAPID_PRIVATE_KEY:undefined};
const q=(sql,...args)=>env.DB.prepare(sql).bind(...args);
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const now=Date.now(),pid=randomUUID(),storage=new D1AudioStorage(env);
let versionNumber=0;
async function upload(bytes,label,age=0){
  const key=pid+'/'+randomUUID(),u=await storage.createMultipartUpload(key,{customMetadata:{bytes:bytes.length}}),parts=[];
  for(let i=0;i<bytes.length;i+=CHUNK)parts.push(await storage.uploadPart(key,u.uploadId,parts.length+1,bytes.subarray(i,i+CHUNK)));
  await storage.complete(key,u.uploadId,parts);
  const id=randomUUID();await q('INSERT INTO versions(id,project_id,number,label,file_name,object_key,mime,bytes,duration,created_at,uploaded_by) VALUES(?,?,?,?,?,?,\'audio/wav\',?,1,?,\'client\')',id,pid,++versionNumber,label,label+'.wav',key,bytes.length,now-age).run();
  return {id,key,u,parts};
}
try{
  for(const file of (await fs.readdir('migrations')).sort())for(const sql of splitSqlQuery(await fs.readFile('migrations/'+file,'utf8')))await env.DB.prepare(sql).run();
  for(let i=1;i<=4;i++)for(const sql of splitSqlQuery(await fs.readFile('audio-migrations/0001_fragments.sql','utf8')))await env['AUDIO_DB_'+i].prepare(sql).run();
  await q('INSERT INTO projects(id,title,client_name,invite_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)',pid,'Disposable retention fixture','Test','none',now,now).run();
  const bytes=Buffer.alloc(CHUNK*4+7);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const fresh=await upload(bytes,'fresh'),expired=await upload(Buffer.from('expired original'),'old',RETENTION_MS+1),edge=await upload(Buffer.from('boundary'),'boundary',RETENTION_MS);
  const parts=await Promise.all([1,2,3,4].map(async i=>(await env['AUDIO_DB_'+i].prepare('SELECT data FROM audio_fragments WHERE object_key=?').bind(fresh.key).all()).results.reduce((n,r)=>n+Buffer.from(r.data,'base64').length,0)));
  check(Math.max(...parts)-Math.min(...parts)<=4&&parts.reduce((a,b)=>a+b,0)===bytes.length,'audio is evenly distributed across four databases');
  const downloaded=[];for(let offset=0;offset<bytes.length;offset+=CHUNK){const result=await storage.get(fresh.key,{range:new Headers({Range:`bytes=${offset}-${Math.min(bytes.length-1,offset+CHUNK-1)}`})});downloaded.push(Buffer.from(result.body));}
  check(Buffer.concat(downloaded).equals(bytes),'lossless reconstruction across every shard and chunk');
  const cross=await storage.get(fresh.key,{range:new Headers({Range:`bytes=${CHUNK-3}-${CHUNK+3}`})});check(Buffer.from(cross.body).equals(bytes.subarray(CHUNK-3,CHUNK+4)),'range crossing a chunk boundary preserves bytes');
  const retry=await storage.createMultipartUpload(pid+'/retry',{customMetadata:{bytes:5}});await storage.uploadPart(pid+'/retry',retry.uploadId,1,Buffer.from('hello'));await storage.uploadPart(pid+'/retry',retry.uploadId,1,Buffer.from('hello'));
  await assert.rejects(storage.uploadPart(pid+'/retry',retry.uploadId,1,Buffer.from('other')));check(true,'same-byte retry succeeds and different-byte retry is rejected');await storage.delete(pid+'/retry');
  const reservations=await Promise.allSettled(Array.from({length:6},(_,i)=>storage.createMultipartUpload(pid+'/reserve-'+i,{customMetadata:{bytes:200*1024*1024}})));
  const reserved=await q('SELECT SUM(expected_bytes) AS bytes FROM audio_objects').first();check(reservations.filter(r=>r.status==='fulfilled').length===5&&reserved.bytes<=AUDIO_CAPACITY,'concurrent uploads enforce one global 1 GiB capacity reservation');
  for(let i=0;i<6;i++)await storage.delete(pid+'/reserve-'+i);
  const legacyKey=pid+'/legacy',legacyBytes=Buffer.from('original legacy bytes'),legacyHash=createHash('sha256').update(legacyBytes).digest('hex');
  await q("INSERT INTO audio_objects(key,upload_id,project_id,expected_bytes,bytes,state,created_at) VALUES(?,?,?,?,?,'ready',?)",legacyKey,randomUUID(),pid,legacyBytes.length,legacyBytes.length,now).run();
  await q('INSERT INTO audio_chunks(object_key,part_number,etag,hash,bytes,data) VALUES(?,1,?,?,?,?)',legacyKey,legacyHash,legacyHash,legacyBytes.length,legacyBytes.toString('base64')).run();
  check(Buffer.from((await storage.get(legacyKey)).body).equals(legacyBytes),'existing legacy audio remains lossless without migration');
  const requestId=randomUUID();await q("INSERT INTO requests(id,project_id,version_id,start,end,text,status,resolved_version_id,created_at,updated_at) VALUES(?,?,?,0,1,'Keep request','resolved',?,?,?)",requestId,pid,fresh.id,expired.id,now,now).run();
  for(const [label,age,request] of [['old chat',RETENTION_MS+1,null],['old reply',RETENTION_MS+1,requestId],['edge',RETENTION_MS,null],['fresh chat',RETENTION_MS-10000,null]])await q('INSERT INTO messages(id,project_id,request_id,role,text,created_at,read_at) VALUES(?,?,?,\'engineer\',?,?,?)',randomUUID(),pid,request,label,now-age,now).run();
  const token='a'.repeat(48);await q('INSERT INTO sessions(hash,role,expires_at) VALUES(?,\'engineer\',?)',createHash('sha256').update(token).digest('hex'),now+86400000).run();
  const ctx={waitUntil:()=>{}};
  const api=path=>worker.fetch(new Request('http://localhost/api'+path,{headers:{Authorization:'Bearer '+token}}),env,ctx);
  const room=await (await api('/projects/'+pid)).json();check(room.versions.length===1&&room.messages.length===1,'API hides expired audio and messages before scheduled cleanup');
  check((await api('/projects/'+pid+'/versions/'+expired.id+'/audio')).status===410,'expired download is denied before scheduled cleanup');
  const result=await expireRecords(env,now);check(result.files===2&&result.messages===3,'scheduled expiry includes the exact 30-day boundary and request replies');
  check((await q('SELECT text FROM messages').all()).results[0].text==='fresh chat','reading or replying does not extend old message retention');
  const request=await q('SELECT * FROM requests WHERE id=?',requestId).first();check(request.text==='Keep request'&&request.status==='open'&&request.resolved_version_id===null,'request text survives audio expiry and invalid resolved link is cleared');
  for(let i=0;i<4;i++)await storage.cleanup();
  check(!await storage.head(expired.key)&&!!await storage.head(fresh.key),'cleanup releases expired audio while keeping younger audio');
  for(let i=1;i<=4;i++)check((await env['AUDIO_DB_'+i].prepare('SELECT COUNT(*) AS n FROM audio_fragments WHERE object_key IN (?,?)').bind(expired.key,edge.key).first()).n===0,'expired fragments removed from shard '+i);
  const late=env.AUDIO_DB_1.prepare("INSERT INTO audio_fragments(object_key,part_number,hash,data) SELECT ?,1,'late','' WHERE NOT EXISTS(SELECT 1 FROM audio_tombstones WHERE object_key=?)").bind(expired.key,expired.key);check((await late.run()).meta.changes===0,'deletion tombstone blocks a delayed fragment from resurrecting data');
  check((await expireRecords(env,now)).files===0,'repeated scheduled retention is idempotent');
  // Tiny rows exercise multi-pass cleanup without allocating a large test recording.
  const queued=await upload(Buffer.from('queued'),'queued',RETENTION_MS+10);
  for(let i=2;i<=130;i++){
    await q("INSERT INTO audio_chunks(object_key,part_number,etag,hash,bytes,data) VALUES(?,?,'fixture','fixture',1,'')",queued.key,i).run();
    for(let shard=1;shard<=4;shard++)await env['AUDIO_DB_'+shard].prepare("INSERT INTO audio_fragments(object_key,part_number,hash,data) VALUES(?,?,'fixture','eA==')").bind(queued.key,i).run();
  }
  let queryCount=0;const raw=new WeakMap();
  function counted(db){
    const wrap=statement=>{const proxy=new Proxy(statement,{get(target,key){if(key==='bind')return (...args)=>wrap(target.bind(...args));if(['first','all','run','raw'].includes(key))return (...args)=>{queryCount++;return target[key](...args);};return target[key];}});raw.set(proxy,statement);return proxy;};
    return {prepare:sql=>wrap(db.prepare(sql)),batch:statements=>{queryCount+=statements.length;return db.batch(statements.map(s=>raw.get(s)||s));}};
  }
  const bounded={...env,DB:counted(env.DB)};for(let i=1;i<=4;i++)bounded['AUDIO_DB_'+i]=counted(env['AUDIO_DB_'+i]);
  for(let pass=0;pass<3;pass++){
    queryCount=0;const work=[];await worker.scheduled({cron:'*/2 * * * *'},bounded,{waitUntil:promise=>work.push(promise)});await Promise.all(work);
    check(queryCount<=50,'scheduled cleanup stays within the free query budget, pass '+(pass+1)+' ('+queryCount+' queries)');
    if(pass===0)check(!!await q('SELECT key FROM audio_objects WHERE key=?',queued.key).first(),'pending physical deletion keeps capacity reserved');
  }
  check(!await q('SELECT key FROM audio_objects WHERE key=?',queued.key).first(),'multi-pass deletion finishes and releases the object');
  for(let i=1;i<=4;i++)assert.equal((await env['AUDIO_DB_'+i].prepare('SELECT COUNT(*) AS n FROM audio_fragments WHERE object_key=?').bind(queued.key).first()).n,0);
  console.log(`${checks} isolated storage and retention checks passed.`);
}finally{await proxy.dispose();}
