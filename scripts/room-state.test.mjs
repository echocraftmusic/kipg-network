import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeId,roomState,easternTime} from '../assets/js/room-state.js';
const start=Date.parse('2026-10-07T23:00:00Z');
const session={id:'test',videoId:'abcdefghijk',startsAt:new Date(start).toISOString(),opensAt:new Date(start-900000).toISOString(),durationSeconds:3600};
test('room and chat share lobby/start/end boundaries',()=>{
  assert.equal(roomState(null).phase,'idle');
  assert.equal(roomState(session,start-900001).phase,'scheduled');
  assert.deepEqual([roomState(session,start-900000).phase,roomState(session,start-900000).chatWindow],['lobby',true]);
  assert.equal(roomState(session,start).phase,'playing');
  assert.equal(roomState(session,start+1200000).position,1200);
  assert.equal(roomState(session,start+3599999).chatWindow,true);
  assert.equal(roomState(session,start+3600000).phase,'ended');
  assert.equal(roomState(session,start+3600000).chatWindow,false);
});
test('Play Now and Schedule use identical start-time rules',()=>{
  const nowSession={...session,startsAt:new Date(start).toISOString(),opensAt:new Date(start).toISOString()};
  assert.equal(roomState(nowSession,start+45000).position,roomState(session,start+45000).position);
});
test('authoritative early end closes the session and chat',()=>{
  const ended={...session,endedAt:new Date(start+1800000).toISOString()};
  assert.equal(roomState(ended,start+1800000).phase,'ended');
  assert.equal(roomState(ended,start+1800000).chatWindow,false);
});
test('rejects invalid video links and incomplete timing',()=>{
  assert.equal(youtubeId('https://youtu.be/abcdefghijk?t=10'),'abcdefghijk');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=abcdefghijk'),'abcdefghijk');
  assert.equal(youtubeId('https://youtube.com.evil.example/watch?v=abcdefghijk'),null);
  assert.equal(youtubeId('javascript:alert(1)'),null);
  for(const bad of [{...session,durationSeconds:0},{...session,startsAt:'bad'},{...session,opensAt:new Date(start+1).toISOString()},{...session,videoId:'bad'}])assert.throws(()=>roomState(bad,start));
});
test('Eastern display follows daylight-saving changes',()=>{
  assert.match(easternTime('2026-10-07T23:00:00Z'),/7:00 PM EDT/);
  assert.match(easternTime('2026-11-04T00:00:00Z'),/7:00 PM EST/);
});

test('chat rehearsal requires an open session and never enables public posting',async()=>{
  const {chatCanPost,messageText}=await import('../assets/js/room-chat.js');
  assert.equal(chatCanPost(null,{chatWindow:true}),false);
  assert.equal(chatCanPost('rehearsal',{chatWindow:true}),true);
  assert.equal(chatCanPost('rehearsal',roomState(session,start+3600000)),false);
  assert.equal(messageText('   hello   '),'hello');
  assert.equal(messageText(' '.repeat(10)),'');
  assert.equal(messageText('x'.repeat(600)).length,500);
  assert.equal(messageText(null),'');
});
