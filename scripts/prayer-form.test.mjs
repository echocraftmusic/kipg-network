import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../assets/js/prayer.js',import.meta.url),'utf8');
async function setup(enabled=true){
 const handlers={},elements={name:{value:'Test',focus(){}},email:{value:'test@example.com'},prayer_request:{value:'Private prayer',addEventListener(){}},contact_requested:{value:'no'},website:{value:''}};
 const form={elements,hidden:false,reportValidity:()=>true,setAttribute(){},addEventListener(name,fn){handlers[name]=fn;},reset(){elements.prayer_request.value='';}};
 const submit={disabled:true},status={dataset:{}},success={hidden:true};let options,requests=[],response=()=>Response.json({status:'received',submissionId:requests.at(-1).submissionId});
 const nodes={'[data-prayer-form]':form,'[data-prayer-submit]':submit,'[data-prayer-status]':status,'[data-prayer-success]':success,'[data-prayer-security]':{}};
 const context={document:{querySelector:k=>nodes[k],createElement:()=>({}),head:{append(){}}},window:{turnstile:{render(node,o){options=o;return 1;},remove(){}}},crypto,Date:class extends Date{static now(){return Date.now()-5000;}},AbortSignal,fetch:async(url,opts)=>{
 if(url.endsWith('prayer-config.json'))return Response.json({enabled,endpoint:'https://endpoint.invalid/submit',turnstileSiteKey:'public-key'});
 requests.push(JSON.parse(opts.body));return response();
 }};
 vm.createContext(context);vm.runInContext(source,context);await new Promise(r=>setImmediate(r));
 context.Date=Date;
 if(enabled)context.window.kipgPrayerSecurityReady();
 return {form,submit,status,success,requests,get options(){return options;},send:()=>handlers.submit({preventDefault(){}}),setResponse:fn=>response=fn};
}
test('closed form does not render a widget or send requests',async()=>{const s=await setup(false);await s.send();assert.equal(s.options,undefined);assert.equal(s.submit.disabled,true);assert.equal(s.requests.length,0);});
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
