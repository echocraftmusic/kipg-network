import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseSession,databaseSession} from '../assets/js/shared-room.js';
import {sharedCanPost,messageRows,connectSharedChat} from '../assets/js/shared-chat.js';
const verified={id:'member',email_confirmed_at:'2026-10-01T00:00:00Z'};
const profile={username:'User123456789',suspended:false,muted_until:null};
test('shared access requires verified member, profile, live connection and open window',()=>{
  const open={chatWindow:true};assert.equal(sharedCanPost(open,verified,profile,true),true);
  for(const args of [[{chatWindow:false},verified,profile,true],[open,null,profile,true],[open,{id:'unverified'},profile,true],[open,verified,null,true],[open,verified,profile,false],[open,verified,{...profile,suspended:true},true],[open,verified,{...profile,muted_until:new Date(Date.now()+60000).toISOString()},true]])assert.equal(sharedCanPost(...args),false);
});
test('room selection and shared timing use database end, preserving goodbye chat',()=>{
  const now=Date.parse('2026-10-03T01:00:00Z');const row=(id,start,end)=>({id,title:id,youtube_id:'abcdefghijk',starts_at:new Date(now+start).toISOString(),ends_at:new Date(now+end).toISOString()});
  const current=row('current',-3600000,-60000),future=row('future',3600000,7200000),past=row('past',-7200000,-300000);
  assert.equal(chooseSession([future,past,current],now).id,'current');assert.equal(chooseSession([past,future],now).id,'future');assert.equal(chooseSession([past],now),null);
  assert.equal(chooseSession([{...current,cancelled:true}],now),null);
  const session=databaseSession(current);assert.equal(session.endedAt,current.ends_at);assert.equal(Date.parse(session.opensAt),Date.parse(current.starts_at)-900000);
});
test('messages are chronological, deduplicated, capped and hide removed content',()=>{
  const rows=Array.from({length:110},(_,i)=>({id:String(i).padStart(3,'0'),body:`message ${i}`,username:'member',created_at:new Date(i*1000).toISOString()}));
  const result=messageRows([...rows,rows[109],{...rows[108],hidden:true}]);assert.equal(result.length,100);assert.equal(result.at(-1).id,'109');
  assert.equal(messageRows([{...rows[0],hidden:true}]).length,0);
});
test('shared adapter sends only session and body, handles sign-out, close and stale events',async()=>{
  const realFetch=globalThis.fetch,realInterval=globalThis.setInterval,realClear=globalThis.clearInterval;
  const elements=new Map();globalThis.document={querySelector:key=>{if(key==='.vr-program')return null;if(!elements.has(key))elements.set(key,{textContent:'',hidden:false});return elements.get(key);}};
  const lifecycle=new Map();globalThis.window={addEventListener:(name,callback)=>lifecycle.set(name,callback)};let authUser=verified,authCallback,eventCallback,subscription,sent,serverRows=[],lastRows=[],allowed=false,sender;
  const fake={auth:{getSession:async()=>({data:{session:authUser?{user:authUser}:null}}),onAuthStateChange:callback=>{authCallback=callback;}},rpc:async()=>({data:profile}),removeChannel:async()=>{},channel:name=>{const presence=name.startsWith('kipg-room-presence-');const channel={on(_type,_filter,callback){if(!presence)eventCallback=callback;return this;},subscribe(callback){if(!presence)subscription=callback;queueMicrotask(()=>callback('SUBSCRIBED'));return this;},track:async()=>{},untrack:async()=>{},presenceState:()=>({})};return channel;},from:()=>({insert:async row=>{sent=row;serverRows.push({id:'one',body:row.body,username:profile.username,created_at:new Date().toISOString(),hidden:false});return {error:null};},select:()=>({eq(){return this;},order(){return this;},limit:async()=>({data:serverRows})})})};
  globalThis.supabase={createClient:()=>fake};globalThis.fetch=async()=>({ok:true,json:async()=>({projectUrl:'https://'+'a'.repeat(20)+'.supabase.co',publishableKey:'sb_publishable_test'})});
  globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
  const flush=async()=>{await new Promise(resolve=>setTimeout(resolve,20));};
  try{
    const adapter=connectSharedChat({setSender:callback=>{sender=callback;},setAccess:value=>{allowed=value;},replace:rows=>{lastRows=rows;}});
    adapter.update({chatWindow:true},{id:'show'});await flush();assert.equal(allowed,true);
    await sender('Hello');assert.deepEqual(sent,{session_id:'show',body:'Hello'});assert.equal(lastRows.length,1);
    subscription('CHANNEL_ERROR');assert.equal(allowed,false);await assert.rejects(()=>sender('offline'));
    subscription('SUBSCRIBED');await flush();assert.equal(allowed,true);
    authUser=null;authCallback();await flush();assert.equal(allowed,false);
    const stale=eventCallback;adapter.update({chatWindow:false},{id:'show'});assert.equal(lastRows.length,0);
    stale({new:serverRows[0]});assert.equal(lastRows.length,0);await assert.rejects(()=>sender('closed'));
    authUser=verified;adapter.update({chatWindow:true},{id:'show'});lifecycle.get('pagehide')();
    lifecycle.get('pageshow')({persisted:true});await flush();assert.equal(allowed,true);assert.equal(lastRows.length,1);
  }finally{globalThis.fetch=realFetch;globalThis.setInterval=realInterval;globalThis.clearInterval=realClear;}
});
