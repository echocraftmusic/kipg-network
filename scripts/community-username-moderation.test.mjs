import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=file=>readFile(new URL(file,root),'utf8');

test('Community username moderation expansion remains additive and broad',async()=>{
  const migration=await read('supabase/migrations/20261031_007_username_moderation.sql');
  assert.match(migration,/insert into kipg_private\.blocked_username_terms/i);
  assert.match(migration,/on conflict \(term\) do nothing/i);
  assert.match(migration,/create or replace function kipg_private\.username_allowed/i);
  for(const term of ['evil','satan','lucifer','devil','trump','maga','biden','harris','obama','desantis','porn','naked','onlyfans']){
    assert.ok(migration.includes(`('${term}')`),`missing blocked username term: ${term}`);
  }
  assert.ok(!/create table public\.kipg_profiles/i.test(migration),'moderation expansion must not recreate the profile table');
});

test('Community hides the private blocked-term reason from members',async()=>{
  const client=await read('assets/js/community-client.js');
  const page=await read('pages/community.html');
  assert.match(client,/That username isn’t available\. Please choose another name that follows KIPG Community guidelines\./);
  assert.match(page,/political\/campaign names or slogans/i);
  assert.match(page,/sexual or hateful terms/i);
});
