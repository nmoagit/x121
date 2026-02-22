-- PRD-49: Automated Quality Gates — quality_scores table
--
-- Stores per-segment QA check results with score, status, and threshold context.

CREATE TABLE IF NOT EXISTS quality_scores (
    id          BIGSERIAL PRIMARY KEY,
    segment_id  BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type  TEXT NOT NULL,
    score       DOUBLE PRECISION NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
    details     JSONB,
    threshold_used DOUBLE PRECISION,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_scores_segment_id ON quality_scores(segment_id);
CREATE INDEX idx_quality_scores_check_type ON quality_scores(check_type);
CREATE INDEX idx_quality_scores_status     ON quality_scores(status);

CREATE TRIGGER trg_quality_scores_updated_at
    BEFORE UPDATE ON quality_scores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
