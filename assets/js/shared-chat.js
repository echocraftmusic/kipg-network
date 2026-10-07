import {getCommunityClient,communityError} from './community-client.js?v=20261003-shared';
import {attachModeration} from './moderation.js?v=20261005-staff';
export function sharedCanPost(state,user,profile,connected,now=Date.now()){
  return Boolean(state?.chatWindow && user?.email_confirmed_at && profile && !profile.suspended && !(Date.parse(profile.muted_until)>now) && connected);
}
export function messageRows(rows){
  const unique=new Map();
  for(const row of rows){if(row.hidden){unique.delete(row.id);continue;}if(row.id&&typeof row.body==='string'&&Number.isFinite(Date.parse(row.created_at)))unique.set(row.id,{id:row.id,text:row.body,at:row.created_at,username:row.username});}
  return [...unique.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id)).slice(-100);
}
function createRoomMembers(){
  const heading=document.querySelector('.vr-chat-heading');
  if(!heading)return null;
  const wrap=document.createElement('div');wrap.className='vr-members';wrap.hidden=true;
  const button=document.createElement('button');button.type='button';button.className='vr-members-toggle';button.setAttribute('aria-expanded','false');button.textContent='Room Members';
  const panel=document.createElement('div');panel.className='vr-members-panel';panel.hidden=true;
  panel.innerHTML='<div class="vr-members-head"><strong>In the room</strong><span data-members-count>0</span></div><div data-members-list><p class="vr-members-empty">Connecting…</p></div><div data-hidden-members hidden><div class="vr-members-head vr-members-head--hidden"><strong>Hidden / Restricted</strong><span data-hidden-count>0</span></div><div data-hidden-list><p class="vr-members-empty">No hidden members.</p></div></div>';
  wrap.append(button,panel);heading.append(wrap);
  const count=panel.querySelector('[data-members-count]'),list=panel.querySelector('[data-members-list]');
  const hiddenSection=panel.querySelector('[data-hidden-members]'),hiddenCount=panel.querySelector('[data-hidden-count]'),hiddenList=panel.querySelector('[data-hidden-list]');
  const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
  button.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)wrap.dispatchEvent(new Event('vr-members-open'));});
  document.addEventListener('click',event=>{if(!panel.hidden&&!wrap.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();button.focus();}});
  return {
    wrap,
    render(attendees){
      const named=attendees.filter(item=>item.username&&item.username!=='Guest viewer');
      const guests=attendees.filter(item=>!item.username||item.username==='Guest viewer').length;
      count.textContent=String(attendees.length);
      button.textContent='Room Members ('+attendees.length+')';
      list.replaceChildren();
      for(const item of named){const row=document.createElement('div');row.className='vr-member-row';const name=document.createElement('span');name.textContent=item.username;row.append(name);list.append(row);}
      if(guests){const row=document.createElement('div');row.className='vr-member-row';const name=document.createElement('span');name.textContent='Guest viewers ('+guests+')';row.append(name);list.append(row);}
      if(!attendees.length){const p=document.createElement('p');p.className='vr-members-empty';p.textContent='No one else is showing as present yet.';list.append(p);}
    },
    setStaff(show){wrap.hidden=!show;hiddenSection.hidden=!show;if(!show){panel.hidden=true;button.setAttribute('aria-expanded','false');hiddenCount.textContent='0';hiddenList.innerHTML='<p class="vr-members-empty">No hidden members.</p>';}} ,
    renderHidden(items){
      hiddenSection.hidden=false;hiddenCount.textContent=String(items.length);hiddenList.replaceChildren();
      for(const item of items){const row=document.createElement('div');row.className='vr-member-row vr-member-row--hidden';const main=document.createElement('span');main.textContent=item.username||'Member';const meta=document.createElement('small');meta.textContent=item.label;row.append(main,meta);hiddenList.append(row);}
      if(!items.length){const p=document.createElement('p');p.className='vr-members-empty';p.textContent='No currently hidden members.';hiddenList.append(p);}
    }
  };
}
function hiddenLabel(incident){
  if(!incident.until_at)return incident.strike?'Hidden indefinitely · incident '+incident.strike:'Hidden indefinitely';
  const ms=Date.parse(incident.until_at)-Date.now();
  if(ms<=0)return 'Expired';
  const minutes=Math.ceil(ms/60000),hours=Math.ceil(ms/3600000),days=Math.ceil(ms/86400000);
  const remaining=minutes<60?minutes+' min left':hours<48?hours+' hr left':days+' days left';
  return incident.strike?remaining+' · incident '+incident.strike:remaining;
}
export function connectSharedChat(view){
  const status=document.querySelector('[data-chat-status]'),copy=document.querySelector('[data-chat-copy]');
  const roomMembers=createRoomMembers();
  let client=null,user=null,profile=null,current={},session=null,channel=null,presenceChannel=null,presenceIdentity='',presenceSignature='',caps={},generation=0,authGeneration=0,connected=false,rows=[],refreshing=false,arrivals=[],failure='';
  const moderation=document.querySelector('.vr-program')?attachModeration(view,()=>refreshMessages(generation)):null;
  function browserPresenceId(){
    try{let id=localStorage.getItem('kipg-room-presence-id');if(!id){id=crypto.randomUUID();localStorage.setItem('kipg-room-presence-id',id);}return id;}
    catch{return crypto.randomUUID();}
  }
  function renderPresence(){
    if(!presenceChannel||!roomMembers)return;
    const state=presenceChannel.presenceState(),attendees=[];
    for(const entries of Object.values(state||{})){const latest=Array.isArray(entries)?entries.at(-1):null;if(latest)attendees.push({username:latest.username||'Guest viewer',online_at:latest.online_at||''});}
    roomMembers.render(attendees);
  }
  async function startPresence(){
    if(!client||presenceChannel)return;
    presenceIdentity=user?.id||browserPresenceId();
    presenceSignature=presenceIdentity+'|'+(profile?.username||'Guest viewer');
    presenceChannel=client.channel('kipg-room-presence-'+location.pathname,{config:{presence:{key:presenceIdentity}}})
      .on('presence',{event:'sync'},renderPresence)
      .on('presence',{event:'join'},renderPresence)
      .on('presence',{event:'leave'},renderPresence)
      .subscribe(async state=>{if(state!=='SUBSCRIBED')return;await presenceChannel.track({username:profile?.username||'Guest viewer',online_at:new Date().toISOString()});renderPresence();});
  }
  async function restartPresence(){
    const nextIdentity=user?.id||browserPresenceId(),nextSignature=nextIdentity+'|'+(profile?.username||'Guest viewer');
    if(presenceChannel&&presenceSignature===nextSignature)return;
    if(presenceChannel&&client){const old=presenceChannel;presenceChannel=null;try{await old.untrack();}catch{}try{await client.removeChannel(old);}catch{}}
    await startPresence();
  }
  async function refreshHiddenMembers(){
    if(!client||!(caps.moderator||caps.administrator)||!roomMembers)return;
    roomMembers.setStaff(true);
    try{
      const {data,error}=await client.rpc('kipg_review_incidents');if(error)throw error;
      const byUser=new Map();
      for(const incident of data||[]){if(incident.action!=='hide'||incident.reversed_at||incident.restored_at)continue;if(incident.until_at&&Date.parse(incident.until_at)<=Date.now())continue;const key=incident.username||incident.member_id||incident.id;const previous=byUser.get(key);if(!previous||Date.parse(incident.created_at)>Date.parse(previous.created_at))byUser.set(key,incident);}
      roomMembers.renderHidden([...byUser.values()].map(incident=>({username:incident.username,label:hiddenLabel(incident)})));
    }catch{roomMembers.renderHidden([]);}
  }
  roomMembers?.wrap.addEventListener('vr-members-open',()=>{if(caps.moderator||caps.administrator)void refreshHiddenMembers();});

  function paint(){
    const allowed=sharedCanPost(current,user,profile,connected);
    let hint=!current.chatWindow?'Chat opens 15 minutes before the show and closes five minutes afterward.':!client?'Connecting to community…':!user?'Sign in to join the conversation.':!user.email_confirmed_at?'Verify your email to chat.':!profile?'Preparing your community username…':profile.suspended?'Chat access is suspended.':Date.parse(profile.muted_until)>Date.now()?'Your chat access is temporarily muted.':!connected?'Reconnecting to shared chat…':`Chatting as ${profile.username}`;
    if(!current.chatWindow && profile)hint=`Signed in as ${profile.username} · Chat opens with the next show.`;
    if(failure)hint=failure;
    document.querySelector('[data-chat-member]').textContent=profile?`Signed in as ${profile.username}`:user?'Signed in · preparing your username':client?'Watching as a guest':'Checking community account…';
    status.textContent=!current.chatWindow?'Closed':connected?'Shared chat':'Connecting';
    copy.textContent=current.chatWindow?'Say hello to the community. Everyone here shares this conversation.':'The conversation opens with the next show. Anyone can watch; verified community members can chat.';
    view.setAccess(allowed,hint,allowed?'Say something to the community…':user?'Chat is unavailable right now':'Sign in to chat');
    document.querySelector('[data-chat-signin]').hidden=Boolean(user);
  }
  async function refreshProfile(){
    if(!client)return;
    const ticket=++authGeneration;const previousUser=user?.id;profile=null;paint();
    try{
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(ticket!==authGeneration)return;user=data.session?.user || null;
      if(previousUser!==user?.id){stop();moderation?.setAccess({});}
      if(user?.email_confirmed_at){const response=await client.rpc('kipg_ensure_profile');if(response.error)throw response.error;if(ticket!==authGeneration)return;profile=response.data;}
      if(user?.email_confirmed_at){const rights=await client.rpc('kipg_capabilities');if(ticket!==authGeneration)return;caps=rights.error?{}:rights.data||{};moderation?.setAccess(caps);roomMembers?.setStaff(Boolean(caps.moderator||caps.administrator));}else {caps={};moderation?.setAccess({});roomMembers?.setStaff(false);}
      failure='';
    }catch(error){if(ticket===authGeneration)failure='Your community profile could not connect. Reload or sign in again.';}
    if(ticket===authGeneration){subscribe();paint();await restartPresence();}
  }
  async function refreshMessages(ticket){
    if(!client||!session||!current.chatWindow||ticket!==generation||refreshing)return;
    refreshing=true;arrivals=[];const id=session.id;
    try{
      const {data,error}=await client.from('kipg_messages').select('id,body,created_at,username,hidden').eq('session_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
      if(error)throw error;if(ticket!==generation)return;
      rows=[...data,...arrivals];view.replace(messageRows(rows));failure='';
    }catch(error){if(ticket===generation){connected=false;failure='Shared messages could not reconnect. Reload to try again.';view.replace([]);}}
    finally{if(ticket===generation){refreshing=false;paint();}}
  }
  function stop(){
    generation++;connected=false;refreshing=false;rows=[];arrivals=[];view.replace([]);
    if(channel&&client)client.removeChannel(channel).catch(()=>{});channel=null;
  }
  function subscribe(){
    if(!client||channel||!session||!current.chatWindow)return;
    const ticket=generation,id=session.id;
    channel=client.channel(`theater-1-${id}-${ticket}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'kipg_messages',filter:`session_id=eq.${id}`},event=>{
        if(ticket!==generation||!current.chatWindow)return;
        const row=event.new;rows.push(row);if(refreshing)arrivals.push(row);view.replace(messageRows(rows));
        if(rows.length>200)rows=rows.slice(-100);
      }).subscribe(async state=>{
        if(ticket!==generation)return;
        connected=state==='SUBSCRIBED';paint();
        if(connected)await refreshMessages(ticket);
      });
  }
  view.setSender(async body=>{
    if(!sharedCanPost(current,user,profile,connected)||!session)throw new Error('Sign in while this show’s chat is open.');
    const {error}=await client.from('kipg_messages').insert({session_id:session.id,body});
    if(error){refreshProfile();throw new Error(communityError(error));}
    await refreshMessages(generation);
  });
  getCommunityClient().then(async service=>{
    client=service;client.auth.onAuthStateChange(()=>{setTimeout(()=>refreshProfile(),0);});
    await refreshProfile();subscribe();paint();await startPresence();
  }).catch(()=>{failure='Community service could not connect. Reload to try again.';paint();});
  let timer,messageTimer;
  function startPolling(){if(timer==null)timer=setInterval(()=>{refreshProfile();},15000);if(messageTimer==null)messageTimer=setInterval(()=>{if(current.chatWindow)refreshMessages(generation);},3000);}
  startPolling();
  window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(messageTimer);timer=null;messageTimer=null;stop();if(presenceChannel&&client){presenceChannel.untrack().catch(()=>{});client.removeChannel(presenceChannel).catch(()=>{});presenceChannel=null;}moderation?.setAccess({});});
  window.addEventListener('pageshow',event=>{if(event.persisted){startPolling();refreshProfile().then(()=>{subscribe();paint();});}});
  return {update(state,next){
    const changed=next?.id!==session?.id||Boolean(state.chatWindow)!==Boolean(current.chatWindow);
    current=state;if(changed)stop();session=next;
    if(current.chatWindow)subscribe();paint();
  }};
}
