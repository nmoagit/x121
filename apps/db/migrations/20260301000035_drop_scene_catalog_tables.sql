-- PRD-123: Scene Catalog & Scene Types Unification
-- Step 5: Drop old tables and temporary mapping table.

-- Order matters: drop dependents first.
DROP TABLE IF EXISTS scene_catalog_tracks;
DROP TABLE IF EXISTS scene_catalog CASCADE;
DROP TABLE IF EXISTS _scene_catalog_to_scene_type_map;
