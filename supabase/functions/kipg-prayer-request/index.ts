const origins = new Set([
  'https://kipgnetwork.com',
  'https://www.kipgnetwork.com',
  'https://echocraftmusic.github.io'
]);
const recipient = 'keepingitpg247@gmail.com';

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

export function createHandler(env, requestFetch = fetch) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const cors = {
      ...(origins.has(origin) ? {'Access-Control-Allow-Origin': origin} : {}),
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    };
    const reply = (status, result) => Response.json(result, {status, headers: cors});

    if (origin && !origins.has(origin)) return reply(403, {error: 'Origin not allowed.'});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (req.method !== 'POST') return reply(405, {error: 'Use POST.'});

    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = env.RESEND_API_KEY;
    if (!url || !key || !resendKey) return reply(503, {error: 'Prayer delivery is not configured yet.'});

    let payload;
    try { payload = await req.json(); }
    catch { return reply(400, {error: 'Please check the form and try again.'}); }

    // Honeypot + minimum dwell time catch basic automated submissions.
    if (clean(payload.website, 120)) return reply(200, {status: 'received'});
    const startedAt = Number(payload.startedAt);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < 2000 || Date.now() - startedAt > 60 * 60 * 1000) {
      return reply(400, {error: 'Please refresh the page and try again.'});
    }

    const name = clean(payload.name, 60);
    const email = clean(payload.email, 160).toLowerCase();
    const prayer = clean(payload.prayerRequest, 4000);
    const contact = payload.contactRequested;

    if (!name) return reply(400, {error: 'Please enter your first name or initial.'});
    if (!validEmail(email)) return reply(400, {error: 'Please enter a valid email address.'});
    if (prayer.length < 5) return reply(400, {error: 'Please enter your prayer request.'});
    if (typeof contact !== 'boolean') return reply(400, {error: 'Please choose whether you would like KIPG to contact you.'});

    const serviceHeaders = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    };
    const timedFetch = (target, options) => requestFetch(target, {
      ...options,
      signal: AbortSignal.timeout(15000)
    });

    let requestId = null;
    try {
      const saved = await timedFetch(`${url}/rest/v1/kipg_prayer_requests`, {
        method: 'POST',
        headers: {...serviceHeaders, Prefer: 'return=representation'},
        body: JSON.stringify({
          name,
          email,
          prayer_text: prayer,
          contact_requested: contact,
          status: 'pending'
        })
      });
      if (!saved.ok) return reply(503, {error: 'Your request could not be secured for delivery. Please try again.'});
      const rows = await saved.json();
      requestId = rows?.[0]?.id;
      if (!requestId) return reply(503, {error: 'Your request could not be secured for delivery. Please try again.'});

      const contactLabel = contact ? 'Yes' : 'No';
      const text = `Name: ${name}\nEmail: ${email}\nContact Requested: ${contactLabel}\n\nPrayer Request:\n${prayer}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#171717">
        <h2 style="margin-bottom:22px">Prayer Request</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Contact Requested:</strong> ${contactLabel}</p>
        <hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
        <p><strong>Prayer Request:</strong></p>
        <div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(prayer)}</div>
      </div>`;

      const sent = await timedFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
          'Idempotency-Key': `kipg-prayer-v1-${requestId}`
        },
        body: JSON.stringify({
          from: 'KIPG Network <community@kipgnetwork.com>',
          to: [recipient],
          ...(contact ? {reply_to: email} : {}),
          subject: 'Prayer Request',
          text,
          html
        })
      });
      const result = await sent.json().catch(() => ({}));
      const accepted = sent.ok && typeof result.id === 'string';

      if (!accepted) {
        await timedFetch(`${url}/rest/v1/kipg_prayer_requests?id=eq.${encodeURIComponent(requestId)}`, {
          method: 'PATCH',
          headers: {...serviceHeaders, Prefer: 'return=minimal'},
          body: JSON.stringify({
            status: 'needs_review',
            updated_at: new Date().toISOString()
          })
        });
        return reply(502, {error: 'Your request was saved safely, but email delivery needs attention. Please try again later.'});
      }

      // Resend accepted the message, so purge the sensitive recovery copy.
      await timedFetch(`${url}/rest/v1/kipg_prayer_requests?id=eq.${encodeURIComponent(requestId)}`, {
        method: 'PATCH',
        headers: {...serviceHeaders, Prefer: 'return=minimal'},
        body: JSON.stringify({
          status: 'accepted',
          provider_id: result.id,
          name: null,
          email: null,
          prayer_text: null,
          contact_requested: null,
          purged_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });

      return reply(200, {status: 'received'});
    } catch {
      if (requestId) {
        try {
          await timedFetch(`${url}/rest/v1/kipg_prayer_requests?id=eq.${encodeURIComponent(requestId)}&status=eq.pending`, {
            method: 'PATCH',
            headers: {...serviceHeaders, Prefer: 'return=minimal'},
            body: JSON.stringify({status: 'needs_review', updated_at: new Date().toISOString()})
          });
        } catch {}
      }
      return reply(503, {error: 'Your request could not complete. Please try again shortly.'});
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
