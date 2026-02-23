-- Pipeline Stage Hooks (PRD-77): hook execution logs table.
-- Execution logs are immutable -- no updated_at column or trigger.

CREATE TABLE hook_execution_logs (
    id            BIGSERIAL    PRIMARY KEY,
    hook_id       BIGINT       NOT NULL REFERENCES hooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    job_id        BIGINT       REFERENCES jobs(id) ON DELETE SET NULL ON UPDATE CASCADE,
    input_json    JSONB,
    output_text   TEXT,
    exit_code     INTEGER,
    duration_ms   BIGINT,
    success       BOOLEAN      NOT NULL,
    error_message TEXT,
    executed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hook_execution_logs_hook_id     ON hook_execution_logs(hook_id);
CREATE INDEX idx_hook_execution_logs_job_id      ON hook_execution_logs(job_id);
CREATE INDEX idx_hook_execution_logs_executed_at  ON hook_execution_logs(executed_at);
