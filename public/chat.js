export function sendsChatOnEnter(event){
  return event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&event.keyCode!==229;
}
export function receivedMessageIds(messages,role,visibleIds,atBottom){
  return messages.filter(m=>!m.request_id&&m.role!==role&&!m.read_at&&(atBottom||visibleIds.has(m.id))).map(m=>m.id);
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
