import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8795';let passed=0;
const check=(condition,label)=>{assert.ok(condition,label);passed++;console.log('PASS '+label);};
async function api(path,cookie,body){const r=await fetch(origin+'/api'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const credentials=JSON.parse(await fs.readFile('.local/test-credentials.json','utf8')),admin=(await api('/login',null,{role:'engineer',password:credentials.password})).cookie;assert.ok(admin);
const projects=[];
try{
  for(let i=0;i<2;i++){const title='Storage fixture '+Date.now()+' '+i,p=(await api('/projects',admin,{title,client:'Storage test'})).data;assert.ok(p.id);projects.push({...p,title});}
  const [p,other]=projects,client=(await api('/login',null,{role:'client',code:p.code})).cookie,bytes=await fs.readFile('test-results/customer-original.wav');
  const upload=async(project,label)=>{const base='/projects/'+project.id,u=(await api(base+'/uploads',admin,{fileName:'fixture.wav',label,bytes:bytes.length,duration:1})).data;const r=await fetch(origin+'/api'+base+'/uploads/'+u.id+'/1',{method:'PUT',headers:{Origin:origin,Cookie:admin},body:bytes});return (await api(base+'/uploads/'+u.id+'/complete',admin,{parts:[await r.json()]})).data.id;};
  const first=await upload(p,'first'),revision=await upload(p,'revision'),keep=await upload(other,'keep');
  const request=(await api('/projects/'+p.id+'/requests',client,{versionId:first,start:0,end:1,text:'Keep this request'})).data.id;
  await api('/projects/'+p.id+'/requests/'+request,admin,{status:'resolved',versionId:revision});
  await api('/projects/'+p.id+'/messages',client,{text:'Keep this chat'});
  check((await api('/storage/files')).status===401,'anonymous storage listing rejected');
  check((await api('/storage/files',client)).status===403,'customer cannot list other customer files');
  check((await api('/storage/files/delete',client,{ids:[first]})).status===403,'customer cannot bulk delete audio');
  check((await api('/storage/files/delete',admin,{ids:[]})).status===400,'empty bulk deletion rejected');
  check((await api('/storage/files/delete',admin,{ids:[first,'00000000-0000-0000-0000-000000000000']})).status===404,'invalid selection fails before deleting valid files');
  const listed=(await api('/storage/files',admin)).data.files;check(listed.some(v=>v.id===first)&&listed.every(v=>!('object_key'in v)),'file inventory includes metadata without storage keys');
  const before=(await api('/storage',admin)).data.bytes,result=await api('/storage/files/delete',admin,{ids:[first,revision,first]});
  check(result.status===200&&result.data.deleted===2,'selected files delete once even with duplicate IDs');
  const data=(await api('/projects/'+p.id,admin)).data;
  check(data.versions.length===0&&data.requests[0].text==='Keep this request'&&data.messages.some(m=>m.text==='Keep this chat'),'bulk deletion preserves request and chat records');
  check(data.requests[0].status==='open'&&!data.requests[0].resolved_version_id,'deleting resolved version reopens linked request');
  check((await api('/storage/files',admin)).data.files.some(v=>v.id===keep),'unselected project audio is retained');
  if(result.data.audioDeletionPending)await fetch(origin+'/cdn-cgi/local/scheduled');
  check(before-(await api('/storage',admin)).data.bytes===2*bytes.length,'storage capacity is released for all selected audio');
  check((await api('/storage/files/delete',admin,{ids:[first,revision]})).status===200,'repeated bulk deletion is safe');
  const r=await fetch(origin+'/api/projects/'+p.id+'/versions/'+first+'/audio',{headers:{Cookie:admin,Range:'bytes=0-9'}});check(r.status===404,'deleted audio is no longer downloadable');
}finally{for(const p of projects)await api('/projects/'+p.id+'/close',admin,{confirm:p.title});await fetch(origin+'/cdn-cgi/local/scheduled');}
console.log(`${passed} storage integration checks passed; disposable local files only.`);
