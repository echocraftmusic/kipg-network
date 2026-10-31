import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../assets/js/prayer.js',import.meta.url),'utf8');
async function setup(enabled=true){
 const handlers={},elements={name:{value:'Test',focus(){}},email:{value:'test@example.com',checkValidity(){return this.value.includes('@')&&this.value.includes('.')}},phone:{value:''},sms_consent:{checked:false},contact_method:{value:'email'},prayer_request:{value:'Private prayer',addEventListener(){}},contact_requested:{value:'no'},website:{value:''}};
 const form={elements,hidden:false,reportValidity:()=>true,setAttribute(){},addEventListener(name,fn){handlers[name]=fn;},reset(){elements.prayer_request.value='';}};
 const submit={disabled:true},status={dataset:{}},success={hidden:true};let options,requests=[],response=()=>Response.json({status:'received',submissionId:requests.at(-1).submissionId});
 const nodes={'[data-prayer-form]':form,'[data-prayer-submit]':submit,'[data-prayer-availability]':{hidden:false},'[data-prayer-status]':status,'[data-prayer-success]':success,'[data-prayer-security]':{},'[data-prayer-contact-details]':{hidden:true},'[data-prayer-email-field]':{hidden:true},'[data-prayer-phone-field]':{hidden:true},'[data-prayer-sms-consent]':{hidden:true}};
 const context={document:{querySelector:k=>nodes[k],createElement:()=>({}),head:{append(){}}},window:{turnstile:{render(node,o){options=o;return 1;},remove(){}}},crypto,Date:class extends Date{static now(){return Date.now()-5000;}},AbortSignal,fetch:async(url,opts)=>{
 if(url.endsWith('prayer-config.json'))return Response.json({enabled,endpoint:'https://endpoint.invalid/submit',turnstileSiteKey:'public-key'});
 requests.push(JSON.parse(opts.body));return response();
 }};
 vm.createContext(context);vm.runInContext(source,context);await new Promise(r=>setImmediate(r));
 context.Date=Date;
 if(enabled)context.window.kipgPrayerSecurityReady();
 return {form,submit,status,success,requests,nodes,sync:()=>vm.runInContext('syncContactFields()',context),get options(){return options;},send:()=>handlers.submit({preventDefault(){}}),setResponse:fn=>response=fn};
}
test('closed form does not render a widget or send requests',async()=>{const s=await setup(false);await s.send();assert.equal(s.options,undefined);assert.equal(s.submit.disabled,true);assert.equal(s.requests.length,0);});
test('closed form visibly explains why no response is sent',async()=>{
 const s=await setup(false);
 assert.equal(s.submit.disabled,true);
 assert.equal(s.submit.textContent,'Prayer Submissions Not Open');
 assert.equal(s.nodes['[data-prayer-availability]'].hidden,false);
 assert.match(s.status.textContent,/Nothing has been sent/);
 await s.send();
 assert.equal(s.requests.length,0);
 const enabled=await setup(true);
 assert.equal(enabled.submit.textContent,'Send Prayer Request');
 assert.equal(enabled.nodes['[data-prayer-availability]'].hidden,true);
});

test('requires a token and exact durable receipt before clearing sensitive draft',async()=>{
 const s=await setup();await s.send();assert.equal(s.requests.length,0);
 s.options.callback('token-one');s.setResponse(()=>Response.json({status:'received',submissionId:'wrong'}));await s.send();
 assert.equal(s.success.hidden,true);assert.equal(s.form.elements.prayer_request.value,'Private prayer');
 const id=s.requests[0].submissionId;s.options.callback('token-two');s.setResponse(()=>Response.json({status:'received',submissionId:id}));await s.send();
 assert.equal(s.requests[1].submissionId,id);assert.equal(s.requests[1].turnstileToken,'token-two');assert.equal(s.form.elements.prayer_request.value,'');assert.equal(s.success.hidden,false);
});
test('changed draft after uncertain response requires a fresh token and ID',async()=>{
 const s=await setup();s.options.callback('token-one');s.setResponse(()=>{throw Error('offline');});await s.send();
 const id=s.requests[0].submissionId;s.form.elements.prayer_request.value='Changed prayer';s.options.callback('token-two');await s.send();assert.equal(s.requests.length,1);assert.notEqual(s.options.cData,id);
});

test('contact fields are hidden until follow-up is requested',async()=>{
 const s=await setup();
 assert.equal(s.nodes['[data-prayer-contact-details]'].hidden,true);
 assert.equal(s.form.elements.email.required,false);
 s.form.elements.contact_requested.value='yes';
 s.sync();
 assert.equal(s.nodes['[data-prayer-contact-details]'].hidden,false);
 assert.equal(s.nodes['[data-prayer-email-field]'].hidden,false);
 assert.equal(s.form.elements.email.required,true);
 assert.equal(s.nodes['[data-prayer-phone-field]'].hidden,true);
 s.form.elements.contact_method.value='phone';s.sync();
 assert.equal(s.form.elements.email.required,false);
 assert.equal(s.nodes['[data-prayer-phone-field]'].hidden,false);
 assert.equal(s.form.elements.phone.required,true);
 s.form.elements.contact_method.value='text';s.sync();
 assert.equal(s.nodes['[data-prayer-sms-consent]'].hidden,false);
 assert.equal(s.form.elements.sms_consent.required,true);
 s.form.elements.contact_requested.value='no';s.sync();
 assert.equal(s.nodes['[data-prayer-contact-details]'].hidden,true);
 assert.equal(s.form.elements.phone.required,false);
});
test('email, call and text follow-up choices are included correctly in requests',async()=>{
 for(const channel of ['email','phone','text']){
  const s=await setup();
  s.form.elements.contact_requested.value='yes';
  s.form.elements.contact_method.value=channel;
  s.form.elements.phone.value='(407) 555-0182';
  s.form.elements.sms_consent.checked=channel==='text';
  s.sync();s.options.callback('token');
  await s.send();
  assert.equal(s.requests.length,1,channel);
  const payload=s.requests[0];
  assert.equal(payload.contactMethod,channel);
  assert.equal(payload.phone,channel==='email'?'':'(407) 555-0182');
  assert.equal(payload.email,channel==='email'?'test@example.com':'');
  assert.equal(payload.smsConsent,channel==='text');
 }
});
test('text consent and valid phone are required before any request is sent',async()=>{
 const s=await setup();
 s.form.elements.contact_requested.value='yes';
 s.form.elements.contact_method.value='text';
 s.form.elements.phone.value='407-555-0101';
 s.sync();s.options.callback('token');
 await s.send();assert.equal(s.requests.length,0);
 s.form.elements.sms_consent.checked=true;
 s.form.elements.phone.value='123';
 await s.send();assert.equal(s.requests.length,0);
 s.form.elements.phone.value='407-555-0101';
 await s.send();assert.equal(s.requests.length,1);
});
