const form=document.querySelector('[data-prayer-form]');
const submit=document.querySelector('[data-prayer-submit]');
const status=document.querySelector('[data-prayer-status]');
const success=document.querySelector('[data-prayer-success]');
const another=document.querySelector('[data-prayer-another]');
const count=document.querySelector('[data-prayer-count]');
const textarea=form?.elements?.prayer_request;
const security=document.querySelector('[data-prayer-security]');
let busy=false,startedAt=Date.now(),config=null;
let submissionId=crypto.randomUUID(),token='',widget=null,lastBody='';

function resetSecurity(){
  token='';
  if(widget!==null&&window.turnstile){window.turnstile.remove(widget);widget=null;}
  renderSecurity();
}
function renderSecurity(){
  if(!window.turnstile||!security||widget!==null||config?.enabled!==true)return;
  widget=window.turnstile.render(security,{
    sitekey:config.turnstileSiteKey,action:'prayer_submit',cData:submissionId,theme:'auto',size:'flexible',
    callback:value=>{token=value;setBusy(busy);},
    'expired-callback':()=>{token='';setBusy(busy);},
    'error-callback':()=>{token='';setBusy(busy);setStatus('The security check could not finish. Please try again.','error');}
  });
}
function loadSecurity(){
  window.kipgPrayerSecurityReady=renderSecurity;
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=kipgPrayerSecurityReady&render=explicit';
  script.async=true;script.defer=true;
  script.onerror=()=>setStatus('The security check could not load. Please refresh and try again.','error');
  document.head.append(script);
}

function setStatus(message,state=''){
  if(!status)return;
  status.textContent=message;
  state?status.dataset.state=state:delete status.dataset.state;
}
function setBusy(value){
  busy=value;
  if(submit)submit.disabled=value||config?.enabled!==true||!token;
  if(form)form.setAttribute('aria-busy',String(value));
}
function valid(){
  if(!form)return false;
  if(!form.reportValidity())return false;
  const name=form.elements.name.value.trim();
  const email=form.elements.email.value.trim();
  const request=form.elements.prayer_request.value.trim();
  const contact=form.elements.contact_requested.value;
  if(name.length<1||email.length<5||request.length<5||!['yes','no'].includes(contact))return false;
  return true;
}
async function loadConfig(){
  try{
    const response=await fetch('../data/prayer-config.json',{cache:'no-store'});
    if(!response.ok)throw new Error();
    config=await response.json();
    if(config.enabled===true){
      submit.disabled=true;
      setStatus('');
      loadSecurity();
    }else{
      submit.disabled=true;
      setStatus('The secure prayer connection is being finalized. The form is ready, but submissions are not open yet.','ready');
    }
  }catch{
    submit.disabled=true;
    setStatus('Prayer submissions are temporarily unavailable. Please check back soon.','error');
  }
}
textarea?.addEventListener('input',()=>{if(count)count.textContent=String(textarea.value.length);});
another?.addEventListener('click',()=>{
  success.hidden=true;
  form.hidden=false;
  form.reset();
  if(count)count.textContent='0';
  startedAt=Date.now();
  submissionId=crypto.randomUUID();lastBody='';resetSecurity();
  setStatus('');
  setBusy(false);
  form.elements.name.focus();
});
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||config?.enabled!==true||!valid())return;
  if(!token){setStatus('Please complete the security check.','error');return;}
  if(form.elements.website.value)return;
  if(Date.now()-startedAt<2500){
    setStatus('Please take a moment to review your request before sending.','error');
    return;
  }
  const body={
    name:form.elements.name.value.trim(),
    email:form.elements.email.value.trim(),
    prayerRequest:form.elements.prayer_request.value.trim(),
    contactRequested:form.elements.contact_requested.value==='yes',
    website:form.elements.website.value,
    startedAt
  };
  const fingerprint=JSON.stringify({name:body.name,email:body.email,prayerRequest:body.prayerRequest,contactRequested:body.contactRequested});
  if(lastBody&&lastBody!==fingerprint){
    submissionId=crypto.randomUUID();lastBody=fingerprint;resetSecurity();setBusy(false);
    setStatus('Your request changed. Please complete the new security check before sending.','ready');return;
  }
  lastBody=fingerprint;
  body.submissionId=submissionId;body.turnstileToken=token;
  // Keep the draft in this page only; do not persist sensitive prayers on shared devices.
  // The same ID survives uncertain responses; changed content gets a new ID.
  try{
    setBusy(true);
    setStatus('Sending your prayer request…');
    const response=await fetch(config.endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      signal:AbortSignal.timeout(20000),
      body:JSON.stringify(body)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.status!=='received'||result.submissionId!==submissionId)throw new Error(result.error||'We could not confirm receipt. Your request is still in this form; please try again.');
    form.reset();lastBody='';token='';
    form.hidden=true;
    success.hidden=false;
    setStatus('');
  }catch(error){
    setStatus(error?.message||'Your request could not be sent. Please try again.','error');
  }finally{
    if(!form.hidden){startedAt=Date.now()-3000;resetSecurity();}
    setBusy(false);
  }
});
loadConfig();