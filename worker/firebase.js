import {Buffer} from 'node:buffer';
let accessCache,keyCache;
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
function account(env){const a=JSON.parse(env.FIREBASE_ACCOUNT);if(a.project_id!==env.FIREBASE_PROJECT_ID)throw Error('Firebase project mismatch');return a;}
async function jwt(env,payload){
  const a=account(env);
  if(!keyCache||keyCache.id!==a.private_key_id)keyCache={id:a.private_key_id,key:await crypto.subtle.importKey('pkcs8',Buffer.from(a.private_key.replace(/-----[^-]+-----|\s/g,''),'base64'),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign'])};
  const value=b64({alg:'RS256',typ:'JWT'})+'.'+b64(payload);
  return value+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keyCache.key,new TextEncoder().encode(value))).toString('base64url');
}
async function access(env){
  if(accessCache?.until>Date.now()+60000)return accessCache.token;
  const a=account(env),now=Math.floor(Date.now()/1000);
  const assertion=await jwt(env,{iss:a.client_email,scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/identitytoolkit',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if(!r.ok)throw Error('Firebase authentication unavailable');const d=await r.json();accessCache={token:d.access_token,until:Date.now()+d.expires_in*1000};return accessCache.token;
}
export async function firebaseSession(env,s){
  if(!env.FIREBASE_ACCOUNT)return {enabled:false};
  const a=account(env),now=Math.floor(Date.now()/1000),path=s.role==='engineer'?'engineer':'clients/'+s.project_id;
  const customToken=await jwt(env,{iss:a.client_email,sub:a.client_email,aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',iat:now,exp:now+3600,uid:s.role==='engineer'?'engineer':'client-'+s.project_id,claims:{role:s.role,projectId:s.project_id||'',validUntil:s.expires_at}});
  return {enabled:true,customToken,apiKey:env.FIREBASE_API_KEY,databaseURL:env.FIREBASE_DATABASE_URL,path};
}
export function signalStatement(env,id,deleted=false){return env.DB.prepare('INSERT INTO realtime_outbox(id,revision,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,created_at=excluded.created_at').bind(id,deleted?'delete':crypto.randomUUID(),Date.now());}
export async function flushSignals(env){
  if(!env.FIREBASE_ACCOUNT)return;
  const rows=(await env.DB.prepare('SELECT * FROM realtime_outbox ORDER BY created_at LIMIT 8').all()).results;if(!rows.length)return;
  const token=await access(env),patch={};
  for(const row of rows){patch[row.id==='engineer'?'engineer':'clients/'+row.id]=row.revision==='delete'?null:row.revision;}
  const r=await fetch(env.FIREBASE_DATABASE_URL+'/signals.json',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(patch)});
  if(!r.ok)throw Error('Firebase signal sync unavailable');
  for(const row of rows){
    if(row.revision==='delete'){
      const response=await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+env.FIREBASE_PROJECT_ID+'/accounts:delete',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({localId:'client-'+row.id})});
      if(!response.ok){const data=await response.json().catch(()=>({}));if(!String(data.error?.message).includes('USER_NOT_FOUND'))throw Error('Firebase user cleanup pending');}
    }
    await env.DB.prepare('DELETE FROM realtime_outbox WHERE id=? AND revision=?').bind(row.id,row.revision).run();
  }
}
