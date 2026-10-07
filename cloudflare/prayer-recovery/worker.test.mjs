import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capture,retryPending} from './worker.js';
const id='fd21b6ad-c145-4ed0-b747-7d4de0c4a803';
const payload={submissionId:id,name:'Test',email:'test@example.com',prayerRequest:'PRIVATE TEST PRAYER',contactRequested:false,startedAt:Date.now()-5000,website:''};
function setup() {
 const map=new Map();
 const bucket={async head(k){return map.has(k)?{}:null;},async get(k){const v=map.get(k);return v?{json:async()=>JSON.parse(v)}:null;},async put(k,v,o){if(o?.onlyIf&&map.has(k))return null;map.set(k,v);return {};},async delete(k){map.delete(k);},async list(){return {objects:[...map.keys()].filter(k=>k.startsWith('pending/')).map(key=>({key})),truncated:false};}};
 return {map,env:{PRAYER_RECOVERY:bucket,RECOVERY_ENCRYPTION_KEY:btoa('a'.repeat(32)),SUBMISSIONS_ENABLED:'true',DELIVERY_ENABLED:'true',DELIVERY_SECRET:'test-only',DELIVERY_URL:'https://'+ 'a'.repeat(20) +'.supabase.co/functions/v1/kipg-prayer-request'}};
}
const req=(p=payload,origin='https://kipgnetwork.com')=>new Request('https://test.invalid/submit',{method:'POST',headers:{Origin:origin},body:JSON.stringify(p)});
test('disabled deployment accepts no submissions',async()=>{const {env,map}=setup();env.SUBMISSIONS_ENABLED='false';assert.equal((await capture(req(),env)).status,503);assert.equal(map.size,0);});
test('capture encrypts content and duplicate capture keeps one record',async()=>{const {env,map}=setup();assert.equal((await capture(req(),env)).status,200);assert.equal((await capture(req(),env)).status,200);assert.equal(map.size,1);assert.ok(![...map.values()][0].includes(payload.prayerRequest));});
test('invalid origin and invalid data cannot enter storage',async()=>{const {env,map}=setup();assert.equal((await capture(req(payload,'https://untrusted.invalid'),env)).status,403);assert.equal((await capture(req({...payload,email:'invalid'}),env)).status,400);assert.equal(map.size,0);});
test('outage and ambiguous response retain recovery copy',async()=>{const {env,map}=setup();await capture(req(),env);await retryPending(env,async()=>{throw Error('offline');});assert.equal(map.size,1);await retryPending(env,async()=>Response.json({status:'received'}));assert.equal(map.size,1);});
test('confirmed delivery purges content, receipt prevents recreation',async()=>{const {env,map}=setup();await capture(req(),env);await retryPending(env,async(url,opts)=>{assert.equal(JSON.parse(opts.body).submissionId,id);return Response.json({status:'delivered',submissionId:id});});assert.equal(map.has(`pending/${id}.json`),false);assert.equal(map.has(`receipts/${id}.json`),true);await capture(req(),env);assert.equal(map.size,1);});
test('preflight returns no body',async()=>{const {env}=setup();const r=await capture(new Request('https://test.invalid/submit',{method:'OPTIONS',headers:{Origin:'https://kipgnetwork.com'}}),env);assert.equal(r.status,204);});
