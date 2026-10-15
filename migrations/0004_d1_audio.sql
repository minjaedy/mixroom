-- Replace the unused KV manifest with D1-owned audio chunks.
-- No uploaded customer files existed in the retired deployment.
CREATE TABLE audio_chunks (
  object_key TEXT NOT NULL REFERENCES audio_objects(key) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  hash TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(object_key, part_number)
);
ALTER TABLE versions ADD COLUMN deleted_at INTEGER;
CREATE TABLE realtime_outbox(id TEXT PRIMARY KEY, revision TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_expired_uploads ON uploads(created_at);
