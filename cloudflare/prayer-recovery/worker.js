// KIPG private prayer recovery. No prayer content is exposed through GET or logs.
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
const receiptKey = id => `receipts/${id}.json`;
export async function capture(request,env,requestFetch=fetch) {
  const origin = request.headers.get('Origin') || '';
  if (request.method === 'GET' && new URL(request.url).pathname === '/') return json({service:'KIPG prayer recovery', submissionsEnabled:env.SUBMISSIONS_ENABLED === 'true'});
  if (!ORIGINS.has(origin)) return json({error:'Request unavailable'},403);
  if (request.method === 'OPTIONS') return json({},204,origin);
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/submit') return json({error:'Request unavailable'},405,origin);
  if (env.SUBMISSIONS_ENABLED !== 'true' || !env.PRAYER_RECOVERY) return json({error:'Prayer requests are not open yet.'},503,origin);
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
    if (await env.PRAYER_RECOVERY.head(receiptKey(payload.submissionId))) return json({status:'received',submissionId:payload.submissionId},200,origin);
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
    return json({status:'received',submissionId:payload.submissionId},200,origin);
  } catch { return json({error:'We could not confirm receipt. Please keep your request and try again.'},503,origin); }
}
export async function retryPending(env, requestFetch=fetch) {
  // Enable only after the idempotent Supabase delivery endpoint passes testing.
  if(env.DELIVERY_ENABLED !== 'true') return;
  if(!env.DELIVERY_SECRET || !env.DELIVERY_URL || !env.PRAYER_RECOVERY) throw new Error('Delivery configuration unavailable');
  const url=new URL(env.DELIVERY_URL);
  if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url.origin) || url.pathname!=='/functions/v1/kipg-prayer-request') throw new Error('Unexpected delivery endpoint');
  let cursor; let processed=0;
  do {
    const page=await env.PRAYER_RECOVERY.list({prefix:'pending/',limit:50,cursor});
    for(const object of page.objects) {
      // Bound cron work even during a large backlog (20 seconds per attempt).
      if (++processed>25) return;
      try {
        const item=await env.PRAYER_RECOVERY.get(object.key);
        if(!item) continue;
        const record=await item.json();
        const saved=await unseal(record,env);
        const id=saved.payload.submissionId;
        if(await env.PRAYER_RECOVERY.head(receiptKey(id))) {await env.PRAYER_RECOVERY.delete(object.key);continue;}
        // Failover test captures normally but pauses forwarding.
        if(env.PAUSE_DELIVERY === 'true') continue;
        const response=await requestFetch(url.href,{method:'POST',headers:{'Content-Type':'application/json','X-KIPG-Recovery-Secret':env.DELIVERY_SECRET},body:JSON.stringify(saved.payload),signal:AbortSignal.timeout(20000)});
        const result=await response.json().catch(()=>null);
        // An HTTP 200 alone does not authorize deleting a recovery copy.
        if(response.ok && result?.status==='delivered' && result.submissionId===id) {
          await env.PRAYER_RECOVERY.put(receiptKey(id),JSON.stringify({submissionId:id,deliveredAt:Date.now()}),{customMetadata:{status:'delivered'}});
          await env.PRAYER_RECOVERY.delete(object.key);
        }
      } catch { console.warn('KIPG prayer recovery: one queued item remains pending.'); }
    }
    cursor=page.truncated ? page.cursor : undefined;
  } while(cursor);
}
export default {
  fetch(request,env) {return capture(request,env);},
  async scheduled(event,env,ctx) {ctx.waitUntil(retryPending(env));}
};
