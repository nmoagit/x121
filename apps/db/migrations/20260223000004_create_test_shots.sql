-- PRD-58: Scene Preview & Quick Test
-- Creates the test_shots table for storing quick test/preview renders.

CREATE TABLE test_shots (
    id BIGSERIAL PRIMARY KEY,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    workflow_id BIGINT REFERENCES workflows(id) ON DELETE SET NULL ON UPDATE CASCADE,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    seed_image_path TEXT NOT NULL,
    output_video_path TEXT,
    last_frame_path TEXT,
    duration_secs DOUBLE PRECISION,
    quality_score DOUBLE PRECISION,
    is_promoted BOOLEAN NOT NULL DEFAULT false,
    promoted_to_scene_id BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_shots_scene_type_id ON test_shots(scene_type_id);
CREATE INDEX idx_test_shots_character_id ON test_shots(character_id);
CREATE INDEX idx_test_shots_created_by_id ON test_shots(created_by_id);
CREATE INDEX idx_test_shots_promoted_to_scene_id ON test_shots(promoted_to_scene_id) WHERE promoted_to_scene_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON test_shots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
