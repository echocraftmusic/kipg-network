import fs from 'node:fs/promises';
import path from 'node:path';
const apiKey=process.env.YOUTUBE_API_KEY;
const playlistId='PLWy7yBFqtc6o';
if(!apiKey) throw new Error('Missing YOUTUBE_API_KEY GitHub secret.');
async function youtube(endpoint,params){
  const url=new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for(const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  url.searchParams.set('key',apiKey);
  const response=await fetch(url);
  if(!response.ok) throw new Error(`YouTube API request failed (${response.status})`);
  return response.json();
}
function completed(video){
  if(!video || video.status?.privacyStatus!=='public') return false;
  if(['live','upcoming'].includes(video.snippet?.liveBroadcastContent)) return false;
  const live=video.liveStreamingDetails;
  return !live?.scheduledStartTime || Boolean(live.actualEndTime);
}
const playlist=[];
let pageToken;
do {
  const page=await youtube('playlistItems',{part:'snippet,contentDetails,status',playlistId,maxResults:'50',...(pageToken?{pageToken}:{})});
  playlist.push(...(page.items||[]));pageToken=page.nextPageToken;
}while(pageToken);
const ids=[...new Set(playlist.map(item=>item.contentDetails?.videoId || item.snippet?.resourceId?.videoId).filter(Boolean))];
const byId=new Map();
for(let i=0;i<ids.length;i+=50){
  const data=await youtube('videos',{part:'snippet,liveStreamingDetails,status',id:ids.slice(i,i+50).join(',')});
  for(const video of data.items||[]) byId.set(video.id,video);
}
const seen=new Set();
const episodes=playlist.map(item=>{
  const id=item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
  const video=byId.get(id);
  if(!completed(video) || seen.has(id)) return null;
  seen.add(id);
  const snippet=video.snippet;
  const title=snippet.title || 'KIPG Podcast';
  const match=title.match(/(?:EP(?:ISODE)?\.?\s*)(\d{1,3})\b/i);
  const thumbs=snippet.thumbnails||{};
  return {videoId:id,title,description:(snippet.description||'').replace(/\s+/g,' ').trim(),thumbnail:thumbs.maxres?.url||thumbs.high?.url||thumbs.default?.url||'',publishedAt:snippet.publishedAt||null,episodeNumber:match?match[1]:null,liveBroadcastContent:'none',watchUrl:`https://www.youtube.com/watch?v=${id}`};
}).filter(Boolean);
if(!episodes.length) throw new Error('No completed public KIPG episode found; existing data preserved.');
const latest=episodes[0];
const data={generatedAt:new Date().toISOString(),playlistId,...latest,description:latest.description.slice(0,420),recentEpisodes:episodes.slice(0,4),episodes};
const output=path.resolve('data/latest-kipg-episode.json');
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(data,null,2)+'\n');
console.log(`Featured: ${latest.title}; ${episodes.length} completed episodes.`);
