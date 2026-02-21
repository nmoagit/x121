-- Restart status lookup and restart logs for worker service restarts (PRD-06).

--------------------------------------------------------------------------------
-- restart_statuses: lookup table for restart lifecycle states
--------------------------------------------------------------------------------

CREATE TABLE restart_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    label      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_restart_statuses_updated_at
    BEFORE UPDATE ON restart_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO restart_statuses (name, label) VALUES
    ('initiated',  'Initiated'),
    ('stopping',   'Stopping'),
    ('restarting', 'Restarting'),
    ('completed',  'Completed'),
    ('failed',     'Failed');

--------------------------------------------------------------------------------
-- restart_logs: tracks each service restart request and its outcome
--------------------------------------------------------------------------------

CREATE TABLE restart_logs (
    id            BIGSERIAL   PRIMARY KEY,
    worker_id     BIGINT      NOT NULL,
    service_name  TEXT        NOT NULL,
    initiated_by  BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id     SMALLINT    NOT NULL REFERENCES restart_statuses(id) DEFAULT 1,
    reason        TEXT,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No FK on worker_id — the workers table (PRD-46) does not exist yet.

-- FK indexes.
CREATE INDEX idx_restart_logs_worker_id    ON restart_logs(worker_id);
CREATE INDEX idx_restart_logs_initiated_by ON restart_logs(initiated_by);
CREATE INDEX idx_restart_logs_status_id    ON restart_logs(status_id);

CREATE TRIGGER trg_restart_logs_updated_at
    BEFORE UPDATE ON restart_logs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
