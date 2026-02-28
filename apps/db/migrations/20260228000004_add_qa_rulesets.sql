-- PRD-091: Custom QA Rulesets per Scene Type
-- QA profiles (named threshold bundles) + scene-type QA overrides.

-- 1. QA profiles table
CREATE TABLE qa_profiles (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    thresholds  JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_builtin  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_qa_profiles_updated_at
    BEFORE UPDATE ON qa_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed built-in profiles
INSERT INTO qa_profiles (name, description, thresholds, is_builtin) VALUES
    ('high_motion', 'Relaxed face confidence, strict motion continuity',
     '{"face_confidence": {"warn": 0.55, "fail": 0.35}, "motion": {"warn": 0.8, "fail": 0.6}}', true),
    ('portrait', 'Strict face confidence, relaxed motion',
     '{"face_confidence": {"warn": 0.85, "fail": 0.7}, "motion": {"warn": 0.4, "fail": 0.2}}', true),
    ('transition', 'Relaxed overall, strict boundary SSIM',
     '{"boundary_ssim": {"warn": 0.9, "fail": 0.8}}', true);

-- 2. Scene type QA overrides table
CREATE TABLE scene_type_qa_overrides (
    id                BIGSERIAL PRIMARY KEY,
    scene_type_id     BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    qa_profile_id     BIGINT REFERENCES qa_profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    custom_thresholds JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_scene_type_qa_overrides_scene_type ON scene_type_qa_overrides(scene_type_id);
CREATE INDEX idx_scene_type_qa_overrides_profile ON scene_type_qa_overrides(qa_profile_id);

CREATE TRIGGER trg_scene_type_qa_overrides_updated_at
    BEFORE UPDATE ON scene_type_qa_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
