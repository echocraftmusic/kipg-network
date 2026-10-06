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

The room reads `session.id`, `videoId`, `title`, `startsAt`, optional `opensAt`, `durationSeconds`, optional `endedAt`, and `summary`. UTC ISO timestamps identify absolute times; the UI shows America/New_York. Lobby, playing, aftershow and ended phases share a single clock calculation. The published schedule is polled every 15 seconds. Video playback requires a viewer gesture; late joins seek to the current session position. “Return to the room’s position” resynchronizes a paused player. These are watch-party controls, not guaranteed frame-accurate synchronization or restricted video access. The API-reported video duration replaces the estimated duration once available in a loaded player.

`pages/projector.html` provides clearly labeled browser-only Play Now and Schedule rehearsals, with up to 20 locally saved video choices. Rehearsal links depend on browser-local storage and are not invitations for other viewers. They cannot start or modify the published room. The public schedule can currently be changed through the repository JSON; authenticated shared host controls remain to build. No public admin button changes global state, and no credentials are embedded.

Chat is a reserved, responsive panel, not a functioning messaging service. Its state follows the shared session lobby/end window and does not follow an individual pause or browser close. Server enforcement must mirror these boundaries when the backend is connected. Required next: accounts, host authorization, a trusted session clock, shared Play Now/Schedule writes, realtime chat, moderator roles, bans/timeouts, spam filtering, and server-side session-end checks. Future social/private chat rooms are outside this implementation. Theater/projector IDs allow later expansion without claiming additional rooms are already available.

Run `node --test scripts/room-state.test.mjs` for the room boundary, timing, early-end, URL validation and EST/EDT checks. A real unlisted video and a multi-user rehearsal are required before launch. Beautification remains last.

Local Chromium installation failed, but cloud-browser verification succeeded on the published site: Theater 1 loaded, navigation reached Projector 1, Play Now created a browser-only rehearsal, and Join the show loaded Episode 14 in the YouTube player with active playback/captions and the catch-up control. Desktop layout was visually inspected. GitHub's Viewing Room checks and Pages deployment passed. Mobile-device and multi-user/backend verification remain required before launch.

### Theater 1 functional rehearsal update

Projector 1 now has collapsible browser rehearsal controls directly in the room. Paste a YouTube link, set title/duration, then use Play Now or Schedule. These are local test controls, not authenticated administration. Video file uploads still require a video-storage service.

The conversation sidebar has a bounded scrolling viewport and an anchored composer. Rehearsal messages render safely as text, newest at the bottom, with Enter to send and Shift+Enter for a line break; scrolling back preserves the reader’s position and shows a New messages button. Messages are stored only in this browser and capped at 100 per rehearsal. Posting opens in the lobby/playing phases and remains available in the five-minute aftershow window before closing. Public posting remains disabled until a shared backend and sign-in/moderation are implemented.

### Viewer sizing controls
Desktop chat height now matches the video screen itself, excluding controls and program details. Expand video collapses chat to a narrow Show chat rail while preserving the player and messages. Fullscreen video uses the browser Fullscreen API on the screen only; Escape or Exit fullscreen returns to the room. Mobile keeps a practical separate chat height and can hide chat using the same toggle.

If native fullscreen is declined or unsupported, the video fills the browser viewport instead; Exit fullscreen or Escape restores the room.

### Aligned viewing cards
Chat now matches the complete video card, including the viewer button row. A ResizeObserver follows the video card height as controls wrap or the video expands. On the projector is a separate full-width card beneath the viewing row, separated by the same spacing as the two viewing cards. Player notices sit below that row rather than changing its alignment.

### Chat width and emoji picker
Messages now stretch across the available chat width rather than inheriting centered flex alignment; reduced horizontal padding leaves more space for long sentences. A labeled Emoji button opens a 36-choice keyboard with keyboard-accessible named buttons, Close/Escape/outside-click dismissal, insertion at the text cursor, and the same 500-character message limit. It is enabled only during the local rehearsal chat window, like the composer.

### Starting soon, live arrival and goodbye window
Play Now opens the local chat lobby immediately and schedules playback sixty seconds later. Scheduled sessions open chat fifteen minutes before the requested start; the branded Starting Soon curtain displays a countdown only in the final sixty seconds. Viewers who take their seat during the lobby join playback when the start time arrives. Late arrivals see a red Currently Live indicator above Join the show; joining removes that indicator. The room enters an aftershow phase at the shared episode end (including an explicit early end), and chat closes five minutes later. Personal pause/seek does not move that room deadline.

The eight room-state tests verify exact lobby/start/aftershow/close boundaries, final-minute countdown rules, Play Now grace, validation and Eastern timezone display. Published browser checks confirmed the countdown, early chat posting and live indicator disappearing on join. These remain browser rehearsals; shared chat, secured host controls and trusted server timing are still required.

### Community account interface
Community now shows a free-membership signup card with display name, email, password and a respectful-conversation acknowledgement, plus a Sign in view and Show/Hide password control. The interface initially shipped with registration disabled. The connection update below supersedes that initial state. No membership gate or shared chat is simulated.

`assets/js/community.js` uses the existing `window.ecSupabase` client interface when provided. Before activation, configure the project using the optional Supabase integration, load the official SDK and initialized client before this module, enable email confirmation, allow the community page as an auth redirect, configure email delivery, and test signup/verification/sign-in/sign-out on real devices. Publishable project configuration may be public; service-role keys and email credentials must never be placed in the site. Password recovery and a privacy notice still need to be completed before account launch. Display names are user-controlled metadata and must never authorize host/moderator roles. Server-verified membership and moderator permissions remain separate work for shared chat.

### Community Supabase connection
The project URL and publishable key supplied by Troy are stored in `data/community-auth.json`. The official Supabase JavaScript SDK is loaded at pinned version 2.117.2 with a verified integrity hash. The public configuration is narrowly validated by framework verification; secret keys, JWT credentials and private keys remain rejected. Project settings were checked through the public Auth API: email signup is enabled and email confirmation is required.

The account page now connects to Auth, creates email/password accounts, records display name and community-guidelines acknowledgement as user metadata, restores signed-in sessions, signs out, and supports requesting a reset email and updating a password from a recovery link. User metadata does not authorize moderators or hosts. Passwords are not stored by this page; Supabase's SDK persists its scoped session. A backend connection check keeps the form disabled if the project cannot be reached or confirmation requirements are missing.

Before public registration is announced, Troy must confirm the Auth Site URL/redirect allowlist for the community page and its recovery URL, configure custom SMTP for verification/reset emails, and complete a real inbox signup/verification/sign-in/recovery test. The publishable key cannot inspect or change those admin settings. No real member was created and no email was sent by the agent. Shared chat, host authorization, database policies and the community privacy notice remain separate launch tasks.

## Shared community connection — October 2, 2026

The community page now requests email magic links and calls the installed profile RPC after verified sign-in. It displays the persisted random username, provides a custom-name form and uses server validation rather than Auth display-name metadata. Existing password-created accounts can sign in by email link. The project's Magic Link email template must retain a confirmation link; custom SMTP and public delivery readiness still need dashboard verification.

The public Viewing Room loads Theater 1 shows from `kipg_sessions`. It uses the database's start/end timestamps for every viewer and no longer changes shared timing from an individual YouTube duration. It reads recent messages, subscribes to Realtime INSERTs, reconciles after reconnect and every 15 seconds, and disables sending when disconnected, signed out, unverified, muted, suspended, or outside the show window. Message text is rendered through textContent. Local projector rehearsals are still browser-only and do not create database events.

Live anonymous API checks found the installed schedule/message tables reachable and empty, with profiles inaccessible to anonymous callers. Framework checks, 8 room tests, 4 shared-adapter tests and 33 isolated PostgreSQL security assertions passed. No real member email was sent by the assistant. Production verified-member RPC calls and two-account Realtime delivery await Troy's test. There is currently no scheduled database show; public chat stays closed until a trusted operator creates one. Host/moderator UI and roles, automated content moderation, welcome/quarterly emails and retention rules remain unfinished.

## Room return / rehearsal sign-in correction

Troy's screenshots showed a signed-in member leaving a local rehearsal through the misleading chat sign-in link and returning to the empty public room. The member session remained signed in. Rehearsals now hide that link and explicitly say no sign-in is required. The community member button returns to the last viewing room, including a valid rehearsal UUID, via an origin/path-validated URL and tab-scoped storage. Sign-in links carry the same safe return context; callback URLs stay unchanged. Public chat also displays the saved username when closed. Back/forward-cache restoration restarts profile polling and the message subscription. Tests cover unsafe return URLs, clean callback restoration, blocked storage, and Back-button reconnection.


## Resilient Submission Requirement

KIPG must follow the Echo Craft Resilient Submission Standard documented in `docs/ECHO-CRAFT-RESILIENT-SUBMISSIONS.md` for any important user-submitted data.

Prayer requests are not yet implemented as a completed production workflow. When they are built, treat them as sensitive submissions: use protected server-side fallback storage, admin-only visibility, automatic retry, duplicate protection, and purge the recovery copy after successful synchronization. Do not route full prayer text through a generic email fallback.


## Prayer request workflow — prepared October 6, 2026

The Prayer page now has the finished Phase 1 form presentation: required first name/initial, required email, required prayer text, and a required Yes/No contact preference with no default selection. The public email subject is intentionally generic: `Prayer Request`. The message body carries the submitted name, email, contact preference and prayer request. Reply-To is set to the visitor only when they explicitly request contact.

The frontend is intentionally gated by `data/prayer-config.json` with `enabled: false` until the backend is deployed and tested. The prepared Supabase Edge Function `kipg-prayer-request` reuses the existing Resend infrastructure and delivers to `keepingitpg247@gmail.com`. It uses private temporary recovery storage, server-side validation, a honeypot/minimum-dwell check, and purges sensitive recovery fields after Resend accepts delivery. Anonymous/authenticated browser roles have no access to the recovery table.

Before turning submissions on: run migration `20261006_005_prayer_requests.sql`, deploy the Edge Function, confirm the existing `RESEND_API_KEY` secret is available to it, perform a real delivery test, then change the prayer config to `enabled: true`.
