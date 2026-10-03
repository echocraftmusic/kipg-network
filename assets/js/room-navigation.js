const key='kipg-return-room';
export function safeRoomReturn(value,base){
  if(typeof value!=='string'||!value)return null;
  try{
    const target=new URL(value,base),room=new URL('live.html',base);
    if(target.origin!==room.origin||target.pathname!==room.pathname||target.username||target.password)return null;
    if(target.searchParams.has('room')&&target.searchParams.get('room')!=='theater-1')return null;
    const rehearsal=target.searchParams.get('rehearsal');
    if(rehearsal&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(rehearsal))return null;
    room.searchParams.set('room','theater-1');if(rehearsal)room.searchParams.set('rehearsal',rehearsal);
    return room.href;
  }catch{return null;}
}
export function rememberRoom(value,base){
  const safe=safeRoomReturn(value,base);if(safe){try{sessionStorage.setItem(key,safe);}catch{}}return safe;
}
export function accountReturn(base){
  const requested=new URL(base).searchParams.get('returnTo');
  let saved;try{saved=sessionStorage.getItem(key);}catch{}
  const safe=safeRoomReturn(requested,base)||safeRoomReturn(saved,base);
  if(safe)rememberRoom(safe,base);return safe || new URL('live.html',base).href;
}
