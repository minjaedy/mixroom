import {uid,hash,token,passwordHash,equal,validSubscription,validRange,cleanText,principal,transitionAllowed} from './security.js';
import {notificationStatements,deliver} from './push.js';
import {withAudioStorage,AUDIO_CAPACITY,CHUNK} from './audio-storage.js';
import {firebaseSession,signalStatement,flushSignals} from './firebase.js';
const q=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
function fail(message,status=400){throw Object.assign(Error(message),{status});}
const requireEngineer=s=>{if(s.role!=='engineer')fail('엔지니어만 사용할 수 있어요.',403);};
async function body(request){if(Number(request.headers.get('Content-Length'))>100000)fail('입력 내용이 너무 길어요.',413);const raw=await request.text();if(raw.length>100000)fail('입력 내용이 너무 길어요.',413);try{return JSON.parse(raw);}catch{fail('입력 내용을 확인해 주세요.');}}
async function session(env,request){const value=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1]||request.headers.get('Cookie')?.match(/(?:^|;\s*)mixroom=([a-f0-9]{48})/)?.[1];if(!value)return null;const s=await q(env,'SELECT * FROM sessions WHERE hash=? AND expires_at>?',await hash(value),Date.now()).first();if(s?.role==='client'){const p=await q(env,'SELECT status,invite_epoch FROM projects WHERE id=?',s.project_id).first();if(!p||['archived','deleting'].includes(p.status)||p.invite_epoch!==s.epoch)return null;}return s;}
async function createSession(env,request,role,project=null){const t=token();await q(env,'INSERT INTO sessions(hash,role,project_id,epoch,expires_at) VALUES(?,?,?,?,?)',await hash(t),role,project?.id||null,project?.invite_epoch||null,Date.now()+30*86400000).run();return json({ok:true,role,token:t},200,{'Set-Cookie':`mixroom=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${new URL(request.url).protocol==='https:'?'; Secure':''}`});}
async function limited(env,request,key,max=12){const now=Date.now(),id=await hash((request.headers.get('CF-Connecting-IP')||'local')+':'+key+':'+Math.floor(now/900000));const r=await q(env,'INSERT INTO rate_limits(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts',id,now+900000).first();if(r.attempts>max)fail('시도가 많아요. 15분 뒤 다시 시도해 주세요.',429);}
async function project(env,s,id,write=false){if(s.role==='client'&&s.project_id!==id)fail('프로젝트에 접근할 수 없어요.',403);const p=await q(env,'SELECT * FROM projects WHERE id=?',id).first();if(!p||p.status==='deleting')fail('프로젝트를 찾을 수 없어요.',404);if(write&&p.status!=='active')fail('완료된 프로젝트예요. 엔지니어가 다시 열 수 있어요.',409);return p;}
const publicProject=({invite_hash,...p})=>p;
async function notifyBatch(env,ctx,origin,statements,p,recipient,type,title,target){const n=await notificationStatements(env,p.id,recipient,type,title,target);await env.DB.batch([...statements,...n,q(env,'UPDATE projects SET updated_at=? WHERE id=?',Date.now(),p.id)]);ctx.waitUntil(deliver(env,origin));}
async function removeAudio(env,id){let cursor;do{const list=await env.AUDIO.list({prefix:id+'/',cursor});if(list.objects.length)await env.AUDIO.delete(list.objects.map(x=>x.key));cursor=list.truncated?list.cursor:undefined;}while(cursor);}
async function maintenance(env,origin){
  await env.AUDIO.cleanup?.();
  const expired=(await q(env,'SELECT * FROM uploads WHERE created_at<? LIMIT 1',Date.now()-86400000).all()).results;
  for(const u of expired){try{await env.AUDIO.resumeMultipartUpload(u.object_key,u.upload_id).abort();}catch{}if(!await q(env,'SELECT id FROM versions WHERE object_key=?',u.object_key).first())await env.AUDIO.delete(u.object_key);await q(env,'DELETE FROM uploads WHERE id=?',u.id).run();}
  const pending=(await q(env,"SELECT id FROM projects WHERE purge_audio=1").all()).results;
  for(const p of pending.slice(0,1)){const files=(await env.AUDIO.list({prefix:p.id+'/'})).objects.slice(0,1);for(const f of files)await env.AUDIO.delete(f.key);if(!(await env.AUDIO.list({prefix:p.id+'/'})).objects.length)await env.DB.batch([q(env,'DELETE FROM versions WHERE project_id=?',p.id),q(env,"UPDATE projects SET purge_audio=0 WHERE id=?",p.id)]);}
  await env.DB.batch([q(env,'DELETE FROM sessions WHERE expires_at<?',Date.now()),q(env,'DELETE FROM rate_limits WHERE expires_at<?',Date.now()),q(env,'DELETE FROM notifications WHERE created_at<?',Date.now()-90*86400000)]);await deliver(env,origin);await flushSignals(env);
}
async function api(request,env,ctx){
  const url=new URL(request.url),path=url.pathname,method=request.method,origin=env.APP_URL||url.origin;
  if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')&&![url.origin,env.APP_ORIGIN].includes(request.headers.get('Origin')))fail('다른 사이트의 요청은 허용되지 않아요.',403);
  if(path==='/api/storage'&&method==='GET'){const user=await session(env,request);if(!user)fail('접속해 주세요.',401);requireEngineer(user);const usage=await q(env,'SELECT COALESCE(SUM(expected_bytes),0) AS bytes FROM audio_objects').first();return json({bytes:usage.bytes,capacity:AUDIO_CAPACITY});}
  if(path==='/api/config')return json({setup:!(await q(env,'SELECT id FROM engineers LIMIT 1').first()),push:!!env.VAPID_PUBLIC_KEY,publicKey:env.VAPID_PUBLIC_KEY||null});
  if(path==='/api/setup'&&method==='POST'){
    await limited(env,request,'setup',6);const b=await body(request);if(!env.SETUP_CODE_HASH||!equal(await hash(String(b.code||'')),env.SETUP_CODE_HASH))fail('초기 설정 코드를 확인해 주세요.',403);
    if(await q(env,'SELECT id FROM engineers LIMIT 1').first())fail('관리자가 이미 등록되어 있어요.',409);
    const name=cleanText(b.name,40),password=String(b.password||'');if(!name||password.length<12||password.length>128)fail('이름과 12자 이상 비밀번호를 입력해 주세요.');const salt=token();
    try{await q(env,"INSERT INTO engineers(id,name,salt,password_hash,created_at) VALUES('owner',?,?,?,?)",name,salt,await passwordHash(password,salt),Date.now()).run();}catch{fail('관리자가 이미 등록되어 있어요.',409);}return createSession(env,request,'engineer');
  }
  if(path==='/api/login'&&method==='POST'){
    await limited(env,request,'login');const b=await body(request);
    if(b.role==='engineer'){const a=await q(env,"SELECT * FROM engineers WHERE id='owner'").first();if(!a||typeof b.password!=='string'||b.password.length>128||!equal(await passwordHash(b.password,a.salt),a.password_hash))fail('비밀번호를 확인해 주세요.',403);return createSession(env,request,'engineer');}
    const code=String(b.code||'').replace(/[\s-]/g,'').toLowerCase();const p=await q(env,"SELECT * FROM projects WHERE invite_hash=? AND status IN ('active','completed')",await hash(code)).first();if(!p)fail('접속 코드가 만료되었거나 올바르지 않아요.',403);return createSession(env,request,'client',p);
  }
  const s=await session(env,request);if(!s)fail('다시 접속해 주세요.',401);
  if(path==='/api/firebase'&&method==='GET')return json(await firebaseSession(env,s));
  if(!['GET','HEAD','PUT'].includes(method))await limited(env,request,'write:'+principal(s),180);
  if(path==='/api/logout'&&method==='POST'){await q(env,'DELETE FROM sessions WHERE hash=?',s.hash).run();return json({ok:true},200,{'Set-Cookie':'mixroom=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(path==='/api/me')return json({role:s.role,name:s.role==='engineer'?(await q(env,"SELECT name FROM engineers WHERE id='owner'").first()).name:(await project(env,s,s.project_id)).client_name,projectId:s.project_id});
  if(path==='/api/projects'&&method==='GET'){const rows=(await (s.role==='engineer'?q(env,"SELECT * FROM projects WHERE status!='deleting' ORDER BY updated_at DESC"):q(env,'SELECT * FROM projects WHERE id=?',s.project_id)).all()).results;return json({projects:rows.map(publicProject)});}
  if(path==='/api/projects'&&method==='POST'){
    requireEngineer(s);const b=await body(request),title=cleanText(b.title,100),client=cleanText(b.client,60);if(!title||!client)fail('프로젝트 이름과 고객 표시 이름을 입력해 주세요.');const id=uid(),code=token().slice(0,32),now=Date.now();await q(env,'INSERT INTO projects(id,title,client_name,description,invite_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,title,client,cleanText(b.description,1000),await hash(code),now,now).run();return json({id,code:code.match(/.{1,4}/g).join('-')},201);
  }
  if(path==='/api/notifications'&&method==='GET'){
    const [notes,counts]=await env.DB.batch([
      q(env,'SELECT n.*,p.title AS project_title FROM notifications n JOIN projects p ON p.id=n.project_id WHERE recipient=? ORDER BY (read_at IS NULL) DESC,created_at DESC LIMIT 100',principal(s)),
      q(env,"SELECT COUNT(*) AS total,COALESCE(SUM(type='message' AND target_id IS NULL),0) AS chat,COALESCE(SUM(type IN ('request','version','status') OR (type='message' AND target_id IS NOT NULL)),0) AS projects FROM notifications WHERE recipient=? AND read_at IS NULL",principal(s))
    ]);
    return json({notifications:notes.results,unread:counts.results[0]});
  }
  if(path==='/api/notifications/read'&&method==='POST'){
    const b=await body(request),recipient=principal(s),now=Date.now();
    if(b.id!==undefined){
      if(typeof b.id!=='string')fail('알림을 확인해 주세요.');
      if(!await q(env,'SELECT id FROM notifications WHERE id=? AND recipient=?',b.id,recipient).first())fail('알림을 찾을 수 없어요.',404);
      await q(env,'UPDATE notifications SET read_at=? WHERE id=? AND recipient=? AND read_at IS NULL',now,b.id,recipient).run();
    }else if(b.projectId!==undefined){
      if(typeof b.projectId!=='string'||b.kind!=='chat'||!Number.isSafeInteger(b.through)||b.through<0||b.through>now)fail('읽은 범위를 확인해 주세요.');
      await project(env,s,b.projectId);
      await q(env,"UPDATE notifications SET read_at=? WHERE recipient=? AND project_id=? AND type='message' AND target_id IS NULL AND created_at<=? AND read_at IS NULL",now,recipient,b.projectId,b.through).run();
    }else if(b.all===true){await q(env,'UPDATE notifications SET read_at=? WHERE recipient=? AND read_at IS NULL',now,recipient).run();}
    else fail('읽을 알림을 선택해 주세요.');
    return json({ok:true});
  }
  const notificationMatch=path.match(/^\/api\/notifications\/([a-f0-9-]{36})$/);
  if(notificationMatch&&method==='GET'){
    const notification=await q(env,'SELECT n.*,p.title AS project_title FROM notifications n JOIN projects p ON p.id=n.project_id WHERE n.id=? AND recipient=?',notificationMatch[1],principal(s)).first();
    if(!notification)fail('알림이 삭제되었거나 접근할 수 없어요.',404);
    return json({notification});
  }
  if(path==='/api/subscription'&&method==='POST'){const b=await body(request);if(!validSubscription(b))fail('지원하는 기기에서 알림을 연결해 주세요.');const id=await hash(b.endpoint);await q(env,'INSERT INTO subscriptions(id,recipient,subscription,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET recipient=excluded.recipient,subscription=excluded.subscription',id,principal(s),JSON.stringify({endpoint:b.endpoint,keys:b.keys}),Date.now()).run();return json({ok:true});}
  if(path==='/api/subscription'&&method==='DELETE'){const b=await body(request);await q(env,'DELETE FROM subscriptions WHERE id=? AND recipient=?',await hash(String(b.endpoint)),principal(s)).run();return json({ok:true});}
  if(path==='/api/push-test'&&method==='POST'){const b=await body(request),p=await project(env,s,b.projectId);const statements=await notificationStatements(env,p.id,principal(s),'test','알림 연결이 완료되었어요.');await env.DB.batch(statements);ctx.waitUntil(deliver(env,origin));return json({ok:true});}
  const match=path.match(/^\/api\/projects\/([a-f0-9-]{36})(?:\/(.*))?$/);if(!match)fail('요청을 찾을 수 없어요.',404);const [,id,action='']=match,p=await project(env,s,id);
  if(!action&&method==='GET'){const notificationCutoff=Date.now();const [versions,requests,messages]=await Promise.all(['SELECT * FROM versions WHERE project_id=? AND deleted_at IS NULL ORDER BY number DESC','SELECT * FROM requests WHERE project_id=? ORDER BY created_at DESC','SELECT * FROM messages WHERE project_id=? ORDER BY created_at DESC LIMIT 300'].map(sql=>q(env,sql,id).all()));return json({notificationCutoff,project:publicProject(p),versions:versions.results.map(({object_key,...v})=>v),requests:requests.results,messages:messages.results.reverse()});}
  if(action==='invite'&&method==='POST'){requireEngineer(s);if(p.status!=='active')fail('진행 중인 프로젝트에서 발급할 수 있어요.',409);const code=token().slice(0,32);await env.DB.batch([q(env,'UPDATE projects SET invite_hash=?,invite_epoch=invite_epoch+1 WHERE id=?',await hash(code),id),q(env,'DELETE FROM sessions WHERE project_id=?',id),q(env,'DELETE FROM subscriptions WHERE recipient=?','client:'+id)]);return json({code:code.match(/.{1,4}/g).join('-')});}
  if(action==='status'&&method==='POST'){requireEngineer(s);const b=await body(request);if(!['active','completed'].includes(b.status)||!['active','completed'].includes(p.status))fail('프로젝트 상태를 확인해 주세요.');await notifyBatch(env,ctx,origin,[q(env,'UPDATE projects SET status=? WHERE id=?',b.status,id)],p,'client:'+id,'status',b.status==='completed'?'작업이 완료되었어요. 최종본을 확인해 주세요.':'프로젝트가 다시 열렸어요.');return json({ok:true});}
  if(action==='close'&&method==='POST'){
    requireEngineer(s);const b=await body(request);if(b.confirm!==p.title)fail('확인을 위해 프로젝트 이름을 그대로 입력해 주세요.');
    await env.DB.batch([q(env,"UPDATE projects SET title='종료된 프로젝트',client_name='',description='',invite_hash='',invite_epoch=invite_epoch+1,status='archived',purge_audio=1,updated_at=? WHERE id=?",Date.now(),id),q(env,'DELETE FROM sessions WHERE project_id=?',id),q(env,'DELETE FROM subscriptions WHERE recipient=?','client:'+id),q(env,'DELETE FROM notifications WHERE project_id=?',id),q(env,'DELETE FROM messages WHERE project_id=?',id),q(env,'DELETE FROM requests WHERE project_id=?',id),q(env,'DELETE FROM uploads WHERE project_id=?',id),signalStatement(env,'engineer'),signalStatement(env,id,true)]);
    ctx.waitUntil(maintenance(env,origin));return json({ok:true,audioDeletionPending:true});
  }
  const deletion=action.match(/^versions\/([a-f0-9-]{36})$/);
  if(deletion&&method==='DELETE'){
    requireEngineer(s);const v=await q(env,'SELECT * FROM versions WHERE id=? AND project_id=?',deletion[1],id).first();if(!v)fail('음원을 찾을 수 없어요.',404);
    await env.DB.batch([q(env,"UPDATE versions SET deleted_at=?,file_name='',label='삭제된 버전',note='',bytes=0 WHERE id=?",Date.now(),v.id),q(env,"UPDATE audio_objects SET state='deleting' WHERE key=?",v.object_key),q(env,"UPDATE requests SET resolved_version_id=NULL,status=CASE WHEN status IN ('resolved','confirmed') THEN 'open' ELSE status END WHERE project_id=? AND resolved_version_id=?",id,v.id),q(env,"DELETE FROM notifications WHERE project_id=? AND type='version' AND target_id=?",id,v.id)]);
    try{await env.AUDIO.delete(v.object_key);return json({ok:true});}catch{ctx.waitUntil(maintenance(env,origin));return json({ok:true,audioDeletionPending:true});}
  }
  if(action==='uploads'&&method==='POST'){
    await project(env,s,id,true);const b=await body(request),name=cleanText(b.fileName,180);if(!/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(name)||!Number.isInteger(b.bytes)||b.bytes<1||b.bytes>200*1024*1024||!Number.isFinite(b.duration)||b.duration<=0||b.duration>7200)fail('200MB 이하, 2시간 이하의 지원 음원을 선택해 주세요.');const pending=await q(env,'SELECT COUNT(*) AS n FROM uploads WHERE project_id=?',id).first();if(pending.n>=3)fail('진행 중인 업로드를 먼저 완료해 주세요.');const uploadId=uid(),key=id+'/'+uid();const mime={'wav':'audio/wav','mp3':'audio/mpeg','m4a':'audio/mp4','aac':'audio/aac','ogg':'audio/ogg','flac':'audio/flac'}[name.split('.').pop().toLowerCase()];const u=await env.AUDIO.createMultipartUpload(key,{httpMetadata:{contentType:mime},customMetadata:{bytes:String(b.bytes)}});await q(env,'INSERT INTO uploads(id,project_id,upload_id,object_key,file_name,mime,bytes,duration,label,note,created_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',uploadId,id,u.uploadId,key,name,mime,b.bytes,b.duration,cleanText(b.label,60)||'새 믹스',cleanText(b.note,1000),Date.now(),s.role).run();return json({id:uploadId,chunkSize:CHUNK});
  }
  const um=action.match(/^uploads\/([a-f0-9-]{36})(?:\/(complete|[0-9]+))?$/);
  if(um){await project(env,s,id,true);const u=await q(env,'SELECT * FROM uploads WHERE id=? AND project_id=?',um[1],id).first();if(!u)fail('업로드를 찾을 수 없어요.',404);if(u.uploaded_by!==s.role)fail('본인이 시작한 업로드만 변경할 수 있어요.',403);const multipart=env.AUDIO.resumeMultipartUpload(u.object_key,u.upload_id);
    if(method==='DELETE'){try{await multipart.abort();}catch{}if(!await q(env,'SELECT id FROM versions WHERE object_key=?',u.object_key).first())await env.AUDIO.delete(u.object_key);await q(env,'DELETE FROM uploads WHERE id=?',u.id).run();return json({ok:true});}
    if(method==='PUT'&&/^\d+$/.test(um[2])){const part=Number(um[2]),size=Number(request.headers.get('Content-Length')),expected=Math.min(CHUNK,u.bytes-(part-1)*CHUNK);if(!Number.isInteger(part)||part<1||expected<=0||size!==expected)fail('업로드 조각 크기를 확인해 주세요.');const result=await multipart.uploadPart(part,request.body);const expectedHash=request.headers.get('X-Content-SHA256');if(expectedHash&&result.etag!==expectedHash)fail('전송 중 파일 검증에 실패했어요. 다시 업로드해 주세요.',422);return json(result);}
    if(method==='POST'&&um[2]==='complete'){const b=await body(request);if(!Array.isArray(b.parts)||b.parts.length!==Math.ceil(u.bytes/(CHUNK))||b.parts.some((x,i)=>x.partNumber!==i+1||typeof x.etag!=='string'))fail('음원 업로드가 완료되지 않았어요.');if(!await env.AUDIO.head(u.object_key))await multipart.complete(b.parts);const file=await env.AUDIO.head(u.object_key);if(file.size!==u.bytes){await env.AUDIO.delete(u.object_key);fail('음원 크기가 일치하지 않아요.');}const versionId=uid(),now=Date.now();await notifyBatch(env,ctx,origin,[q(env,'INSERT INTO versions(id,project_id,number,label,file_name,object_key,mime,bytes,duration,note,created_at,uploaded_by) SELECT ?,?,COALESCE(MAX(number),0)+1,?,?,?,?,?,?,?,?,? FROM versions WHERE project_id=?',versionId,id,u.label,u.file_name,u.object_key,u.mime,u.bytes,u.duration,u.note,now,s.role,id),...(s.role==='client'&&u.note?[q(env,"INSERT INTO requests(id,project_id,version_id,start,end,text,status,created_at,updated_at) VALUES(?,?,?,0,?,?,'open',?,?)",uid(),id,versionId,u.duration,u.note,now,now)]:[]),q(env,'DELETE FROM uploads WHERE id=?',u.id)],p,s.role==='engineer'?'client:'+id:'engineer','version',s.role==='client'?'고객이 원본 음원과 작업 내용을 올렸어요.':'새 수정본이 도착했어요. 이전 버전과 비교해 보세요.',versionId);return json({id:versionId});}
  }
  const vm=action.match(/^versions\/([a-f0-9-]{36})\/audio$/);
  if(vm&&['GET','HEAD'].includes(method)){if(p.purge_audio)fail('삭제 중인 음원이에요.',410);const v=await q(env,'SELECT * FROM versions WHERE id=? AND project_id=? AND deleted_at IS NULL',vm[1],id).first();if(!v)fail('음원을 찾을 수 없어요.',404);const object=await env.AUDIO.get(v.object_key,{range:request.headers});if(!object)fail('음원을 찾을 수 없어요.',404);const h=new Headers({'Content-Type':v.mime,'Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-SHA256':object.checksum,'Content-Disposition':`${url.searchParams.has('download')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(v.file_name)}`});if(object.range){h.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);h.set('Content-Length',String(object.range.length));}else h.set('Content-Length',String(object.size));return new Response(method==='HEAD'?null:object.body,{status:object.range?206:200,headers:h});}
  if(action==='requests'&&method==='POST'){await project(env,s,id,true);if(s.role!=='client')fail('고객 화면에서 수정 요청을 남길 수 있어요.',403);const b=await body(request),v=await q(env,'SELECT * FROM versions WHERE id=? AND project_id=? AND deleted_at IS NULL',String(b.versionId),id).first(),text=cleanText(b.text);if(!v||!text||!validRange(b.start,b.end,v.duration))fail('요청 내용과 구간을 확인해 주세요.');const rid=uid(),now=Date.now();await notifyBatch(env,ctx,origin,[q(env,'INSERT INTO requests(id,project_id,version_id,start,end,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',rid,id,v.id,b.start,b.end,text,now,now)],p,'engineer','request','새 수정 요청이 도착했어요.',rid);return json({id:rid},201);}
  const rm=action.match(/^requests\/([a-f0-9-]{36})$/);
  if(rm&&method==='POST'){await project(env,s,id,true);const r=await q(env,'SELECT * FROM requests WHERE id=? AND project_id=?',rm[1],id).first();if(!r)fail('요청을 찾을 수 없어요.',404);const b=await body(request);if(!transitionAllowed(s.role,r.status,b.status))fail('변경할 수 없는 상태예요.',403);let version=null;if(b.status==='resolved'){version=await q(env,'SELECT id FROM versions WHERE id=? AND project_id=? AND deleted_at IS NULL',String(b.versionId),id).first();if(!version)fail('수정 사항을 반영한 버전을 선택해 주세요.');}await notifyBatch(env,ctx,origin,[q(env,'UPDATE requests SET status=?,resolved_version_id=COALESCE(?,resolved_version_id),updated_at=? WHERE id=?',b.status,version?.id||null,Date.now(),r.id)],p,s.role==='engineer'?'client:'+id:'engineer','request',b.status==='resolved'?'수정 요청이 반영되었어요. 비교 후 확인해 주세요.':b.status==='confirmed'?'고객이 수정 사항을 확인했어요.':'수정 요청 상태가 변경되었어요.',r.id);return json({ok:true});}
  if(action==='messages/read'&&method==='POST'){
    const b=await body(request);if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>300||b.ids.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x)))fail('읽은 메시지를 확인해 주세요.');
    const now=Date.now(),result=await q(env,'UPDATE messages SET read_at=? WHERE project_id=? AND role<>? AND request_id IS NULL AND read_at IS NULL AND id IN (SELECT value FROM json_each(?)) RETURNING id',now,id,s.role,JSON.stringify([...new Set(b.ids)])).all();
    return json({ids:result.results.map(m=>m.id),readAt:now});
  }
  if(action==='messages'&&method==='POST'){await project(env,s,id,true);const b=await body(request),text=cleanText(b.text);if(!text)fail('메시지를 입력해 주세요.');if(b.requestId&&!await q(env,'SELECT id FROM requests WHERE id=? AND project_id=?',String(b.requestId),id).first())fail('수정 요청을 찾을 수 없어요.');await notifyBatch(env,ctx,origin,[q(env,'INSERT INTO messages(id,project_id,request_id,role,text,created_at) VALUES(?,?,?,?,?,?)',uid(),id,b.requestId||null,s.role,text,Date.now())],p,s.role==='engineer'?'client:'+id:'engineer','message','프로젝트에 새 메시지가 도착했어요.',b.requestId||null);return json({ok:true},201);}
  fail('요청을 찾을 수 없어요.',404);
}
export default {
  async fetch(request,env,ctx){
    env=withAudioStorage(env);const url=new URL(request.url),origin=request.headers.get('Origin'),isApi=url.pathname.startsWith('/api/');let response;
    const allowed=origin&&[url.origin,env.APP_ORIGIN].includes(origin);
    try{
      if(isApi&&request.method==='OPTIONS')response=allowed?new Response(null,{status:204}):json({error:'허용되지 않은 출처예요.'},403);
      else response=isApi?await api(request,env,ctx):env.ASSETS?await env.ASSETS.fetch(request):new Response('MIXROOM API',{status:404});
      if(isApi&&response.ok&&['POST','DELETE'].includes(request.method)&&url.pathname.startsWith('/api/projects')){
        const id=url.pathname.match(/^\/api\/projects\/([a-f0-9-]{36})/)?.[1];
        const statements=[signalStatement(env,'engineer')];
        if(id){const p=await q(env,'SELECT status FROM projects WHERE id=?',id).first();statements.push(signalStatement(env,id,p?.status==='archived'));}
        // Chunk uploads don't publish incomplete versions.
        if(!url.pathname.includes('/uploads/')||url.pathname.endsWith('/complete')){await env.DB.batch(statements);ctx.waitUntil(flushSignals(env).catch(()=>{}));}
      }
    }catch(e){response=json({error:e.status?e.message:'잠시 연결이 원활하지 않아요. 다시 시도해 주세요.'},e.status||500);if(!e.status)console.error('Request failed',e.name,e.message?.replace(/https?:\/\/\S+/g,'[url]').slice(0,180));}
    const h=new Headers(response.headers);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');h.set('X-Frame-Options','DENY');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(isApi&&allowed){h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin');h.set('Access-Control-Allow-Methods','GET, HEAD, POST, PUT, DELETE, OPTIONS');h.set('Access-Control-Allow-Headers','Authorization, Content-Type, Range, X-Content-SHA256');h.set('Access-Control-Expose-Headers','Content-Range, Content-Length, X-Content-SHA256');h.set('Access-Control-Max-Age','3600');}
    return new Response(response.body,{status:response.status,headers:h});
  },
  async scheduled(event,env,ctx){ctx.waitUntil(maintenance(withAudioStorage(env),env.APP_URL));}
};
