// Only unread counts, a recipient identifier and a server timestamp are stored.
// No messages, audio, session tokens or credentials are cached here.
(() => {
  function nextState(previous,snapshot,source){
    if(source==='restore')return previous||null;
    if(source==='reset')return {blocked:true};
    if(!snapshot||!Number.isSafeInteger(snapshot.count)||snapshot.count<0||!Number.isSafeInteger(snapshot.at)||snapshot.at<0||typeof snapshot.recipient!=='string')return null;
    if(source==='push'&&(previous?.blocked||(previous?.recipient&&previous.recipient!==snapshot.recipient)))return null;
    if(previous?.recipient===snapshot.recipient&&previous.at>snapshot.at)return null;
    return {count:snapshot.count,at:snapshot.at,recipient:snapshot.recipient,blocked:false};
  }
  async function apply(state){
    try{if(state.blocked||!state.count)await navigator.clearAppBadge?.();else await navigator.setAppBadge?.(state.count);}catch{}
  }
  const database=()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('mixroom-badge-'+new URL('./',self.location.href).pathname,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  let queue=Promise.resolve(),memory;
  async function update(snapshot,source){
    let db,state;
    try{
      db=await database();
      state=await new Promise((resolve,reject)=>{
        const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),request=store.get('current');let next;
        request.onsuccess=()=>{next=nextState(request.result,snapshot,source);if(next)store.put(next,'current');};
        tx.oncomplete=()=>resolve(next);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }catch{state=nextState(memory,snapshot,source);}finally{db?.close();}
    if(state){memory=state;await apply(state);}return state;
  }
  self.MixroomBadge={nextState,update(snapshot,source='push'){queue=queue.catch(()=>{}).then(()=>update(snapshot,source));return queue;},restore(){return this.update(null,'restore');}};
})();
