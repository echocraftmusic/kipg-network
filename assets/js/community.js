import {getCommunityClient,communityError} from './community-client.js?v=20261003-shared';
const $=selector=>document.querySelector(selector);
const form=$('[data-account-form]'),submit=$('[data-account-submit]'),result=$('[data-account-result]'),connection=$('[data-account-connection]');
const callback=new URL('community.html',location.href).href;
const linkError=new URLSearchParams(location.hash.slice(1)).has('error')||new URL(location.href).searchParams.has('error');
let mode=new URL(location.href).searchParams.get('mode')==='signin'?'signin':'signup',busy=false,client=null,member=null,profile=null,ticket=0;
function setMode(next){
  if(busy)return;mode=next;form.reset();result.textContent='';
  for(const button of document.querySelectorAll('[data-account-mode]'))button.setAttribute('aria-pressed',String(button.dataset.accountMode===mode));
  $('[data-signup-field]').hidden=mode!=='signup';form.elements.respect.required=mode==='signup';
  $('[data-account-title]').textContent=mode==='signup'?'Join the KIPG family':'Welcome back';
  $('[data-account-copy]').textContent=mode==='signup'?'Start with your email. We’ll assign your community username when you verify it.':'We’ll email you a secure sign-in link. No password needed.';
  submit.textContent=mode==='signup'?'Send my join link':'Send sign-in link';
}
function setBusy(active){busy=active;submit.disabled=active||!client;for(const button of document.querySelectorAll('[data-account-mode], [data-sign-out]'))button.disabled=active;form.setAttribute('aria-busy',String(active));}
function showMember(user){
  member=user || null;const show=Boolean(member);
  form.hidden=show;$('.kc-switch').hidden=show;$('[data-member-panel]').hidden=!show;
  if(show){
    $('[data-account-title]').textContent='Your community account';$('[data-account-copy]').textContent='You’re signed in to KIPG Network.';
    $('[data-member-greeting]').textContent=profile?`Welcome, ${profile.username}`:'Welcome to KIPG';
    $('[data-member-copy]').textContent=!member.email_confirmed_at?'Verify your email before joining chat.':profile?`Your community username is ${profile.username}. Keep it or choose a custom one below.`:'Preparing your community username…';
    $('[data-customize-name]').disabled=!profile||profile.suspended;
  }else{profile=null;$('[data-username-form]').hidden=true;setMode(mode);}
}
async function syncMember(){
  const current=++ticket;
  try{
    const {data,error}=await client.auth.getSession();if(error)throw error;if(current!==ticket)return;
    profile=null;showMember(data.session?.user);
    if(member?.email_confirmed_at){
      const response=await client.rpc('kipg_ensure_profile');if(response.error)throw response.error;
      if(current!==ticket)return;profile=response.data;showMember(member);
    }
  }catch(error){if(current===ticket){$('[data-member-copy]').textContent='Your username could not connect. Reload to try again.';result.textContent=communityError(error);}}
}
for(const button of document.querySelectorAll('[data-account-mode]'))button.addEventListener('click',()=>setMode(button.dataset.accountMode));
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!client||busy||!form.reportValidity())return;setBusy(true);result.textContent='';
  try{
    const options={emailRedirectTo:callback,shouldCreateUser:mode==='signup'};
    if(mode==='signup')options.data={community_guidelines_accepted_at:new Date().toISOString()};
    const {error}=await client.auth.signInWithOtp({email:form.elements.email.value.trim().toLowerCase(),options});if(error)throw error;
    form.reset();result.textContent=mode==='signup'?'Check your inbox and spam folder for your KIPG join link. If you already have an account, the link will sign you in.':'If you have a KIPG account, check your inbox and spam folder for your sign-in link.';
  }catch(error){result.textContent=communityError(error);}finally{setBusy(false);}
});
$('[data-sign-out]').addEventListener('click',async()=>{
  if(!client||busy)return;setBusy(true);
  try{const {error}=await client.auth.signOut();if(error)throw error;ticket++;profile=null;member=null;mode='signin';setBusy(false);showMember(null);result.textContent='You’re signed out.';}
  catch(error){result.textContent=communityError(error);}finally{setBusy(false);}
});
$('[data-customize-name]').addEventListener('click',()=>{
  const panel=$('[data-username-form]');panel.hidden=!panel.hidden;
  $('[data-customize-name]').setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden)panel.elements.username.focus();
});
$('[data-username-form]').addEventListener('submit',async event=>{
  event.preventDefault();const nameForm=event.currentTarget;if(!client||busy||!profile||!nameForm.reportValidity())return;
  const expected=member?.id;const button=$('[data-save-name]');button.disabled=true;setBusy(true);$('[data-name-result]').textContent='';
  try{
    const {data,error}=await client.rpc('kipg_set_username',{candidate:nameForm.elements.username.value.trim()});if(error)throw error;
    if(member?.id!==expected)return;profile=data;showMember(member);$('[data-name-result]').textContent='Your username is saved. You’ll use it in community chat.';
  }catch(error){$('[data-name-result]').textContent=communityError(error);}finally{button.disabled=false;setBusy(false);}
});
setMode(mode);
try{
  client=await getCommunityClient();connection.textContent='Community connected. Sign in through your email link.';
  client.auth.onAuthStateChange(()=>{setTimeout(()=>syncMember(),0);});
  await syncMember();setBusy(false);
  if(linkError)result.textContent='That sign-in link is invalid or expired. Request a new one.';
}catch(error){client=null;connection.textContent=communityError(error);setBusy(false);}
