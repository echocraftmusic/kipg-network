import {roomState,easternTime} from './room-state.js';
import {attachChat} from './room-chat.js';
const $ = selector => document.querySelector(selector);
const params = new URL(location.href).searchParams;
const roomId = params.get('room') || 'theater-1';
const rehearsalId = params.get('rehearsal');
const chat=attachChat(rehearsalId);
const sizeChat=()=>{const height=$('.vr-screen').getBoundingClientRect().height+$('.vr-screen-controls').getBoundingClientRect().height;$('.vr-chat').style.setProperty('--vr-chat-height',`${height}px`);};
new ResizeObserver(sizeChat).observe($('.vr-screen'));
new ResizeObserver(sizeChat).observe($('.vr-screen-controls'));
let room, session, player, ready=false, joined=false, activeId, ended=false, runtimeDuration, apiPromise, lastPhase, failures=0;
function state() { return roomState(runtimeDuration ? {...session,durationSeconds:runtimeDuration} : session); }
function api() {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) apiPromise=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('The video player took too long to load. Please try again.')),20000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve();};
    const tag=document.createElement('script'); tag.src='https://www.youtube.com/iframe_api';
    tag.onerror=()=>{clearTimeout(timeout);reject(new Error('The video player could not load. Please check your connection.'));}; document.head.append(tag);
  });
  return apiPromise;
}
function curtain(kicker,title,copy) {
  $('[data-curtain]').hidden=false; $('#vr-player').hidden=true;
  $('[data-screen-kicker]').textContent=kicker; $('[data-screen-title]').textContent=title; $('[data-screen-copy]').textContent=copy;
}
function clearPlayer() {
  player?.destroy();player=null;ready=false;runtimeDuration=undefined;ended=false;
  const mount=document.createElement('div');mount.id='vr-player';mount.hidden=true;
  if(!$('#vr-player')) $('.vr-screen').prepend(mount);
}
async function startPlayer() {
  if (player || ended) return;
  ended=true; // prevent concurrent player construction while loading
  const expected=activeId;
  try {
    await api();
    if(expected!==activeId || state().phase!=='playing') {ended=false;return;}
    $('#vr-player').hidden=false;$('[data-curtain]').hidden=true;
    player=new YT.Player('vr-player',{videoId:session.videoId,width:'100%',height:'100%',playerVars:{playsinline:1,origin:location.origin,start:Math.floor(state().position)},events:{
      onReady:event=>{
        ready=true;const duration=event.target.getDuration();if(duration>0)runtimeDuration=duration;
        const current=state();
        if(current.phase==='playing'){event.target.seekTo(current.position,true);event.target.playVideo();}
        else tick();
      },
      onAutoplayBlocked:()=>{$('[data-player-notice]').textContent='Press play in the video to enable sound, then use “Return to the room’s position” to catch up.';},
      onError:()=>{$('[data-player-notice]').textContent='This video could not play. It may be unavailable or have embedding disabled. Ask the host to check the Projector link.';},
      onStateChange:event=>{
        if(event.data===1){const duration=player.getDuration();if(duration>0)runtimeDuration=duration;}
        if(event.data===0 && state().phase!=='ended')$('[data-player-notice]').textContent='Your player reached the end. The room’s shared session window determines when the event closes.';
      }
    }});
  } catch(error){ended=false;apiPromise=null;$('[data-player-notice]').textContent=error.message;joined=false;clearPlayer();tick();}
}
function tick() {
  if(!room)return;
  const current=state();
  chat.update(current);
  const labels={idle:'No session scheduled',scheduled:'Scheduled',lobby:'Room open',playing:'Now showing',ended:'Session ended'};
  if(current.phase!==lastPhase){$('[data-room-status]').textContent=labels[current.phase];lastPhase=current.phase;}
  $('[data-join]').disabled=!['lobby','playing'].includes(current.phase);
  $('[data-join]').textContent=current.phase==='lobby' ? (joined?'Your seat is ready':'Take your seat') : 'Join the show';
  $('[data-join]').hidden=joined && current.phase==='playing';
  $('[data-catch-up]').hidden=!(ready && current.phase==='playing');
  $('[data-chat-status]').textContent=current.chatWindow?(rehearsalId?'Local rehearsal':'Not connected'):'Closed';
  $('[data-chat-copy]').textContent=rehearsalId ? 'Test the message layout here. These messages are visible only in this browser.' : current.chatWindow ? 'This session’s chat window is open, but posting is not available yet. We’re preparing the KIPG community conversation.' : 'Chat is not available yet. It will open with the room and close when the shared episode ends.';
  if(current.phase==='idle')curtain('Projector 1 · Standing by','Your seat is waiting','Our next shared viewing will appear here when it is scheduled.');
  if(current.phase==='scheduled')curtain('Theater 1 · Scheduled',session.title,`The room opens ${easternTime(current.opensAt)}.`);
  if(current.phase==='lobby')curtain('Theater 1 · Room open',session.title,`The episode begins ${easternTime(current.startsAt)}. Take your seat to join when it starts.`);
  if(current.phase==='playing'){
    if(joined)startPlayer();else curtain('Projector 1 · Now showing',session.title,'Join the show at the room’s current playback position.');
  }
  if(current.phase==='ended'){
    if(ready)player.stopVideo();
    curtain('Theater 1 · Session ended','Thank you for joining us','This viewing session and its chat window have closed. Browse completed episodes while we prepare the next gathering.');
  }
}
function setRoom(next) {
  const nextSession=next.session || null; roomState(nextSession);
  const key=JSON.stringify(nextSession);
  if(key!==activeId){clearPlayer();joined=false;activeId=key;lastPhase=null;}
  room=next;session=nextSession;
  $('[data-room-name]').textContent=next.name;$('[data-projector-name]').textContent=next.projectorName;
  $('[data-session-title]').textContent=session?.title || 'No session scheduled';
  $('[data-session-summary]').textContent=session?.summary || 'Our next shared KIPG viewing will be announced here.';
  $('[data-start-time]').textContent=session ? easternTime(session.startsAt) : 'To be announced';
  $('[data-chat-time]').textContent=session ? `${easternTime(session.opensAt || session.startsAt)} until the episode ends` : 'Opens with the room · closes with the episode';
  tick();
}
async function refresh() {
  try {
    let data;
    if(rehearsalId){data=JSON.parse(localStorage.getItem(`kipg-rehearsal-${rehearsalId}`));$('[data-rehearsal]').hidden=false;}
    else {const response=await fetch(new URL('../../data/viewing-rooms.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('Room schedule unavailable.');data=await response.json();}
    const next=data?.rooms?.find(item=>item.id===roomId);if(!next)throw new Error('This room could not be found. Return to Theater 1 or create a new rehearsal.');
    setRoom(next);failures=0;
  } catch(error){failures++;$('[data-player-notice]').textContent=error.message;if(!room || failures>=3){room=null;chat.update({chatWindow:false});clearPlayer();$('[data-room-status]').textContent='Room unavailable';$('[data-join]').disabled=true;curtain('Please try again','The room could not load','Reload this page to reconnect to the session.');}}
}
$('[data-join]').addEventListener('click',()=>{joined=true;tick();});
$('[data-catch-up]').addEventListener('click',()=>{if(ready && state().phase==='playing'){player.seekTo(state().position,true);player.playVideo();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();}});
await refresh();setInterval(tick,1000);if(!rehearsalId)setInterval(refresh,15000);
