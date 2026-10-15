-- Existing audio remains in the original database; new uploads use four shards.
ALTER TABLE audio_objects ADD COLUMN layout INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_versions_retention ON versions(deleted_at,created_at);
CREATE INDEX idx_messages_retention ON messages(created_at);
