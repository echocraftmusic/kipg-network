import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=async file=>readFile(new URL(file,root),'utf8');

test('KIPG prayer intake remains closed until explicitly approved',async()=>{
  const config=JSON.parse(await read('data/prayer-config.json'));
  assert.equal(config.enabled,false,'Never release the public prayer form before private end-to-end approval');
  assert.equal(config.endpoint,'https://kipg-prayer-intake.echocraft-aimusic.workers.dev/submit');
  assert.ok(config.turnstileSiteKey.startsWith('0x'));
});

test('new prayer Worker keeps fail-closed switches and protected storage',async()=>{
  const source=await read('cloudflare/prayer-v2/worker.js');
  assert.match(source,/SUBMISSIONS_ENABLED\s*!==\s*'true'/);
  assert.match(source,/NOTIFICATIONS_ENABLED\s*!==\s*'true'/);
  assert.match(source,/RECOVERY_ENCRYPTION_KEY/);
  assert.ok(source.includes("env.PRODUCTION_KEY_READY !== 'true'"));
  assert.ok(source.includes('verifiedProductionKey(env)'));
  assert.match(source,/PRODUCTION_KEY_FINGERPRINT/);
  assert.match(source,/PRAYER_RATE_LIMITER/);
  assert.match(source,/PRAYER_RECOVERY/);
  assert.match(source,/TURNSTILE_SECRET_KEY/);
});

test('staff review Worker validates Access JWT and has no anonymous bypass',async()=>{
  const source=await read('cloudflare/prayer-v2/admin-worker.js');
  assert.match(source,/Cf-Access-Jwt-Assertion/);
  assert.match(source,/crypto\.subtle\.verify/);
  assert.match(source,/PRAYER_ADMIN_EMAILS/);
  assert.match(source,/ACCESS_AUD/);
  assert.match(source,/PRAYER_DB\.batch/);
});

test('KIPG public room stays unscheduled until a trusted host assigns a session',async()=>{
  const cfg=JSON.parse(await read('data/viewing-rooms.json'));
  assert.ok(Array.isArray(cfg.rooms));
  for(const room of cfg.rooms)assert.equal(room.session,null,'Unexpected public session on '+room.id);
});

test('prayer launch includes urgent-help guidance and an operations policy',async()=>{
  const page=await read('pages/prayer.html');
  assert.match(page,/not an emergency or crisis-response service/i);
  assert.match(page,/call 911/i);
  assert.match(page,/call or text 988/i);
  const policy=await read('docs/PRAYER-MINISTRY-OPERATIONS.md');
  assert.ok(policy.includes('**Closed requests:** review for deletion within 30 days.'));
  assert.match(policy,/Maximum ordinary retention/i);
  assert.match(policy,/manual person-to-person/i);
  assert.match(policy,/primary and one backup ministry lead/i);
});
