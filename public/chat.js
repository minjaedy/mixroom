export function sendsChatOnEnter(event){
  return event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&event.keyCode!==229;
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
