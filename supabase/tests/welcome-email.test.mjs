import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../functions/kipg-welcome-email/index.ts',import.meta.url),'utf8');
const {createHandler}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',RESEND_API_KEY:'mail-only'};
const user={id:'11111111-1111-4111-8111-111111111111',email:'verified@example.invalid',email_confirmed_at:'2026-10-04T14:00:00Z'};
const request=(body={},headers={})=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer member-session',Origin:'https://kipgnetwork.com',...headers},body:JSON.stringify(body)});
function mock({confirmed=true,existing=false,failSend=false,failPatch=false}={}){
  let claimed=existing;const sends=[];const updates=[];
  const fetcher=async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({...user,email_confirmed_at:confirmed?user.email_confirmed_at:null});
    if(options.method==='POST'&&url.includes('kipg_welcome_deliveries')){if(claimed)return Response.json([]);claimed=true;return Response.json([{user_id:user.id}]);}
    if(url==='https://api.resend.com/emails'){sends.push(options);if(failSend)throw new Error('uncertain');return Response.json({id:'resend-123'});}
    if(options.method==='PATCH'){updates.push(JSON.parse(options.body));return new Response(null,{status:failPatch?500:204});}
    throw new Error('Unexpected request');
  };
  return {handler:createHandler(env,fetcher),sends,updates};
}
test('recipient, subject and body cannot be overridden; repeated and concurrent requests send once',async()=>{
  const m=mock();const replies=await Promise.all([m.handler(request({to:'victim@example.invalid',subject:'spam',html:'fake'})),m.handler(request())]);
  assert.deepEqual(replies.map(r=>r.status),[200,200]);assert.equal(m.sends.length,1);
  const payload=JSON.parse(m.sends[0].body);assert.deepEqual(payload.to,[user.email]);assert.equal(payload.subject,'Welcome to the KIPG community!');assert.ok(payload.html.includes('/pages/live.html'));
  assert.equal(m.sends[0].headers['Idempotency-Key'],`kipg-welcome-v1-${user.id}`);
  await m.handler(request());assert.equal(m.sends.length,1);assert.equal(m.updates[0].status,'accepted');
});
test('anonymous, unverified, and disallowed-origin requests cannot send',async()=>{
  const m=mock({confirmed:false});assert.equal((await m.handler(request())).status,403);
  assert.equal((await m.handler(request({}, {Authorization:''}))).status,401);
  assert.equal((await m.handler(request({}, {Origin:'https://evil.invalid'}))).status,403);assert.equal(m.sends.length,0);
});
test('historical accounts are skipped',async()=>{const m=mock({existing:true});assert.equal((await m.handler(request())).status,200);assert.equal(m.sends.length,0);});
test('uncertain provider response blocks retries and records review state',async()=>{const m=mock({failSend:true});assert.equal((await m.handler(request())).status,503);assert.equal(m.updates[0].status,'needs_review');await m.handler(request());assert.equal(m.sends.length,1);});
test('accepted send with failed database acknowledgement still cannot send again',async()=>{const m=mock({failPatch:true});assert.equal((await m.handler(request())).status,503);await m.handler(request());assert.equal(m.sends.length,1);});
test('invalid auth token never reaches delivery table',async()=>{let calls=0;const h=createHandler(env,async()=>{calls++;return Response.json({error:'invalid'},{status:401});});assert.equal((await h(request())).status,401);assert.equal(calls,1);});
