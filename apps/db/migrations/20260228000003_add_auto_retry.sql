-- PRD-071: Smart Auto-Retry
-- Retry attempts tracking + retry policy columns on scene_types.

-- 1. Retry attempts table
CREATE TABLE retry_attempts (
    id                  BIGSERIAL PRIMARY KEY,
    segment_id          BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    attempt_number      INTEGER NOT NULL,
    seed                BIGINT NOT NULL,
    parameters          JSONB NOT NULL DEFAULT '{}'::jsonb,
    original_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_video_path   TEXT,
    quality_scores      JSONB,
    overall_status      TEXT NOT NULL DEFAULT 'pending',
    is_selected         BOOLEAN NOT NULL DEFAULT false,
    gpu_seconds         DOUBLE PRECISION,
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_retry_attempts_segment_id ON retry_attempts(segment_id);
CREATE INDEX idx_retry_attempts_segment_status ON retry_attempts(segment_id, overall_status);

-- Unique constraint: one attempt number per segment
ALTER TABLE retry_attempts
    ADD CONSTRAINT uq_retry_attempts_segment_attempt
    UNIQUE (segment_id, attempt_number);

-- Status check constraint
ALTER TABLE retry_attempts
    ADD CONSTRAINT ck_retry_attempts_status
    CHECK (overall_status IN ('pending', 'generating', 'qa_running', 'passed', 'failed', 'selected'));

CREATE TRIGGER trg_retry_attempts_updated_at
    BEFORE UPDATE ON retry_attempts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Auto-retry policy columns on scene_types
ALTER TABLE scene_types
    ADD COLUMN auto_retry_enabled       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN auto_retry_max_attempts  INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN auto_retry_trigger_checks TEXT[] DEFAULT '{face_confidence}',
    ADD COLUMN auto_retry_seed_variation BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN auto_retry_cfg_jitter    DOUBLE PRECISION DEFAULT 0.5;

-- Constraint: max attempts must be between 1 and 10
ALTER TABLE scene_types
    ADD CONSTRAINT ck_scene_types_retry_max_attempts
    CHECK (auto_retry_max_attempts BETWEEN 1 AND 10);
