import {getCommunityClient} from './community-client.js?v=20261003-shared';
export function databaseSession(row){
  if(!row || row.cancelled)return null;
  const start=Date.parse(row.starts_at),end=Date.parse(row.ends_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('The show schedule is invalid.');
  return {id:row.id,title:row.title,videoId:row.youtube_id,startsAt:row.starts_at,opensAt:new Date(start-900000).toISOString(),endedAt:row.ends_at,durationSeconds:(end-start)/1000,summary:'A shared KIPG viewing. Chat opens 15 minutes before the show and stays open five minutes afterward.'};
}
export function chooseSession(rows,now=Date.now()){
  const eligible=rows.filter(row=>!row.cancelled&&Date.parse(row.ends_at)+300000>now);
  const active=eligible.filter(row=>Date.parse(row.starts_at)-900000<=now).sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at));
  return active[0] || eligible.sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at))[0] || null;
}
export async function loadSharedRoom(roomId){
  if(roomId!=='theater-1')throw new Error('This viewing room is not available.');
  const client=await getCommunityClient();
  const {data,error}=await client.from('kipg_sessions').select('*').eq('theater_id',roomId).eq('cancelled',false).gt('ends_at',new Date(Date.now()-300000).toISOString()).order('starts_at',{ascending:true}).limit(100);
  if(error)throw new Error('The shared room could not connect. Please reload to try again.');
  return {id:roomId,name:'Theater 1',projectorName:'Projector 1',session:databaseSession(chooseSession(data))};
}
