// YouTube source fields are refreshed; site-specific fields survive each sync.
function completed(video) {
  if (!video || video.status?.privacyStatus !== 'public') return false;
  if (['live', 'upcoming'].includes(video.snippet?.liveBroadcastContent)) return false;
  const live = video.liveStreamingDetails;
  return !live?.scheduledStartTime || Boolean(live.actualEndTime);
}

export function buildEpisodeData({playlist, byId, playlistId, previous = {}, editorial = {}, now = new Date().toISOString()}) {
  const existing = new Map((previous.episodes || previous.recentEpisodes || []).map(item => [item.videoId, item]));
  const seen = new Set();
  const episodes = playlist.flatMap(item => {
    const id = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    const video = byId.get(id);
    if (!/^[\w-]{11}$/.test(id || '') || !completed(video) || seen.has(id)) return [];
    seen.add(id);
    const old = existing.get(id) || {};
    const custom = editorial[id] || {};
    const snippet = video.snippet;
    const title = snippet.title || 'KIPG Podcast';
    const description = (snippet.description || '').replace(/\s+/g, ' ').trim();
    const match = `${title} ${description}`.match(/(?:EP(?:ISODE)?\.?\s*)(\d{1,3})\b/i);
    const thumbs = snippet.thumbnails || {};
    return [{
      ...old, ...custom,
      // These fields cannot be replaced by editorial input.
      videoId: id, title, description,
      youtubeTitle: title, youtubeDescription: description,
      thumbnail: thumbs.maxres?.url || thumbs.high?.url || thumbs.default?.url || '',
      publishedAt: snippet.publishedAt || null,
      playlistPosition: item.snippet?.position ?? null,
      episodeNumber: custom.episodeNumber ?? old.episodeNumber ?? (match ? match[1] : null),
      liveBroadcastContent: 'none',
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      // Explicit overrides keep the display customizable without losing the source.
      ...(custom.customTitle != null || old.customTitle != null ? {title: custom.customTitle ?? old.customTitle} : {}),
      ...(custom.customDescription != null || old.customDescription != null ? {description: custom.customDescription ?? old.customDescription} : {})
    }];
  });
  if (!episodes.length) throw new Error('No completed public KIPG episode found; existing data preserved.');
  const latest = episodes.find(item => item.featured === true) || episodes[0];
  const data = {playlistId, ...latest, description: latest.description.slice(0, 420), recentEpisodes: episodes.slice(0, 4), episodes};
  const {generatedAt, ...oldData} = previous;
  // Do not create a commit just because the sync ran again.
  if (JSON.stringify(oldData) === JSON.stringify(data)) return previous;
  return {generatedAt: now, ...data};
}
