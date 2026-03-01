-- PRD-123: Scene Catalog & Scene Types Unification
-- Step 4: Migrate character_scene_overrides FK from scene_catalog_id to scene_type_id.

-- 1. Add the new FK column.
ALTER TABLE character_scene_overrides
    ADD COLUMN scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE;

-- 2. Backfill from the mapping table.
UPDATE character_scene_overrides cso
SET scene_type_id = m.scene_type_id
FROM _scene_catalog_to_scene_type_map m
WHERE cso.scene_catalog_id = m.scene_catalog_id;

-- 3. Delete orphans.
DELETE FROM character_scene_overrides WHERE scene_type_id IS NULL;

-- 4. Make the column NOT NULL.
ALTER TABLE character_scene_overrides
    ALTER COLUMN scene_type_id SET NOT NULL;

-- 5. Drop old FK constraint.
ALTER TABLE character_scene_overrides
    DROP CONSTRAINT character_scene_overrides_scene_catalog_id_fkey;

-- Drop old unique index and regular index.
DROP INDEX IF EXISTS uq_character_scene_overrides_character_scene;
DROP INDEX IF EXISTS idx_character_scene_overrides_scene_catalog_id;

-- Drop the old column.
ALTER TABLE character_scene_overrides
    DROP COLUMN scene_catalog_id;

-- 6. Add new unique constraint and index.
ALTER TABLE character_scene_overrides
    ADD CONSTRAINT uq_character_scene_overrides_character_scene_type
    UNIQUE (character_id, scene_type_id);

CREATE INDEX idx_character_scene_overrides_scene_type_id
    ON character_scene_overrides (scene_type_id);
