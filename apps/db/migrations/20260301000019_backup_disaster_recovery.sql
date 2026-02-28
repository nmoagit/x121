-- PRD-81: Backup & Disaster Recovery
--
-- backups: records of backup operations with type, destination, status,
-- verification state, and retention expiration.
--
-- backup_schedules: cron-based schedule configurations for automated backups
-- with retention policies and enable/disable toggles.

-- ---------------------------------------------------------------------------
-- backups
-- ---------------------------------------------------------------------------

CREATE TABLE backups (
    id                       BIGSERIAL    PRIMARY KEY,
    backup_type              TEXT         NOT NULL CHECK (backup_type IN ('full', 'incremental', 'config', 'wal')),
    destination              TEXT         NOT NULL,
    file_path                TEXT,
    size_bytes               BIGINT,
    status                   TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'verified')),
    started_at               TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,
    verified                 BOOLEAN      NOT NULL DEFAULT false,
    verified_at              TIMESTAMPTZ,
    verification_result_json JSONB,
    error_message            TEXT,
    triggered_by             TEXT         NOT NULL DEFAULT 'schedule' CHECK (triggered_by IN ('schedule', 'manual', 'system')),
    retention_expires_at     TIMESTAMPTZ,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backups_status       ON backups(status);
CREATE INDEX idx_backups_backup_type  ON backups(backup_type);
CREATE INDEX idx_backups_completed_at ON backups(completed_at);

CREATE TRIGGER set_updated_at_backups BEFORE UPDATE ON backups
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- backup_schedules
-- ---------------------------------------------------------------------------

CREATE TABLE backup_schedules (
    id              BIGSERIAL    PRIMARY KEY,
    backup_type     TEXT         NOT NULL CHECK (backup_type IN ('full', 'incremental', 'config')),
    cron_expression TEXT         NOT NULL,
    destination     TEXT         NOT NULL,
    retention_days  INTEGER      NOT NULL DEFAULT 30,
    enabled         BOOLEAN      NOT NULL DEFAULT true,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backup_schedules_next_run ON backup_schedules(next_run_at, enabled);

CREATE TRIGGER set_updated_at_backup_schedules BEFORE UPDATE ON backup_schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
