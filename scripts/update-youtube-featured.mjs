import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.YOUTUBE_API_KEY;
const playlistId = 'PLWy7yBFqtc6o';
const outFile = path.resolve('data/latest-kipg-episode.json');

if (!apiKey) {
  console.error('Missing YOUTUBE_API_KEY GitHub secret.');
  process.exit(1);
}

async function youtube(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  return res.json();
}

const playlist = await youtube('playlistItems', {
  part: 'snippet,contentDetails,status',
  playlistId,
  maxResults: '10'
});

const ids = playlist.items
  .map(item => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
  .filter(Boolean);

if (!ids.length) throw new Error('No videos found in the KIPG playlist.');

const videos = await youtube('videos', {
  part: 'snippet,liveStreamingDetails,status',
  id: ids.join(',')
});

const byId = new Map(videos.items.map(video => [video.id, video]));
let chosen = null;

for (const playlistItem of playlist.items) {
  const id = playlistItem.contentDetails?.videoId || playlistItem.snippet?.resourceId?.videoId;
  const video = byId.get(id);
  if (!video || video.status?.privacyStatus === 'private') continue;

  const broadcast = video.snippet?.liveBroadcastContent || 'none';
  const scheduled = video.liveStreamingDetails?.scheduledStartTime;
  const actualEnd = video.liveStreamingDetails?.actualEndTime;

  // Skip premieres/streams that have not started or are currently live.
  if (broadcast === 'upcoming' || broadcast === 'live') continue;
  if (scheduled && !actualEnd && new Date(scheduled).getTime() > Date.now()) continue;

  chosen = video;
  break;
}

if (!chosen) throw new Error('No completed KIPG episode found in the first 10 playlist items.');

const thumbs = chosen.snippet?.thumbnails || {};
const thumbnail = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '';
const title = chosen.snippet?.title || 'KIPG Podcast';
const episodeMatch = title.match(/\b(?:EP(?:ISODE)?\.?\s*)?(\d{1,3})\b/i);
const description = (chosen.snippet?.description || '').replace(/\s+/g, ' ').trim();

const data = {
  generatedAt: new Date().toISOString(),
  playlistId,
  videoId: chosen.id,
  title,
  description: description.slice(0, 220),
  thumbnail,
  publishedAt: chosen.snippet?.publishedAt || null,
  episodeNumber: episodeMatch ? episodeMatch[1] : null,
  watchUrl: `https://www.youtube.com/watch?v=${chosen.id}`
};

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(data, null, 2) + '\n');
console.log(`Featured episode: ${data.title} (${data.videoId})`);
