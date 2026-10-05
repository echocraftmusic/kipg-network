import {getCommunityClient,communityError} from './community-client.js?v=20261003-shared';
import {youtubeId,easternTime} from './room-state.js?v=20261002-room-timing';
const drawer=document.querySelector('.vr-projector-drawer');
const form=document.querySelector('[data-projector-form]');
const status=document.querySelector('[data-projector-error]');
const upcoming=document.createElement('section');upcoming.className='vr-host-shows';drawer.querySelector('.vr-projector-drawer-body').append(upcoming);
let client=null,authorized=false,busy=false,generation=0,saved=[];
try{saved=JSON.parse(localStorage.getItem('kipg-projector-videos')||'[]');if(!Array.isArray(saved))saved=[];}catch{}
function renderSaved(){
  const container=document.querySelector('[data-saved-videos]');container.replaceChildren();
  for(const entry of saved.filter(item=>youtubeId(item.videoId))){
    const row=document.createElement('div');row.className='vr-saved-video';const label=document.createElement('span');label.textContent=entry.title;
    const button=document.createElement('button');button.type='button';button.className='kipg-btn kipg-btn--outline';button.textContent='Select';
    button.addEventListener('click',()=>{form.elements.video.value=entry.videoId;form.elements.title.value=entry.title;form.elements.duration.value=entry.durationMinutes;});row.append(label,button);container.append(row);
  }
  if(!container.children.length)container.textContent='Video choices saved on this device appear here after scheduling a show.';
}
async function shows(){
  if(!authorized||!client)return;const ticket=generation;
  const {data,error}=await client.from('kipg_sessions').select('id,title,starts_at,ends_at').eq('cancelled',false).gt('ends_at',new Date(Date.now()-300000).toISOString()).order('starts_at',{ascending:true}).limit(100);
  if(ticket!==generation||!authorized)return;if(error){status.textContent=communityError(error);return;}
  upcoming.replaceChildren();const h=document.createElement('h2');h.textContent='Shared shows';upcoming.append(h);
  for(const show of data){
    const row=document.createElement('div');row.className='vr-saved-video';const label=document.createElement('span');label.textContent=`${show.title} · ${easternTime(show.starts_at)}`;
    const button=document.createElement('button');button.type='button';button.className='kipg-btn kipg-btn--outline';button.textContent=Date.parse(show.starts_at)>Date.now()?'Cancel show':'End show';
    button.addEventListener('click',async()=>{
      if(!authorized||busy||!confirm(`${button.textContent}: ${show.title}? Ending a started show keeps chat open for five minutes.`))return;
      button.disabled=true;try{const {error}=await client.rpc('kipg_end_show',{target_show:show.id});if(error)throw error;await shows();window.dispatchEvent(new Event('kipg-show-changed'));status.textContent='Show updated.';}catch(error){status.textContent=communityError(error);}finally{button.disabled=false;}
    });row.append(label,button);upcoming.append(row);
  }
  if(!data.length){const p=document.createElement('p');p.textContent='No shared shows scheduled.';upcoming.append(p);}
}
async function permissions(){
  const ticket=++generation;
  try{const {data,error}=await client.auth.getSession();if(error)throw error;let caps={};if(data.session?.user?.email_confirmed_at){const rights=await client.rpc('kipg_capabilities');if(rights.error)throw rights.error;caps=rights.data||{};}
    if(ticket!==generation)return;authorized=Boolean(caps.projector);drawer.hidden=!authorized;if(authorized){renderSaved();await shows();}else{upcoming.replaceChildren();drawer.open=false;}
  }catch{if(ticket===generation){authorized=false;drawer.hidden=true;upcoming.replaceChildren();}}
}
form.elements.start.addEventListener('change',()=>{const date=new Date(form.elements.start.value);document.querySelector('[data-eastern-preview]').textContent=Number.isFinite(date.getTime())?`Eastern: ${easternTime(date)}`:'Select a valid date and time.';});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!authorized||!client||busy)return;status.textContent='';
  const videoId=youtubeId(form.elements.video.value),title=form.elements.title.value.trim(),duration=Number(form.elements.duration.value);
  if(!videoId||!title||!Number.isFinite(duration)||duration<1||duration>720){status.textContent='Enter a valid YouTube link, title, and duration between 1 and 720 minutes.';return;}
  const mode=event.submitter?.value||'now';const date=mode==='schedule'?new Date(form.elements.start.value):null;
  if(date&&(!Number.isFinite(date.getTime())||date.getTime()<=Date.now())){status.textContent='Choose a future date and time.';return;}
  busy=true;const ticket=generation;for(const button of form.querySelectorAll('button'))button.disabled=true;
  try{
    const {error}=await client.rpc('kipg_project_show',{video_id:videoId,show_title:title,duration_minutes:duration,scheduled_start:date?.toISOString()||null});if(error)throw error;
    if(ticket!==generation||!authorized)return;
    saved=[{videoId,title,durationMinutes:duration},...saved.filter(item=>item.videoId!==videoId)].slice(0,20);try{localStorage.setItem('kipg-projector-videos',JSON.stringify(saved));}catch{}
    renderSaved();status.textContent=mode==='now'?'Show created for everyone. Playback starts after the one-minute countdown.':'Shared show scheduled.';
    await shows();window.dispatchEvent(new Event('kipg-show-changed'));
  }catch(error){if(ticket===generation)status.textContent=communityError(error);}finally{busy=false;for(const button of form.querySelectorAll('button'))button.disabled=false;}
});
try{client=await getCommunityClient();client.auth.onAuthStateChange(()=>setTimeout(permissions,0));await permissions();}catch{drawer.hidden=true;}
