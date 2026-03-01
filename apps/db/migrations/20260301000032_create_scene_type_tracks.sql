-- PRD-123: Scene Catalog & Scene Types Unification
-- Step 2: Create scene_type_tracks junction table and migrate data.

-- 1. Create the new junction table.
CREATE TABLE scene_type_tracks (
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    track_id      BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scene_type_id, track_id)
);

CREATE INDEX idx_scene_type_tracks_track_id ON scene_type_tracks (track_id);

-- 2. Copy all data from scene_catalog_tracks using the mapping table.
INSERT INTO scene_type_tracks (scene_type_id, track_id, created_at)
SELECT m.scene_type_id, sct.track_id, sct.created_at
FROM scene_catalog_tracks sct
JOIN _scene_catalog_to_scene_type_map m ON m.scene_catalog_id = sct.scene_catalog_id;
