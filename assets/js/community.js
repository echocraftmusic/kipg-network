// This page never stores passwords or simulates account creation.
const form=document.querySelector('[data-account-form]');
const submit=document.querySelector('[data-account-submit]');
const result=document.querySelector('[data-account-result]');
const connection=document.querySelector('[data-account-connection]');
let mode='signup',busy=false;
const client=window.ecSupabase || null;
function setMode(next){
  if(busy)return;
  mode=next;result.textContent='';form.reset();
  form.elements.password.type='password';const visibility=document.querySelector('[data-show-password]');visibility.textContent='Show';visibility.setAttribute('aria-label','Show password');visibility.setAttribute('aria-pressed','false');
  for(const button of document.querySelectorAll('[data-account-mode]'))button.setAttribute('aria-pressed',String(button.dataset.accountMode===mode));
  for(const field of document.querySelectorAll('[data-signup-field]'))field.hidden=mode!=='signup';
  form.elements.displayName.setCustomValidity('');form.elements.displayName.required=mode==='signup';form.elements.respect.required=mode==='signup';
  form.elements.password.minLength=mode==='signup'?12:1;form.elements.password.autocomplete=mode==='signup'?'new-password':'current-password';
  document.querySelector('[data-password-help]').textContent=mode==='signup'?'Use at least 12 characters.':'Enter the password for your KIPG account.';
  document.querySelector('[data-account-title]').textContent=mode==='signup'?'Join the KIPG family':'Welcome back';
  document.querySelector('[data-account-copy]').textContent=mode==='signup'?'A few details, then verify your email to get started.':'Sign in to your community account.';
  submit.textContent=mode==='signup'?'Create free account':'Sign in';
}
for(const button of document.querySelectorAll('[data-account-mode]'))button.addEventListener('click',()=>setMode(button.dataset.accountMode));
document.querySelector('[data-show-password]').addEventListener('click',event=>{
  const shown=form.elements.password.type==='password';form.elements.password.type=shown?'text':'password';
  event.currentTarget.textContent=shown?'Hide':'Show';event.currentTarget.setAttribute('aria-label',shown?'Hide password':'Show password');event.currentTarget.setAttribute('aria-pressed',String(shown));
});
function showMember(user){
  form.hidden=Boolean(user);document.querySelector('.kc-switch').hidden=Boolean(user);document.querySelector('[data-member-panel]').hidden=!user;
  if(user){document.querySelector('[data-member-greeting]').textContent=`Welcome, ${user.user_metadata?.display_name || 'friend'}`;document.querySelector('[data-member-copy]').textContent=user.email_confirmed_at?'Your email is verified. Shared chat is still being connected.':'Please verify your email before participating in community chat.';}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!client || busy){result.textContent='Registration is not open yet. Please check back soon.';return;}
  if(mode==='signup')form.elements.displayName.setCustomValidity(form.elements.displayName.value.trim().length<2?'Choose a display name with at least two characters.':'');
  if(!form.reportValidity())return;
  busy=true;submit.disabled=true;result.textContent='';
  try{
    const email=form.elements.email.value.trim().toLowerCase(),password=form.elements.password.value;
    if(mode==='signup'){
      const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:form.elements.displayName.value.trim()},emailRedirectTo:new URL('community.html',location.href).href}});
      if(error)throw error;
      form.elements.password.value='';
      if(data.session){showMember(data.user);result.textContent='Your account is ready.';}
      else{result.textContent='Check your email for the verification link. If you already have an account, use Sign in.';form.reset();}
    }else{
      const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;form.elements.password.value='';showMember(data.user);
    }
  }catch(error){result.textContent=error.message || 'We could not complete that request. Please try again.';}
  finally{busy=false;submit.disabled=!client;}
});
document.querySelector('[data-sign-out]').addEventListener('click',async()=>{
  if(!client)return;const {error}=await client.auth.signOut();if(error){result.textContent=error.message;return;}showMember(null);setMode('signin');
});
if(client){
  connection.textContent='Verify your email to complete your free community membership.';submit.disabled=false;
  client.auth.onAuthStateChange((_event,session)=>showMember(session?.user));
  client.auth.getSession().then(({data,error})=>{if(error){result.textContent='Please sign in again.';return;}showMember(data.session?.user);});
}
