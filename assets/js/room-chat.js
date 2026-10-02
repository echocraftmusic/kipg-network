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
  const emojiToggle=document.querySelector('[data-emoji-toggle]');
  const emojiPicker=document.querySelector('[data-emoji-picker]');
  const emojiGrid=document.querySelector('[data-emoji-grid]');
  const emojis=[['😀','Grinning face'],['😃','Smiling face'],['😊','Happy smile'],['😁','Beaming smile'],['😂','Tears of joy'],['🤣','Laughing'],['🥹','Happy tears'],['😍','Heart eyes'],['🥰','Feeling loved'],['😎','Cool'],['🤔','Thinking'],['😮','Surprised'],['😢','Sad'],['😭','Crying'],['🙌','Raised hands'],['👏','Clapping'],['👍','Thumbs up'],['👎','Thumbs down'],['🙏','Prayer'],['🤝','Handshake'],['👋','Wave'],['💪','Strength'],['❤️','Red heart'],['💛','Gold heart'],['💙','Blue heart'],['💜','Purple heart'],['🤍','White heart'],['💔','Broken heart'],['🔥','Fire'],['✨','Sparkles'],['⭐','Star'],['🎉','Celebration'],['💯','One hundred'],['✅','Check mark'],['🕊️','Dove'],['✝️','Cross']];
  let allowed=false,messages=[],cursorStart=0,cursorEnd=0;
  function rememberCursor(){cursorStart=input.selectionStart;cursorEnd=input.selectionEnd;}
  for(const event of ['select','keyup','click','input'])input.addEventListener(event,rememberCursor);
  function closePicker(focus=false){emojiPicker.hidden=true;emojiToggle.setAttribute('aria-expanded','false');if(focus)emojiToggle.focus();}
  emojiToggle.addEventListener('click',()=>{if(!allowed)return;emojiPicker.hidden=!emojiPicker.hidden;emojiToggle.setAttribute('aria-expanded',String(!emojiPicker.hidden));if(!emojiPicker.hidden)emojiGrid.firstElementChild.focus();});
  document.querySelector('[data-emoji-close]').addEventListener('click',()=>closePicker(true));
  emojiPicker.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePicker(true);}});
  document.addEventListener('click',event=>{if(!emojiPicker.hidden && !emojiPicker.contains(event.target) && !emojiToggle.contains(event.target))closePicker();});
  for(const [emoji,label] of emojis){
    const button=document.createElement('button');button.type='button';button.textContent=emoji;button.setAttribute('aria-label',label);button.title=label;
    button.addEventListener('click',()=>{
      if(!allowed)return;
      const start=Math.min(cursorStart,input.value.length),end=Math.min(cursorEnd,input.value.length);
      if(input.value.length-(end-start)+emoji.length>input.maxLength){error.textContent='Your message is full. Remove a little text to add an emoji.';return;}
      input.setRangeText(emoji,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();closePicker();error.textContent='';
    });emojiGrid.append(button);
  }

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
    input.value='';cursorStart=cursorEnd=0;document.querySelector('[data-chat-count]').textContent='0/500';
    if(atBottom)bottom();else newer.hidden=false;
    input.focus();
  });
  scroller.addEventListener('scroll',()=>{if(scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<48)newer.hidden=true;});
  newer.addEventListener('click',bottom);
  return {update(state){
    allowed=chatCanPost(rehearsalId,state);input.disabled=!allowed;send.disabled=!allowed;emojiToggle.disabled=!allowed;if(!allowed)closePicker();
    input.placeholder=allowed?'Type a rehearsal message…':rehearsalId?'This session’s chat is closed':'Chat is not connected yet';
    hint.textContent=rehearsalId?'Local rehearsal · messages stay in this browser':'Chat opens with the room and closes with the episode.';
  }};
}
