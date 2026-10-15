export function sendsChatOnEnter(event){
  return event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&event.keyCode!==229;
}
export function receivedMessageIds(messages,role,visibleIds,atBottom){
  return messages.filter(m=>!m.request_id&&m.role!==role&&!m.read_at&&(atBottom||visibleIds.has(m.id))).map(m=>m.id);
}
export function keepReadReceipts(incoming,previous){
  const known=new Map(previous.filter(m=>m.read_at).map(m=>[m.id,m.read_at]));
  return incoming.map(m=>!m.read_at&&known.has(m.id)?{...m,read_at:known.get(m.id)}:m);
}
export function bindChatKeyboard(root=document){
  root.addEventListener('keydown',event=>{
    const field=event.target;
    if(field.id!=='chat-message'||!sendsChatOnEnter(event))return;
    event.preventDefault();
    if(event.repeat||field.readOnly||!field.value.trim()||field.form?.dataset.submitting)return;
    field.form?.requestSubmit();
  });
}
