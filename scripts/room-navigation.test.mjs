import test from 'node:test';
import assert from 'node:assert/strict';
import {safeRoomReturn,rememberRoom,accountReturn} from '../assets/js/room-navigation.js';
const base='https://example.com/kipg-network/pages/community.html';
const id='11111111-2222-4333-8444-555555555555';
test('return keeps rehearsal ID without leaking URL fragments or arbitrary parameters',()=>{
  assert.equal(safeRoomReturn(`live.html?room=theater-1&rehearsal=${id}&v=old#anything`,base),`https://example.com/kipg-network/pages/live.html?room=theater-1&rehearsal=${id}`);
  for(const bad of ['https://evil.example/live.html','//evil.example/live.html','javascript:alert(1)','/elsewhere/live.html','live.html?room=theater-2','live.html?rehearsal=bad'])assert.equal(safeRoomReturn(bad,base),null);
});
test('community return survives a clean email callback and tolerates blocked storage',()=>{
  const values=new Map();globalThis.sessionStorage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)};
  rememberRoom(`live.html?rehearsal=${id}`,base);
  assert.match(accountReturn(base),new RegExp(id));
  assert.match(accountReturn(base+'?returnTo='+encodeURIComponent('live.html?room=theater-1')),/live.html\?room=theater-1$/);
  globalThis.sessionStorage={setItem(){throw Error();},getItem(){throw Error();}};
  assert.equal(accountReturn(base),base.replace('community.html','live.html'));
});
