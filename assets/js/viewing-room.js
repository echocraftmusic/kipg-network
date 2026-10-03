import {roomState,easternTime} from './room-state.js?v=20261002-room-timing';
import {attachChat} from './room-chat.js?v=20261003-emoji-stay';
import {loadSharedRoom} from './shared-room.js?v=20261003-shared';
import {connectSharedChat} from './shared-chat.js?v=20261003-room-return';
import {rememberRoom} from './room-navigation.js?v=20261003-room-return';
const $ = selector => document.querySelector(selector);
const params = new URL(location.href).searchParams;
const roomId = params.get('room') || 'theater-1';
const rehearsalId = params.get('rehearsal');
const returnRoom=rememberRoom(location.href,location.href);
const signin=$('[data-chat-signin]');
if(rehearsalId)signin.hidden=true;
else if(returnRoom){const account=new URL('community.html',location.href);account.searchParams.set('mode','signin');account.searchParams.set('returnTo',returnRoom);signin.href=account.href;}
const chat=attachChat(rehearsalId);
const sharedChat=rehearsalId ? null : connectSharedChat(chat);
const screen=$('.vr-screen');
const layout=$('.vr-layout');
const chatPanel=$('.vr-chat');
const wideButton=$('[data-wide-video]');
const fullscreenButton=$('[data-fullscreen-video]');
const sizeChat=()=>{const height=`${$('.vr-theater').getBoundingClientRect().height}px`;chatPanel.style.setProperty('--vr-chat-height',height);$('[data-chat-rail]').style.setProperty('--vr-chat-height',height);};
new ResizeObserver(sizeChat).observe($('.vr-theater'));
sizeChat();
function setWide(wide){
  layout.classList.toggle('vr-layout--wide',wide);
  chatPanel.hidden=wide;
  $('[data-chat-rail]').hidden=!wide;
  wideButton.textContent=wide?'Show chat':'Expand video';
  wideButton.setAttribute('aria-pressed',String(wide));
  if(wide && chatPanel.contains(document.activeElement))wideButton.focus();
}
wideButton.addEventListener('click',()=>setWide(!layout.classList.contains('vr-layout--wide')));
$('[data-restore-chat]').addEventListener('click',()=>{setWide(false);wideButton.focus();});
function maximizeFallback(active){
  screen.classList.toggle('vr-screen--maximized',active);
  document.body.classList.toggle('vr-video-maximized',active);
  $('[data-exit-fullscreen]').hidden=!active;
  if(!active)fullscreenButton.focus();
}
fullscreenButton.addEventListener('click',async()=>{
  try {await screen.requestFullscreen();}
  catch {maximizeFallback(true);}
});
$('[data-exit-fullscreen]').addEventListener('click',()=>{
  if(document.fullscreenElement===screen)document.exitFullscreen().catch(()=>{});
  else maximizeFallback(false);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && screen.classList.contains('vr-screen--maximized'))maximizeFallback(false);});
document.addEventListener('fullscreenchange',()=>{
  const full=document.fullscreenElement===screen;
  $('[data-exit-fullscreen]').hidden=!full;
  if(!full)fullscreenButton.focus();
});
let room, session, player, ready=false, joined=false, activeId, ended=false, runtimeDuration, apiPromise, lastPhase, failures=0;
function state() { return roomState(rehearsalId && runtimeDuration ? {...session,durationSeconds:runtimeDuration} : session); }
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
        if(event.data===0 && state().phase==='playing')$('[data-player-notice]').textContent='Your player reached the end. The room’s shared session window determines when the event closes.';
      }
    }});
  } catch(error){ended=false;apiPromise=null;$('[data-player-notice]').textContent=error.message;joined=false;clearPlayer();tick();}
}
function tick() {
  if(!room)return;
  const current=state();
  chat.update(current);sharedChat?.update(current,session);
  const phaseChanged=current.phase!==lastPhase;
  const labels={idle:'No session scheduled',scheduled:'Scheduled',lobby:'Room open',playing:'Now showing',aftershow:'Goodbye chat · 5 minutes',ended:'Session ended'};
  if(current.phase!==lastPhase){$('[data-room-status]').textContent=labels[current.phase];lastPhase=current.phase;}
  $('[data-join]').disabled=!['lobby','playing'].includes(current.phase);
  $('[data-join]').textContent=current.phase==='lobby' ? (joined?'Your seat is ready':'Take your seat') : 'Join the show';
  $('[data-join]').hidden=joined && current.phase==='playing';
  $('[data-live-indicator]').hidden=current.phase!=='playing' || joined;
  $('[data-join-area]').hidden=joined && current.phase==='playing';
  $('[data-countdown]').hidden=current.countdownSeconds==null;
  $('[data-countdown]').textContent=current.countdownSeconds==null?'':`Starting in ${Math.floor(current.countdownSeconds/60)}:${String(current.countdownSeconds%60).padStart(2,'0')}`;
  $('[data-catch-up]').hidden=!(ready && current.phase==='playing');
  if(rehearsalId){
    $('[data-chat-status]').textContent=current.chatWindow?'Local rehearsal':'Closed';
    $('[data-chat-copy]').textContent='Test the message layout here. This local rehearsal does not use shared community chat.';
    $('[data-chat-member]').textContent='Local rehearsal · no sign-in required';
  }
  if(current.phase==='idle')curtain('Projector 1 · Standing by','Your seat is waiting','Our next shared viewing will appear here when it is scheduled.');
  if(current.phase==='scheduled')curtain('Theater 1 · Scheduled',session.title,`The room opens ${easternTime(current.opensAt)}.`);
  if(current.phase==='lobby')curtain('Theater 1 · Starting soon',session.title,`The episode begins ${easternTime(current.startsAt)}. ${joined?'Your seat is ready. Playback will begin when the show starts.':'Take your seat and say hello in chat while we get ready.'}`);
  if(current.phase==='playing'){
    if(joined)startPlayer();else curtain('Projector 1 · Now showing',session.title,'Join the show at the room’s current playback position.');
  }
  if(current.phase==='aftershow'){
    if(ready && phaseChanged)player.stopVideo();
    curtain('Theater 1 · Goodbye chat','Thank you for joining us',`Stay a little longer to say goodbye. Chat closes ${easternTime(current.closesAt)}.`);
  }
  if(current.phase==='ended'){
    if(ready && phaseChanged)player.stopVideo();
    curtain('Theater 1 · Session ended','Thank you for joining us','This viewing session and its chat window have closed. Browse completed episodes while we prepare the next gathering.');
  }
}
function setRoom(next) {
  const nextSession=next.session || null; roomState(nextSession);
  const key=JSON.stringify(nextSession && [nextSession.id,nextSession.videoId,nextSession.startsAt]);
  if(key!==activeId){clearPlayer();joined=false;activeId=key;lastPhase=null;}
  room=next;session=nextSession;
  $('[data-room-name]').textContent=next.name;$('[data-projector-name]').textContent=next.projectorName;
  $('[data-session-title]').textContent=session?.title || 'No session scheduled';
  $('[data-session-summary]').textContent=session?.summary || 'Our next shared KIPG viewing will be announced here.';
  $('[data-start-time]').textContent=session ? easternTime(session.startsAt) : 'To be announced';
  $('[data-chat-time]').textContent=session ? `${easternTime(session.opensAt || session.startsAt)} until five minutes after the episode ends` : 'Opens with the room · closes five minutes after the episode';
  tick();
}
async function refresh() {
  try {
    let data;
    if(rehearsalId){data=JSON.parse(localStorage.getItem(`kipg-rehearsal-${rehearsalId}`));$('[data-rehearsal]').hidden=false;}
    else {data={rooms:[await loadSharedRoom(roomId)]};}
    const next=data?.rooms?.find(item=>item.id===roomId);if(!next)throw new Error('This room could not be found. Return to Theater 1 or create a new rehearsal.');
    setRoom(next);failures=0;
  } catch(error){failures++;$('[data-player-notice]').textContent=error.message;if(!room || failures>=3){room=null;chat.update({chatWindow:false});sharedChat?.update({chatWindow:false},null);clearPlayer();$('[data-room-status]').textContent='Room unavailable';$('[data-join]').disabled=true;curtain('Please try again','The room could not load','Reload this page to reconnect to the session.');}}
}
$('[data-join]').addEventListener('click',()=>{joined=true;tick();});
$('[data-catch-up]').addEventListener('click',()=>{if(ready && state().phase==='playing'){player.seekTo(state().position,true);player.playVideo();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();}});
await refresh();setInterval(tick,1000);if(!rehearsalId)setInterval(refresh,15000);
