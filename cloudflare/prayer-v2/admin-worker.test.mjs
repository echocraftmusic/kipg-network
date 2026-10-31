import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleAdmin} from './admin-worker.js';

const keyPair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...(await webcrypto.subtle.exportKey('jwk',keyPair.publicKey)),kid:'local-test-key',alg:'RS256',use:'sig'};
const team='https://echocraft-aimusic.cloudflareaccess.com',aud='test-audience';
const encoded=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function jwt(overrides={}){
  const now=Math.floor(Date.now()/1000);
  const header=encoded({alg:'RS256',kid:jwk.kid,typ:'JWT'});
  const claims=encoded({iss:team,aud:[aud],iat:now-20,exp:now+600,email:'lead@example.com',...overrides});
  const unsigned=header+'.'+claims;
  const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(unsigned));
  return unsigned+'.'+Buffer.from(signature).toString('base64url');
}
const fetchCerts=async url=>{assert.equal(url,team+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
function setup(){
 const rows=[];
 const db={
  prepare(sql){let args=[];return {bind(...a){args=a;return this;},async all(){return {results:rows};},async first(){return {id:'f4fd0503-f4ac-45a9-a38d-1640b273a081',object_key:'pending/dummy',status:'pending'};},sql,args(){return args;}};},
  async batch(statements){assert.equal(statements.length,2);return statements.map(()=>({success:true}));}
 };
 return {PRAYER_DB:db,PRAYER_RECOVERY:{async get(){return null}},RECOVERY_ENCRYPTION_KEY:btoa('x'.repeat(32)),ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:aud,PRAYER_ADMIN_EMAILS:'lead@example.com'};
}
const url='https://prayer-admin.kipgnetwork.com/api/requests';
const req=async(claims,options={})=>new Request(options.url||url,{method:options.method||'GET',headers:{'Cf-Access-Jwt-Assertion':await jwt(claims),...(options.headers||{})},body:options.body});
test('staff dashboard validates signed Access JWT and explicit email allowlist',async()=>{
 const env=setup();const response=await handleAdmin(await req({}),env,fetchCerts);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{requests:[]});
 for(const bad of [{email:'other@example.com'},{aud:['wrong']},{exp:1},{iss:'https://evil.example'}]){
  const r=await handleAdmin(await req(bad),env,fetchCerts);assert.equal(r.status,403);
 }
});
test('JWT cannot be forged by changing its payload',async()=>{
 const env=setup();const token=await jwt();const parts=token.split('.');
 parts[1]=encoded({iss:team,aud:[aud],iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,email:'lead@example.com',fake:true});
 const request=new Request(url,{headers:{'Cf-Access-Jwt-Assertion':parts.join('.')}});
 assert.equal((await handleAdmin(request,env,fetchCerts)).status,403);
});
test('status changes reject cross-origin requests and use atomic D1 batch',async()=>{
 const env=setup(),id='f4fd0503-f4ac-45a9-a38d-1640b273a081';
 const p=url+'/'+id+'/status';
 let batchCalls=0;
 env.PRAYER_DB.batch=async statements=>{batchCalls++;assert.equal(statements.length,2);return [];};
 const foreign=await req({}, {url:p,method:'POST',headers:{Origin:'https://malicious.example','Content-Type':'application/json'},body:JSON.stringify({status:'prayed'})});
 assert.equal((await handleAdmin(foreign,env,fetchCerts)).status,403);
 assert.equal(batchCalls,0);
 const same=await req({}, {url:p,method:'POST',headers:{Origin:'https://prayer-admin.kipgnetwork.com','Content-Type':'application/json'},body:JSON.stringify({status:'prayed'})});
 assert.equal((await handleAdmin(same,env,fetchCerts)).status,200);
 assert.equal(batchCalls,1);
});

test('dashboard CSP permits only same-origin queue API access',async()=>{
 const env=setup();const response=await handleAdmin(await req({}, {url:'https://prayer-admin.kipgnetwork.com/'}),env,fetchCerts);
 assert.equal(response.status,200);
 const csp=response.headers.get('Content-Security-Policy');
 assert.match(csp,/default-src 'none'/);
 assert.match(csp,/connect-src 'self'/);
 assert.equal(csp.includes("connect-src *"),false);
 assert.equal((await response.text()).includes('/api/requests'),true);
 const queue=await handleAdmin(await req({}),env,fetchCerts);
 assert.equal(queue.status,200);
 assert.deepEqual(await queue.json(),{requests:[]});
});

function setupSyntheticStore(){
 const env=setup(),records=new Map(),objects=new Map(),audit=[];
 env.PRAYER_TEST_MODE='true';
 env.PRAYER_RECOVERY={
   async put(key,data){if(objects.has(key))return null;objects.set(key,data);return {etag:'synthetic'};},
   async get(key){return objects.has(key)?{json:async()=>JSON.parse(objects.get(key))}:null;},
   async delete(key){objects.delete(key)}
 };
 env.PRAYER_DB={
   prepare(sql){
     let args=[];
     const statement={
       bind(...values){args=values;return statement;},
       async run(){
         if(sql.startsWith('INSERT INTO prayer_requests')){
           records.set(args[0],{id:args[0],object_key:args[1],status:'pending',wants_follow_up:0,received_at:args[2],updated_at:args[2],notification_sent_at:args[2]});
         }else if(sql.startsWith('DELETE FROM prayer_audit')){
           for(let i=audit.length-1;i>=0;i--)if(audit[i].id===args[0])audit.splice(i,1);
         }else if(sql.startsWith('DELETE FROM prayer_requests')){
           const row=records.get(args[0]);if(row?.object_key===args[1])records.delete(args[0]);
         }else if(sql.startsWith('INSERT INTO prayer_audit')){
           audit.push({id:args[0],actor:args[1],action:args[2]});
         }else if(sql.startsWith('UPDATE prayer_requests SET')){
           const row=records.get(args[2]);if(row)row.status=args[0];
         }
         return {success:true};
       },
       async first(){
         if(sql.startsWith('SELECT id FROM prayer_requests'))return records.has(args[0])?{id:args[0]}:null;
         return records.get(args[0])||null;
       },
       async all(){return {results:[...records.values()]}}
     };
     return statement;
   },
   async batch(statements){const result=[];for(const s of statements)result.push(await s.run());return result;}
 };
 return {env,records,objects,audit};
}
const testPostUrl='https://prayer-admin.kipgnetwork.com/api/test-requests';
const fictionalPrayer='A fictional family is moving to another city and wants encouragement.';
const syntheticBody={testName:'Fictional Guest',prayerRequest:fictionalPrayer,confirmSynthetic:true};
async function syntheticRequest(environment,options={}){
 return handleAdmin(await req(options.claims||{},{
   url:options.url||testPostUrl,method:options.method||'POST',
   headers:{Origin:'https://prayer-admin.kipgnetwork.com','Content-Type':'application/json',...(options.headers||{})},
   body:options.body===undefined?JSON.stringify(syntheticBody):options.body
 }),environment,fetchCerts);
}
test('private synthetic prayer round-trip encrypts content, marks queue, and skips emails',async()=>{
 const {env,records,objects,audit}=setupSyntheticStore();
 const created=await syntheticRequest(env);
 assert.equal(created.status,201);
 const {id,isTest}=await created.json();assert.equal(isTest,true);
 assert.ok(records.get(id)?.object_key.startsWith('test/'));
 assert.ok(records.get(id)?.notification_sent_at,'Test prayers must never enter notification queue');
 const encrypted=objects.get('test/'+id+'.json');
 assert.ok(encrypted);
 assert.equal(encrypted.includes(fictionalPrayer),false,'Unencrypted test text must not enter R2');
 const list=await handleAdmin(await req({}),env,fetchCerts);
 assert.equal(list.status,200);
 const listData=await list.json();assert.equal(listData.testMode,true);
 assert.equal(listData.requests[0].isTest,true);
 assert.equal(Object.hasOwn(listData.requests[0],'object_key'),false);
 const detail=await handleAdmin(await req({}, {url:url+'/'+id}),env,fetchCerts);
 assert.equal(detail.status,200);
 const requestData=(await detail.json()).request;
 assert.equal(requestData.isTest,true);
 assert.equal(requestData.email,'');
 assert.ok(requestData.prayerRequest.includes(fictionalPrayer));
 const changed=await syntheticRequest(env,{url:url+'/'+id+'/status',body:JSON.stringify({status:'prayed'})});
 assert.equal(changed.status,200);assert.equal(records.get(id).status,'prayed');assert.equal(audit.length,1);
 const removed=await syntheticRequest(env,{method:'DELETE',url:testPostUrl+'/'+id,headers:{'X-KIPG-Test-Action':'delete'},body:null});
 assert.equal(removed.status,200);assert.equal((await removed.json()).storageCleanup,true);
 assert.equal(records.size,0);assert.equal(objects.size,0);assert.equal(audit.length,0);
});
test('synthetic endpoint rejects forged identity, wrong origin and disabled test mode',async()=>{
 const {env,objects}=setupSyntheticStore();
 const wrongUser=await syntheticRequest(env,{claims:{email:'outsider@example.com'}});
 assert.equal(wrongUser.status,403);
 const wrongOrigin=await syntheticRequest(env,{headers:{Origin:'https://outside.example'}});
 assert.equal(wrongOrigin.status,403);
 env.PRAYER_TEST_MODE='false';
 assert.equal((await syntheticRequest(env)).status,404);
 assert.equal(objects.size,0);
});
test('test-only deletion refuses real prayer objects',async()=>{
 const {env,records,objects}=setupSyntheticStore();
 const id='c5f20f0f-226c-41b4-bd00-5c4174213b41';
 records.set(id,{id,object_key:'pending/'+id+'.json',status:'pending'});
 objects.set('pending/'+id+'.json','SECRET RECORD');
 const rejected=await syntheticRequest(env,{method:'DELETE',url:testPostUrl+'/'+id,headers:{'X-KIPG-Test-Action':'delete'},body:null});
 assert.equal(rejected.status,403);assert.equal(records.size,1);assert.equal(objects.size,1);
});
test('synthetic prayer requires explicit fictional-data confirmation',async()=>{
 const {env,objects}=setupSyntheticStore();
 const invalid=await syntheticRequest(env,{body:JSON.stringify({...syntheticBody,confirmSynthetic:false})});
 assert.equal(invalid.status,400);assert.equal(objects.size,0);
});
