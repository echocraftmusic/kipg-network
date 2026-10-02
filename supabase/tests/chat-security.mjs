// Run with: node supabase/tests/chat-security.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js
// Uses an isolated PostgreSQL engine with mock Supabase roles/Auth; never touches production.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.argv[2]);
const db = new PGlite();
let checks = 0;
const verified = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const unverified = '33333333-3333-4333-8333-333333333333';
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values ('${verified}', 'one@example.invalid', now()),
('${second}', 'two@example.invalid', now()), ('${unverified}', 'three@example.invalid', null);`);
await db.exec(await readFile(new URL('../migrations/20261002_001_theater_chat.sql', import.meta.url), 'utf8'));
async function as(role, id = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${role}`);
}
async function deny(sql, params = []) {
  await assert.rejects(() => db.query(sql, params)); checks++;
}
await as('anon');
await deny('select public.kipg_ensure_profile()');
await deny("insert into public.kipg_sessions(title,youtube_id,starts_at,ends_at) values('Forged','abcdefghijk',now(),now()+interval '1 hour')");
await as('authenticated', unverified);
await deny('select public.kipg_ensure_profile()');
await as('authenticated', verified);
let profile = (await db.query('select (public.kipg_ensure_profile()).*')).rows[0];
assert.match(profile.username, /^User[0-9]{9}$/); checks++;
assert.equal((await db.query('select (public.kipg_ensure_profile()).*')).rows[0].username, profile.username); checks++;
for (const bad of ['Bad Name', 'Smile😀', 'Admin32', 'KIPGHost', 'sh1t99', 'fuuuck123', 'f1u2c3k', 'User123', 'ab']) {
  await deny('select public.kipg_set_username($1)', [bad]);
}
await db.query("select public.kipg_set_username('TroubleTee')");
await deny("update public.kipg_profiles set suspended = false");
await as('authenticated', second);
await db.query('select public.kipg_ensure_profile()');
await deny("select public.kipg_set_username('troubletee')");
assert.equal((await db.query('select * from public.kipg_profiles')).rows.length, 1); checks++;
await as('postgres');
const show = (await db.query("insert into public.kipg_sessions(title,youtube_id,starts_at,ends_at) values('Test','abcdefghijk',now()+interval '10 minutes',now()+interval '1 hour') returning id")).rows[0].id;
await as('authenticated', verified);
await db.query('insert into public.kipg_messages(session_id,body) values($1,$2)', [show, ' Hello 😀 ']);
let msg = (await db.query('select * from public.kipg_messages')).rows[0];
assert.equal(msg.username, 'TroubleTee'); assert.equal(msg.author_id, verified); assert.equal(msg.body, 'Hello 😀'); checks += 3;
await deny('insert into public.kipg_messages(session_id,body) values($1,$2)', [show, 'Spam']);
await deny('insert into public.kipg_messages(session_id,body,author_id) values($1,$2,$3)', [show,'Impersonation',second]);
await deny('update public.kipg_messages set hidden=true');
await as('anon');
assert.equal((await db.query('select * from public.kipg_messages')).rows.length, 1); checks++;
await deny('insert into public.kipg_messages(session_id,body) values($1,$2)', [show,'Anonymous']);
await as('postgres');
await db.query("update public.kipg_profiles set muted_until=now()+interval '1 hour', last_message_at=null where user_id=$1", [second]);
await as('authenticated', second);
await deny('insert into public.kipg_messages(session_id,body) values($1,$2)', [show,'Muted']);
await as('postgres');
await db.query('update public.kipg_profiles set muted_until=null, suspended=true where user_id=$1',[second]);
await as('authenticated', second);
await deny('insert into public.kipg_messages(session_id,body) values($1,$2)', [show,'Suspended']);
await as('postgres');
await db.query("update public.kipg_profiles set suspended=false where user_id=$1",[second]);
await db.query("update public.kipg_sessions set starts_at=now()+interval '16 minutes' where id=$1",[show]);
await as('authenticated', second);
await deny('insert into public.kipg_messages(session_id,body) values($1,$2)',[show,'Too early']);
assert.equal((await db.query('select * from public.kipg_messages')).rows.length,0); checks++;
await as('postgres');
await db.query("update public.kipg_sessions set starts_at=now()-interval '1 hour',ends_at=now()-interval '4 minutes' where id=$1",[show]);
await as('authenticated', second);
await db.query('insert into public.kipg_messages(session_id,body) values($1,$2)',[show,'Goodbye']); checks++;
await as('postgres');
await db.query("update public.kipg_sessions set ends_at=now()-interval '5 minutes' where id=$1",[show]);
await as('authenticated', verified);
await deny('insert into public.kipg_messages(session_id,body) values($1,$2)',[show,'Closed']);
assert.equal((await db.query('select * from public.kipg_messages')).rows.length,0); checks++;
await as('postgres');
await db.query("update public.kipg_sessions set ends_at=now()+interval '1 hour',cancelled=true where id=$1",[show]);
await as('authenticated', second);
await deny('insert into public.kipg_messages(session_id,body) values($1,$2)',[show,'Cancelled']);
console.log(`${checks} database security checks passed (isolated PostgreSQL; production Realtime not tested).`);
await db.close();
