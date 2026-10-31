import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=file=>readFile(new URL(file,root),'utf8');

test('Cloudflare Community auth Worker remains fail-closed in staging',async()=>{
  const source=await read('cloudflare/community-v2/worker.js');
  assert.match(source,/EMAIL_ENABLED!=='true'/);
  assert.match(source,/TEST_MODE==='true'/);
  assert.match(source,/TEST_ACCESS_KEY/);
  assert.match(source,/__Host-kipg_session/);
  assert.match(source,/HttpOnly; Secure; SameSite=Lax/);
  assert.match(source,/token_hash/);
  assert.match(source,/session_hash/);
  assert.match(source,/consumed_at IS NULL/);
  assert.match(source,/revoked_at IS NULL/);
  assert.match(source,/Origin not allowed/);
});

test('Cloudflare Community auth exposes the required staged account lifecycle',async()=>{
  const source=await read('cloudflare/community-v2/worker.js');
  for(const route of ['/auth/request','/auth/verify','/me','/username','/signout'])assert.ok(source.includes(route),route);
  assert.match(source,/blocked_username_terms/);
  assert.match(source,/That username isn’t available/);
});

test('Cloudflare Community D1 schema keeps auth secrets hashed and private',async()=>{
  const schema=await read('cloudflare/community-v2/schema.sql');
  const auth=await read('cloudflare/community-v2/001_auth_foundation.sql');
  for(const name of ['login_requests','member_sessions','blocked_username_terms','auth_rate_limits'])assert.ok(schema.includes(name),name);
  assert.match(auth,/token_hash TEXT NOT NULL UNIQUE/);
  assert.match(auth,/session_hash TEXT NOT NULL UNIQUE/);
  assert.ok(!/token_plain|session_plain/i.test(auth));
});
