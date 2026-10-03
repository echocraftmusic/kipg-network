// Isolated PostgreSQL only; pass the absolute PGlite module path.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();let checks=0;
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',unverified='33333333-3333-4333-8333-333333333333';
await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
await db.query('insert into auth.users values($1,$2,now(),$3),($4,$5,now(),$6),($7,$8,null,$6)',[first,'one@example.invalid',JSON.stringify({first_name:'Troy',last_name:'Saha',newsletter_opt_in:true}),second,'two@example.invalid','{}',unverified,'three@example.invalid']);
await db.exec(await readFile(new URL('../migrations/20261002_001_theater_chat.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../migrations/20261003_002_member_details.sql',import.meta.url),'utf8'));
async function as(role,id=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
async function deny(sql,args=[]){await assert.rejects(()=>db.query(sql,args));checks++;}
await as('anon');await deny('select * from public.kipg_member_details');await deny('select public.kipg_get_member_details()');await deny("select public.kipg_save_member_details('Fake','Name',true)");
await as('authenticated',unverified);await deny('select public.kipg_get_member_details()');await deny("select public.kipg_save_member_details('Fake','Name',true)");
await as('authenticated',first);
const username=(await db.query('select (public.kipg_ensure_profile()).*')).rows[0].username;
let detail=(await db.query('select (public.kipg_get_member_details()).*')).rows[0];
assert.equal(detail.first_name,'Troy');assert.equal(detail.last_name,'Saha');assert.equal(detail.email,'one@example.invalid');assert.equal(detail.newsletter_opt_in,true);assert.ok(detail.newsletter_consent_at);checks+=5;
await deny("update public.kipg_member_details set email='forged@example.invalid'");await deny('delete from public.kipg_member_details');
await deny("select public.kipg_save_member_details('','Name',true)");await deny('select public.kipg_save_member_details($1,$2,true)',['x'.repeat(81),'Name']);await deny('select public.kipg_save_member_details($1,$2,true)',['Name\n','Name']);
detail=(await db.query("select (public.kipg_save_member_details('  T  ','O’Connor-Saha',false)).*")).rows[0];
assert.equal(detail.first_name,'T');assert.equal(detail.last_name,'O’Connor-Saha');assert.equal(detail.newsletter_opt_in,false);assert.equal(detail.newsletter_consent_at,null);checks+=4;
assert.equal((await db.query('select (public.kipg_ensure_profile()).*')).rows[0].username,username);checks++;
await as('authenticated',second);
detail=(await db.query('select (public.kipg_get_member_details()).*')).rows[0];assert.equal(detail.first_name,'');assert.equal(detail.newsletter_opt_in,false);checks+=2;
assert.equal((await db.query('select * from public.kipg_member_details')).rows.length,1);checks++;
assert.equal((await db.query('select * from public.kipg_member_details where user_id=$1',[first])).rows.length,0);checks++;
await db.query("select public.kipg_save_member_details('Second','Member',true)");
await as('postgres');await db.query("update auth.users set email='changed@example.invalid' where id=$1",[first]);
await as('authenticated',first);detail=(await db.query('select (public.kipg_get_member_details()).*')).rows[0];
assert.equal(detail.email,'changed@example.invalid');assert.equal(detail.first_name,'T');assert.equal(detail.newsletter_opt_in,false);checks+=3;
console.log(`${checks} member privacy and profile checks passed (isolated PostgreSQL).`);await db.close();
