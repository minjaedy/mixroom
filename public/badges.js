import {APP_BASE} from './connection.js';
let latest=null,queue=Promise.resolve();
export async function syncAppBadge(count,at,recipient,reset=false){
  if(!Number.isSafeInteger(count)||count<0)return;
  if(!reset&&(!Number.isSafeInteger(at)||typeof recipient!=='string'))return;
  if(!reset&&latest?.recipient===recipient&&latest.at>at)return;
  latest=reset?null:{count,at,recipient};
  // Window and worker implementations differ across installed desktop browsers.
  // Neither path should prevent the other from applying the badge.
  const snapshot={count,at,recipient};
  queue=queue.catch(()=>{}).then(async()=>{
    await Promise.allSettled([applyBadge(reset?0:count),(async()=>{
    const registration=await navigator.serviceWorker?.getRegistration(APP_BASE),worker=registration?.active;
    worker?.postMessage({type:reset?'mixroom-badge-reset':'mixroom-badge',snapshot});
    })()]);
  });
  return queue;
}
async function applyBadge(count){if(count)await navigator.setAppBadge?.(count);else await navigator.clearAppBadge?.();}
function restore(){if(latest&&document.visibilityState==='visible')void syncAppBadge(latest.count,latest.at,latest.recipient);}
window.addEventListener('focus',restore);
document.addEventListener('visibilitychange',restore);
navigator.serviceWorker?.addEventListener('message',event=>{
  const state=event.data?.snapshot;
  if(event.data?.type==='mixroom-badge-applied'&&latest&&state?.recipient===latest.recipient)void syncAppBadge(state.count,state.at,state.recipient);
});
