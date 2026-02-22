-- Migration 000069: job_debug_state table for interactive debugger (PRD-34).
--
-- Stores mid-run debug state for paused jobs: which step they paused at,
-- any modified parameters, intermediate preview data, and abort reasons.

CREATE TABLE job_debug_state (
    id              BIGSERIAL    PRIMARY KEY,
    job_id          BIGINT       NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    paused_at_step  INTEGER,
    modified_params JSONB        NOT NULL DEFAULT '{}',
    intermediate_previews JSONB  NOT NULL DEFAULT '[]',
    abort_reason    TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_job_debug_state_job_id ON job_debug_state(job_id);
CREATE INDEX idx_job_debug_state_job_id ON job_debug_state(job_id);

CREATE TRIGGER trg_job_debug_state_updated_at
    BEFORE UPDATE ON job_debug_state
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
