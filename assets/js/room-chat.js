// Browser-only chat rehearsal. No shared messaging or moderation is claimed here.
export function messageText(value) {return typeof value==='string' ? value.trim().slice(0,500) : '';}
export function chatCanPost(rehearsal, state) {return Boolean(rehearsal && state?.chatWindow);}
export function attachChat(rehearsalId) {
  const form=document.querySelector('[data-chat-form]');
  const input=document.querySelector('[data-chat-input]');
  const send=document.querySelector('[data-chat-send]');
  const log=document.querySelector('[data-chat-messages]');
  const scroller=document.querySelector('.vr-chat-body');
  const empty=document.querySelector('[data-chat-empty]');
  const newer=document.querySelector('[data-new-messages]');
  const hint=document.querySelector('[data-chat-hint]');
  const error=document.querySelector('[data-chat-error]');
  let allowed=false,messages=[];
  const key=rehearsalId ? `kipg-chat-rehearsal-${rehearsalId}` : null;
  if(key){try{const data=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(data))messages=data.filter(m=>messageText(m.text)&&Number.isFinite(Date.parse(m.at))).slice(-100);}catch{}}
  function bottom(){scroller.scrollTop=scroller.scrollHeight;newer.hidden=true;}
  function renderMessage(message){
    const row=document.createElement('article');row.className='vr-chat-message';
    const header=document.createElement('header');const name=document.createElement('strong');name.textContent='You · rehearsal';
    const time=document.createElement('time');time.dateTime=message.at;time.textContent=new Date(message.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    const text=document.createElement('p');text.textContent=message.text;header.append(name,time);row.append(header,text);log.append(row);
  }
  for(const message of messages)renderMessage(message);
  empty.hidden=messages.length>0;
  requestAnimationFrame(bottom);
  input.addEventListener('input',()=>{document.querySelector('[data-chat-count]').textContent=`${input.value.length}/500`;});
  input.addEventListener('keydown',event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault();form.requestSubmit();}});
  form.addEventListener('submit',event=>{
    event.preventDefault();error.textContent='';
    if(!allowed){error.textContent='This session’s chat window is closed.';return;}
    const text=messageText(input.value);if(!text)return;
    const message={text,at:new Date().toISOString()};const atBottom=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<48;
    messages.push(message);if(messages.length>100){messages.shift();log.firstElementChild?.remove();}
    renderMessage(message);empty.hidden=true;
    try{localStorage.setItem(key,JSON.stringify(messages));}catch{error.textContent='This browser could not save the rehearsal messages.';}
    input.value='';document.querySelector('[data-chat-count]').textContent='0/500';
    if(atBottom)bottom();else newer.hidden=false;
    input.focus();
  });
  scroller.addEventListener('scroll',()=>{if(scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<48)newer.hidden=true;});
  newer.addEventListener('click',bottom);
  return {update(state){
    allowed=chatCanPost(rehearsalId,state);input.disabled=!allowed;send.disabled=!allowed;
    input.placeholder=allowed?'Type a rehearsal message…':rehearsalId?'This session’s chat is closed':'Chat is not connected yet';
    hint.textContent=rehearsalId?'Local rehearsal · messages stay in this browser':'Chat opens with the room and closes with the episode.';
  }};
}
