CREATE TABLE IF NOT EXISTS shows (
  broadcast_id TEXT PRIMARY KEY,
  handle       TEXT NOT NULL,
  show_name    TEXT,
  start_ts     INTEGER,
  end_ts       INTEGER,
  duration     INTEGER,
  listeners    INTEGER,
  mp3_url      TEXT,
  wav_url      TEXT,
  first_seen   INTEGER,
  last_seen    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shows_handle ON shows(handle);
CREATE INDEX IF NOT EXISTS idx_shows_start ON shows(start_ts);
