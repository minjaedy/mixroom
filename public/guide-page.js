import {startAppUpdates} from './updates.js';
import {guideHTML,guideAction} from './guide.js';
const root=document.querySelector('#guide-root');root.innerHTML=guideHTML(new URLSearchParams(location.search).get('role')==='engineer'?'engineer':'client');
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el)guideAction(el.dataset.action,el);});

startAppUpdates();
