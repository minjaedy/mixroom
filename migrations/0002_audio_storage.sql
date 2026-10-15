CREATE TABLE audio_objects (
  key TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id),
  expected_bytes INTEGER NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','ready','deleting')),
  created_at INTEGER NOT NULL
);
CREATE TABLE audio_parts (
  object_key TEXT NOT NULL REFERENCES audio_objects(key) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  kv_key TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY(object_key,part_number)
);
CREATE INDEX idx_audio_project ON audio_objects(project_id);
