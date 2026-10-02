# KIPG Network — Phase 1 Functionality

Phase 1 uses the approved EC Framework design and the existing GitHub Pages site.

## Working visitor flows

- Home → latest episode → playback inside KIPG Network.
- Watch → episode search and topic filters → individual episode URL.
- Shows → KIPG Podcast profile and episode library.
- Schedule → next Wednesday at 7 PM America/New_York → calendar download.
- About → host PG and moderator/producer Troy.
- Community and Prayer clearly explain what is available today and what is coming next.
- Mobile navigation, keyboard labels and saved dark/light theme work across pages.

The old `pages/live.html` link remains available as an honest viewing-room introduction.
Episode URLs use `pages/watch.html?episode=VIDEO_ID`; filters use `q` and `topic`.

## Episode publishing

The GitHub workflow runs every Tuesday at 7:00 PM in `America/New_York`, automatically following EST/EDT. It also supports **Run workflow** in GitHub Actions and runs when the sync code or editorial file changes. GitHub may queue scheduled runs after the requested minute. It uses the existing `YOUTUBE_API_KEY` secret and playlist `PLWy7yBFqtc6o`; no API key goes into the browser.

The script paginates the full playlist and fetches video details in batches, producing a full `episodes` collection alongside featured and recent records. Private/unlisted, upcoming and active streams are excluded, so the Tuesday sync publishes completed public episodes only; Wednesday live listings remain Phase 2. A failed or empty sync preserves the previous data. Playlist order determines the featured episode unless an episode has `featured: true`. Removed/ineligible videos disappear on a successful sync. Unchanged data does not create another commit. After syncing, the workflow explicitly requests a GitHub Pages rebuild, because bot commits do not automatically publish Pages.

`data/episode-editorial.json` holds site-controlled details keyed by YouTube video ID. Supported display overrides are `customTitle`, `customDescription` and `episodeNumber`; other fields such as `guest`, `topics`, `scripture`, `resources` and `featured` are retained. Existing custom fields in generated records also survive. YouTube IDs, source title/description, thumbnails, dates and playlist positions are refreshed independently. Guest/resource presentation can be expanded later; preserving those fields does not yet add new UI.

Example editorial entry:

```json
{
  "VIDEO_ID_11": {
    "episodeNumber": "15",
    "customDescription": "Our website summary",
    "topics": ["purpose"],
    "guest": {"name": "Omega Sparx"},
    "resources": [],
    "featured": true
  }
}
```

Run `npm run test:youtube` to verify editorial preservation, no-change syncs, eligibility filtering, playlist pagination, API batching and failure recovery.

The initial checked-in collection includes the four already verified episode records. The next successful sync fills the rest of the official playlist. Titles, descriptions and IDs are rendered as text; players accept only valid IDs from the published collection. Topic assignment uses title/description keywords, or an explicit `topics` array when available.

## Phase 2

Live chat requirement: the Wednesday room opens at 6:45 PM America/New_York, fifteen minutes before the 7 PM show. Chat is available during the live viewing window only, with a moderator control to close it after the show. Anyone may watch; sign-in is recommended for posting. Desktop chat sits beside the video; on phones it sits below. Server-side schedule enforcement, moderation and rate limits are required.

Still to implement: scheduled site-first premieres, accounts, live chat, moderation, email signup/reminders and private prayer delivery. No signup or prayer form currently pretends to collect submissions. The Wednesday calendar event is a single reminder for the next show, not a claim that a premiere is already live.

## Verification

Run `npm run verify` for required files, imports and asset links. Browser QA could not run in this environment because Chromium is unavailable. A browser verification script was prepared for playback selection, search, topics, recovery, calendar download, mobile navigation and theme preference. Schedule calculations are checked around daylight-saving transitions.
