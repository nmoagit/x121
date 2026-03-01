-- Per-track scene settings: add track_id to project_scene_settings and
-- character_scene_overrides so each (scene_type, track) pair can be
-- toggled independently.

-- =========================================================================
-- 1. project_scene_settings
-- =========================================================================

-- 1a. Add nullable column
ALTER TABLE project_scene_settings
    ADD COLUMN track_id BIGINT REFERENCES tracks(id) ON DELETE CASCADE;

-- 1b. Drop old unique constraint BEFORE inserting expanded rows (otherwise
--     the insert of a second row with same project_id+scene_type_id fails).
ALTER TABLE project_scene_settings
    DROP CONSTRAINT IF EXISTS uq_project_scene_settings_project_scene_type;

-- 1c. Expand existing rows: for each current row whose scene_type has
--     tracks in the junction table, create one row per track.
INSERT INTO project_scene_settings (project_id, scene_type_id, track_id, is_enabled, created_at, updated_at)
SELECT pss.project_id, pss.scene_type_id, stt.track_id, pss.is_enabled, pss.created_at, now()
FROM project_scene_settings pss
JOIN scene_type_tracks stt ON stt.scene_type_id = pss.scene_type_id
WHERE pss.track_id IS NULL;

-- 1d. Delete the original trackless rows (only for scene types that have tracks).
DELETE FROM project_scene_settings pss
WHERE pss.track_id IS NULL
  AND EXISTS (
      SELECT 1 FROM scene_type_tracks stt
      WHERE stt.scene_type_id = pss.scene_type_id
  );

-- 1e. Add new unique constraint with track_id. NULLS NOT DISTINCT ensures
--     (project_id, scene_type_id, NULL) is treated as a single entry (Postgres 15+).
ALTER TABLE project_scene_settings
    ADD CONSTRAINT project_scene_settings_project_scene_track_uq
        UNIQUE NULLS NOT DISTINCT (project_id, scene_type_id, track_id);

CREATE INDEX IF NOT EXISTS idx_project_scene_settings_track_id
    ON project_scene_settings (track_id);

-- =========================================================================
-- 2. character_scene_overrides
-- =========================================================================

-- 2a. Add nullable column
ALTER TABLE character_scene_overrides
    ADD COLUMN track_id BIGINT REFERENCES tracks(id) ON DELETE CASCADE;

-- 2b. Drop old unique constraint first.
ALTER TABLE character_scene_overrides
    DROP CONSTRAINT IF EXISTS uq_character_scene_overrides_character_scene_type;

-- 2c. Expand existing rows.
INSERT INTO character_scene_overrides (character_id, scene_type_id, track_id, is_enabled, created_at, updated_at)
SELECT cso.character_id, cso.scene_type_id, stt.track_id, cso.is_enabled, cso.created_at, now()
FROM character_scene_overrides cso
JOIN scene_type_tracks stt ON stt.scene_type_id = cso.scene_type_id
WHERE cso.track_id IS NULL;

-- 2d. Delete the original trackless rows.
DELETE FROM character_scene_overrides cso
WHERE cso.track_id IS NULL
  AND EXISTS (
      SELECT 1 FROM scene_type_tracks stt
      WHERE stt.scene_type_id = cso.scene_type_id
  );

-- 2e. Add new unique constraint with track_id.
ALTER TABLE character_scene_overrides
    ADD CONSTRAINT character_scene_overrides_char_scene_track_uq
        UNIQUE NULLS NOT DISTINCT (character_id, scene_type_id, track_id);

CREATE INDEX IF NOT EXISTS idx_character_scene_overrides_track_id
    ON character_scene_overrides (track_id);
