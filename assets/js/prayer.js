const form=document.querySelector('[data-prayer-form]');
const submit=document.querySelector('[data-prayer-submit]');
const status=document.querySelector('[data-prayer-status]');
const success=document.querySelector('[data-prayer-success]');
const another=document.querySelector('[data-prayer-another]');
const count=document.querySelector('[data-prayer-count]');
const textarea=form?.elements?.prayer_request;
let busy=false,startedAt=Date.now(),config=null;

function setStatus(message,state=''){
  if(!status)return;
  status.textContent=message;
  state?status.dataset.state=state:delete status.dataset.state;
}
function setBusy(value){
  busy=value;
  if(submit)submit.disabled=value||config?.enabled!==true;
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
      submit.disabled=false;
      setStatus('');
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
  setStatus('');
  setBusy(false);
  form.elements.name.focus();
});
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||config?.enabled!==true||!valid())return;
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
  try{
    setBusy(true);
    setStatus('Sending your prayer request…');
    const endpoint=`${config.projectUrl.replace(/\/$/,'')}/functions/v1/${config.functionName}`;
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':config.publishableKey,'Authorization':`Bearer ${config.publishableKey}`},
      body:JSON.stringify(body)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Your request could not be sent.');
    form.hidden=true;
    success.hidden=false;
    setStatus('');
  }catch(error){
    setStatus(error?.message||'Your request could not be sent. Please try again.','error');
  }finally{setBusy(false);}
});
loadConfig();