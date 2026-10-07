// Delivery endpoint for the private Cloudflare prayer recovery queue.
// Browser submissions go to the Worker; this endpoint requires its shared secret.
const origins = new Set(['https://kipgnetwork.com', 'https://www.kipgnetwork.com', 'https://echocraftmusic.github.io']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}
async function secretMatches(actual, expected) {
  if (!actual || actual.length > 256) return false;
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(actual)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(expected)));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
function validate(p) {
  if (!p || typeof p !== 'object' || !uuid.test(p.submissionId || '')) return null;
  const result = {submissionId:p.submissionId.toLowerCase(), contactRequested:p.contactRequested};
  for (const [field, max] of Object.entries({name:60, email:160, prayerRequest:4000})) {
    if (typeof p[field] !== 'string' || p[field].length > max) return null;
    result[field] = p[field].trim();
  }
  result.email = result.email.toLowerCase();
  if (!result.name || result.prayerRequest.length < 5 || typeof result.contactRequested !== 'boolean'
    || !/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(result.email)) return null;
  return result;
}
async function readPayload(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let size = 0;
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 24000) {await reader.cancel(); throw new Error('Oversized body');}
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const c of chunks) {bytes.set(c, offset); offset += c.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHandler(env, requestFetch = fetch) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const headers = {'Cache-Control':'no-store', 'Vary':'Origin',
      ...(origins.has(origin) ? {'Access-Control-Allow-Origin':origin} : {}),
      'Access-Control-Allow-Headers':'content-type',
      'Access-Control-Allow-Methods':'POST, OPTIONS'};
    const reply = (status, result) => Response.json(result, {status, headers});
    if (origin && !origins.has(origin)) return reply(403, {error:'Request unavailable.'});
    if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (req.method !== 'POST') return reply(405, {error:'Use POST.'});
    if (!env.DELIVERY_SECRET || env.DELIVERY_SECRET.length < 32)
      return reply(503, {error:'Delivery unavailable.'});
    if (!await secretMatches(req.headers.get('X-KIPG-Recovery-Secret'), env.DELIVERY_SECRET))
      return reply(401, {error:'Request unavailable.'});
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY)
      return reply(503, {error:'Delivery unavailable.'});
    let p;
    try {p = validate(await readPayload(req));}
    catch {return reply(400, {error:'Invalid request.'});}
    if (!p) return reply(400, {error:'Invalid request.'});
    const serviceHeaders = {apikey:env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type':'application/json'};
    const timedFetch = (url, options) => requestFetch(url, {...options, signal:AbortSignal.timeout(15000)});
    const rpc = async (name, body) => {
      const response = await timedFetch(env.SUPABASE_URL + '/rest/v1/rpc/' + name,
        {method:'POST', headers:serviceHeaders, body:JSON.stringify(body)});
      if (!response.ok) throw new Error('Database operation unavailable');
      return response.json();
    };
    let token;
    try {
      // A keyed fingerprint detects changed content without retaining plaintext.
      const hashKey = await crypto.subtle.importKey('raw', encoder.encode(env.DELIVERY_SECRET),
        {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
      const fingerprint = hex(await crypto.subtle.sign('HMAC', hashKey, encoder.encode(JSON.stringify(p))));
      const claim = await rpc('kipg_claim_prayer_delivery', {p_id:p.submissionId,
        p_payload_hash:fingerprint, p_name:p.name, p_email:p.email,
        p_prayer_text:p.prayerRequest, p_contact_requested:p.contactRequested});
      if (claim.action === 'delivered') return reply(200, {status:'delivered', submissionId:p.submissionId});
      if (claim.action === 'conflict') return reply(409, {status:'conflict', submissionId:p.submissionId});
      if (claim.action === 'review') return reply(409, {status:'needs_review', submissionId:p.submissionId});
      if (claim.action !== 'send' || !uuid.test(claim.token || ''))
        return reply(503, {status:'pending', submissionId:p.submissionId});
      token = claim.token;
      const contact = p.contactRequested ? 'Yes' : 'No';
      const text = ['Name: ' + p.name, 'Email: ' + p.email, 'Contact Requested: ' + contact,
        '', 'Prayer Request:', p.prayerRequest].join('\n');
      const html = '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#171717">'
        + '<h2>Prayer Request</h2><p><strong>Name:</strong> ' + escapeHtml(p.name) + '</p>'
        + '<p><strong>Email:</strong> ' + escapeHtml(p.email) + '</p>'
        + '<p><strong>Contact Requested:</strong> ' + contact + '</p><hr>'
        + '<p><strong>Prayer Request:</strong></p><div style="white-space:pre-wrap;line-height:1.6">'
        + escapeHtml(p.prayerRequest) + '</div></div>';
      const sent = await timedFetch('https://api.resend.com/emails', {method:'POST',
        headers:{'Content-Type':'application/json', Authorization:'Bearer ' + env.RESEND_API_KEY,
          'Idempotency-Key':'kipg-prayer-v2-' + p.submissionId},
        body:JSON.stringify({from:'KIPG Network <community@kipgnetwork.com>',
          to:['keepingitpg247@gmail.com'], ...(p.contactRequested ? {reply_to:p.email} : {}),
          subject:'Prayer Request', text, html})});
      const result = await sent.json().catch(() => null);
      if (!sent.ok || typeof result?.id !== 'string' || !result.id || result.id.length > 200)
        throw new Error('Email acceptance unconfirmed');
      const finished = await rpc('kipg_finish_prayer_delivery',
        {p_id:p.submissionId, p_token:token, p_provider_id:result.id});
      if (finished !== true) throw new Error('Delivery persistence unconfirmed');
      return reply(200, {status:'delivered', submissionId:p.submissionId});
    } catch {
      if (token) {
        try {await rpc('kipg_release_prayer_delivery', {p_id:p.submissionId, p_token:token});}
        catch {}
      }
      return reply(503, {status:'pending', submissionId:p.submissionId});
    }
  };
}
if (typeof Deno !== 'undefined') {
  Deno.serve(createHandler({
    SUPABASE_URL:Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    RESEND_API_KEY:Deno.env.get('RESEND_API_KEY'),
    DELIVERY_SECRET:Deno.env.get('DELIVERY_SECRET'),
  }));
}
