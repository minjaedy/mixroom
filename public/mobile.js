export function installMobileChat(){
  const viewport=window.visualViewport,root=document.documentElement;
  let frame=0;
  function layout(){
    frame=0;
    const field=document.querySelector('#chat-message'),active=document.querySelector('.chat-view');
    if(!active||!matchMedia('(max-width:760px)').matches){delete document.body.dataset.chatKeyboard;return;}
    const height=viewport?.height||innerHeight,offset=viewport?.offsetTop||0;
    const keyboard=document.activeElement===field&&Math.max(innerHeight,root.clientHeight)-height>100;
    document.body.dataset.chatKeyboard=String(keyboard);
    root.style.setProperty('--chat-screen-height',height+'px');root.style.setProperty('--chat-screen-top',offset+'px');
    if(field){field.style.height='44px';field.style.height=Math.min(132,Math.max(44,field.scrollHeight))+'px';}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
  viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);
  window.addEventListener('resize',schedule);document.addEventListener('input',schedule);
  document.addEventListener('focusin',schedule);document.addEventListener('focusout',()=>{schedule();setTimeout(schedule,300);});
  new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});
  schedule();
}
