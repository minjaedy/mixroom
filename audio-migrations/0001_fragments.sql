CREATE TABLE audio_fragments (
  object_key TEXT NOT NULL,
  part_number INTEGER NOT NULL,
  hash TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(object_key,part_number)
);
-- A delayed upload must not recreate a file after it has been deleted.
CREATE TABLE audio_tombstones (object_key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX idx_audio_tombstones_expiry ON audio_tombstones(expires_at);
