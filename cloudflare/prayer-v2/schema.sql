-- KIPG Prayer 2.0 / Cloudflare D1 (metadata ONLY).
-- Sensitive names, email addresses and prayer content live in AES-256-GCM encrypted R2 objects.
-- Apply manually to a private D1 database before binding the new Worker.
CREATE TABLE IF NOT EXISTS prayer_requests (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','prayed','follow_up','closed')),
  wants_follow_up INTEGER NOT NULL CHECK (wants_follow_up IN (0,1)),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS prayer_requests_status_received ON prayer_requests(status,received_at);
-- No browser, public search, or unauthenticated read of this D1 database is permitted.
-- Administrative access is intentionally NOT exposed by the submission Worker.
