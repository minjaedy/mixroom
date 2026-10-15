export const uid = () => crypto.randomUUID();
export const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const token = () => {const b=crypto.getRandomValues(new Uint8Array(24));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');};
export async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return [...new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export function validSubscription(s){try{const u=new URL(s.endpoint);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com','notify.windows.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))&&/^[A-Za-z0-9_-]{80,100}$/.test(s.keys.p256dh)&&/^[A-Za-z0-9_-]{20,30}$/.test(s.keys.auth);}catch{return false;}}
export function validRange(start,end,duration){return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>=start&&end<=duration+0.1;}
export function cleanText(value,max=2000){return typeof value==='string'?value.trim().slice(0,max):'';}
export const principal = session => session.role==='engineer'?'engineer':'client:'+session.project_id;
export function transitionAllowed(role,from,to){return role==='engineer'?['open','working','resolved'].includes(to):to==='confirmed'&&from==='resolved'||to==='open'&&['resolved','confirmed'].includes(from);}
