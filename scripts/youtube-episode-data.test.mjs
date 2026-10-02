import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildEpisodeData } from './youtube-episode-data.mjs';

const id = 'abcdefghijk';
const video = (videoId = id, overrides = {}) => ({id: videoId, status: {privacyStatus: 'public'}, snippet: {title: 'Episode 15', description: 'Original summary', publishedAt: '2026-10-01T00:00:00Z', liveBroadcastContent: 'none'}, ...overrides});
const item = (videoId = id, position = 0) => ({contentDetails: {videoId}, snippet: {position}});
const source = {playlist: [item()], byId: new Map([[id, video()]]), playlistId: 'test'};

test('refreshes YouTube metadata and preserves editorial fields', () => {
  const data = buildEpisodeData({...source, previous: {episodes: [{videoId: id, title: 'Old title', guest: {name: 'Guest'}, resources: ['Book'], scripture: 'Romans 15:13', topics: ['purpose'], episodeNumber: '99'}]}, editorial: {[id]: {customTitle: 'Site title', customDescription: 'Site summary', featured: true, videoId: 'invalid', thumbnail: 'invalid'}}});
  assert.equal(data.title, 'Site title');
  assert.equal(data.youtubeTitle, 'Episode 15');
  assert.equal(data.description, 'Site summary');
  assert.equal(data.videoId, id);
  assert.equal(data.thumbnail, '');
  assert.equal(data.episodeNumber, '99');
  assert.deepEqual(data.episodes[0].guest, {name: 'Guest'});
  assert.deepEqual(data.episodes[0].resources, ['Book']);
  assert.deepEqual(data.episodes[0].topics, ['purpose']);
  assert.equal(data.episodes[0].scripture, 'Romans 15:13');
});

test('unchanged sync does not rewrite timestamp or data', () => {
  const previous = buildEpisodeData({...source, now: '2026-10-01T00:00:00Z'});
  assert.equal(buildEpisodeData({...source, previous, now: '2026-10-08T00:00:00Z'}), previous);
});

test('playlist order, removals and duplicate IDs are respected', () => {
  const second = 'zyxwvutsrqp';
  const data = buildEpisodeData({...source, playlist: [item(second), item(), item()], byId: new Map([[id, video()], [second, video(second)]]), previous: {episodes: [{videoId: 'removed1234'}]}});
  assert.deepEqual(data.episodes.map(episode => episode.videoId), [second, id]);
  assert.equal(data.videoId, second);
});

test('private, missing, live and upcoming videos are excluded', () => {
  for (const blocked of [undefined, video(id, {status: {privacyStatus: 'private'}}), video(id, {status: {privacyStatus: 'unlisted'}}), video(id, {snippet: {...video().snippet, liveBroadcastContent: 'live'}}), video(id, {snippet: {...video().snippet, liveBroadcastContent: 'upcoming'}}), video(id, {liveStreamingDetails: {scheduledStartTime: '2026-10-07T23:00:00Z'}})]) {
    assert.throws(() => buildEpisodeData({...source, byId: new Map([[id, blocked]])}), /existing data preserved/);
  }
  assert.equal(buildEpisodeData({...source, byId: new Map([[id, video(id, {liveStreamingDetails: {scheduledStartTime: 'past', actualEndTime: 'past'}})]])}).videoId, id);
});

test('script paginates playlists, batches video metadata, and preserves file on API failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kipg-sync-'));
  const script = new URL('./update-youtube-featured.mjs', import.meta.url).href;
  try {
    await mkdir(path.join(dir, 'data'));
    const ids = Array.from({length: 51}, (_, i) => String(i).padStart(11, '0'));
    const harness = `
      const ids = ${JSON.stringify(ids)};
      let playlistCalls = 0, videoCalls = 0;
      globalThis.fetch = async input => {
        const url = new URL(input);
        let items, nextPageToken;
        if (url.pathname.endsWith('/playlistItems')) {
          playlistCalls++;
          const second = url.searchParams.has('pageToken');
          items = (second ? ids.slice(50) : ids.slice(0, 50)).map(videoId => ({contentDetails: {videoId}}));
          nextPageToken = second ? undefined : 'page-two';
        } else {
          videoCalls++;
          const batch = url.searchParams.get('id').split(',');
          if (batch.length > 50) throw new Error('Oversized batch');
          items = batch.map(id => ({id, status: {privacyStatus: 'public'}, snippet: {title: 'Episode 15', description: 'summary'}}));
        }
        return {ok: true, json: async () => ({items, nextPageToken})};
      };
      await import(${JSON.stringify(script)});
      if (playlistCalls !== 2 || videoCalls !== 2) throw new Error('Missing pagination or batching');
    `;
    const options = {cwd: dir, env: {...process.env, YOUTUBE_API_KEY: 'test-only'}, stdio: 'pipe'};
    execFileSync(process.execPath, ['--input-type=module', '-e', harness], options);
    const output = path.join(dir, 'data/latest-kipg-episode.json');
    const before = await readFile(output, 'utf8');
    assert.equal(JSON.parse(before).episodes.length, 51);
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch = async () => ({ok: false, status: 403}); await import(${JSON.stringify(script)});`], options));
    assert.equal(await readFile(output, 'utf8'), before);
    await writeFile(path.join(dir, 'data/episode-editorial.json'), '{invalid JSON');
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', harness], options));
    assert.equal(await readFile(output, 'utf8'), before);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
