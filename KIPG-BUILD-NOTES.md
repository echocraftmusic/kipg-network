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

The existing hourly GitHub workflow runs `scripts/update-youtube-featured.mjs` using the existing `YOUTUBE_API_KEY` secret. It now paginates the full playlist and fetches video details in batches, producing a full `episodes` collection alongside the existing featured and recent records. Private/unlisted, upcoming and active streams are excluded. A failed sync preserves the previous data. Playlist order determines the featured episode.

The initial checked-in collection includes the four already verified episode records. The next successful sync fills the rest of the official playlist. Titles, descriptions and IDs are rendered as text; players accept only valid IDs from the published collection. Topic assignment uses title/description keywords, or an explicit `topics` array when available.

## Phase 2

Live chat requirement: the Wednesday room opens at 6:45 PM America/New_York, fifteen minutes before the 7 PM show. Chat is available during the live viewing window only, with a moderator control to close it after the show. Anyone may watch; sign-in is recommended for posting. Desktop chat sits beside the video; on phones it sits below. Server-side schedule enforcement, moderation and rate limits are required.

Still to implement: scheduled site-first premieres, accounts, live chat, moderation, email signup/reminders and private prayer delivery. No signup or prayer form currently pretends to collect submissions. The Wednesday calendar event is a single reminder for the next show, not a claim that a premiere is already live.

## Verification

Run `npm run verify` for required files, imports and asset links. Browser QA could not run in this environment because Chromium is unavailable. A browser verification script was prepared for playback selection, search, topics, recovery, calendar download, mobile navigation and theme preference. Schedule calculations are checked around daylight-saving transitions.
