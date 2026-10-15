ALTER TABLE uploads ADD COLUMN uploaded_by TEXT NOT NULL DEFAULT 'engineer';
ALTER TABLE versions ADD COLUMN uploaded_by TEXT NOT NULL DEFAULT 'engineer';
