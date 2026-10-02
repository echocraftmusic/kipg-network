export function youtubeId(value) {
  if (typeof value !== 'string') return null;
  if (/^[\w-]{11}$/.test(value.trim())) return value.trim();
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    let id;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
export function roomState(session, now = Date.now()) {
  if (!session) return {phase:'idle', chatWindow:false, position:0};
  const start = Date.parse(session.startsAt);
  const duration = Number(session.durationSeconds);
  const open = Date.parse(session.opensAt || session.startsAt);
  if (!youtubeId(session.videoId) || !session.id || !Number.isFinite(start) || !Number.isFinite(open) || open > start || !Number.isFinite(duration) || duration <= 0) throw new Error('Invalid viewing session.');
  const end = session.endedAt ? Date.parse(session.endedAt) : start + duration * 1000;
  if (!Number.isFinite(end) || end < start) throw new Error('Invalid session end.');
  const phase = now < open ? 'scheduled' : now < start ? 'lobby' : now < end ? 'playing' : 'ended';
  return {phase, chatWindow: ['lobby','playing'].includes(phase), position: Math.max(0, Math.min(duration, (now-start)/1000)), startsAt:start, endsAt:end, opensAt:open};
}
export function easternTime(value) {
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York', weekday:'short', month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
}
