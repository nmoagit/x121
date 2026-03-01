-- PRD-123: Scene Catalog & Scene Types Unification
-- Step 1: Add catalog columns to scene_types and migrate catalog data.

-- 1. Add the two columns that only exist on scene_catalog.
ALTER TABLE scene_types
    ADD COLUMN slug TEXT,
    ADD COLUMN has_clothes_off_transition BOOLEAN NOT NULL DEFAULT false;

-- 2. Create a temporary mapping table so later migrations can translate
--    scene_catalog_id FKs to scene_type_id.
CREATE TABLE _scene_catalog_to_scene_type_map (
    scene_catalog_id BIGINT NOT NULL,
    scene_type_id    BIGINT NOT NULL,
    PRIMARY KEY (scene_catalog_id)
);

-- 3. Copy all 26 catalog entries into scene_types.
--    Since scene_types is empty, every catalog entry becomes a new row.
INSERT INTO scene_types (
    name, slug, description, has_clothes_off_transition,
    sort_order, is_active, is_studio_level
)
SELECT
    name, slug, description, has_clothes_off_transition,
    sort_order, is_active, true
FROM scene_catalog;

-- 4. Populate the mapping table.
INSERT INTO _scene_catalog_to_scene_type_map (scene_catalog_id, scene_type_id)
SELECT sc.id, st.id
FROM scene_catalog sc
JOIN scene_types st ON st.slug = sc.slug;

-- 5. Auto-generate slugs for any scene_types rows that lack one
--    (should not happen here since we just copied slugs, but safety net).
UPDATE scene_types
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9 _]', '', 'g'), '\s+', '_', 'g'))
WHERE slug IS NULL;

-- 6. Make slug NOT NULL now that all rows have values.
ALTER TABLE scene_types
    ALTER COLUMN slug SET NOT NULL;

-- 7. Partial unique index on slug for non-deleted rows.
CREATE UNIQUE INDEX uq_scene_types_slug ON scene_types (slug) WHERE deleted_at IS NULL;
