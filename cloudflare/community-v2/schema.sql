-- KIPG Community on Cloudflare D1 — STAGING SCHEMA ONLY.
-- No database has been created or connected by committing this file.
-- Access ALL tables exclusively through an authenticated Worker; D1 has no browser connection.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  email_verified_at TEXT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  newsletter_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (newsletter_opt_in IN (0,1)),
  newsletter_consent_at TEXT,
  suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0,1)),
  muted_until TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- IMPORTANT: membership and staff privileges can only be created/changed server-side.
-- No client-side role selection, and no escalation via public profile fields.
CREATE TABLE IF NOT EXISTS staff_roles (
  member_id TEXT PRIMARY KEY NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  administrator INTEGER NOT NULL DEFAULT 0 CHECK (administrator IN (0,1)),
  moderator INTEGER NOT NULL DEFAULT 0 CHECK (moderator IN (0,1)),
  projector INTEGER NOT NULL DEFAULT 0 CHECK (projector IN (0,1)),
  granted_by TEXT,
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS shows (
  id TEXT PRIMARY KEY NOT NULL,
  theater_id TEXT NOT NULL DEFAULT 'theater-1',
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  youtube_id TEXT NOT NULL CHECK (length(youtube_id) = 11),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_shows_room_time ON shows(theater_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  show_id TEXT NOT NULL REFERENCES shows(id),
  author_id TEXT NOT NULL REFERENCES members(id),
  username_snapshot TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_chat_show_time ON chat_messages(show_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_chat_author ON chat_messages(author_id, show_id);

CREATE TABLE IF NOT EXISTS moderation_incidents (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL REFERENCES members(id),
  show_id TEXT NOT NULL REFERENCES shows(id),
  message_id TEXT NOT NULL REFERENCES chat_messages(id),
  actor_id TEXT NOT NULL REFERENCES members(id),
  action TEXT NOT NULL CHECK (action IN ('hide','remove')),
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL,
  context_json TEXT NOT NULL,
  strike INTEGER,
  until_at TEXT,
  restored_at TEXT,
  reversed_at TEXT,
  reviewed_by TEXT REFERENCES members(id),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_incidents_subject ON moderation_incidents(subject_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_hide_per_show ON moderation_incidents(subject_id, show_id)
  WHERE action='hide' AND reversed_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_quarantine (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL REFERENCES moderation_incidents(id),
  PRIMARY KEY(message_id,incident_id)
);

CREATE TABLE IF NOT EXISTS security_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES members(id),
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_security_audit_time ON security_audit(occurred_at);

-- No public attendance table, count, or presence feed in this baseline.
-- Realtime messages belong in a server-authenticated Durable Object channel.
-- Authorization and shadow-hide filtering must happen before any response/broadcast.
