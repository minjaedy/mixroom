import test from 'node:test';
import assert from 'node:assert/strict';
import {sendsChatOnEnter,bindChatKeyboard} from '../public/chat.js';
test('chat Enter sends, Shift+Enter and Korean IME confirmation do not',()=>{
  assert.equal(sendsChatOnEnter({key:'Enter'}),true);
  for(const event of [{shiftKey:true},{isComposing:true},{keyCode:229},{ctrlKey:true},{altKey:true},{metaKey:true}])assert.equal(sendsChatOnEnter({key:'Enter',...event}),false);
  assert.equal(sendsChatOnEnter({key:'a'}),false);
});
test('chat keyboard blocks blank, repeated and in-flight submissions without intercepting other forms',()=>{
  let handler,sent=0,prevented=0;bindChatKeyboard({addEventListener:(_,fn)=>handler=fn});
  const target={id:'chat-message',value:'hello',form:{dataset:{},requestSubmit:()=>sent++}};
  const event={key:'Enter',target,preventDefault:()=>prevented++};handler(event);assert.equal(sent,1);
  target.value='   ';handler(event);target.value='hello';target.form.dataset.submitting='true';handler(event);delete target.form.dataset.submitting;handler({...event,repeat:true});
  assert.equal(sent,1);assert.equal(prevented,4);
  handler({...event,shiftKey:true});handler({...event,isComposing:true});handler({...event,target:{...target,id:'request-text'}});assert.equal(prevented,4);
});
