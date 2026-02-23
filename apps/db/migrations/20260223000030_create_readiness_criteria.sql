-- PRD-107: Character Readiness & State View
-- Configurable readiness criteria: studio-level default or project-level override.

CREATE TABLE readiness_criteria (
    id BIGSERIAL PRIMARY KEY,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('studio', 'project')),
    scope_id BIGINT,  -- NULL for studio scope, project_id for project scope
    criteria_json JSONB NOT NULL DEFAULT '{}',
    -- criteria_json format:
    -- {
    --   "required_fields": {
    --     "source_image": true,
    --     "approved_variant": true,
    --     "metadata_complete": true,
    --     "settings": ["a2c4_model", "elevenlabs_voice", "avatar_json"]
    --   }
    -- }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_readiness_criteria_scope
    ON readiness_criteria(scope_type, COALESCE(scope_id, 0));

CREATE TRIGGER trg_readiness_criteria_updated_at
    BEFORE UPDATE ON readiness_criteria
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed studio-level default criteria.
INSERT INTO readiness_criteria (scope_type, scope_id, criteria_json) VALUES
    ('studio', NULL, '{"required_fields": {"source_image": true, "approved_variant": true, "metadata_complete": true, "settings": ["a2c4_model", "elevenlabs_voice", "avatar_json"]}}');
