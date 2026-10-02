// Passwords go directly to Supabase Auth; they are never saved by this page.
const $=selector=>document.querySelector(selector);
const form=$('[data-account-form]'),submit=$('[data-account-submit]'),result=$('[data-account-result]'),connection=$('[data-account-connection]');
const recoveryRequested=new URL(location.href).searchParams.get('flow')==='recovery';
let mode='signup',busy=false,client=null,recovering=false,member=null;
const callback=new URL('community.html',location.href).href;
function setMode(next){
  if(busy)return;
  mode=next;result.textContent='';form.reset();form.elements.displayName.setCustomValidity('');
  form.elements.password.type='password';const visibility=$('[data-show-password]');visibility.textContent='Show';visibility.setAttribute('aria-label','Show password');visibility.setAttribute('aria-pressed','false');
  for(const button of document.querySelectorAll('[data-account-mode]'))button.setAttribute('aria-pressed',String(button.dataset.accountMode===mode));
  for(const field of document.querySelectorAll('[data-signup-field]'))field.hidden=mode!=='signup';
  form.elements.displayName.required=mode==='signup';form.elements.respect.required=mode==='signup';
  $('[data-email-field]').hidden=mode==='update';form.elements.email.required=mode!=='update';
  $('[data-password-field]').hidden=mode==='reset';form.elements.password.required=mode!=='reset';
  form.elements.password.minLength=['signup','update'].includes(mode)?12:1;form.elements.password.autocomplete=mode==='signin'?'current-password':'new-password';
  $('[data-password-help]').textContent=mode==='signin'?'Enter the password for your KIPG account.':'Use at least 12 characters.';
  const titles={signup:'Join the KIPG family',signin:'Welcome back',reset:'Reset your password',update:'Choose a new password'};
  const copies={signup:'A few details, then verify your email to get started.',signin:'Sign in to your community account.',reset:'We’ll email you a link to choose a new password.',update:'Save a new password for your community account.'};
  $('[data-account-title]').textContent=titles[mode];$('[data-account-copy]').textContent=copies[mode];
  submit.textContent={signup:'Create free account',signin:'Sign in',reset:'Send reset link',update:'Save new password'}[mode];
  $('[data-forgot-password]').hidden=mode!=='signin';$('[data-back-signin]').hidden=mode!=='reset';
  showMember(member);
}
for(const button of document.querySelectorAll('[data-account-mode]'))button.addEventListener('click',()=>setMode(button.dataset.accountMode));
$('[data-forgot-password]').addEventListener('click',()=>setMode('reset'));
$('[data-back-signin]').addEventListener('click',()=>setMode('signin'));
$('[data-show-password]').addEventListener('click',event=>{
  const shown=form.elements.password.type==='password';form.elements.password.type=shown?'text':'password';
  event.currentTarget.textContent=shown?'Hide':'Show';event.currentTarget.setAttribute('aria-label',shown?'Hide password':'Show password');event.currentTarget.setAttribute('aria-pressed',String(shown));
});
function showMember(user){
  member=user||null;const show=Boolean(member)&&!recovering;
  form.hidden=show;$('.kc-switch').hidden=show||recovering;$('[data-member-panel]').hidden=!show;
  if(show){
    $('[data-account-title]').textContent='Your community account';$('[data-account-copy]').textContent='You’re signed in to KIPG Network.';
    $('[data-member-greeting]').textContent=`Welcome, ${member.user_metadata?.display_name || 'friend'}`;
    $('[data-member-copy]').textContent=member.email_confirmed_at?'Your email is verified. Shared chat is still being connected.':'Please verify your email before participating in community chat.';
  }
}
function setBusy(active){busy=active;submit.disabled=active||!client;for(const button of document.querySelectorAll('[data-account-mode], [data-forgot-password], [data-back-signin], [data-sign-out]'))button.disabled=active;form.setAttribute('aria-busy',String(active));}
function errorCopy(error){
  if(error?.code==='email_address_not_authorized')return 'Email delivery is still being set up. Please try again once community registration opens.';
  if(error?.code==='over_email_send_rate_limit')return 'Please wait a little before requesting another email.';
  return error?.message || 'We could not complete that request. Please try again.';
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!client||busy)return;
  if(mode==='signup')form.elements.displayName.setCustomValidity(form.elements.displayName.value.trim().length<2?'Choose a display name with at least two characters.':'');
  if(!form.reportValidity())return;
  setBusy(true);result.textContent='';const action=mode;
  try{
    const email=form.elements.email.value.trim().toLowerCase(),password=form.elements.password.value;
    if(action==='signup'){
      const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:form.elements.displayName.value.trim(),community_guidelines_accepted_at:new Date().toISOString()},emailRedirectTo:callback}});
      if(error)throw error;
      form.reset();form.elements.password.type='password';
      if(data.session)showMember(data.user);
      else result.textContent='Check your email for the verification link. If you already have an account, use Sign in.';
    }else if(action==='signin'){
      const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;form.elements.password.value='';showMember(data.user);
    }else if(action==='reset'){
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:callback+'?flow=recovery'});if(error)throw error;
      form.reset();result.textContent='If that email has an account, you’ll receive a password-reset link. Check your inbox and spam folder.';
    }else if(action==='update'){
      const {error}=await client.auth.updateUser({password});if(error)throw error;form.elements.password.value='';
      // End the recovery session before showing a normal sign-in form.
      const signedOut=await client.auth.signOut();if(signedOut.error)throw signedOut.error;
      recovering=false;member=null;setBusy(false);setMode('signin');history.replaceState(null,'',callback);result.textContent='Your password is updated. Sign in with your new password.';
    }
  }catch(error){form.elements.password.value='';result.textContent=errorCopy(error);}
  finally{setBusy(false);}
});
form.elements.displayName.addEventListener('input',()=>form.elements.displayName.setCustomValidity(''));
$('[data-sign-out]').addEventListener('click',async()=>{
  if(!client||busy)return;setBusy(true);
  try{const {error}=await client.auth.signOut();if(error)throw error;member=null;recovering=false;setBusy(false);setMode('signin');}
  catch(error){result.textContent=errorCopy(error);}finally{setBusy(false);}
});
async function connect(){
  try{
    if(!window.supabase?.createClient)throw new Error('The account service could not load. Reload the page to try again.');
    const response=await fetch(new URL('../../data/community-auth.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('Account connection unavailable.');
    const config=await response.json();if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.projectUrl)||!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(config.publishableKey))throw new Error('Account connection is not configured.');
    const settingsResponse=await fetch(config.projectUrl+'/auth/v1/settings',{headers:{apikey:config.publishableKey}});if(!settingsResponse.ok)throw new Error('Could not connect to the account service.');
    const settings=await settingsResponse.json();if(settings.disable_signup||!settings.external?.email||settings.mailer_autoconfirm)throw new Error('Community registration is not open yet.');
    client=window.supabase.createClient(config.projectUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'kipg-community-auth'}});
    connection.textContent='Account connection ready. Email verification and delivery are being tested before launch.';
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'){recovering=true;showMember(session?.user);setMode('update');}
      else if(event==='SIGNED_OUT')showMember(null);
      else showMember(session?.user);
    });
    const {data,error}=await client.auth.getSession();if(error)throw error;
    recovering=recoveryRequested&&Boolean(data.session);showMember(data.session?.user);
    if(recovering)setMode('update');
    else if(recoveryRequested){setMode('reset');result.textContent='This reset link is invalid or expired. Request a new link.';}
    else if(new URL(location.href).searchParams.has('error')||new URLSearchParams(location.hash.slice(1)).has('error'))result.textContent='That verification link is invalid or expired. Try signing in or request a new reset link.';
    setBusy(false);
  }catch(error){client=null;submit.disabled=true;connection.textContent=errorCopy(error);}
}
await connect();
