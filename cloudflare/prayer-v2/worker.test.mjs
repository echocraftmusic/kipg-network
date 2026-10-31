import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capture,notifyPending} from './worker.js';
import {handleAdmin} from './admin-worker.js';

const id='fd21b6ad-c145-4ed0-b747-7d4de0c4a803';
const base={submissionId:id,name:'Anonymous',email:'person@example.com',prayerRequest:'Please pray for hope and encouragement.',contactRequested:false,website:'',startedAt:Date.now()-5000,turnstileToken:'token'};
function setup(){
  const objects=new Map(),rows=new Map();
  const R2={
    async get(key){return objects.has(key)?{json:async()=>JSON.parse(objects.get(key))}:null;},
    async put(key,value,opts){if(opts?.onlyIf&&objects.has(key))return null;objects.set(key,value);return {etag:'test'};}
  };
  const D1={prepare(sql){
    let args=[];
    return {bind(...values){args=values;return this;},
      async first(){if(sql.startsWith('SELECT id FROM'))return rows.has(args[0])?{id:args[0]}:null;return null;},
      async run(){if(sql.startsWith('INSERT OR IGNORE'))rows.set(args[0],{id:args[0],notification_sent_at:null});return {success:true};},
      async all(){if(sql.startsWith('SELECT id FROM prayer_requests WHERE notification_sent_at'))return {results:[...rows.values()].filter(x=>!x.notification_sent_at)};return {results:[]};}
    };
  }};
  return {objects,rows,env:{PRAYER_RECOVERY:R2,PRAYER_DB:D1,RECOVERY_ENCRYPTION_KEY:btoa('k'.repeat(32)),SUBMISSIONS_ENABLED:'true',PRODUCTION_KEY_READY:'true',TURNSTILE_SECRET_KEY:'test',PRAYER_RATE_LIMITER:{async limit(){return {success:true}}}}};
}
function request(body=base){return new Request('https://test.invalid/submit',{method:'POST',headers:{'Origin':'https://kipgnetwork.com','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)})}
const siteverify=async()=>Response.json({success:true,hostname:'kipgnetwork.com',action:'prayer_submit',cdata:id});
test('public requests fail closed when switch is off',async()=>{const {env,objects}=setup();env.SUBMISSIONS_ENABLED='false';assert.equal((await capture(request(),env,siteverify)).status,503);assert.equal(objects.size,0)});
test('encrypted intake stores only metadata in D1',async()=>{const {env,objects,rows}=setup();const response=await capture(request(),env,siteverify);assert.equal(response.status,200);assert.ok(rows.has(id));assert.ok(!objects.get('pending/'+id+'.json').includes(base.prayerRequest));assert.equal((await capture(request(),env,siteverify)).status,200);assert.equal(objects.size,1)});
test('prayer admin refuses unauthenticated requests',async()=>{const {env}=setup();const response=await handleAdmin(new Request('https://private.example/api/requests'),env,async()=>{throw Error('Should not reach certificate endpoint')});assert.equal(response.status,403)});
test('notifications are disabled by default and contain no prayer details when enabled',async()=>{
 const {env,rows}=setup();rows.set(id,{id,notification_sent_at:null});
 let calls=0;
 await notifyPending(env,async()=>{calls++;return Response.json({id:'x'})});assert.equal(calls,0);
 Object.assign(env,{NOTIFICATIONS_ENABLED:'true',RESEND_API_KEY:'test',PRAYER_NOTIFICATION_FROM:'KIPG Prayer <no-reply@kipgnetwork.com>',PRAYER_NOTIFICATION_TO:'prayers@kipgnetwork.com'});
 await notifyPending(env,async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.ok(!options.body.includes(base.prayerRequest));assert.ok(!options.body.includes(base.email));assert.ok(!options.body.includes(base.name));return Response.json({id:'test'});});
 assert.equal(calls,1);
});

test('no-follow-up requests may omit email; follow-up requires verified email syntax',async()=>{
 const first=setup(),noEmail={...base,email:'',contactRequested:false};
 assert.equal((await capture(request(noEmail),first.env,siteverify)).status,200);
 const second=setup(),needsEmail={...base,email:'',contactRequested:true};
 assert.equal((await capture(request(needsEmail),second.env,siteverify)).status,400);
 assert.equal(second.objects.size,0);
});

test('intake refuses public submissions when encryption recovery is not approved',async()=>{
  const {env,objects,rows}=setup();env.PRODUCTION_KEY_READY='false';
  const response=await capture(request(),env,siteverify);
  assert.equal(response.status,503);
  assert.equal(objects.size,0);
  assert.equal(rows.size,0);
});
