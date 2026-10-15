import {APP_BASE} from './connection.js';
export async function syncAppBadge(count,at,recipient,reset=false){
  if(!Number.isSafeInteger(count)||count<0)return;
  try{
    const registration=await navigator.serviceWorker?.getRegistration(APP_BASE),worker=registration?.active;
    if(worker){worker.postMessage({type:reset?'mixroom-badge-reset':'mixroom-badge',snapshot:{count,at,recipient}});return;}
    if(!count||reset)await navigator.clearAppBadge?.();else await navigator.setAppBadge?.(count);
  }catch{}
}
