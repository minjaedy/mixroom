import {APP_BASE} from './connection.js';
export function pushSetupMode({supported,ios,installed,permission,subscribed}){
  if(!supported)return 'unsupported';
  if(ios&&!installed)return 'install';
  if(permission==='granted'&&subscribed)return 'connected';
  return permission==='denied'?'blocked':'offer';
}
export async function appRegistration(){
  const reg=await navigator.serviceWorker.register(new URL('sw.js',APP_BASE),{scope:APP_BASE.pathname,updateViaCache:'none'});
  if(reg.active)return reg;
  const worker=reg.installing||reg.waiting;
  if(!worker)throw Error('알림 준비 중이에요. 잠시 후 다시 눌러 주세요.');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('알림 연결을 다시 확인해 주세요.')),12000);
    const change=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('알림 연결을 다시 확인해 주세요.'));}};
    worker.addEventListener('statechange',change);change();
  });
  return reg;
}
export async function devicePushMode(){
  const supported='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const installed=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
  let subscribed=false;
  if(supported)try{subscribed=!!(await(await navigator.serviceWorker.getRegistration(APP_BASE)).pushManager.getSubscription());}catch{}
  return pushSetupMode({supported,ios,installed,permission:supported?Notification.permission:'default',subscribed});
}
