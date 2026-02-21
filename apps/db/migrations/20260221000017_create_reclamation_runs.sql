-- Reclamation run history (PRD-15).
--
-- Each cleanup operation (manual or scheduled) is logged as a reclamation
-- run with statistics on scanned, marked, and deleted files.

CREATE TABLE reclamation_runs (
    id              BIGSERIAL    PRIMARY KEY,
    run_type        TEXT         NOT NULL,
    policy_id       BIGINT       REFERENCES reclamation_policies(id) ON DELETE SET NULL,
    project_id      BIGINT       REFERENCES projects(id) ON DELETE SET NULL,
    files_scanned   INT          NOT NULL DEFAULT 0,
    files_marked    INT          NOT NULL DEFAULT 0,
    files_deleted   INT          NOT NULL DEFAULT 0,
    bytes_reclaimed BIGINT       NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON reclamation_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_reclamation_runs_policy_id ON reclamation_runs (policy_id);
CREATE INDEX idx_reclamation_runs_project_id ON reclamation_runs (project_id);
CREATE INDEX idx_reclamation_runs_started_at ON reclamation_runs (started_at);
