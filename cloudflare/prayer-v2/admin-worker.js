// KIPG prayer staff service — deploy as a SEPARATE Worker behind Cloudflare Access.
// Never expose this on the public prayer intake Worker route.
// Authorization: verified Cloudflare Access RS256 JWT plus explicit staff email allowlist.
const textDecoder=new TextDecoder();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const b64url=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
async function accessIdentity(request,env,fetcher=fetch){
  if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.PRAYER_ADMIN_EMAILS)return null;
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token)return null;
  const parts=token.split('.');
  if(parts.length!==3)return null;
  let header,claims;
  try{header=JSON.parse(textDecoder.decode(b64url(parts[0])));claims=JSON.parse(textDecoder.decode(b64url(parts[1])));}catch{return null;}
  const team=env.ACCESS_TEAM_DOMAIN.replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team)||header.alg!=='RS256'||typeof header.kid!=='string')return null;
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==team||!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60)return null;
  const email=String(claims.email||'').trim().toLowerCase();
  const allowed=env.PRAYER_ADMIN_EMAILS.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!email||!allowed.includes(email))return null;
  const certResponse=await fetcher(team+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(7000)});
  if(!certResponse.ok)return null;
  const certs=await certResponse.json();
  const jwk=certs.keys?.find(key=>key.kid===header.kid&&key.kty==='RSA');
  if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  return ok?email:null;
}
async function decrypt(object,env){
  const record=await object.json();
  if(record.version!==1)throw Error('Unsupported encrypted prayer object');
  const keyBytes=Uint8Array.from(atob(env.RECOVERY_ENCRYPTION_KEY||''),c=>c.charCodeAt(0));
  if(keyBytes.length!==32)throw Error('Prayer key unavailable');
  const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['decrypt']);
  const iv=Uint8Array.from(atob(record.iv),c=>c.charCodeAt(0));
  const ciphertext=Uint8Array.from(atob(record.ciphertext),c=>c.charCodeAt(0));
  return JSON.parse(textDecoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext))).payload;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=new Set(['pending','reviewing','prayed','follow_up','closed']);

const encoder=new TextEncoder();
const testKey=id=>'test/'+id+'.json';
const isTestRow=row=>!!row&&row.object_key===testKey(row.id);
const testEnabled=env=>env.PRAYER_TEST_MODE==='true';
const sameOrigin=(request,url)=>request.headers.get('Origin')===url.origin;
// Enforce request size even when a client omits Content-Length.
async function smallJson(request,limit=2048){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw Error('Invalid content type');
 const reader=request.body?.getReader();
 if(!reader)throw Error('No JSON body');
 let length=0;const chunks=[];
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  length+=value.length;
  if(length>limit){await reader.cancel();throw Error('Body too large');}
  chunks.push(value);
 }
 const bytes=new Uint8Array(length);let offset=0;
 for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(textDecoder.decode(bytes));
}
async function encryptTest(payload,env){
 const keyBytes=Uint8Array.from(atob(env.RECOVERY_ENCRYPTION_KEY||''),c=>c.charCodeAt(0));
 if(keyBytes.length!==32)throw Error('Test key unavailable');
 const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify({payload,createdAt:Date.now()}))));
 const b64=bytes=>btoa(String.fromCharCode(...bytes));
 return {version:1,iv:b64(iv),ciphertext:b64(ciphertext)};
}

export async function handleAdmin(request,env,fetcher=fetch){
  // No admin interface runs without both private storage bindings and Access JWT checks.
  if(!env.PRAYER_DB||!env.PRAYER_RECOVERY||!env.RECOVERY_ENCRYPTION_KEY)return json({error:'Staff service unavailable'},503);
  let email;
  try{email=await accessIdentity(request,env,fetcher);}catch{return json({error:'Authentication unavailable'},503);}
  if(!email)return json({error:'Access denied'},403);
  const url=new URL(request.url);
  const path=url.pathname;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'};
  if(request.method==='GET'&&path==='/'){
    return new Response(DASHBOARD,{status:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  }
  // A verified ministry administrator can compare this one-way fingerprint
  // with their private recovery record; the AES key itself is never returned.
  if(request.method==='GET'&&path==='/api/key-fingerprint'){
    try{
      const keyBytes=Uint8Array.from(atob(env.RECOVERY_ENCRYPTION_KEY||''),c=>c.charCodeAt(0));
      if(keyBytes.length!==32)throw Error('Invalid encryption secret');
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',keyBytes));
      const fingerprint=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
      return json({fingerprint});
    }catch{return json({error:'Encryption secret unavailable'},503);}
  }
  if(request.method==='GET'&&path==='/api/requests'){
    const rows=await env.PRAYER_DB.prepare('SELECT id,object_key,status,wants_follow_up,received_at,updated_at FROM prayer_requests ORDER BY received_at DESC LIMIT 100').all();
    const requests=(rows.results||[]).map(({object_key,...row})=>({...row,isTest:object_key===testKey(row.id)}));
    return json({requests,testMode:testEnabled(env)});
  }
  if(request.method==='POST'&&path==='/api/test-requests'){
    if(!testEnabled(env))return json({error:'Private test mode is disabled.'},404);
    if(!sameOrigin(request,url))return json({error:'Invalid request origin'},403);
    let body;
    try{body=await smallJson(request,3072);}catch{return json({error:'Invalid or oversized test request.'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body)||body.confirmSynthetic!==true||
       Object.keys(body).some(key=>!['testName','prayerRequest','confirmSynthetic'].includes(key))||
       typeof body.testName!=='string'||typeof body.prayerRequest!=='string')
       return json({error:'Confirm that this is a fictional test request.'},400);
    const name=body.testName.trim(),prayer=body.prayerRequest.trim();
    if(name.length<2||name.length>60||prayer.length<10||prayer.length>800||
       /[\r\n<>@]/.test(name)||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(prayer))
       return json({error:'Please use a fictional name and a test prayer of 10–800 characters.'},400);
    const id=crypto.randomUUID(),objectKey=testKey(id);
    const stamp=new Date().toISOString();
    const payload={submissionId:id,name:'TEST — '+name,email:'',
      prayerRequest:'TEST ONLY — '+prayer,contactRequested:false};
    let stored=false;
    try{
      const record=await encryptTest(payload,env);
      const object=await env.PRAYER_RECOVERY.put(objectKey,JSON.stringify(record),
        {onlyIf:{etagDoesNotMatch:'*'},customMetadata:{kind:'synthetic-prayer-test'}});
      if(!object)throw Error('R2 did not store the test request');
      stored=true;
      const result=await env.PRAYER_DB.prepare(
        'INSERT INTO prayer_requests(id,object_key,wants_follow_up,notification_sent_at) VALUES (?1,?2,0,?3)')
        .bind(id,objectKey,stamp).run();
      if(result?.success===false)throw Error('D1 did not accept test request');
      const row=await env.PRAYER_DB.prepare('SELECT id FROM prayer_requests WHERE id=?1').bind(id).first();
      if(!row)throw Error('D1 did not persist test request');
      return json({ok:true,id,isTest:true},201);
    }catch{
      if(stored)try{await env.PRAYER_RECOVERY.delete(objectKey);}catch{}
      return json({error:'Could not safely create this test request.'},503);
    }
  }
  const deleteTest=path.match(/^\/api\/test-requests\/([0-9a-f-]{36})$/i);
  if(request.method==='DELETE'&&deleteTest){
    if(!testEnabled(env))return json({error:'Private test mode is disabled.'},404);
    if(!sameOrigin(request,url)||request.headers.get('X-KIPG-Test-Action')!=='delete')
      return json({error:'Invalid request origin or action'},403);
    const id=deleteTest[1].toLowerCase();
    if(!uuid.test(id))return json({error:'Not found'},404);
    const row=await env.PRAYER_DB.prepare('SELECT id,object_key FROM prayer_requests WHERE id=?1').bind(id).first();
    if(!isTestRow(row))return json({error:'Only synthetic test records may be deleted here.'},403);
    try{
      await env.PRAYER_DB.batch([
        env.PRAYER_DB.prepare('DELETE FROM prayer_audit WHERE request_id=?1').bind(id),
        env.PRAYER_DB.prepare('DELETE FROM prayer_requests WHERE id=?1 AND object_key=?2').bind(id,row.object_key)
      ]);
    }catch{return json({error:'Test metadata could not be cleared.'},503);}
    try{
      await env.PRAYER_RECOVERY.delete(row.object_key);
      return json({ok:true,storageCleanup:true});
    }catch{return json({ok:true,storageCleanup:false,warning:'The queue is cleared; encrypted test storage still needs cleanup.'});}
  }
  const match=path.match(/^\/api\/requests\/([0-9a-f-]{36})(?:\/status)?$/i);
  if(!match||!uuid.test(match[1]))return json({error:'Not found'},404);
  const id=match[1].toLowerCase();
  const row=await env.PRAYER_DB.prepare('SELECT id,object_key,status,wants_follow_up,received_at,updated_at FROM prayer_requests WHERE id=?1').bind(id).first();
  if(!row)return json({error:'Not found'},404);
  if(request.method==='GET'&&path.endsWith(id)){
    const encrypted=await env.PRAYER_RECOVERY.get(row.object_key);
    if(!encrypted)return json({error:'Prayer object unavailable. Contact an administrator.'},503);
    try{const payload=await decrypt(encrypted,env);const {object_key,...meta}=row;return json({request:{...meta,isTest:isTestRow(row),name:payload.name,email:payload.email||'',phone:payload.phone||'',contactMethod:payload.contactMethod||(payload.contactRequested?'email':'none'),smsConsent:payload.smsConsent===true,prayerRequest:payload.prayerRequest,contactRequested:payload.contactRequested}});}
    catch{return json({error:'Prayer could not be decrypted.'},503);}
  }
  if(request.method==='POST'&&path.endsWith('/status')){
    // Browser can send the Access cookie automatically; require a same-origin request.
    if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'Invalid request origin'},403);
    const size=Number(request.headers.get('Content-Length')||0);
    if(size>2048)return json({error:'Request too large'},413);
    let body;try{body=await request.json();}catch{return json({error:'Invalid request'},400);}
    if(!body||!statuses.has(body.status))return json({error:'Invalid status'},400);
    const stamp=new Date().toISOString();
    // D1 batch is atomic: a status update must not succeed without its audit record.
    await env.PRAYER_DB.batch([
      env.PRAYER_DB.prepare("UPDATE prayer_requests SET status=?1,updated_at=?2,reviewed_at=COALESCE(reviewed_at,?2),closed_at=CASE WHEN ?1='closed' THEN ?2 ELSE NULL END WHERE id=?3").bind(body.status,stamp,id),
      env.PRAYER_DB.prepare('INSERT INTO prayer_audit (request_id,actor_email,action,created_at) VALUES (?1,?2,?3,?4)').bind(id,email,'status:'+body.status,stamp)
    ]);
    return json({ok:true,status:body.status});
  }
  return json({error:'Method not supported'},405);
}
const DASHBOARD=String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KIPG Prayer Ministry — Private</title>
<script>
try{if(localStorage.getItem('kipg-prayer-admin-theme')==='light')document.documentElement.dataset.theme='light';}catch{}
</script><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#0c0b0a;color:#eee7da}
.dashboard-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;border-bottom:1px solid #765a2c;padding-bottom:1rem}
.dashboard-header p:last-child{margin-bottom:0}
.dashboard-header h1{margin-top:.45rem}
.dashboard-header .header-copy{flex:1 1 420px;min-width:0}
.dashboard-header #theme-toggle{flex:none;margin-top:.5rem;min-width:144px;white-space:nowrap}
:root[data-theme="light"]{color-scheme:light;background:#f6f3ec;color:#302820}
:root[data-theme="light"] .dashboard-header{border-bottom-color:#b79762}
:root[data-theme="light"] .panel{background:#fffdfa;border-color:#b99b67;box-shadow:0 3px 14px rgba(80,53,20,.055)}
:root[data-theme="light"] button,:root[data-theme="light"] select,:root[data-theme="light"] input,:root[data-theme="light"] textarea{background:#f9efdd;border-color:#917141;color:#352716}
:root[data-theme="light"] button:hover{background:#eedbb7}
:root[data-theme="light"] button:focus-visible,:root[data-theme="light"] select:focus-visible,:root[data-theme="light"] input:focus-visible,:root[data-theme="light"] textarea:focus-visible{outline-color:#895a16}
:root[data-theme="light"] #queue-count,:root[data-theme="light"] .hint{color:#66502e}
:root[data-theme="light"] #requests .request-row{background:#fffaf2;border-color:#c3ad87}
:root[data-theme="light"] #requests .request-row:hover{background:#f6e9d2;border-color:#a67a32}
:root[data-theme="light"] #requests .request-row[aria-pressed="true"]{background:#f4e4c4;border-color:#9e742b;box-shadow:inset 3px 0 0 #a57224}
:root[data-theme="light"] .row-status{color:#62410e;border-color:#a9874b;background:#f4e5c9}
:root[data-theme="light"] .row-follow{color:#69512e}
:root[data-theme="light"] #details .prayer-content{background:#f9f0df;border-left-color:#aa7e34}
:root[data-theme="light"] #actions{border-top-color:#ddcba9}
:root[data-theme="light"] #error{color:#8d370c}
:root[data-theme="light"] #test-panel{border-color:#bc9d60;background:linear-gradient(135deg,#fff8e9,#fffdfa 65%)}
:root[data-theme="light"] #test-panel input[type="text"],:root[data-theme="light"] #test-panel textarea{background:#fffdfa}
:root[data-theme="light"] .primary{background:linear-gradient(115deg,#bc8838,#ecc975);color:#211608;border-color:#986b28}
:root[data-theme="light"] .primary:hover{background:#e5bf6b}
:root[data-theme="light"] .warning{color:#80440e}
@media(max-width:650px){.dashboard-header #theme-toggle{margin-top:0}.dashboard-header .header-copy{flex-basis:100%}}

body{margin:0 auto;max-width:1080px;padding:1.5rem}
header{border-bottom:1px solid #765a2c;padding-bottom:1rem}
h1{font-family:Georgia,serif}
h2{margin-top:0}
button,select,input,textarea{background:#241c11;border:1px solid #967135;border-radius:8px;color:#f9eacf;padding:.7rem;font:inherit}
button{cursor:pointer}
button:hover{background:#403019}
button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #eac074;outline-offset:2px}
main{display:grid;grid-template-columns:minmax(0,1fr);gap:1.25rem;margin-top:1.5rem}
.panel{border:1px solid #785d31;border-radius:12px;padding:1.2rem;min-width:0}
.panel-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.7rem}
.panel-head h2{margin:0}
#queue-count{font-size:.88rem;color:#d7c39e}
#requests{display:grid;gap:.5rem;margin-top:1rem;max-height:340px;min-height:72px;overflow-y:auto;overscroll-behavior:contain;padding-right:.25rem;align-content:start}
#requests .request-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem 1rem;width:100%;min-height:55px;text-align:left;padding:.8rem 1rem;box-sizing:border-box;background:#17130d;border:1px solid #5c482a}
#requests .request-row:hover{background:#2f2413;border-color:#d7aa54}
#requests .request-row[aria-pressed="true"]{background:#352710;border-color:#e0b35e;box-shadow:inset 3px 0 0 #e9bd6a}
.row-date{font-weight:600;overflow-wrap:anywhere}
.row-meta{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem}
.row-status{font-size:.85rem;color:#ffe2ab;border:1px solid #8b672e;border-radius:999px;padding:.2rem .65rem}
.row-follow{font-size:.84rem;color:#ddc49c}
#details{overflow-wrap:anywhere;line-height:1.7;min-height:135px}
#details p{white-space:pre-wrap}
#details .prayer-content{margin:1rem 0;padding:1rem 1.2rem;border-left:3px solid #d6a653;background:#17120c;border-radius:0 8px 8px 0;max-width:95ch;line-height:1.8}
#actions{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;margin-top:1rem;padding-top:1rem;border-top:1px solid #483920}
#actions label{font-weight:600}
@media(max-width:650px){body{padding:1rem}.panel{padding:1rem}#requests{max-height:325px}.request-row{align-items:flex-start}#actions>*{max-width:100%}}

#error{color:#ffcc9c;min-height:1.2rem}
#test-panel{margin-top:1rem;border-color:#ab843d;background:linear-gradient(130deg,rgba(180,118,23,.12),transparent 65%)}
#test-panel label{display:block;margin:.75rem 0 .25rem;font-weight:600}
#test-panel input[type="text"],#test-panel textarea{box-sizing:border-box;width:100%;background:#12100e}
#test-panel textarea{resize:vertical;min-height:105px}
#test-panel .confirm-row{display:flex;align-items:flex-start;gap:.6rem;font-weight:400}
#test-panel input[type="checkbox"]{width:1.15rem;height:1.15rem;margin:.15rem 0 0;flex:none}
.test-label{display:inline-block;background:#5d4117;border:1px solid #c49944;border-radius:5px;padding:.1rem .4rem;color:#ffe4aa;font-size:.8em;font-weight:700}
.hint{color:#d7c39e;line-height:1.5}
.primary{background:linear-gradient(115deg,#a67325,#e4bb65);border-color:#f0d48d;color:#17120a;font-weight:700}
.primary:hover{background:#efc770}
.warning{color:#ffe1b2}
[hidden]{display:none!important}

</style></head><body>
<header class="dashboard-header">
<div class="header-copy"><p>KIPG NETWORK · AUTHORIZED MINISTRY USE</p><h1>Prayer Ministry</h1>
<p>Confidential requests. Never share request details outside approved ministry access.</p></div>
<button id="theme-toggle" type="button" aria-label="Switch to light mode" aria-pressed="false">☀ Light mode</button>
</header>
<p id="error" role="status" aria-live="polite"></p>
<main>
<section class="panel" aria-labelledby="queue-heading">
<div class="panel-head"><h2 id="queue-heading">Prayer queue</h2><button id="reload" type="button">Refresh</button></div>
<p id="queue-count" role="status" aria-live="polite">Loading requests…</p>
<div id="requests" aria-label="Prayer requests"></div>
</section>
<section class="panel" aria-labelledby="detail-heading">
<h2 id="detail-heading">Request details</h2><div id="details">Select a prayer request above to read its details.</div>
<div id="actions" hidden><label for="status">Prayer status</label>
<select id="status"><option value="pending">New / Pending</option><option value="reviewing">Being reviewed</option><option value="prayed">Prayed for</option><option value="follow_up">Follow-up needed</option><option value="closed">Closed</option></select>
<button id="save" type="button">Save status</button> <button id="delete-test" type="button" hidden>Delete TEST record</button>
</div></section>
</main>
<section id="test-panel" class="panel" hidden aria-labelledby="test-title">
<p class="test-label">PRIVATE TEST MODE · SYNTHETIC DATA ONLY</p><h2 id="test-title">Create a fictional prayer request</h2>
<p class="hint">Test the encryption, prayer queue and ministry workflow here without opening the public form or sending an email. Do not enter a real person's name, contact details, or a genuine prayer request.</p>
<label for="test-name">Fictional visitor name</label><input id="test-name" type="text" maxlength="60" value="Demo Visitor" autocomplete="off">
<label for="test-prayer">Fictional prayer request</label>
<textarea id="test-prayer" maxlength="800" placeholder="Example: Please pray for the fictional Smith family as they prepare to move to a new city."></textarea>
<label class="confirm-row"><input id="test-confirm" type="checkbox"> <span>I confirm this is a completely fictional test, not a real person's confidential information.</span></label>
<p><button class="primary" id="create-test" type="button">Submit TEST prayer</button></p><p id="test-result" class="hint" role="status" aria-live="polite"></p>
</section>
<script>
const byId=id=>document.getElementById(id);
const themeButton=byId('theme-toggle');
function applyTheme(theme,save=false){
 const light=theme==='light';
 document.documentElement.dataset.theme=light?'light':'dark';
 themeButton.textContent=light?'☾ Dark mode':'☀ Light mode';
 themeButton.setAttribute('aria-label',light?'Switch to dark mode':'Switch to light mode');
 themeButton.setAttribute('aria-pressed',String(light));
 if(save)try{localStorage.setItem('kipg-prayer-admin-theme',light?'light':'dark');}catch{}
}
applyTheme(document.documentElement.dataset.theme==='light'?'light':'dark');
themeButton.addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light',true));
let selected=null,testMode=false;
const status=message=>byId('error').textContent=message;
async function api(path,options){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 if(!response.ok){let message='Request failed ('+response.status+').';try{const body=await response.json();if(typeof body.error==='string')message=body.error;}catch{}throw Error(message);}
 return response.json();
}
async function load(){
 try{
  status('');
  const data=await api('/api/requests');testMode=!!data.testMode;
  byId('test-panel').hidden=!testMode;
  const list=byId('requests');list.replaceChildren();
  const rows=Array.isArray(data.requests)?data.requests:[];
  byId('queue-count').hidden=rows.length===0;
  byId('queue-count').textContent=rows.length===1?'1 request in the queue':rows.length>1?rows.length+' requests in the queue (showing up to 100)':'';
  for(const item of rows){
   const button=document.createElement('button');
   button.type='button';button.className='request-row';
   button.dataset.requestId=item.id;
   button.setAttribute('aria-pressed',String(item.id===selected));
   const date=document.createElement('span');date.className='row-date';
   const parsed=new Date(item.received_at);
   date.textContent=(item.isTest?'[TEST] ':'')+(Number.isNaN(parsed.getTime())?item.received_at:parsed.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}));
   const meta=document.createElement('span');meta.className='row-meta';
   const statusLabel=document.createElement('span');statusLabel.className='row-status';
   const titles={pending:'New / Pending',reviewing:'Being reviewed',prayed:'Prayed for',follow_up:'Follow-up needed',closed:'Closed'};
   statusLabel.textContent=titles[item.status]||item.status;meta.append(statusLabel);
   if(item.wants_follow_up){const follow=document.createElement('span');follow.className='row-follow';follow.textContent='Follow-up requested';meta.append(follow);}
   button.append(date,meta);
   button.onclick=()=>open(item.id);list.append(button);
  }
  if(!rows.length)list.textContent='No requests yet.';
  else if(selected&&!rows.some(item=>item.id===selected)){
   selected=null;byId('details').textContent='Select a prayer request above to read its details.';byId('actions').hidden=true;
  }
 }catch(e){status(e.message)}
}
async function open(id){
 try{
  const {request:r}=await api('/api/requests/'+encodeURIComponent(id));selected=r.id;
  const box=byId('details');box.replaceChildren();
  if(r.isTest){const badge=document.createElement('p');badge.className='test-label';badge.textContent='FICTIONAL TEST RECORD';box.append(badge);}
  const preferred=r.contactRequested?(r.contactMethod==='text'?'Text message':r.contactMethod==='phone'?'Phone call':r.contactMethod==='email'?'Email':'Unspecified'):'None';
  const fields=[['Received',r.received_at],['Name',r.name],['Follow-up requested',r.contactRequested?'Yes':'No']];
  if(r.contactRequested){
   fields.push(['Preferred contact',preferred]);
   if(r.contactMethod==='email')fields.push(['Email',r.email||'(not supplied)']);
   if(r.contactMethod==='phone'||r.contactMethod==='text')fields.push(['Phone number',r.phone||'(not supplied)']);
   if(r.contactMethod==='text')fields.push(['Text message permission',r.smsConsent?'Yes':'No']);
  }
  fields.push(['Prayer request',r.prayerRequest]);
  for(const [name,value] of fields){
   const p=document.createElement('p'),strong=document.createElement('strong');
   if(name==='Prayer request')p.className='prayer-content';
   strong.textContent=name+': ';p.append(strong,document.createTextNode(String(value||'')));box.append(p);
  }
  byId('status').value=r.status;
  byId('actions').hidden=false;byId('delete-test').hidden=!(r.isTest&&testMode);
  document.querySelectorAll('.request-row').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.requestId===selected)));
  status('');
 }catch(e){status(e.message)}
}
byId('reload').onclick=load;
byId('save').onclick=async()=>{
 if(!selected)return;
 try{
  await api('/api/requests/'+encodeURIComponent(selected)+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:byId('status').value})});
  await load();await open(selected);
 }catch(e){status(e.message)}
};
byId('create-test').onclick=async()=>{
 const name=byId('test-name').value.trim(),prayerRequest=byId('test-prayer').value.trim();
 const result=byId('test-result');
 if(!byId('test-confirm').checked){result.textContent='Please confirm that this is fictional test data only.';return;}
 if(name.length<2||prayerRequest.length<10){result.textContent='Provide a fictional name and at least ten characters of test prayer text.';return;}
 const button=byId('create-test');button.disabled=true;result.textContent='Saving encrypted test request…';
 try{
  const response=await api('/api/test-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({testName:name,prayerRequest,confirmSynthetic:true})});
  byId('test-prayer').value='';byId('test-confirm').checked=false;
  result.textContent='Test request created. Open it in the prayer queue to verify its contents and update its status.';
  await load();await open(response.id);
 }catch(e){result.textContent=e.message}finally{button.disabled=false}
};
byId('delete-test').onclick=async()=>{
 if(!selected||!testMode)return;
 if(!confirm('Permanently delete this FICTIONAL TEST record from the prayer queue and encrypted storage?'))return;
 try{
  const result=await api('/api/test-requests/'+encodeURIComponent(selected),{method:'DELETE',headers:{'X-KIPG-Test-Action':'delete'}});
  selected=null;byId('details').textContent='Select a prayer request above to read its details.';byId('actions').hidden=true;
  await load();
  status(result.storageCleanup?'Synthetic test record deleted.':'Test removed from the queue, but encrypted storage cleanup needs attention.');
 }catch(e){status(e.message)}
};
load();
</script></body></html>`;
export default {fetch(request,env){return handleAdmin(request,env);}};
