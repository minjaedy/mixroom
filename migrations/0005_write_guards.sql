-- A request that authenticated just before closure must not recreate deleted data.
CREATE TRIGGER guard_versions_insert BEFORE INSERT ON versions
WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND status='active')
BEGIN SELECT RAISE(ABORT,'PROJECT_CLOSED'); END;
CREATE TRIGGER guard_uploads_insert BEFORE INSERT ON uploads
WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND status='active')
BEGIN SELECT RAISE(ABORT,'PROJECT_CLOSED'); END;
CREATE TRIGGER guard_requests_insert BEFORE INSERT ON requests
WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM versions WHERE id=NEW.version_id AND project_id=NEW.project_id AND deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'PROJECT_OR_VERSION_CLOSED'); END;
CREATE TRIGGER guard_messages_insert BEFORE INSERT ON messages
WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND status='active')
BEGIN SELECT RAISE(ABORT,'PROJECT_CLOSED'); END;
CREATE TRIGGER guard_notifications_insert BEFORE INSERT ON notifications
WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND status IN ('active','completed'))
BEGIN SELECT RAISE(ABORT,'PROJECT_CLOSED'); END;
DROP TABLE audio_pending_writes;
DROP TABLE audio_parts;
