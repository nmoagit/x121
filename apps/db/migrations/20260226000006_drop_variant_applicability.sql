-- PRD-111: Scene Catalog & Track Management
-- Drop variant_applicability column, replaced by the tracks system
-- (scene_catalog_tracks many-to-many replaces the hardcoded string column)

ALTER TABLE scene_types DROP COLUMN variant_applicability;
