// Paste this entire file into the Supabase Edge Function editor.
// Disable the gateway's legacy JWT check; this handler validates the user's
// bearer token with Supabase Auth itself (including ES256 sessions).
const origins = new Set(['https://kipgnetwork.com', 'https://www.kipgnetwork.com', 'https://echocraftmusic.github.io']);
const room = 'https://kipgnetwork.com/pages/live.html';
const community = 'https://kipgnetwork.com/pages/community.html';

export function createHandler(env, requestFetch = fetch) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const cors = {
      ...(origins.has(origin) ? {'Access-Control-Allow-Origin': origin} : {}),
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
    };
    const reply = (status, result) => Response.json(result, {status, headers: cors});
    if (origin && !origins.has(origin)) return reply(403, {error: 'Origin not allowed.'});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (req.method !== 'POST') return reply(405, {error: 'Use POST.'});
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply(401, {error: 'Sign in first.'});
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = env.RESEND_API_KEY;
    if (!url || !key || !resendKey) return reply(503, {error: 'Welcome email is not configured.'});
    const serviceHeaders = {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'};
    const timedFetch = (target, options) => requestFetch(target, {...options, signal: AbortSignal.timeout(15000)});
    let userId;
    let reserved = false;
    try {
      const auth = await timedFetch(`${url}/auth/v1/user`, {headers: {apikey: key, Authorization: authorization}});
      if (!auth.ok) return reply(401, {error: 'Sign in again to continue.'});
      const user = await auth.json();
      if (!user.id || !user.email || !user.email_confirmed_at) return reply(403, {error: 'Verify your email first.'});
      userId = user.id;
      // Never take recipients or content from the request body.
      // A unique database row reserves one send, even across concurrent tabs.
      const claim = await timedFetch(`${url}/rest/v1/kipg_welcome_deliveries?on_conflict=user_id`, {
        method: 'POST', headers: {...serviceHeaders, Prefer: 'resolution=ignore-duplicates,return=representation'},
        body: JSON.stringify({user_id: userId, status: 'pending'}),
      });
      if (!claim.ok) return reply(503, {error: 'Welcome delivery record unavailable.'});
      const records = await claim.json();
      if (!records.length) return reply(200, {status: 'already_processed'});
      reserved = true;
      const text = `Welcome to the KIPG community!\n\nThank you for joining KIPG Network. We're glad you're here.\n\nYour verified account lets you join the chat when the Viewing Room is open. Visit the Viewing Room: ${room}\n\nYou can manage your private profile and quarterly newsletter preference here: ${community}\n\nFaith. Conversation. Community.\nThe KIPG Network team\n\nThis is a one-time account welcome. Newsletter emails are separate and require your opt-in.`;
      const html = `<div style="background:#111;padding:32px;font-family:Arial,sans-serif;color:#f7f4ec;max-width:600px;margin:auto"><p style="color:#d8b96e;letter-spacing:2px">KIPG NETWORK</p><h1>Welcome to the KIPG community!</h1><p>Thank you for joining KIPG Network. We're glad you're here.</p><p>Your verified account lets you join the chat when the Viewing Room is open.</p><p style="margin:28px 0"><a href="${room}" style="background:#d8b96e;color:#111;padding:14px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold">Go to the Viewing Room</a></p><p>Manage your private profile and quarterly newsletter preference on your <a href="${community}" style="color:#d8b96e">community account page</a>.</p><p>Faith. Conversation. Community.<br>The KIPG Network team</p><p style="font-size:12px;color:#bbb">This is a one-time account welcome. Newsletter emails are separate and require your opt-in.</p></div>`;
      const sent = await timedFetch('https://api.resend.com/emails', {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}`, 'Idempotency-Key': `kipg-welcome-v1-${userId}`},
        body: JSON.stringify({from: 'KIPG Network <community@kipgnetwork.com>', to: [user.email], reply_to: 'community@kipgnetwork.com', subject: 'Welcome to the KIPG community!', text, html}),
      });
      const result = await sent.json();
      const accepted = sent.ok && typeof result.id === 'string';
      const saved = await timedFetch(`${url}/rest/v1/kipg_welcome_deliveries?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH', headers: {...serviceHeaders, Prefer: 'return=minimal'},
        body: JSON.stringify({status: accepted ? 'accepted' : 'needs_review', provider_id: accepted ? result.id : null, updated_at: new Date().toISOString()}),
      });
      if (!saved.ok) throw new Error('Delivery record update failed.');
      return accepted ? reply(200, {status: 'accepted'}) : reply(502, {error: 'Welcome email needs delivery review.'});
    } catch {
      // Never automatically resend an uncertain delivery. Check Resend first.
      if (reserved) {
        try {
          await timedFetch(`${url}/rest/v1/kipg_welcome_deliveries?user_id=eq.${encodeURIComponent(userId)}&status=eq.pending`, {
            method: 'PATCH', headers: serviceHeaders,
            body: JSON.stringify({status: 'needs_review', updated_at: new Date().toISOString()}),
          });
        } catch { /* A pending row still prevents duplicate sends. */ }
      }
      return reply(503, {error: 'Welcome email could not complete. Your account still works.'});
    }
  };
}

if (typeof Deno !== 'undefined') {
  Deno.serve(createHandler({
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'),
  }));
}
