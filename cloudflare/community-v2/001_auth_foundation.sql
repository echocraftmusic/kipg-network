-- KIPG Community Cloudflare staging auth foundation.
-- Private D1 only. Public browser access must go through an authenticated Worker.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS login_requests (
  id TEXT PRIMARY KEY NOT NULL,
  email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('signup','signin')),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  newsletter_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (newsletter_opt_in IN (0,1)),
  guidelines_accepted_at TEXT,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  request_ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_requests_email_time ON login_requests(email_normalized,requested_at);
CREATE INDEX IF NOT EXISTS idx_login_requests_expiry ON login_requests(expires_at);

CREATE TABLE IF NOT EXISTS member_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_member_sessions_member ON member_sessions(member_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_member_sessions_expiry ON member_sessions(expires_at);

CREATE TABLE IF NOT EXISTS blocked_username_terms (
  term TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  category TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO blocked_username_terms(term,category) VALUES
  ('admin','reserved'),('administrator','reserved'),('moderator','reserved'),('modteam','reserved'),
  ('kipg','reserved'),('kipgnetwork','reserved'),('staff','reserved'),('support','reserved'),
  ('official','reserved'),('owner','reserved'),('host','reserved'),
  ('fuck','profanity'),('shit','profanity'),('bitch','profanity'),('cunt','profanity'),
  ('asshole','profanity'),('bastard','profanity'),('motherfucker','profanity'),
  ('whore','sexual'),('slut','sexual'),('dick','sexual'),('cock','sexual'),('pussy','sexual'),
  ('porn','sexual'),('porno','sexual'),('xxx','sexual'),('nude','sexual'),('naked','sexual'),
  ('hentai','sexual'),('onlyfans','sexual'),('blowjob','sexual'),('handjob','sexual'),('sexual','sexual'),
  ('nigger','hate'),('nigga','hate'),('faggot','hate'),('nazi','hate'),('kkk','hate'),
  ('evil','provocative'),('satan','provocative'),('satanic','provocative'),('lucifer','provocative'),
  ('devil','provocative'),('demon','provocative'),
  ('trump','political'),('maga','political'),('biden','political'),('harris','political'),
  ('obama','political'),('desantis','political'),('democrat','political'),
  ('republican','political'),('potus','political'),('president','political');

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);
