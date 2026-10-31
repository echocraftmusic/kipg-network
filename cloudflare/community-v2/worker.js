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
  const testAuthorized=env.TEST_MODE==='true'&&env.TEST_ACCESS_KEY&&req.headers.get('x-kipg-test-key')===env.TEST_ACCESS_KEY;
  if(testAuthorized)return json({ok:true,test_token:raw,expires_in_seconds:900});
  if(env.EMAIL_ENABLED!=='true')return json({error:'Community email delivery is not enabled on this staging service.'},503);
  return json({ok:true,message:'If that address can receive a KIPG sign-in link, it will arrive shortly.'});
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
  return json({ok:true,member:{id:member.id,username:member.username,first_name:member.first_name,last_name:member.last_name,newsletter_opt_in:Boolean(member.newsletter_opt_in)}},200,{'set-cookie':setCookie(session)});
}
async function me(req,env){const m=await currentMember(req,env);if(!m)return json({authenticated:false},401);return json({authenticated:true,member:{id:m.id,username:m.username,first_name:m.first_name,last_name:m.last_name,newsletter_opt_in:Boolean(m.newsletter_opt_in),suspended:Boolean(m.suspended)}});}
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
async function signout(req,env){
  if(!allowedOrigin(req,env))return json({error:'Origin not allowed.'},403);
  const token=cookieToken(req);if(token){const hash=await sha256(token);await env.COMMUNITY_DB.prepare('UPDATE member_sessions SET revoked_at=? WHERE session_hash=? AND revoked_at IS NULL').bind(nowIso(),hash).run();}
  return json({ok:true},200,{'set-cookie':clearCookie()});
}
export default{async fetch(req,env){
  const url=new URL(req.url),p=url.pathname;
  if(p==='/health'&&req.method==='GET')return json({ok:true,service:'kipg-community-auth',environment:'staging',email_enabled:env.EMAIL_ENABLED==='true',test_mode:env.TEST_MODE==='true'});
  if(p==='/auth/request'&&req.method==='POST')return requestLink(req,env);
  if(p==='/auth/verify'&&req.method==='GET')return verifyLink(req,env);
  if(p==='/me'&&req.method==='GET')return me(req,env);
  if(p==='/username'&&req.method==='POST')return setUsername(req,env);
  if(p==='/signout'&&req.method==='POST')return signout(req,env);
  return json({error:'Not found.'},404);
}};