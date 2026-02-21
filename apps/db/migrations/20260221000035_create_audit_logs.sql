-- Append-only audit log table (PRD-45).
--
-- Captures all user and system actions in an immutable, tamper-resistant log.
-- No updated_at column (immutable records). No update trigger.
-- UPDATE and DELETE are blocked by application-level triggers.

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    session_id      TEXT,
    action_type     TEXT NOT NULL,
    entity_type     TEXT,
    entity_id       BIGINT,
    details_json    JSONB,
    ip_address      TEXT,
    user_agent      TEXT,
    integrity_hash  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns.
CREATE INDEX idx_audit_logs_timestamp   ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user_id     ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_entity      ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_session_id  ON audit_logs(session_id);

-- GIN index on details_json for JSON content search.
CREATE INDEX idx_audit_logs_details_gin ON audit_logs USING gin(details_json);

-- Prevent modifications to audit log entries at the database level.
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit_logs
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER no_delete_audit_logs
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
