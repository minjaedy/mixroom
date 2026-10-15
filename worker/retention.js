import {signalStatement} from './firebase.js';
import {RETENTION_DAYS,RETENTION_MS} from '../public/policy.js';
export {RETENTION_DAYS,RETENTION_MS};
const q=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);

// Logical deletion and signals commit together. Physical audio cleanup is retryable.
export async function expireRecords(env,now=Date.now()){
  const cutoff=now-RETENTION_MS;
  const files=(await q(env,'SELECT id,project_id,object_key FROM versions WHERE deleted_at IS NULL AND created_at<=? ORDER BY created_at LIMIT 30',cutoff).all()).results;
  const messages=(await q(env,'SELECT id,project_id FROM messages WHERE created_at<=? ORDER BY created_at LIMIT 500',cutoff).all()).results;
  const projects=[...new Set([...files,...messages].map(row=>row.project_id))];
  const statements=[];
  if(files.length){
    const ids=JSON.stringify(files.map(row=>row.id)),keys=JSON.stringify(files.map(row=>row.object_key));
    statements.push(
      q(env,"UPDATE versions SET deleted_at=?,file_name='',label='보관 기한이 지난 음원',note='',bytes=0 WHERE id IN (SELECT value FROM json_each(?))",now,ids),
      q(env,"UPDATE audio_objects SET state='deleting' WHERE key IN (SELECT value FROM json_each(?))",keys),
      q(env,"UPDATE requests SET resolved_version_id=NULL,status=CASE WHEN status IN ('resolved','confirmed') THEN 'open' ELSE status END WHERE resolved_version_id IN (SELECT value FROM json_each(?))",ids),
      q(env,"DELETE FROM notifications WHERE type='version' AND target_id IN (SELECT value FROM json_each(?))",ids)
    );
  }
  if(messages.length)statements.push(q(env,'DELETE FROM messages WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(messages.map(row=>row.id))));
  statements.push(q(env,"DELETE FROM notifications WHERE type='message' AND created_at<=?",cutoff));
  if(projects.length){
    statements.push(signalStatement(env,'engineer'));
    // One statement for all affected customers keeps the scheduled query budget bounded.
    statements.push(q(env,"INSERT INTO realtime_outbox(id,revision,created_at) SELECT value,?,? FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,created_at=excluded.created_at",crypto.randomUUID(),now,JSON.stringify(projects)));
  }
  await env.DB.batch(statements);
  return {files:files.length,messages:messages.length};
}
