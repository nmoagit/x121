-- Failure pattern tracking table (PRD-64).
--
-- Correlates quality gate failures with generation parameter combinations
-- (workflow, LoRA, character, scene type, segment position) to surface
-- recurring failure patterns for institutional learning.

CREATE TABLE failure_patterns (
    id                        BIGSERIAL PRIMARY KEY,
    pattern_key               TEXT NOT NULL UNIQUE,
    description               TEXT,
    dimension_workflow_id     BIGINT REFERENCES workflows(id) ON DELETE SET NULL ON UPDATE CASCADE,
    dimension_lora_id         BIGINT,
    dimension_character_id    BIGINT REFERENCES characters(id) ON DELETE SET NULL ON UPDATE CASCADE,
    dimension_scene_type_id   BIGINT REFERENCES scene_types(id) ON DELETE SET NULL ON UPDATE CASCADE,
    dimension_segment_position TEXT,
    failure_count             INTEGER NOT NULL DEFAULT 0,
    total_count               INTEGER NOT NULL DEFAULT 0,
    failure_rate              DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    severity                  TEXT NOT NULL DEFAULT 'low',
    last_occurrence           TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_failure_patterns_dimension_workflow_id ON failure_patterns(dimension_workflow_id);
CREATE INDEX idx_failure_patterns_severity ON failure_patterns(severity);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON failure_patterns
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
