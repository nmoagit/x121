-- PRD-123: Scene Catalog & Scene Types Unification
-- Step 3: Migrate project_scene_settings FK from scene_catalog_id to scene_type_id.

-- 1. Add the new FK column.
ALTER TABLE project_scene_settings
    ADD COLUMN scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE;

-- 2. Backfill from the mapping table.
UPDATE project_scene_settings pss
SET scene_type_id = m.scene_type_id
FROM _scene_catalog_to_scene_type_map m
WHERE pss.scene_catalog_id = m.scene_catalog_id;

-- 3. Delete orphans (rows whose scene_catalog_id had no mapping).
DELETE FROM project_scene_settings WHERE scene_type_id IS NULL;

-- 4. Make the column NOT NULL now that all rows have values.
ALTER TABLE project_scene_settings
    ALTER COLUMN scene_type_id SET NOT NULL;

-- 5. Drop old FK constraint.
ALTER TABLE project_scene_settings
    DROP CONSTRAINT project_scene_settings_scene_catalog_id_fkey;

-- Drop old unique index and regular index.
DROP INDEX IF EXISTS uq_project_scene_settings_project_scene;
DROP INDEX IF EXISTS idx_project_scene_settings_scene_catalog_id;

-- Drop the old column.
ALTER TABLE project_scene_settings
    DROP COLUMN scene_catalog_id;

-- 6. Add new unique constraint and index.
ALTER TABLE project_scene_settings
    ADD CONSTRAINT uq_project_scene_settings_project_scene_type
    UNIQUE (project_id, scene_type_id);

CREATE INDEX idx_project_scene_settings_scene_type_id
    ON project_scene_settings (scene_type_id);
