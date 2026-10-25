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
export async function handleAdmin(request,env,fetcher=fetch){
  // No admin interface runs without both private storage bindings and Access JWT checks.
  if(!env.PRAYER_DB||!env.PRAYER_RECOVERY||!env.RECOVERY_ENCRYPTION_KEY)return json({error:'Staff service unavailable'},503);
  let email;
  try{email=await accessIdentity(request,env,fetcher);}catch{return json({error:'Authentication unavailable'},503);}
  if(!email)return json({error:'Access denied'},403);
  const url=new URL(request.url);
  const path=url.pathname;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'};
  if(request.method==='GET'&&path==='/'){
    return new Response(DASHBOARD,{status:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  }
  if(request.method==='GET'&&path==='/api/requests'){
    const rows=await env.PRAYER_DB.prepare('SELECT id,status,wants_follow_up,received_at,updated_at FROM prayer_requests ORDER BY received_at DESC LIMIT 100').all();
    return json({requests:rows.results||[]});
  }
  const match=path.match(/^\/api\/requests\/([0-9a-f-]{36})(?:\/status)?$/i);
  if(!match||!uuid.test(match[1]))return json({error:'Not found'},404);
  const id=match[1].toLowerCase();
  const row=await env.PRAYER_DB.prepare('SELECT id,object_key,status,wants_follow_up,received_at,updated_at FROM prayer_requests WHERE id=?1').bind(id).first();
  if(!row)return json({error:'Not found'},404);
  if(request.method==='GET'&&path.endsWith(id)){
    const encrypted=await env.PRAYER_RECOVERY.get(row.object_key);
    if(!encrypted)return json({error:'Prayer object unavailable. Contact an administrator.'},503);
    try{const payload=await decrypt(encrypted,env);return json({request:{...row,name:payload.name,email:payload.email||'',prayerRequest:payload.prayerRequest,contactRequested:payload.contactRequested}});}
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
    await env.PRAYER_DB.prepare("UPDATE prayer_requests SET status=?1,updated_at=?2,reviewed_at=COALESCE(reviewed_at,?2),closed_at=CASE WHEN ?1='closed' THEN ?2 ELSE NULL END WHERE id=?3")
      .bind(body.status,stamp,id).run();
    await env.PRAYER_DB.prepare('INSERT INTO prayer_audit (request_id,actor_email,action,created_at) VALUES (?1,?2,?3,?4)')
      .bind(id,email,'status:'+body.status,stamp).run();
    return json({ok:true,status:body.status});
  }
  return json({error:'Method not supported'},405);
}
const DASHBOARD=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KIPG Prayer Ministry — Private</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#0c0b0a;color:#eee7da}body{margin:0 auto;max-width:1080px;padding:1.5rem}header{border-bottom:1px solid #765a2c;padding-bottom:1rem}h1{font-family:Georgia,serif}a{color:#ebc87c}button,select{background:#241c11;border:1px solid #967135;border-radius:8px;color:#f9eacf;padding:.75rem;font:inherit;cursor:pointer}button:hover{background:#403019}button:focus-visible,select:focus-visible{outline:3px solid #eac074}main{display:grid;grid-template-columns:minmax(230px,1fr) 2fr;gap:1rem;margin-top:1.5rem}.panel{border:1px solid #785d31;border-radius:12px;padding:1rem;min-width:0}#requests{display:grid;gap:.5rem}#requests button{text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.65}#error{color:#ffcc9c}@media(max-width:650px){main{grid-template-columns:1fr}}
</style></head><body><header><p>KIPG NETWORK · AUTHORIZED MINISTRY USE</p><h1>Prayer Ministry</h1><p>Confidential requests. Never share request details outside approved ministry access.</p></header><p id="error" role="status"></p><main><section class="panel"><h2>Prayer queue</h2><button id="reload">Refresh</button><div id="requests"></div></section><section class="panel"><h2>Request details</h2><div id="details">Select a prayer request.</div><div id="actions" hidden><label for="status">Prayer status</label><select id="status"><option value="pending">New / Pending</option><option value="reviewing">Being reviewed</option><option value="prayed">Prayed for</option><option value="follow_up">Follow-up needed</option><option value="closed">Closed</option></select> <button id="save">Save status</button></div></section></main><script>
const byId=id=>document.getElementById(id);let selected=null;
const status=(message)=>byId('error').textContent=message;
async function api(path,options){const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});if(!response.ok)throw new Error('Request failed ('+response.status+').');return response.json()}
async function load(){try{status('');let data=await api('/api/requests');let list=byId('requests');list.replaceChildren();for(const item of data.requests){const button=document.createElement('button');button.textContent=item.received_at+' · '+item.status+(item.wants_follow_up?' · Follow-up requested':'');button.onclick=()=>open(item.id);list.append(button)}if(!data.requests.length)list.textContent='No requests yet.'}catch(e){status(e.message)}}
async function open(id){try{const {request:r}=await api('/api/requests/'+encodeURIComponent(id));selected=r.id;const box=byId('details');box.replaceChildren();for(const [name,value] of [['Received',r.received_at],['Name',r.name],['Email',r.email||'(not supplied)'],['Follow-up requested',r.contactRequested?'Yes':'No'],['Prayer request',r.prayerRequest]]){const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=name+': ';p.append(strong,document.createTextNode(String(value||'')));box.append(p)}byId('status').value=r.status;byId('actions').hidden=false;status('')}catch(e){status(e.message)}}
byId('reload').onclick=load;byId('save').onclick=async()=>{if(!selected)return;try{await api('/api/requests/'+encodeURIComponent(selected)+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:byId('status').value})});await load();await open(selected)}catch(e){status(e.message)}};load();
</script></body></html>`;
export default {fetch(request,env){return handleAdmin(request,env);}};
