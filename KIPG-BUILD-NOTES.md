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

The GitHub workflow runs every Saturday at 7:00 PM in `America/New_York`, automatically following EST/EDT. It also supports **Run workflow** in GitHub Actions and runs when the sync code or editorial file changes. GitHub may queue scheduled runs after the requested minute. It uses the existing `YOUTUBE_API_KEY` secret and playlist `PLWy7yBFqtc6o`; no API key goes into the browser.

The script paginates the full playlist and fetches video details in batches, producing a full `episodes` collection alongside featured and recent records. Private/unlisted, upcoming and active streams are excluded, so the Saturday sync publishes completed public episodes only; Wednesday's unlisted premiere requires a separate Projector record in the Phase 1 Viewing Room. A failed or empty sync preserves the previous data. Playlist order determines the featured episode unless an episode has `featured: true`. Removed/ineligible videos disappear on a successful sync. Unchanged data does not create another commit. After syncing, the workflow explicitly requests a GitHub Pages rebuild, because bot commits do not automatically publish Pages.

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

## Phase 1 Viewing Room — agreed scope, still to implement

Video hosting: use an unlisted YouTube video embedded on KIPG for Wednesday's site-first watch event, then make the same video public afterward (original target: Thursday). Unlisted links are shareable, so this is not strict website-only access. Keep the video out of the public playlist until public release. Projector identifies the scheduled video independently of the public episode-library sync. Scheduled playback and late-join positioning require implementation and browser testing.

Chat is an independent KIPG system, not embedded YouTube chat. It must include desktop/mobile presentation, moderator message removal, timeouts/bans and automatic filtering. Live chat requirement: the Wednesday room opens at 6:45 PM America/New_York, fifteen minutes before the 7 PM show. Chat is available during the live viewing window only, with a moderator control to close it after the show. Anyone may watch; sign-in is recommended for posting. Desktop chat sits beside the video; on phones it sits below. Server-side schedule enforcement, moderation and rate limits are required.

Still to implement: scheduled site-first premieres, accounts, live chat, moderation, email signup/reminders and private prayer delivery. No signup or prayer form currently pretends to collect submissions. The Wednesday calendar event is a single reminder for the next show, not a claim that a premiere is already live.

Beautification is the final Phase 1 step, after the Viewing Room, chat and other launch functionality work.

## Verification

Run `npm run verify` for required files, imports and asset links. Browser QA could not run in this environment because Chromium is unavailable. A browser verification script was prepared for playback selection, search, topics, recovery, calendar download, mobile navigation and theme preference. Schedule calculations are checked around daylight-saving transitions.

## Viewing Room foundation — Theater 1 / Projector 1

`pages/live.html` is the responsive room display. `data/viewing-rooms.json` gives each room its own projector and optional session. The initial public room has no session: no episode has been supplied for the first rehearsal. The room is linked from primary navigation.

The room reads `session.id`, `videoId`, `title`, `startsAt`, optional `opensAt`, `durationSeconds`, optional `endedAt`, and `summary`. UTC ISO timestamps identify absolute times; the UI shows America/New_York. Lobby, playing and ended phases share a single clock calculation. The published schedule is polled every 15 seconds. Video playback requires a viewer gesture; late joins seek to the current session position. “Return to the room’s position” resynchronizes a paused player. These are watch-party controls, not guaranteed frame-accurate synchronization or restricted video access. The API-reported video duration replaces the estimated duration once available in a loaded player.

`pages/projector.html` provides clearly labeled browser-only Play Now and Schedule rehearsals, with up to 20 locally saved video choices. Rehearsal links depend on browser-local storage and are not invitations for other viewers. They cannot start or modify the published room. The public schedule can currently be changed through the repository JSON; authenticated shared host controls remain to build. No public admin button changes global state, and no credentials are embedded.

Chat is a reserved, responsive panel, not a functioning messaging service. Its state follows the shared session lobby/end window and does not follow an individual pause or browser close. Server enforcement must mirror these boundaries when the backend is connected. Required next: accounts, host authorization, a trusted session clock, shared Play Now/Schedule writes, realtime chat, moderator roles, bans/timeouts, spam filtering, and server-side session-end checks. Future social/private chat rooms are outside this implementation. Theater/projector IDs allow later expansion without claiming additional rooms are already available.

Run `node --test scripts/room-state.test.mjs` for the room boundary, timing, early-end, URL validation and EST/EDT checks. A real unlisted video and a multi-user rehearsal are required before launch. Beautification remains last.

Local Chromium installation failed, but cloud-browser verification succeeded on the published site: Theater 1 loaded, navigation reached Projector 1, Play Now created a browser-only rehearsal, and Join the show loaded Episode 14 in the YouTube player with active playback/captions and the catch-up control. Desktop layout was visually inspected. GitHub's Viewing Room checks and Pages deployment passed. Mobile-device and multi-user/backend verification remain required before launch.

### Theater 1 functional rehearsal update

Projector 1 now has collapsible browser rehearsal controls directly in the room. Paste a YouTube link, set title/duration, then use Play Now or Schedule. These are local test controls, not authenticated administration. Video file uploads still require a video-storage service.

The conversation sidebar has a bounded scrolling viewport and an anchored composer. Rehearsal messages render safely as text, newest at the bottom, with Enter to send and Shift+Enter for a line break; scrolling back preserves the reader’s position and shows a New messages button. Messages are stored only in this browser and capped at 100 per rehearsal. Posting opens in the lobby/playing phases and closes at the session end. Public posting remains disabled until a shared backend and sign-in/moderation are implemented.

### Viewer sizing controls
Desktop chat height now matches the video screen itself, excluding controls and program details. Expand video collapses chat to a narrow Show chat rail while preserving the player and messages. Fullscreen video uses the browser Fullscreen API on the screen only; Escape or Exit fullscreen returns to the room. Mobile keeps a practical separate chat height and can hide chat using the same toggle.

If native fullscreen is declined or unsupported, the video fills the browser viewport instead; Exit fullscreen or Escape restores the room.

### Aligned viewing cards
Chat now matches the complete video card, including the viewer button row. A ResizeObserver follows the video card height as controls wrap or the video expands. On the projector is a separate full-width card beneath the viewing row, separated by the same spacing as the two viewing cards. Player notices sit below that row rather than changing its alignment.
