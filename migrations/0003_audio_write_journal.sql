-- Retain cleanup intent if a Worker is interrupted between KV and D1 writes.
CREATE TABLE audio_pending_writes(kv_key TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
