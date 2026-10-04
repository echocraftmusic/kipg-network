import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();
const old='11111111-1111-4111-8111-111111111111',fresh='22222222-2222-4222-8222-222222222222';
await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);');
await db.query('insert into auth.users values ($1)',[old]);
await db.exec(await readFile(new URL('../migrations/20261004_003_welcome_email.sql',import.meta.url),'utf8'));
assert.equal((await db.query('select status from public.kipg_welcome_deliveries')).rows[0].status,'skipped');
await db.query('insert into auth.users values ($1)',[fresh]);
for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query('select * from public.kipg_welcome_deliveries'));
  await assert.rejects(()=>db.query("insert into public.kipg_welcome_deliveries(user_id,status) values ($1,'pending')",[fresh]));
  await db.exec('reset role');
}
// Supabase's service_role bypasses RLS; emulate that in this isolated database.
await db.exec('alter role service_role bypassrls;set role service_role');
let claimed=await db.query("insert into public.kipg_welcome_deliveries(user_id,status) values ($1,'pending') on conflict(user_id) do nothing returning *",[fresh]);assert.equal(claimed.rows.length,1);
claimed=await db.query("insert into public.kipg_welcome_deliveries(user_id,status) values ($1,'pending') on conflict(user_id) do nothing returning *",[fresh]);assert.equal(claimed.rows.length,0);
await db.query("update public.kipg_welcome_deliveries set status='accepted' where user_id=$1",[fresh]);
console.log('Welcome record privacy, historical-account exclusion, and unique reservation checks passed.');await db.close();
