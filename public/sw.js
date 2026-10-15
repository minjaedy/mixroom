const BASE=new URL('./',self.location.href);
importScripts('./badge-core.js');
function appURL(value){
  try{const url=new URL(value||BASE.href,BASE);return url.origin===BASE.origin&&url.pathname.startsWith(BASE.pathname)?url:null;}catch{return null;}
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Never cache project files, conversations, authentication, or API responses.
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'&&appURL(e.request.url))e.respondWith(fetch(e.request).catch(()=>new Response('<meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MIXROOM</title><h1>연결을 기다리고 있어요.</h1><p>음원과 고객 정보는 오프라인에 저장하지 않아요. 인터넷 연결 후 다시 열어 주세요.</p>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch{}const u=appURL(d.url)||BASE;e.waitUntil(Promise.all([self.MixroomBadge.update(d.badge,'push'),self.registration.showNotification('MIXROOM',{body:String(d.body||'프로젝트에 새 소식이 있어요.').slice(0,180),icon:new URL('mixroom-icon-v3-192.png',BASE).href,badge:new URL('mixroom-icon-v3-192.png',BASE).href,tag:String(d.tag||'update').slice(0,80),data:{url:u.href}})]));});
self.addEventListener('message',e=>{
  const source=e.source?.url;if(!source)return;const url=new URL(source);
  if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  if(e.data?.type==='mixroom-badge')e.waitUntil(self.MixroomBadge.update(e.data.snapshot,'page'));
  if(e.data?.type==='mixroom-badge-reset')e.waitUntil(self.MixroomBadge.update(null,'reset'));
});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=appURL(e.notification.data?.url);if(!u)return;e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const app=windows.find(w=>appURL(w.url));if(app){await app.navigate(u.href);return app.focus();}return self.clients.openWindow(u.href);}));});
