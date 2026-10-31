import {accountReturn} from './room-navigation.js?v=20261003-room-return';
const $=selector=>document.querySelector(selector);
const form=$('[data-account-form]'),submit=$('[data-account-submit]'),result=$('[data-account-result]'),connection=$('[data-account-connection]');
let mode=new URL(location.href).searchParams.get('mode')==='signin'?'signin':'signup',busy=false,member=null;
const api=location.origin;

function message(error){
  const text=String(error?.message||error||'');
  if(/not available|guidelines/i.test(text))return 'That username isn’t available. Please choose another name that follows KIPG Community guidelines.';
  if(/already taken/i.test(text))return 'That username is already taken. Please choose another one.';
  if(/rate|wait/i.test(text))return 'Please wait a little before requesting another sign-in email.';
  return text||'We could not complete that request. Please try again.';
}
async function request(path,options={}){
  const response=await fetch(api+path,{credentials:'include',cache:'no-store',...options});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok)throw new Error(body.error||'We could not complete that request.');
  return body;
}
function setMode(next){
  if(busy)return;mode=next;form.reset();result.textContent='';
  for(const button of document.querySelectorAll('[data-account-mode]'))button.setAttribute('aria-pressed',String(button.dataset.accountMode===mode));
  for(const field of document.querySelectorAll('[data-signup-field]'))field.hidden=mode!=='signup';
  for(const name of ['respect','first_name','last_name']){form.elements[name].required=mode==='signup';form.elements[name].disabled=mode!=='signup';}
  $('[data-account-title]').textContent=mode==='signup'?'Join the KIPG family':'Welcome back';
  $('[data-account-copy]').textContent=mode==='signup'?'Tell us your name and email. We’ll assign your community username when you verify your email.':'We’ll email you a secure sign-in link. No password needed.';
  submit.textContent=mode==='signup'?'Send my join link':'Send sign-in link';
}
function setBusy(active){
  busy=active;submit.disabled=active;
  for(const button of document.querySelectorAll('[data-account-mode], [data-sign-out]'))button.disabled=active;
  form.setAttribute('aria-busy',String(active));
  $('[data-save-profile]').disabled=active||!member;
}
function showMember(data){
  member=data||null;const show=Boolean(member);
  form.hidden=show;$('.kc-switch').hidden=show;$('[data-member-panel]').hidden=!show;
  if(show){
    $('[data-account-title]').textContent='Your community account';
    $('[data-account-copy]').textContent='You’re signed in to KIPG Network.';
    $('[data-member-greeting]').textContent=`Welcome, ${member.username}`;
    $('[data-member-copy]').textContent='You’re ready to join the conversation. Enter the Viewing Room below.';
    $('[data-customize-name]').disabled=member.suspended===true;
    connection.textContent='Cloudflare Community connected. You’re signed in.';
    const fields=$('[data-profile-form]').elements;
    fields.first_name.value=member.first_name||'';
    fields.last_name.value=member.last_name||'';
    fields.email.value=member.email||'';
    fields.newsletter.checked=member.newsletter_opt_in===true;
    $('[data-save-profile]').disabled=busy;
    $('[data-profile-copy]').textContent='Your name and email stay private. You can update your details and newsletter preference here.';
  }else{
    connection.textContent='Cloudflare Community connected. Sign in through your email link.';
    $('[data-username-form]').hidden=true;
    $('[data-profile-form]').hidden=true;
    setMode(mode);
  }
}
async function syncMember(){
  try{const data=await request('/me');showMember(data.member);}
  catch{showMember(null);}
}
for(const button of document.querySelectorAll('[data-account-mode]'))button.addEventListener('click',()=>setMode(button.dataset.accountMode));

form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  if(mode==='signup'){for(const name of ['first_name','last_name'])form.elements[name].value=form.elements[name].value.trim();}
  if(!form.reportValidity())return;
  setBusy(true);result.textContent='';
  try{
    const payload={mode,email:form.elements.email.value.trim().toLowerCase()};
    if(mode==='signup')Object.assign(payload,{first_name:form.elements.first_name.value.trim(),last_name:form.elements.last_name.value.trim(),guidelines_accepted:form.elements.respect.checked,newsletter_opt_in:form.elements.newsletter.checked});
    const data=await request('/auth/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    result.textContent=data.message||'Check your inbox and spam folder for your KIPG Community link.';
  }catch(error){result.textContent=message(error);}
  finally{setBusy(false);}
});

$('[data-sign-out]').addEventListener('click',async()=>{
  if(busy)return;setBusy(true);
  try{await request('/signout',{method:'POST'});member=null;mode='signin';showMember(null);result.textContent='You’re signed out.';}
  catch(error){result.textContent=message(error);}
  finally{setBusy(false);}
});

$('[data-customize-name]').addEventListener('click',()=>{
  const panel=$('[data-username-form]');panel.hidden=!panel.hidden;
  $('[data-customize-name]').setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden)panel.elements.username.focus();
});
$('[data-username-form]').addEventListener('submit',async event=>{
  event.preventDefault();const nameForm=event.currentTarget;if(busy||!member||!nameForm.reportValidity())return;
  const button=$('[data-save-name]');button.disabled=true;setBusy(true);$('[data-name-result]').textContent='';
  try{
    const data=await request('/username',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:nameForm.elements.username.value.trim()})});
    member.username=data.username;showMember(member);$('[data-name-result]').textContent='Your username is saved. You’ll use it in community chat.';
  }catch(error){$('[data-name-result]').textContent=message(error);}
  finally{button.disabled=false;setBusy(false);}
});

$('[data-edit-profile]').addEventListener('click',()=>{
  const panel=$('[data-profile-form]');panel.hidden=!panel.hidden;
  $('[data-edit-profile]').setAttribute('aria-expanded',String(!panel.hidden));
  $('[data-edit-profile]').textContent=panel.hidden?'Edit profile':'Close profile';
  if(!panel.hidden)panel.elements.first_name.focus();
});
$('[data-profile-form]').addEventListener('submit',async event=>{
  event.preventDefault();const fields=event.currentTarget.elements;if(busy||!member||!event.currentTarget.reportValidity())return;
  setBusy(true);$('[data-profile-result]').textContent='';
  try{
    const data=await request('/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({first_name:fields.first_name.value.trim(),last_name:fields.last_name.value.trim(),newsletter_opt_in:fields.newsletter.checked})});
    Object.assign(member,data.member);showMember(member);
    $('[data-profile-form]').hidden=true;$('[data-edit-profile]').setAttribute('aria-expanded','false');$('[data-edit-profile]').textContent='Edit profile';
    $('[data-profile-status]').textContent='Your member profile and newsletter preference are saved.';
  }catch(error){$('[data-profile-result]').textContent=message(error);}
  finally{setBusy(false);}
});

const roomReturn=accountReturn('https://kipgnetwork.com/pages/community.html');
const roomButton=$('[data-return-room]');roomButton.href=roomReturn;roomButton.textContent='Go to the Viewing Room';
setMode(mode);
connection.textContent='Connecting to Cloudflare Community…';
await syncMember();setBusy(false);
const params=new URLSearchParams(location.search);
if(params.get('auth')==='success'){
  result.textContent=params.get('mode')==='joined'?'Welcome to KIPG Community — your account is ready.':'Welcome back to KIPG Community — you’re signed in.';
  history.replaceState({},'',location.pathname);
}
