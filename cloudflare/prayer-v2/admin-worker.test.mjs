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
