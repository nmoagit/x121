-- Add track_id to scenes so each scene is associated with a specific track.
-- This replaces the indirect scene_type → tracks relationship for scene
-- uniqueness, allowing "BJ clothed" and "BJ topless" to be distinct scenes.

ALTER TABLE scenes ADD COLUMN track_id BIGINT REFERENCES tracks(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_scenes_track_id ON scenes (track_id);

-- Drop old unique constraint and replace with one that includes track_id.
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS uq_scenes_character_scene_type_variant;
ALTER TABLE scenes ADD CONSTRAINT uq_scenes_character_type_track
    UNIQUE (character_id, scene_type_id, track_id);
