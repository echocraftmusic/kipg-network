import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
const {createHandler} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const env = {SUPABASE_URL:'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'service-test',
  RESEND_API_KEY:'resend-test', DELIVERY_SECRET:'a'.repeat(44)};
const payload = {submissionId:'12345678-1234-4123-8123-123456789abc', name:'Troy',
  email:'TEST@example.com', prayerRequest:'Please pray for <our family>.', contactRequested:true};
const token = 'abcdef12-1234-4123-8123-123456789abc';
const request = (body = payload, secret = env.DELIVERY_SECRET) => new Request('https://example.test/submit',
  {method:'POST', headers:{'Content-Type':'application/json', 'X-KIPG-Recovery-Secret':secret}, body:JSON.stringify(body)});
function backend({claimAction = 'send', failSend = false, failFinish = false, failClaim = false} = {}) {
  const calls = []; let accepted = false;
  return {calls, fetch:async (url, options) => {
    const body = JSON.parse(options.body); calls.push({url, options, body});
    if (url.endsWith('/kipg_claim_prayer_delivery')) {
      if (failClaim) return Response.json({}, {status:503});
      return Response.json({action:accepted ? 'delivered' : claimAction, token});
    }
    if (url === 'https://api.resend.com/emails') {
      if (failSend) throw new Error('Provider timeout');
      return Response.json({id:'provider-123'});
    }
    if (url.endsWith('/kipg_finish_prayer_delivery')) {
      if (failFinish) return Response.json(false);
      accepted = true; return Response.json(true);
    }
    if (url.endsWith('/kipg_release_prayer_delivery')) return Response.json(true);
    throw new Error('Unexpected request');
  }};
}
test('rejects direct submissions and wrong secrets before any database or email request', async () => {
  const mock = backend(), handler = createHandler(env, mock.fetch);
  assert.equal((await handler(request(payload, 'wrong'))).status, 401);
  assert.equal((await handler(new Request('https://example.test', {method:'POST', body:'{}'}))).status, 401);
  assert.equal(mock.calls.length, 0);
});
test('validates without truncating and accepts delayed authenticated recovery without dwell fields', async () => {
  const mock = backend(), handler = createHandler(env, mock.fetch);
  for (const p of [{...payload, name:'x'.repeat(61)}, {...payload, contactRequested:'yes'},
    {...payload, submissionId:'bad'}, {...payload, email:'not-email'}, {...payload, prayerRequest:'x'.repeat(4001)}]) {
    assert.equal((await handler(request(p))).status, 400);
  }
  assert.equal(mock.calls.length, 0);
  assert.equal((await handler(request())).status, 200);
});
test('confirms cleanup before delivered response; duplicates skip email', async () => {
  const mock = backend(), handler = createHandler(env, mock.fetch);
  const first = await handler(request());
  assert.deepEqual(await first.json(), {status:'delivered', submissionId:payload.submissionId});
  const claim = mock.calls[0].body;
  assert.match(claim.p_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(claim.p_email, 'test@example.com');
  const email = mock.calls.find(c => c.url === 'https://api.resend.com/emails');
  assert.equal(email.options.headers['Idempotency-Key'], 'kipg-prayer-v2-' + payload.submissionId);
  assert.equal(email.body.reply_to, 'test@example.com');
  assert.match(email.body.html, /&lt;our family&gt;/);
  assert.equal((await handler(request())).status, 200);
  assert.equal(mock.calls.filter(c => c.url === 'https://api.resend.com/emails').length, 1);
});
test('provider outage and cleanup failure retain pending status and release the lease', async () => {
  for (const opts of [{failSend:true}, {failFinish:true}]) {
    const mock = backend(opts), handler = createHandler(env, mock.fetch);
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'pending');
    assert.ok(mock.calls.some(c => c.url.endsWith('/kipg_release_prayer_delivery')));
  }
});
test('conflict, busy lease, expired retry window and database outage never send email', async () => {
  for (const opts of [{claimAction:'conflict'}, {claimAction:'busy'}, {claimAction:'review'}, {failClaim:true}]) {
    const mock = backend(opts), handler = createHandler(env, mock.fetch);
    assert.notEqual((await handler(request())).status, 200);
    assert.equal(mock.calls.filter(c => c.url === 'https://api.resend.com/emails').length, 0);
  }
});
test('no contact permission means no reply-to; malformed and oversized bodies are rejected', async () => {
  const mock = backend(), handler = createHandler(env, mock.fetch);
  assert.equal((await handler(request({...payload, contactRequested:false}))).status, 200);
  const email = mock.calls.find(c => c.url === 'https://api.resend.com/emails');
  assert.equal('reply_to' in email.body, false);
  const malformed = new Request('https://example.test', {method:'POST',
    headers:{'X-KIPG-Recovery-Secret':env.DELIVERY_SECRET}, body:'{'});
  assert.equal((await handler(malformed)).status, 400);
  assert.equal((await handler(request({...payload, unused:'x'.repeat(25000)}))).status, 400);
});
