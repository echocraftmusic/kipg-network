const COOKIE='__Host-kipg_session';
const enc=new TextEncoder();
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const nowIso=()=>new Date().toISOString();
const addMs=(ms)=>new Date(Date.now()+ms).toISOString();
const cleanEmail=v=>String(v||'').trim().toLowerCase();
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const cleanName=v=>String(v||'').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,80);
function b64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function randomToken(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);return b64url(b);}
async function sha256(value){const h=await crypto.subtle.digest('SHA-256',enc.encode(value));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function cookieToken(req){const raw=req.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===COOKIE)return rest.join('=');}return '';}
function setCookie(token){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;}
function clearCookie(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;}
function allowedOrigin(req,env){const origin=req.headers.get('origin');if(!origin)return true;const allowed=String(env.PUBLIC_ORIGINS||'https://kipgnetwork.com,https://www.kipgnetwork.com').split(',').map(x=>x.trim()).filter(Boolean);return allowed.includes(origin);}
export function usernameVariants(candidate){
  const plain=String(candidate||'').toLowerCase();
  const map={0:'o',1:'i',2:'z',3:'e',4:'a',5:'s',6:'g',7:'t',8:'b',9:'g'};
  const disguised=[...plain].map(c=>map[c]||c).join('');
  const collapse=s=>s.replace(/(.)\1+/g,'$1');
  return [...new Set([plain,disguised,collapse(plain),collapse(disguised),plain.replace(/[0-9]/g,'')])];
}
async function usernameAllowed(db,candidate){
  if(!/^[A-Za-z][A-Za-z0-9]{2,23}$/.test(candidate)||/^user[0-9]+$/i.test(candidate))return false;
  const {results=[]}=await db.prepare('SELECT term FROM blocked_username_terms WHERE active=1').all();
  const variants=usernameVariants(candidate);
  return !results.some(row=>variants.some(v=>v.includes(String(row.term).toLowerCase())));
}
async function currentMember(req,env){
  const token=cookieToken(req);if(!token)return null;
  const hash=await sha256(token);
  const row=await env.COMMUNITY_DB.prepare(`SELECT m.* FROM member_sessions s JOIN members m ON m.id=s.member_id WHERE s.session_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1`).bind(hash,nowIso()).first();
  if(row)await env.COMMUNITY_DB.prepare('UPDATE member_sessions SET last_seen_at=? WHERE session_hash=?').bind(nowIso(),hash).run();
  return row||null;
}
async function assignUsername(db){
  for(let i=0;i<30;i++){
    const n=Math.floor(Math.random()*1e9).toString().padStart(9,'0');
    const u='User'+n;
    const hit=await db.prepare('SELECT 1 FROM members WHERE lower(username)=lower(?) LIMIT 1').bind(u).first();
    if(!hit)return u;
  }
  throw new Error('username_exhausted');
}
async function requestLink(req,env){
  if(!allowedOrigin(req,env))return json({error:'Origin not allowed.'},403);
  let body={};try{body=await req.json();}catch{return json({error:'Invalid request.'},400);}
  const email=cleanEmail(body.email),mode=body.mode==='signin'?'signin':'signup';
  if(!validEmail(email))return json({error:'Enter a valid email address.'},400);
  const first=cleanName(body.first_name),last=cleanName(body.last_name);
  if(mode==='signup'&&(!first||!last||body.guidelines_accepted!==true))return json({error:'Complete the required signup fields and community agreement.'},400);
  const recent=await env.COMMUNITY_DB.prepare(`SELECT COUNT(*) AS n FROM login_requests WHERE email_normalized=? AND requested_at>?`).bind(email,addMs(-15*60*1000)).first();
  if(Number(recent?.n||0)>=5)return json({ok:true,message:'If that address can receive a KIPG sign-in link, it will arrive shortly.'});
  const raw=randomToken(),hash=await sha256(raw),id=crypto.randomUUID();
  await env.COMMUNITY_DB.prepare(`INSERT INTO login_requests(id,email_normalized,token_hash,mode,first_name,last_name,newsletter_opt_in,guidelines_accepted_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(id,email,hash,mode,first,last,body.newsletter_opt_in===true?1:0,mode==='signup'?nowIso():null,addMs(15*60*1000)).run();
  const accessEmail=String(req.headers.get('Cf-Access-Authenticated-User-Email')||'').trim().toLowerCase();
  const testAuthorized=env.TEST_MODE==='true'&&accessEmail&&accessEmail===String(env.TEST_ALLOWED_EMAIL||'').trim().toLowerCase();
  if(testAuthorized)return json({ok:true,test_token:raw,expires_in_seconds:900,test_only:true});
  if(env.EMAIL_ENABLED!=='true')return json({error:'Community email delivery is not enabled on this staging service.'},503);
  if(!env.RESEND_API_KEY)return json({error:'Community email delivery is not configured.'},503);
  const verifyBase=String(env.MAGIC_LINK_BASE||'https://community-staging.kipgnetwork.com/auth/verify');
  const verifyUrl=verifyBase+'?token='+encodeURIComponent(raw);
  const subject=mode==='signup'?'Your KIPG Community join link':'Your KIPG Community sign-in link';
  const intro=mode==='signup'?'Use the secure link below to finish creating your KIPG Community account.':'Use the secure link below to sign in to your KIPG Community account.';
  const text=[subject,'',intro,'',verifyUrl,'','This link expires in 15 minutes and can be used only once.','If you did not request this link, you can ignore this email.','','Faith. Conversation. Community.','KIPG Network'].join('\n');
  const html=`<div style="background:#111;padding:32px;font-family:Arial,sans-serif;color:#f7f4ec;max-width:600px;margin:auto"><p style="color:#d8b96e;letter-spacing:2px">KIPG NETWORK</p><h1>${subject}</h1><p>${intro}</p><p style="margin:28px 0"><a href="${verifyUrl}" style="background:#d8b96e;color:#111;padding:14px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold">Continue to KIPG Community</a></p><p style="font-size:13px;color:#bbb">This link expires in 15 minutes and can be used only once.</p><p style="font-size:13px;color:#bbb">If you did not request this link, you can ignore this email.</p><p>Faith. Conversation. Community.<br>KIPG Network</p></div>`;
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+env.RESEND_API_KEY,'Idempotency-Key':'kipg-community-magic-'+id},body:JSON.stringify({from:String(env.EMAIL_FROM||'KIPG Network <community@kipgnetwork.com>'),to:[email],reply_to:String(env.EMAIL_REPLY_TO||'community@kipgnetwork.com'),subject,text,html})});
  let delivery={};try{delivery=await sent.json();}catch{}
  if(!sent.ok||typeof delivery.id!=='string')return json({error:'We could not send your sign-in email. Please try again later.'},502);
  return json({ok:true,message:'Check your inbox and spam folder for your KIPG Community link.'});
}
async function verifyLink(req,env){
  const url=new URL(req.url),raw=url.searchParams.get('token')||'';if(raw.length<20)return json({error:'Invalid or expired link.'},400);
  const hash=await sha256(raw),login=await env.COMMUNITY_DB.prepare(`SELECT * FROM login_requests WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? LIMIT 1`).bind(hash,nowIso()).first();
  if(!login)return json({error:'Invalid or expired link.'},400);
  const consumed=await env.COMMUNITY_DB.prepare(`UPDATE login_requests SET consumed_at=? WHERE id=? AND consumed_at IS NULL`).bind(nowIso(),login.id).run();
  if(Number(consumed.meta?.changes||0)!==1)return json({error:'Invalid or expired link.'},400);
  let member=await env.COMMUNITY_DB.prepare('SELECT * FROM members WHERE email_normalized=? LIMIT 1').bind(login.email_normalized).first();
  if(!member){
    if(login.mode!=='signup')return json({error:'No Community account exists for that email yet.'},403);
    const id=crypto.randomUUID(),username=await assignUsername(env.COMMUNITY_DB);
    await env.COMMUNITY_DB.prepare(`INSERT INTO members(id,email_normalized,email_verified_at,username,first_name,last_name,newsletter_opt_in,newsletter_consent_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(id,login.email_normalized,nowIso(),username,login.first_name,login.last_name,login.newsletter_opt_in,login.newsletter_opt_in?nowIso():null).run();
    member=await env.COMMUNITY_DB.prepare('SELECT * FROM members WHERE id=?').bind(id).first();
    await env.COMMUNITY_DB.prepare(`INSERT INTO security_audit(id,actor_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),id,'member_created','member',id,'{}').run();
  }else if(!member.email_verified_at){
    await env.COMMUNITY_DB.prepare('UPDATE members SET email_verified_at=?,updated_at=? WHERE id=?').bind(nowIso(),nowIso(),member.id).run();
  }
  const session=randomToken(),sessionHash=await sha256(session);
  await env.COMMUNITY_DB.prepare(`INSERT INTO member_sessions(id,member_id,session_hash,expires_at,last_seen_at) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(),member.id,sessionHash,addMs(30*24*60*60*1000),nowIso()).run();
  const accept=req.headers.get('accept')||'';
  if(accept.includes('text/html')){
    const mode=login.mode==='signup'?'joined':'returned';
    return new Response(null,{status:302,headers:{location:'/?auth=success&mode='+mode,'set-cookie':setCookie(session),'cache-control':'no-store'}});
  }
  return json({ok:true,member:{id:member.id,username:member.username,first_name:member.first_name,last_name:member.last_name,newsletter_opt_in:Boolean(member.newsletter_opt_in)}},200,{'set-cookie':setCookie(session)});
}
async function me(req,env){const m=await currentMember(req,env);if(!m)return json({authenticated:false},401);return json({authenticated:true,member:{id:m.id,email:m.email_normalized,username:m.username,first_name:m.first_name,last_name:m.last_name,newsletter_opt_in:Boolean(m.newsletter_opt_in),suspended:Boolean(m.suspended)}});}
async function setUsername(req,env){
  if(!allowedOrigin(req,env))return json({error:'Origin not allowed.'},403);
  const m=await currentMember(req,env);if(!m)return json({error:'Sign in required.'},401);if(m.suspended)return json({error:'This account is restricted.'},403);
  let body={};try{body=await req.json();}catch{return json({error:'Invalid request.'},400);}
  const candidate=String(body.username||'').trim();
  if(!await usernameAllowed(env.COMMUNITY_DB,candidate))return json({error:'That username isn’t available. Please choose another name that follows KIPG Community guidelines.'},400);
  const taken=await env.COMMUNITY_DB.prepare('SELECT id FROM members WHERE lower(username)=lower(?) AND id<>? LIMIT 1').bind(candidate,m.id).first();
  if(taken)return json({error:'That username is already taken. Please choose another one.'},409);
  await env.COMMUNITY_DB.prepare('UPDATE members SET username=?,updated_at=? WHERE id=?').bind(candidate,nowIso(),m.id).run();
  await env.COMMUNITY_DB.prepare(`INSERT INTO security_audit(id,actor_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),m.id,'username_changed','member',m.id,'{}').run();
  return json({ok:true,username:candidate});
}
async function updateProfile(req,env){
  if(!allowedOrigin(req,env))return json({error:'Origin not allowed.'},403);
  const m=await currentMember(req,env);
  if(!m)return json({error:'Sign in required.'},401);
  if(m.suspended)return json({error:'This account is restricted.'},403);
  let body={};try{body=await req.json();}catch{return json({error:'Invalid request.'},400);}
  const first=cleanName(body.first_name),last=cleanName(body.last_name);
  if(!first||!last)return json({error:'Enter your first and last name.'},400);
  const subscribe=body.newsletter_opt_in===true?1:0;
  const consent=subscribe?(m.newsletter_consent_at||nowIso()):null;
  await env.COMMUNITY_DB.prepare('UPDATE members SET first_name=?,last_name=?,newsletter_opt_in=?,newsletter_consent_at=?,updated_at=? WHERE id=?')
    .bind(first,last,subscribe,consent,nowIso(),m.id).run();
  await env.COMMUNITY_DB.prepare(`INSERT INTO security_audit(id,actor_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),m.id,'profile_updated','member',m.id,JSON.stringify({newsletter_opt_in:Boolean(subscribe)})).run();
  return json({ok:true,member:{id:m.id,first_name:first,last_name:last,newsletter_opt_in:Boolean(subscribe)}});
}
async function signout(req,env){
  if(!allowedOrigin(req,env))return json({error:'Origin not allowed.'},403);
  const token=cookieToken(req);if(token){const hash=await sha256(token);await env.COMMUNITY_DB.prepare('UPDATE member_sessions SET revoked_at=? WHERE session_hash=? AND revoked_at IS NULL').bind(nowIso(),hash).run();}
  return json({ok:true},200,{'set-cookie':clearCookie()});
}
const stagingHtml=()=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KIPG Community Cloudflare Staging</title><style>body{font-family:system-ui;background:#111;color:#eee;margin:0}.wrap{max-width:850px;margin:40px auto;padding:24px}.card{border:1px solid #555;border-radius:16px;padding:22px;margin:16px 0;background:#181818}input,button{font:inherit;padding:10px 12px;margin:5px 0;border-radius:8px}input{width:min(100%,420px);box-sizing:border-box;background:#222;color:#fff;border:1px solid #666}button{cursor:pointer}.row{display:grid;gap:8px}.muted{color:#bbb}.ok{color:#b9efb9}.bad{color:#ffb2b2}code{word-break:break-all}.hidden{display:none}</style></head><body><main class="wrap"><h1>KIPG Community — Cloudflare Staging</h1><p class="muted">Private test surface. Fictional test accounts only. The public Community page is not connected to this yet.</p><p id="authBanner" class="ok"></p><section class="card"><h2>Create fictional test account</h2><div class="row"><input id="first" value="Test" aria-label="First name"><input id="last" value="Member" aria-label="Last name"><input id="email" type="email" placeholder="account-a@example.invalid" aria-label="Test email"><label><input id="guidelines" type="checkbox" checked> Community guidelines accepted</label><button id="signup">Generate private signup link</button><button id="signin">Generate returning-member sign-in link</button><p id="signupStatus"></p><button id="verify" class="hidden">Verify generated link and sign in</button></div></section><section class="card"><h2>Current session</h2><button id="check">Refresh member</button><pre id="me">Not checked yet.</pre><div class="row"><input id="username" placeholder="Custom username" aria-label="Custom username"><button id="saveName">Save username</button><button id="isolation">Run cross-account tamper test</button><p id="nameStatus"></p><hr><h3>Edit private profile</h3><input id="profileFirst" placeholder="First name" aria-label="Profile first name"><input id="profileLast" placeholder="Last name" aria-label="Profile last name"><label><input id="profileNewsletter" type="checkbox"> Quarterly newsletter</label><button id="saveProfile">Save profile</button><button id="profileIsolation">Run profile tamper test</button><p id="profileStatus"></p><button id="signout">Sign out</button></div></section></main><script>
let token='';
const params=new URLSearchParams(location.search);
if(params.get('auth')==='success'){
  const joined=params.get('mode')==='joined';
  document.getElementById('authBanner').textContent=joined?'Welcome to KIPG Community — your account is ready.':'Welcome back to KIPG Community — you’re signed in.';
  history.replaceState({},'',location.pathname);
}
const out=(id,msg,ok=true)=>{const el=document.getElementById(id);el.textContent=msg;el.className=ok?'ok':'bad';};
document.getElementById('signup').onclick=async()=>{token='';out('nameStatus','');document.getElementById('verify').classList.add('hidden');const body={mode:'signup',first_name:first.value,last_name:last.value,email:email.value,guidelines_accepted:guidelines.checked,newsletter_opt_in:false};const r=await fetch('/auth/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(j.test_token){token=j.test_token;out('signupStatus','Private test link generated. It expires in 15 minutes.');document.getElementById('verify').classList.remove('hidden');}else out('signupStatus',j.error||j.message||'Request failed',r.ok);};
document.getElementById('signin').onclick=async()=>{token='';out('nameStatus','');document.getElementById('verify').classList.add('hidden');const body={mode:'signin',email:email.value};const r=await fetch('/auth/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(j.test_token){token=j.test_token;out('signupStatus','Private returning-member link generated. It expires in 15 minutes.');document.getElementById('verify').classList.remove('hidden');}else out('signupStatus',j.error||j.message||'Request failed',r.ok);};
document.getElementById('verify').onclick=async()=>{const r=await fetch('/auth/verify?token='+encodeURIComponent(token));const j=await r.json();out('signupStatus',r.ok?'Verified and signed in as '+j.member.username:(j.error||'Verification failed'),r.ok);if(r.ok){out('nameStatus','');document.getElementById('check').click();}};
document.getElementById('check').onclick=async()=>{const r=await fetch('/me');const j=await r.json();document.getElementById('me').textContent=JSON.stringify(j,null,2);if(r.ok){out('nameStatus','');out('profileStatus','');profileFirst.value=j.member.first_name||'';profileLast.value=j.member.last_name||'';profileNewsletter.checked=j.member.newsletter_opt_in===true;}};
document.getElementById('saveName').onclick=async()=>{const r=await fetch('/username',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:username.value})});const j=await r.json();out('nameStatus',j.error||(j.ok?'Saved: '+j.username:'Unable to save'),r.ok);if(r.ok)document.getElementById('check').click();};
document.getElementById('isolation').onclick=async()=>{const r=await fetch('/username',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'IsolationPassB',member_id:'5e962c7a-d6c2-4fb4-ba70-7979479c3140',target_member_id:'5e962c7a-d6c2-4fb4-ba70-7979479c3140'})});const j=await r.json();out('nameStatus',r.ok?'Tamper request accepted only for the signed-in account. Current username: '+j.username:(j.error||'Tamper test failed'),r.ok);if(r.ok)document.getElementById('check').click();};
document.getElementById('saveProfile').onclick=async()=>{const r=await fetch('/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({first_name:profileFirst.value,last_name:profileLast.value,newsletter_opt_in:profileNewsletter.checked})});const j=await r.json();out('profileStatus',j.error||(j.ok?'Profile saved.':'Unable to save profile'),r.ok);if(r.ok)document.getElementById('check').click();};
document.getElementById('profileIsolation').onclick=async()=>{const r=await fetch('/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({first_name:'Isolation',last_name:'Member B',newsletter_opt_in:true,member_id:'5e962c7a-d6c2-4fb4-ba70-7979479c3140',target_member_id:'5e962c7a-d6c2-4fb4-ba70-7979479c3140'})});const j=await r.json();out('profileStatus',r.ok?'Profile tamper request applied only to the signed-in account.':'Profile tamper test failed: '+(j.error||''),r.ok);if(r.ok)document.getElementById('check').click();};
document.getElementById('signout').onclick=async()=>{const r=await fetch('/signout',{method:'POST'});const j=await r.json();out('nameStatus',j.ok?'Signed out.':'Sign-out failed',r.ok);document.getElementById('check').click();};
</script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});

async function realCommunityPage(){
  const source=await fetch('https://kipgnetwork.com/pages/community.html',{cf:{cacheTtl:0,cacheEverything:false}});
  if(!source.ok)return new Response('Community staging page unavailable.',{status:502});
  let html=await source.text();
  html=html.replace('<head>','<head><base href="https://kipgnetwork.com/pages/">');
  html=html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js[^>]*><\/script>/,'');
  html=html.replace(/<script type="module" src="\.\.\/assets\/js\/community\.js[^"]*"><\/script>/,'<script type="module" src="https://kipgnetwork.com/assets/js/community-cloudflare.js?v=20261031-cloudflare-staging-v1"></script>');
  html=html.replace('<title>Join the KIPG Community | KIPG Network</title>','<title>KIPG Community Cloudflare Staging | KIPG Network</title>');
  html=html.replace('<section class="kc-card" aria-labelledby="account-title">','<section class="kc-card" aria-labelledby="account-title"><div class="kc-connection" style="margin:0 0 1rem">Private Cloudflare staging — public Community is unchanged.</div>');
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
}
async function prayerNotifyRelay(req,env){
  if(!env.PRAYER_RELAY_SECRET||req.headers.get('x-kipg-relay-secret')!==env.PRAYER_RELAY_SECRET)return json({error:'Forbidden.'},403);
  if(!env.RESEND_API_KEY)return json({error:'Email service unavailable.'},503);
  let body;try{body=await req.json();}catch{return json({error:'Invalid request.'},400);}
  const to=String(body?.to||'').trim().toLowerCase();
  const requestId=String(body?.requestId||'').trim();
  if(to!=='prayers@kipgnetwork.com'||!/^[0-9a-f-]{36}$/i.test(requestId))return json({error:'Invalid notification request.'},400);
  const subject='[KIPG PRAYER] New Prayer Request Received';
  const text='A new confidential prayer request has been received. Sign in to the protected KIPG Prayer Ministry dashboard to review it. No prayer details are sent by email.';
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+env.RESEND_API_KEY,'Idempotency-Key':'kipg-prayer-notify-'+requestId},body:JSON.stringify({from:'KIPG Prayer Ministry <community@kipgnetwork.com>',to:[to],reply_to:'prayers@kipgnetwork.com',subject,text})});
  if(!sent.ok)return json({error:'Notification provider rejected request.'},502);
  return json({ok:true},200);
}

export default{async fetch(req,env){
  const url=new URL(req.url),p=url.pathname;
  if(p==='/internal/prayer-notify'&&req.method==='POST')return prayerNotifyRelay(req,env);
  if(p==='/'&&req.method==='GET')return realCommunityPage();
  if(p==='/staging-tools'&&req.method==='GET')return stagingHtml();
  if(p==='/health'&&req.method==='GET')return json({ok:true,service:'kipg-community-auth',environment:'staging',email_enabled:env.EMAIL_ENABLED==='true',email_configured:Boolean(env.RESEND_API_KEY),test_mode:env.TEST_MODE==='true'});
  if(p==='/auth/request'&&req.method==='POST')return requestLink(req,env);
  if(p==='/auth/verify'&&req.method==='GET')return verifyLink(req,env);
  if(p==='/me'&&req.method==='GET')return me(req,env);
  if(p==='/username'&&req.method==='POST')return setUsername(req,env);
  if(p==='/profile'&&req.method==='POST')return updateProfile(req,env);
  if(p==='/signout'&&req.method==='POST')return signout(req,env);
  return json({error:'Not found.'},404);
}};