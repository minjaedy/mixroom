import {guideHTML,guideAction} from './guide.js';
const root=document.querySelector('#guide-root');root.innerHTML=guideHTML('client');
document.querySelector('#guide-role').addEventListener('change',e=>root.innerHTML=guideHTML(e.target.value));
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el)guideAction(el.dataset.action,el);});
