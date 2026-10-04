import {accountReturn} from './room-navigation.js?v=20261003-room-return';
import {getCommunityClient,communityError} from './community-client.js?v=20261003-shared';
const $=selector=>document.querySelector(selector);
const form=$('[data-account-form]'),submit=$('[data-account-submit]'),result=$('[data-account-result]'),connection=$('[data-account-connection]');
const callback=new URL('community.html',location.href).href;
const linkError=new URLSearchParams(location.hash.slice(1)).has('error')||new URL(location.href).searchParams.has('error');
let mode=new URL(location.href).searchParams.get('mode')==='signin'?'signin':'signup',busy=false,client=null,member=null,profile=null,details=null,ticket=0;
function setMode(next){
  if(busy)return;mode=next;form.reset();result.textContent='';
  for(const button of document.querySelectorAll('[data-account-mode]'))button.setAttribute('aria-pressed',String(button.dataset.accountMode===mode));
  for(const field of document.querySelectorAll('[data-signup-field]'))field.hidden=mode!=='signup';
  for(const name of ['respect','first_name','last_name']){form.elements[name].required=mode==='signup';form.elements[name].disabled=mode!=='signup';}
  $('[data-account-title]').textContent=mode==='signup'?'Join the KIPG family':'Welcome back';
  $('[data-account-copy]').textContent=mode==='signup'?'Tell us your name and email. We’ll assign your community username when you verify your email.':'We’ll email you a secure sign-in link. No password needed.';
  submit.textContent=mode==='signup'?'Send my join link':'Send sign-in link';
}
function setBusy(active){busy=active;submit.disabled=active||!client;for(const button of document.querySelectorAll('[data-account-mode], [data-sign-out]'))button.disabled=active;form.setAttribute('aria-busy',String(active));$('[data-save-profile]').disabled=active||!details;}
function showMember(user){
  const previousId=member?.id;member=user || null;const show=Boolean(member);
  if(previousId!==member?.id){$('[data-profile-form]').hidden=true;$('[data-edit-profile]').setAttribute('aria-expanded','false');$('[data-edit-profile]').textContent='Edit profile';$('[data-profile-status]').textContent='';}
  form.hidden=show;$('.kc-switch').hidden=show;$('[data-member-panel]').hidden=!show;
  if(show){
    $('[data-account-title]').textContent='Your community account';$('[data-account-copy]').textContent='You’re signed in to KIPG Network.';
    $('[data-member-greeting]').textContent=profile?`Welcome, ${profile.username}`:'Welcome to KIPG';
    $('[data-member-copy]').textContent=!member.email_confirmed_at?'Verify your email before joining chat.':profile?'You’re ready to join the conversation. Enter the Viewing Room below.':'Preparing your community username…';
    $('[data-customize-name]').disabled=!profile||profile.suspended;
    connection.textContent='You’re signed in. Welcome back.';
    const fields=$('[data-profile-form]').elements;
    fields.email.value=member.email||'';
    if(!details){fields.first_name.value=member.user_metadata?.first_name||'';fields.last_name.value=member.user_metadata?.last_name||'';fields.newsletter.checked=member.user_metadata?.newsletter_opt_in===true;}
    $('[data-save-profile]').disabled=!details||busy;
  }else{connection.textContent='Sign in through your email link.';profile=null;details=null;$('[data-profile-result]').textContent='';$('[data-username-form]').hidden=true;setMode(mode);}
}
async function syncMember(){
  const current=++ticket;
  try{
    const {data,error}=await client.auth.getSession();if(error)throw error;if(current!==ticket)return;
    profile=null;details=null;showMember(data.session?.user);
    if(member?.email_confirmed_at){
      const response=await client.rpc('kipg_ensure_profile');if(response.error)throw response.error;
      if(current!==ticket)return;profile=response.data;showMember(member);
      await loadDetails(current);
    }
  }catch(error){if(current===ticket){$('[data-member-copy]').textContent='Your username could not connect. Reload to try again.';result.textContent=communityError(error);}}
}
for(const button of document.querySelectorAll('[data-account-mode]'))button.addEventListener('click',()=>setMode(button.dataset.accountMode));
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!client||busy)return;
  if(mode==='signup'){for(const name of ['first_name','last_name'])form.elements[name].value=form.elements[name].value.trim();}
  if(!form.reportValidity())return;setBusy(true);result.textContent='';
  try{
    const options={emailRedirectTo:callback,shouldCreateUser:mode==='signup'};
    if(mode==='signup')options.data={community_guidelines_accepted_at:new Date().toISOString(),first_name:form.elements.first_name.value.trim(),last_name:form.elements.last_name.value.trim(),newsletter_opt_in:form.elements.newsletter.checked};
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

$('[data-edit-profile]').addEventListener('click',()=>{
  const panel=$('[data-profile-form]');panel.hidden=!panel.hidden;
  $('[data-edit-profile]').setAttribute('aria-expanded',String(!panel.hidden));
  $('[data-edit-profile]').textContent=panel.hidden?'Edit profile':'Close profile';
  if(!panel.hidden)panel.elements.first_name.focus();
});
function showDetails(){
  const fields=$('[data-profile-form]').elements;
  fields.first_name.value=details.first_name||'';fields.last_name.value=details.last_name||'';
  fields.email.value=details.email;fields.newsletter.checked=details.newsletter_opt_in;
  $('[data-profile-copy]').textContent=details.first_name&&details.last_name?'Your name and email stay private. You can update your details and newsletter preference here.':'Add your first and last name to complete your community profile. Only your username appears in chat.';
  $('[data-save-profile]').disabled=busy;
}
async function loadDetails(current){
  const {data,error}=await client.rpc('kipg_get_member_details');
  if(current!==ticket)return;
  if(error){$('[data-profile-status]').textContent='Your saved profile could not load. Please reload before editing your details.';return;}
  details=Array.isArray(data)?data[0]:data;if(!details)throw new Error('Your saved profile could not load.');showDetails();
}
$('[data-profile-form]').addEventListener('submit',async event=>{
  event.preventDefault();const fields=event.currentTarget.elements;
  if(!client||busy||!details||!event.currentTarget.reportValidity())return;
  const current=ticket;setBusy(true);$('[data-save-profile]').disabled=true;$('[data-profile-result]').textContent='';
  try{
    const {data,error}=await client.rpc('kipg_save_member_details',{given_name:fields.first_name.value.trim(),family_name:fields.last_name.value.trim(),subscribe_newsletter:fields.newsletter.checked});
    if(error)throw error;if(current!==ticket)return;details=Array.isArray(data)?data[0]:data;if(!details)throw new Error('Your saved profile could not load.');showDetails();
    $('[data-profile-form]').hidden=true;$('[data-edit-profile]').setAttribute('aria-expanded','false');$('[data-edit-profile]').textContent='Edit profile';
    $('[data-profile-status]').textContent='Your member profile and newsletter preference are saved.';
  }catch(error){if(current===ticket)$('[data-profile-result]').textContent=communityError(error);}
  finally{setBusy(false);$('[data-save-profile]').disabled=!details;}
});

const roomReturn=accountReturn(location.href);
const roomButton=$('[data-return-room]');roomButton.href=roomReturn;
roomButton.textContent=new URL(roomReturn).searchParams.has('rehearsal')?'Return to your rehearsal':'Go to the Viewing Room';
setMode(mode);
try{
  client=await getCommunityClient();connection.textContent='Community connected. Sign in through your email link.';
  client.auth.onAuthStateChange(()=>{setTimeout(()=>syncMember(),0);});
  await syncMember();setBusy(false);
  if(linkError)result.textContent='That sign-in link is invalid or expired. Request a new one.';
}catch(error){client=null;connection.textContent=communityError(error);setBusy(false);}
