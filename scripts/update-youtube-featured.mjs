import fs from 'node:fs/promises';
import path from 'node:path';
import { buildEpisodeData } from './youtube-episode-data.mjs';
const apiKey=process.env.YOUTUBE_API_KEY;
const playlistId='PLWy7yBFqtc6o';
if(!apiKey) throw new Error('Missing YOUTUBE_API_KEY GitHub secret.');
async function youtube(endpoint,params){
  const url=new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for(const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  url.searchParams.set('key',apiKey);
  const response=await fetch(url, {signal: AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`YouTube API request failed (${response.status})`);
  return response.json();
}
const output=path.resolve('data/latest-kipg-episode.json');
async function readJson(file, fallback){
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch(error) { if(error.code==='ENOENT') return fallback; throw error; }
}
const previous=await readJson(output, {});
const editorial=await readJson(path.resolve('data/episode-editorial.json'), {});
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
const data=buildEpisodeData({playlist,byId,playlistId,previous,editorial});
if(JSON.stringify(data)===JSON.stringify(previous)){
  console.log('Playlist unchanged; existing episode data preserved.');
  process.exit(0);
}
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output+'.tmp',JSON.stringify(data,null,2)+'\n');
await fs.rename(output+'.tmp',output);
console.log(`Featured: ${data.title}; ${data.episodes.length} completed episodes.`);
