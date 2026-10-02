import {youtubeId,easternTime,sessionTiming} from './room-state.js?v=20261002-room-timing';
const form=document.querySelector('[data-projector-form]');
const error=document.querySelector('[data-projector-error]');
let saved=[];
try{saved=JSON.parse(localStorage.getItem('kipg-projector-videos') || '[]');if(!Array.isArray(saved))saved=[];}catch{}
function showSaved(){
  const container=document.querySelector('[data-saved-videos]');container.replaceChildren();
  for(const entry of saved.filter(item=>youtubeId(item.videoId))){
    const row=document.createElement('div');row.className='vr-saved-video';
    const label=document.createElement('span');label.textContent=entry.title;
    const details=document.createElement('small');details.textContent=`${entry.videoId} · ${entry.durationMinutes} minutes`;label.append(details);
    const button=document.createElement('button');button.type='button';button.className='kipg-btn kipg-btn--outline';button.textContent='Select';
    button.addEventListener('click',()=>{form.elements.video.value=entry.videoId;form.elements.title.value=entry.title;form.elements.duration.value=entry.durationMinutes;form.elements.video.focus();});
    row.append(label,button);container.append(row);
  }
  if(!container.children.length)container.textContent='Your video choices will appear here after your first rehearsal.';
}
form.elements.start.addEventListener('change',()=>{
  const date=new Date(form.elements.start.value);
  document.querySelector('[data-eastern-preview]').textContent=Number.isFinite(date.getTime()) ? `Eastern: ${easternTime(date)}` : 'Select a valid date and time.';
});
form.addEventListener('submit',event=>{
  event.preventDefault();error.textContent='';
  const videoId=youtubeId(form.elements.video.value);
  const title=form.elements.title.value.trim();const durationMinutes=Number(form.elements.duration.value);
  if(!videoId){error.textContent='Enter a valid YouTube link or 11-character video ID.';return;}
  if(!title || durationMinutes<=0 || durationMinutes>720){error.textContent='Enter a title and an episode length between 1 and 720 minutes.';return;}
  const mode=event.submitter?.value || 'now';
  let timing;
  try{timing=sessionTiming(mode,form.elements.start.value);}catch(failure){error.textContent=failure.message;return;}
  const id=crypto.randomUUID();
  const session={id,videoId,title,durationSeconds:durationMinutes*60,...timing,summary:'Projector 1 browser rehearsal.'};
  const data={version:1,rooms:[{id:'theater-1',name:'Theater 1',projectorId:'projector-1',projectorName:'Projector 1',session}]};
  try {
    saved=[{videoId,title,durationMinutes},...saved.filter(item=>item.videoId!==videoId)].slice(0,20);
    localStorage.setItem('kipg-projector-videos',JSON.stringify(saved));localStorage.setItem(`kipg-rehearsal-${id}`,JSON.stringify(data));
    location.assign(`live.html?room=theater-1&rehearsal=${encodeURIComponent(id)}`);
  } catch {error.textContent='Your browser is blocking local storage. Allow storage for this site to run a rehearsal.';}
});
showSaved();
