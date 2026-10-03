import {getCommunityClient,communityError} from './community-client.js?v=20261003-shared';
export function sharedCanPost(state,user,profile,connected,now=Date.now()){
  return Boolean(state?.chatWindow && user?.email_confirmed_at && profile && !profile.suspended && !(Date.parse(profile.muted_until)>now) && connected);
}
export function messageRows(rows){
  const unique=new Map();
  for(const row of rows){if(row.hidden){unique.delete(row.id);continue;}if(row.id&&typeof row.body==='string'&&Number.isFinite(Date.parse(row.created_at)))unique.set(row.id,{id:row.id,text:row.body,at:row.created_at,username:row.username});}
  return [...unique.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id)).slice(-100);
}
export function connectSharedChat(view){
  const status=document.querySelector('[data-chat-status]'),copy=document.querySelector('[data-chat-copy]');
  let client=null,user=null,profile=null,current={},session=null,channel=null,generation=0,authGeneration=0,connected=false,rows=[],refreshing=false,arrivals=[],failure='';
  function paint(){
    const allowed=sharedCanPost(current,user,profile,connected);
    let hint=!current.chatWindow?'Chat opens 15 minutes before the show and closes five minutes afterward.':!client?'Connecting to community…':!user?'Sign in to join the conversation.':!user.email_confirmed_at?'Verify your email to chat.':!profile?'Preparing your community username…':profile.suspended?'Chat access is suspended.':Date.parse(profile.muted_until)>Date.now()?'Your chat access is temporarily muted.':!connected?'Reconnecting to shared chat…':`Chatting as ${profile.username}`;
    if(failure)hint=failure;
    status.textContent=!current.chatWindow?'Closed':connected?'Shared chat':'Connecting';
    copy.textContent=current.chatWindow?'Say hello to the community. Everyone here shares this conversation.':'The conversation opens with the next show. Anyone can watch; verified community members can chat.';
    view.setAccess(allowed,hint,allowed?'Say something to the community…':user?'Chat is unavailable right now':'Sign in to chat');
    document.querySelector('[data-chat-signin]').hidden=Boolean(user);
  }
  async function refreshProfile(){
    if(!client)return;
    const ticket=++authGeneration;profile=null;paint();
    try{
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(ticket!==authGeneration)return;user=data.session?.user || null;
      if(user?.email_confirmed_at){const response=await client.rpc('kipg_ensure_profile');if(response.error)throw response.error;if(ticket!==authGeneration)return;profile=response.data;}
      failure='';
    }catch(error){if(ticket===authGeneration)failure='Your community profile could not connect. Reload or sign in again.';}
    if(ticket===authGeneration)paint();
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
    await refreshProfile();subscribe();paint();
  }).catch(()=>{failure='Community service could not connect. Reload to try again.';paint();});
  const timer=setInterval(()=>{refreshProfile();if(current.chatWindow)refreshMessages(generation);},15000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);stop();});
  return {update(state,next){
    const changed=next?.id!==session?.id||Boolean(state.chatWindow)!==Boolean(current.chatWindow);
    current=state;if(changed)stop();session=next;
    if(current.chatWindow)subscribe();paint();
  }};
}
