-- PRD-43: System Integrity & Repair Tools — integrity_scans table
--
-- Stores results of system integrity scans (model verification, node checks,
-- full system scans) triggered by admins or automated processes.

CREATE TABLE IF NOT EXISTS integrity_scans (
    id                BIGSERIAL PRIMARY KEY,
    worker_id         BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scan_type         TEXT NOT NULL CHECK (scan_type IN ('models', 'nodes', 'full')),
    status_id         SMALLINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    results_json      JSONB,
    models_found      INTEGER NOT NULL DEFAULT 0,
    models_missing    INTEGER NOT NULL DEFAULT 0,
    models_corrupted  INTEGER NOT NULL DEFAULT 0,
    nodes_found       INTEGER NOT NULL DEFAULT 0,
    nodes_missing     INTEGER NOT NULL DEFAULT 0,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    triggered_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integrity_scans_worker_id ON integrity_scans(worker_id);
CREATE INDEX idx_integrity_scans_status_id ON integrity_scans(status_id);
CREATE INDEX idx_integrity_scans_triggered_by ON integrity_scans(triggered_by);

CREATE TRIGGER trg_integrity_scans_updated_at
    BEFORE UPDATE ON integrity_scans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
