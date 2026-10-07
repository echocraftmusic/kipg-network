import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capture as captureRaw,retryPending} from './worker.js';
const id='fd21b6ad-c145-4ed0-b747-7d4de0c4a803';
const payload={submissionId:id,name:'Test',email:'test@example.com',prayerRequest:'PRIVATE TEST PRAYER',contactRequested:false,startedAt:Date.now()-5000,website:'',turnstileToken:'test-token'};
function setup() {
 const map=new Map();
 const bucket={async head(k){return map.has(k)?{}:null;},async get(k){const v=map.get(k);return v?{json:async()=>JSON.parse(v)}:null;},async put(k,v,o){if(o?.onlyIf&&map.has(k))return null;map.set(k,v);return {};},async delete(k){map.delete(k);},async list(){return {objects:[...map.keys()].filter(k=>k.startsWith('pending/')).map(key=>({key})),truncated:false};}};
 return {map,env:{TURNSTILE_SECRET_KEY:'local-test-secret',PRAYER_RATE_LIMITER:{async limit(){return {success:true};}},PRAYER_RECOVERY:bucket,RECOVERY_ENCRYPTION_KEY:btoa('a'.repeat(32)),SUBMISSIONS_ENABLED:'true',DELIVERY_ENABLED:'true',DELIVERY_SECRET:'test-only',DELIVERY_URL:'https://'+ 'a'.repeat(20) +'.supabase.co/functions/v1/kipg-prayer-request'}};
}
const req=(p=payload,origin='https://kipgnetwork.com')=>new Request('https://test.invalid/submit',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(p)});
const verify=async()=>Response.json({success:true,hostname:'kipgnetwork.com',action:'prayer_submit',cdata:id});
const capture=(request,env)=>captureRaw(request,env,verify);
test('disabled deployment accepts no submissions',async()=>{const {env,map}=setup();env.SUBMISSIONS_ENABLED='false';assert.equal((await capture(req(),env)).status,503);assert.equal(map.size,0);});
test('capture encrypts content and duplicate capture keeps one record',async()=>{const {env,map}=setup();assert.equal((await capture(req(),env)).status,200);assert.equal((await capture(req(),env)).status,200);assert.equal(map.size,1);assert.ok(![...map.values()][0].includes(payload.prayerRequest));});
test('invalid origin and invalid data cannot enter storage',async()=>{const {env,map}=setup();assert.equal((await capture(req(payload,'https://untrusted.invalid'),env)).status,403);assert.equal((await capture(req({...payload,email:'invalid'}),env)).status,400);assert.equal(map.size,0);});
test('outage and ambiguous response retain recovery copy',async()=>{const {env,map}=setup();await capture(req(),env);await retryPending(env,async()=>{throw Error('offline');});assert.equal(map.size,1);await retryPending(env,async()=>Response.json({status:'received'}));assert.equal(map.size,1);});
test('confirmed delivery purges content, receipt prevents recreation',async()=>{const {env,map}=setup();await capture(req(),env);await retryPending(env,async(url,opts)=>{assert.equal(JSON.parse(opts.body).submissionId,id);return Response.json({status:'delivered',submissionId:id});});assert.equal(map.has(`pending/${id}.json`),false);assert.equal(map.has(`receipts/${id}.json`),true);await capture(req(),env);assert.equal(map.size,1);});
test('preflight returns no body',async()=>{const {env}=setup();const r=await capture(new Request('https://test.invalid/submit',{method:'OPTIONS',headers:{Origin:'https://kipgnetwork.com'}}),env);assert.equal(r.status,204);});

test('missing security configuration fails closed without storage',async()=>{
 for(const field of ['TURNSTILE_SECRET_KEY','PRAYER_RATE_LIMITER']) {
  const {env,map}=setup();delete env[field];
  assert.equal((await capture(req(),env)).status,503);assert.equal(map.size,0);
 }
});
test('rate limiting rejects before bot verification or storage',async()=>{
 const {env,map}=setup();env.PRAYER_RATE_LIMITER.limit=async({key})=>{assert.equal(key,'prayer-submit:192.0.2.1');return {success:false};};
 const r=await captureRaw(req(),env,()=>assert.fail('must not verify'));
 assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal(map.size,0);
});
test('bot token must be present, successful and bound to this host, action and submission',async()=>{
 const outcomes=[{success:false},{success:true,hostname:'evil.invalid',action:'prayer_submit',cdata:id},{success:true,hostname:'kipgnetwork.com',action:'login',cdata:id},{success:true,hostname:'kipgnetwork.com',action:'prayer_submit',cdata:'other-id'}];
 for(const result of outcomes) {
  const {env,map}=setup();assert.equal((await captureRaw(req(),env,async()=>Response.json(result))).status,403);assert.equal(map.size,0);
 }
 const {env,map}=setup();assert.equal((await capture(req({...payload,turnstileToken:''}),env)).status,403);assert.equal(map.size,0);
});
test('verification outage and limiter outage do not save or leak content',async()=>{
 const {env,map}=setup();assert.equal((await captureRaw(req(),env,async()=>{throw Error('offline');})).status,503);assert.equal(map.size,0);
 env.PRAYER_RATE_LIMITER.limit=async()=>{throw Error('offline');};assert.equal((await capture(req(),env)).status,503);assert.equal(map.size,0);
});
test('missing trusted network address is rejected',async()=>{
 const {env,map}=setup();const r=req();r.headers.delete('CF-Connecting-IP');assert.equal((await capture(r,env)).status,403);assert.equal(map.size,0);
});
test('verification sends only token, secret and network address, never prayer content',async()=>{
 const {env,map}=setup();await captureRaw(req(),env,async(url,options)=>{
 assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
 assert.deepEqual(JSON.parse(options.body),{secret:'local-test-secret',response:'test-token',remoteip:'192.0.2.1'});return verify();
 });assert.equal(map.size,1);
});
test('public read attempts cannot expose prayer or receipt objects',async()=>{
 const {env}=setup();await capture(req(),env);
 for(const path of ['/pending/'+id+'.json','/receipts/'+id+'.json','/submit']) {
 const r=await capture(new Request('https://test.invalid'+path,{headers:{Origin:'https://kipgnetwork.com'}}),env);
 assert.equal(r.status,405);assert.ok(!(await r.text()).includes(payload.prayerRequest));
 }
});
