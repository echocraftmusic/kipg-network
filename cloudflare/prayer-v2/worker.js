// KIPG Cloudflare-only private prayer intake (staging). No prayer content is exposed through GET or logs.
const ORIGINS = new Set(['https://kipgnetwork.com', 'https://www.kipgnetwork.com', 'https://echocraftmusic.github.io']);
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function encryptionKey(env) {
  const bytes = unb64(env.RECOVERY_ENCRYPTION_KEY || '');
  if (bytes.length !== 32) throw new Error('Encryption key unavailable');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(payload, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await encryptionKey(env), encoder.encode(JSON.stringify(payload)));
  return {version:1, iv:b64(iv), ciphertext:b64(new Uint8Array(ciphertext))};
}
async function unseal(record, env) {
  if (record.version !== 1) throw new Error('Unsupported record');
  const bytes = await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(record.iv)}, await encryptionKey(env), unb64(record.ciphertext));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function validate(p) {
  if (!p || typeof p !== 'object' || !uuid.test(p.submissionId || '')) return null;
  const limits = {name:60, email:160, prayerRequest:4000};
  const result = {submissionId:p.submissionId.toLowerCase(), contactRequested:p.contactRequested};
  for (const [field,max] of Object.entries(limits)) {
    if (typeof p[field] !== 'string' || p[field].length > max) return null;
    result[field] = p[field].trim();
  }
  if (!result.name || result.prayerRequest.length < 5 || typeof result.contactRequested !== 'boolean' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) return null;
  return result;
}
function json(body,status=200,origin='') {
  const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store'};
  if (ORIGINS.has(origin)) Object.assign(headers, {'Access-Control-Allow-Origin':origin, 'Vary':'Origin', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type'});
  return new Response(status === 204 ? null : JSON.stringify(body), {status,headers});
}
const pendingKey = id => `pending/${id}.json`;
export async function capture(request,env,requestFetch=fetch) {
  const origin = request.headers.get('Origin') || '';
  if (request.method === 'GET' && new URL(request.url).pathname === '/') return json({service:'KIPG prayer recovery', submissionsEnabled:env.SUBMISSIONS_ENABLED === 'true'});
  if (!ORIGINS.has(origin)) return json({error:'Request unavailable'},403);
  if (request.method === 'OPTIONS') return json({},204,origin);
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/submit') return json({error:'Request unavailable'},405,origin);
  if (env.SUBMISSIONS_ENABLED !== 'true' || !env.PRAYER_RECOVERY || !env.PRAYER_DB) return json({error:'Prayer requests are not open yet.'},503,origin);
  try {
    // These guards also protect workers.dev; zone-only rules cannot cover it.
    // Origin is a browser restriction, not authentication: scripts can forge it.
    if (!env.TURNSTILE_SECRET_KEY || typeof env.PRAYER_RATE_LIMITER?.limit !== 'function') return json({error:'Prayer requests are temporarily unavailable.'},503,origin);
    const ip=request.headers.get('CF-Connecting-IP');
    if (!ip) return json({error:'Request unavailable'},403,origin);
    const rate=await env.PRAYER_RATE_LIMITER.limit({key:`prayer-submit:${ip}`});
    if (rate?.success !== true) {
      const response=json({error:'Please wait a minute before trying again.'},429,origin);
      response.headers.set('Retry-After','60');
      return response;
    }
    // Enforce the byte limit while reading, even if Content-Length is absent.
    const reader=request.body?.getReader();
    if (!reader) return json({error:'Please check the form.'},400,origin);
    const chunks=[]; let size=0;
    for (;;) { const {value,done}=await reader.read(); if(done) break; size+=value.length; if(size>24000) {await reader.cancel(); return json({error:'Please shorten your request.'},413,origin);} chunks.push(value); }
    const bytes=new Uint8Array(size); let offset=0; for(const c of chunks) {bytes.set(c,offset);offset+=c.length;}
    const p=JSON.parse(new TextDecoder().decode(bytes));
    if (typeof p.website === 'string' && p.website.trim()) return json({status:'received'},200,origin);
    const age=Date.now()-Number(p.startedAt);
    const payload=validate(p);
    if (!payload || !Number.isFinite(age) || age<2000 || age>3600000) return json({error:'Please check the form and try again.'},400,origin);
    if (typeof p.turnstileToken !== 'string' || !p.turnstileToken || p.turnstileToken.length>2048) return json({error:'Please complete the security check.'},403,origin);
    const verification=await requestFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:p.turnstileToken,remoteip:ip}),
      signal:AbortSignal.timeout(10000)
    });
    const verified=await verification.json();
    if (!verification.ok || verified?.success!==true || verified.hostname!==new URL(origin).hostname || verified.action!=='prayer_submit' || verified.cdata!==payload.submissionId) return json({error:'Please repeat the security check.'},403,origin);
    const tracked=await env.PRAYER_DB.prepare('SELECT id FROM prayer_requests WHERE id = ?1').bind(payload.submissionId).first();
    if(tracked) {
      const stored=await env.PRAYER_RECOVERY.get(pendingKey(payload.submissionId));
      if(!stored)return json({error:'Please contact KIPG support before resubmitting.'},503,origin);
      const saved=await unseal(await stored.json(),env);
      if(JSON.stringify(saved.payload)!==JSON.stringify(payload))return json({error:'Please start a new request.'},409,origin);
      return json({status:'received',submissionId:payload.submissionId},200,origin);
    }
    const key=pendingKey(payload.submissionId);
    const existing=await env.PRAYER_RECOVERY.get(key);
    if (existing) {
      const saved=await unseal(await existing.json(),env);
      if(JSON.stringify(saved.payload)!==JSON.stringify(payload)) return json({error:'Please start a new request.'},409,origin);
    } else {
      const record=await seal({payload,createdAt:Date.now()},env);
      const stored=await env.PRAYER_RECOVERY.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{status:'pending'}});
      // A concurrent capture must be checked rather than replacing its content.
      if(!stored) return json({error:'Please retry your request.'},409,origin);
    }
    // D1 contains no name, email address or prayer text. If D1 fails, R2 keeps
    // an encrypted recovery copy and the caller receives a failure, never a false success.
    await env.PRAYER_DB.prepare('INSERT OR IGNORE INTO prayer_requests (id,object_key,wants_follow_up) VALUES (?1,?2,?3)')
      .bind(payload.submissionId,key,payload.contactRequested?1:0).run();
    const recorded=await env.PRAYER_DB.prepare('SELECT id FROM prayer_requests WHERE id = ?1').bind(payload.submissionId).first();
    if(!recorded)throw new Error('Intake could not be tracked');
    return json({status:'received',submissionId:payload.submissionId},200,origin);
  } catch { return json({error:'We could not confirm receipt. Please keep your request and try again.'},503,origin); }
}
// Deliver only a generic notification, never a name, contact address or prayer text.
// Retry unnotified requests via Cloudflare cron. Resend idempotency helps prevent duplicates.
export async function notifyPending(env,requestFetch=fetch){
 if(env.NOTIFICATIONS_ENABLED!=='true')return;
 if(!env.PRAYER_DB||!env.RESEND_API_KEY||!env.PRAYER_NOTIFICATION_FROM||!env.PRAYER_NOTIFICATION_TO)throw Error('Notification service not configured');
 if(env.PRAYER_NOTIFICATION_TO.trim().toLowerCase()!=='prayers@kipgnetwork.com')throw Error('Unexpected prayer mailbox');
 const rows=await env.PRAYER_DB.prepare('SELECT id FROM prayer_requests WHERE notification_sent_at IS NULL ORDER BY received_at ASC LIMIT 20').all();
 for(const row of rows.results||[]){
  try{
   const response=await requestFetch('https://api.resend.com/emails',{
     method:'POST',
     headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'kipg-prayer-notify-'+row.id},
     body:JSON.stringify({from:env.PRAYER_NOTIFICATION_FROM,to:[env.PRAYER_NOTIFICATION_TO],subject:'New KIPG prayer request',text:'A new confidential prayer request has been received. Sign in to the protected KIPG Prayer Ministry dashboard to review it. No prayer details are sent by email.'}),
     signal:AbortSignal.timeout(10000)
   });
   if(!response.ok)throw Error('Provider did not accept notification');
   await env.PRAYER_DB.prepare("UPDATE prayer_requests SET notification_sent_at=?1 WHERE id=?2 AND notification_sent_at IS NULL").bind(new Date().toISOString(),row.id).run();
  }catch{console.warn('KIPG prayer: a notification remains queued.');}
 }
}
export default {
 fetch(request,env){return capture(request,env);},
 async scheduled(event,env,ctx){ctx.waitUntil(notifyPending(env));}
};

