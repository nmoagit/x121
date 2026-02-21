-- Execution status lookup and script execution log for the Multi-Runtime
-- Script Orchestrator (PRD-09).
--
-- execution_statuses  -- lookup table: pending, running, completed, failed, timeout
-- script_executions   -- per-run log with input/output data, stdout/stderr,
--                       exit code, duration, and optional job association

--------------------------------------------------------------------------------
-- execution_statuses: lookup table for script execution lifecycle states
--------------------------------------------------------------------------------

CREATE TABLE execution_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    label      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_execution_statuses_updated_at
    BEFORE UPDATE ON execution_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO execution_statuses (name, label) VALUES
    ('pending',   'Pending'),
    ('running',   'Running'),
    ('completed', 'Completed'),
    ('failed',    'Failed'),
    ('timeout',   'Timeout');

--------------------------------------------------------------------------------
-- script_executions: tracks every invocation of a registered script
--
-- Each row records the full context of a single script run: which script, who
-- triggered it, the input/output data, captured stdout/stderr, exit code,
-- wall-clock duration, and timing information. The optional job_id column
-- associates the execution with a pipeline job once the jobs table is created
-- (PRD-07/08); no FK constraint is added yet.
--------------------------------------------------------------------------------

CREATE TABLE script_executions (
    id            BIGSERIAL   PRIMARY KEY,
    script_id     BIGINT      NOT NULL REFERENCES scripts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    -- NOTE: No FK to jobs table -- it does not exist yet (PRD-07/08).
    -- A future migration will add the constraint once the jobs table is created.
    job_id        BIGINT,
    triggered_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    status_id     SMALLINT    NOT NULL REFERENCES execution_statuses(id) DEFAULT 1,
    input_data    JSONB,
    output_data   JSONB,
    stdout_log    TEXT,
    stderr_log    TEXT,
    exit_code     INTEGER,
    duration_ms   INTEGER,
    error_message TEXT,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes.
CREATE INDEX idx_script_executions_script_id    ON script_executions(script_id);
CREATE INDEX idx_script_executions_job_id       ON script_executions(job_id);
CREATE INDEX idx_script_executions_triggered_by ON script_executions(triggered_by);
CREATE INDEX idx_script_executions_status_id    ON script_executions(status_id);

CREATE TRIGGER trg_script_executions_updated_at
    BEFORE UPDATE ON script_executions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
