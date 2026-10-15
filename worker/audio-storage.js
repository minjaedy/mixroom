import {Buffer} from 'node:buffer';
// Base64 rows stay below D1's 2 MB row limit. Reserve space for encoding and DB records.
export const AUDIO_CAPACITY=320*1024*1024;
export const CHUNK=512*1024;
export const READ_CHUNK=2*1024*1024;
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const fault=(message,status=400)=>Object.assign(Error(message),{status});

export function parseRange(header,size){
  if(!header)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!match||(!match[1]&&!match[2]))throw fault('지원하지 않는 음원 범위예요.',416);
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  let end=match[1]?(match[2]?Number(match[2]):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)throw fault('음원 범위를 벗어났어요.',416);
  end=Math.min(size-1,end);
  return {offset:start,length:end-start+1};
}
export class D1AudioStorage {
  constructor(env){this.env=env;}
  async createMultipartUpload(key,options){
    const size=Number(options.customMetadata.bytes),uploadId=crypto.randomUUID();
    const result=await query(this.env,"INSERT INTO audio_objects(key,upload_id,project_id,expected_bytes,created_at) SELECT ?,?,?,?,? WHERE (SELECT COALESCE(SUM(expected_bytes),0) FROM audio_objects)+?<=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND status='active')",key,uploadId,key.split('/')[0],size,Date.now(),size,AUDIO_CAPACITY,key.split('/')[0]).run();
    if(!result.meta.changes)throw fault('음원 저장공간이 부족하거나 종료된 프로젝트예요. 오래된 음원을 삭제해 주세요.',409);
    return {uploadId};
  }
  resumeMultipartUpload(key,uploadId){return {uploadPart:(number,body)=>this.uploadPart(key,uploadId,number,body),complete:parts=>this.complete(key,uploadId,parts),abort:()=>this.remove(key,uploadId)};}
  async uploadPart(key,uploadId,partNumber,body){
    const object=await query(this.env,"SELECT expected_bytes FROM audio_objects WHERE key=? AND upload_id=? AND state='uploading'",key,uploadId).first();
    if(!object)throw fault('종료된 업로드예요.',409);
    const bytes=await new Response(body).arrayBuffer(),expected=Math.min(CHUNK,object.expected_bytes-(partNumber-1)*CHUNK);
    if(!Number.isInteger(partNumber)||partNumber<1||bytes.byteLength!==expected||expected<=0)throw fault('업로드 크기가 일치하지 않아요.');
    const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
    await query(this.env,"INSERT INTO audio_chunks(object_key,part_number,etag,hash,bytes,data) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audio_objects a JOIN projects p ON p.id=a.project_id WHERE a.key=? AND a.upload_id=? AND a.state='uploading' AND p.status='active') ON CONFLICT(object_key,part_number) DO NOTHING",key,partNumber,hash,hash,bytes.byteLength,Buffer.from(bytes).toString('base64'),key,uploadId).run();
    const saved=await query(this.env,'SELECT hash,etag FROM audio_chunks WHERE object_key=? AND part_number=?',key,partNumber).first();
    if(saved?.hash!==hash)throw fault('종료되었거나 내용이 다른 업로드예요.',409);
    return {partNumber,etag:saved.etag};
  }
  async complete(key,uploadId,parts){
    const object=await query(this.env,"SELECT * FROM audio_objects WHERE key=? AND upload_id=? AND state='uploading'",key,uploadId).first();
    if(!object)throw fault('종료된 업로드예요.',409);
    const stored=(await query(this.env,'SELECT part_number,etag,bytes FROM audio_chunks WHERE object_key=? ORDER BY part_number',key).all()).results;
    if(stored.length!==Math.ceil(object.expected_bytes/CHUNK)||stored.length!==parts.length||stored.reduce((n,p)=>n+p.bytes,0)!==object.expected_bytes||stored.some((p,i)=>p.part_number!==i+1||p.etag!==parts[i].etag||parts[i].partNumber!==i+1))throw fault('음원 업로드가 완료되지 않았어요.');
    const result=await query(this.env,"UPDATE audio_objects SET state='ready',bytes=expected_bytes WHERE key=? AND upload_id=? AND state='uploading' AND EXISTS(SELECT 1 FROM projects WHERE id=audio_objects.project_id AND status='active')",key,uploadId).run();
    if(!result.meta.changes)throw fault('종료된 업로드예요.',409);
  }
  async head(key){const o=await query(this.env,"SELECT bytes FROM audio_objects WHERE key=? AND state='ready'",key).first();return o?{size:o.bytes}:null;}
  async get(key,{range:headers}={}){
    const object=await this.head(key);if(!object)return null;
    const range=parseRange(headers?.get('Range'),object.size),start=range?.offset||0,length=range?.length||object.size;
    if(length>READ_CHUNK)throw fault('음원은 2MB 이하 구간으로 요청해 주세요.',416);
    const end=start+length,first=Math.floor(start/CHUNK)+1,last=Math.ceil(end/CHUNK);
    const parts=(await query(this.env,'SELECT part_number,bytes,data,hash FROM audio_chunks WHERE object_key=? AND part_number BETWEEN ? AND ? ORDER BY part_number',key,first,last).all()).results;
    if(parts.length!==last-first+1)throw fault('삭제되었거나 손상된 음원이에요.',410);
    const output=new Uint8Array(length);let position=0;
    for(const p of parts){const data=Buffer.from(p.data,'base64');if(data.length!==p.bytes||Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex')!==p.hash)throw fault('파일 검증에 실패했어요. 관리자에게 알려 주세요.',503);const offset=(p.part_number-1)*CHUNK,chunk=data.subarray(Math.max(0,start-offset),Math.min(p.bytes,end-offset));output.set(chunk,position);position+=chunk.length;}
    if(position!==length)throw fault('음원을 읽을 수 없어요.',503);
    return {size:object.size,range,body:output,checksum:Buffer.from(await crypto.subtle.digest('SHA-256',output)).toString('hex')};
  }
  async remove(key,uploadId){
    const args=uploadId?[key,uploadId]:[key];
    await query(this.env,"UPDATE audio_objects SET state='deleting' WHERE key=?"+(uploadId?' AND upload_id=?':''),...args).run();
    if(!await query(this.env,"SELECT key FROM audio_objects WHERE key=? AND state='deleting'"+(uploadId?' AND upload_id=?':''),...args).first())return;
    let result;do{result=await query(this.env,'DELETE FROM audio_chunks WHERE object_key=? AND part_number IN (SELECT part_number FROM audio_chunks WHERE object_key=? LIMIT 32)',key,key).run();}while(result.meta.changes===32);
    await query(this.env,"DELETE FROM audio_objects WHERE key=? AND state='deleting'",key).run();
  }
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])await this.remove(key);}
  async list({prefix,cursor=''}){const rows=(await query(this.env,'SELECT key FROM audio_objects WHERE project_id=? AND key>? ORDER BY key LIMIT 20',prefix.split('/')[0],cursor).all()).results;return {objects:rows,truncated:rows.length===20,cursor:rows.at(-1)?.key};}
  async cleanup(){
    const rows=(await query(this.env,"SELECT key FROM audio_objects WHERE state='deleting' OR (created_at<? AND NOT EXISTS(SELECT 1 FROM uploads WHERE uploads.object_key=audio_objects.key) AND NOT EXISTS(SELECT 1 FROM versions WHERE versions.object_key=audio_objects.key AND versions.deleted_at IS NULL)) LIMIT 2",Date.now()-86400000).all()).results;
    for(const o of rows)await this.remove(o.key);
  }
}
export function withAudioStorage(env){return {...env,AUDIO:new D1AudioStorage(env)};}
