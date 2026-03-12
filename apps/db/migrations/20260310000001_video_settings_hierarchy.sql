-- Hierarchical video settings: Scene Type -> Project -> Group -> Character
-- Each level can override duration, fps, and resolution.

-- Add fps + resolution columns to scene_types (duration already exists as target_duration_secs)
ALTER TABLE scene_types
  ADD COLUMN IF NOT EXISTS target_fps INTEGER,
  ADD COLUMN IF NOT EXISTS target_resolution VARCHAR(20);

-- Set defaults: all scene types get 720p, 30fps, 16s (Idle gets 30s)
UPDATE scene_types SET target_fps = 30, target_resolution = '720p', target_duration_secs = 16
  WHERE target_duration_secs IS NULL OR target_fps IS NULL;
UPDATE scene_types SET target_duration_secs = 30 WHERE LOWER(name) = 'idle';

-- Project video settings overrides
CREATE TABLE IF NOT EXISTS project_video_settings (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    target_duration_secs  INTEGER,
    target_fps            INTEGER,
    target_resolution     VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_video_settings ON project_video_settings(project_id, scene_type_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_video_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Group video settings overrides
CREATE TABLE IF NOT EXISTS group_video_settings (
    id              BIGSERIAL PRIMARY KEY,
    group_id        BIGINT NOT NULL REFERENCES character_groups(id) ON DELETE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    target_duration_secs  INTEGER,
    target_fps            INTEGER,
    target_resolution     VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_video_settings ON group_video_settings(group_id, scene_type_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON group_video_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Character video settings overrides
CREATE TABLE IF NOT EXISTS character_video_settings (
    id              BIGSERIAL PRIMARY KEY,
    character_id    BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    target_duration_secs  INTEGER,
    target_fps            INTEGER,
    target_resolution     VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_character_video_settings ON character_video_settings(character_id, scene_type_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON character_video_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
