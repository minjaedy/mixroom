export const APP_BASE=new URL('./',import.meta.url);
export const API_BASE=location.hostname==='minjaedy.github.io'?'https://mixroom-studio.couple-private-push.workers.dev/api':new URL('api',APP_BASE).href;
const KEY='mixroom-session-v1';
export const sessionToken=()=>localStorage.getItem(KEY)||'';
export function saveSession(value){if(value)localStorage.setItem(KEY,value);else localStorage.removeItem(KEY);}
export function apiFetch(path,options={}){const headers=new Headers(options.headers);const token=sessionToken();if(token)headers.set('Authorization','Bearer '+token);return fetch(API_BASE+path,{...options,headers,credentials:'omit',cache:'no-store'});}
let stream,timer,generation=0;
export function stopRealtime(){generation++;stream?.close();stream=null;clearTimeout(timer);}
export async function startRealtime(api,onChange){
  stopRealtime();const gen=generation;
  try{
    const config=await api('/firebase');if(!config.enabled||gen!==generation)return;
    const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+encodeURIComponent(config.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:config.customToken,returnSecureToken:true})});
    if(!r.ok)throw Error('realtime sign-in');const d=await r.json();if(gen!==generation)return;
    stream=new EventSource(config.databaseURL+'/signals/'+config.path+'.json?auth='+encodeURIComponent(d.idToken));
    stream.addEventListener('put',onChange);stream.addEventListener('patch',onChange);
    stream.addEventListener('cancel',()=>{stream?.close();});
    timer=setTimeout(()=>startRealtime(api,onChange),50*60000);
  }catch{if(gen===generation)timer=setTimeout(()=>startRealtime(api,onChange),60000);}
}
export async function audioFile(path,size,onProgress=()=>{},signal){
  const pieces=[];const chunk=2*1024*1024;
  for(let offset=0;offset<size;offset+=chunk){
    const end=Math.min(size-1,offset+chunk-1),r=await apiFetch(path,{headers:{Range:`bytes=${offset}-${end}`},signal});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'음원을 불러올 수 없어요.');}
    const bytes=await r.arrayBuffer();if(bytes.byteLength!==end-offset+1)throw Error('음원 크기가 일치하지 않아요.');if(await checksum(bytes)!==r.headers.get('X-Content-SHA256'))throw Error('다운로드 파일 검증에 실패했어요. 다시 시도해 주세요.');pieces.push(bytes);onProgress(Math.round((end+1)/size*100));
  }
  return new Blob(pieces);
}
export async function checksum(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
