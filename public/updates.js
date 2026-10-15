// Reload only after the matching HTML is published and the user's work is idle.
export function updateCoordinator({current,latest,ready,isBusy,reload,onPending=()=>{}}){
  let pending=null,checking=false,applying=false,reloading=false;
  return {
    async check(){
      if(checking)return;checking=true;
      try{const value=await latest();if(value&&value!==current&&value!==pending){pending=value;onPending();}}catch{}finally{checking=false;}
    },
    async apply(){
      if(!pending||applying||reloading||isBusy())return;applying=true;
      try{const version=pending,url=await ready(version);if(url&&version===pending&&!isBusy()){reloading=true;reload(url);return;}}catch{reloading=false;}finally{applying=false;}
    }
  };
}
export function hasEntryDraft(root=document){
  return Array.from(root.querySelectorAll('input,textarea,[contenteditable="true"]')).some(el=>{
    if(el.disabled||el.readOnly)return false;
    if(el.isContentEditable)return !!el.textContent.trim();
    if(el.type==='file')return !!el.files?.length;
    if(el.tagName==='TEXTAREA'||['text','password','email','search','url','tel'].includes(el.type))return !!el.value.trim();
    return false;
  });
}
export function startAppUpdates({busy=()=>false,target=()=>new URL(location.href),notify=()=>{}}={}){
  const current=document.querySelector('meta[name="app-version"]')?.content;
  if(!current||current==='development')return;
  const base=new URL('./',import.meta.url);let lastInput=Date.now();
  const isBusy=()=>document.hidden||Date.now()-lastInput<3000||!!document.querySelector('dialog[open]')||hasEntryDraft()||busy();
  const coordinator=updateCoordinator({current,isBusy,onPending:notify,
    latest:async()=>{const r=await fetch(new URL('version.json?t='+Date.now(),base),{cache:'no-store'});if(!r.ok)return null;const d=await r.json();return /^[a-f0-9]{7,64}$/.test(d.version)?d.version:null;},
    ready:async version=>{const url=target();url.searchParams.set('_v',version);const r=await fetch(url,{cache:'no-store'});if(!r.ok)return null;const html=new DOMParser().parseFromString(await r.text(),'text/html');return html.querySelector('meta[name="app-version"]')?.content===version?url.href:null;},
    reload:url=>location.replace(url)
  });
  for(const event of ['input','keydown','pointerdown'])document.addEventListener(event,()=>{lastInput=Date.now();},{passive:true});
  const check=()=>coordinator.check().then(()=>coordinator.apply());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});window.addEventListener('focus',check);
  setInterval(check,60000);setInterval(()=>coordinator.apply(),5000);check();
}
