// Capture the browser's install event before the application finishes loading.
(() => {
  const base=new URL('./',document.currentScript.src),mode=matchMedia('(display-mode: standalone)');
  let deferred=null,installed=false,busy=false;
  const standalone=()=>installed||mode.matches||navigator.standalone===true;
  function sync(){document.querySelectorAll('[data-app-install]').forEach(button=>{button.hidden=standalone();button.disabled=busy;});}
  function guide(){
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const section=ios?'ios':/Android/.test(navigator.userAgent)?'android':'desktop';
    location.assign(new URL('guide.html#guide-install-'+section,base).href);
  }
  async function open(){
    if(busy||standalone())return;
    if(!deferred){guide();return;}
    const prompt=deferred;deferred=null;busy=true;sync();
    try{await prompt.prompt();await prompt.userChoice;}catch{guide();}finally{busy=false;sync();}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;sync();});
  window.addEventListener('appinstalled',()=>{installed=true;deferred=null;sync();});
  mode.addEventListener?.('change',sync);
  document.addEventListener('click',event=>{if(event.target.closest('[data-app-install]'))open();});
  document.addEventListener('DOMContentLoaded',()=>{sync();new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});});
  window.MixroomInstall={sync};
})();
