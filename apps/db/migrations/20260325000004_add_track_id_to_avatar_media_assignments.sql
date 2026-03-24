-- Add track_id to avatar_media_assignments so seeds can be assigned per-track.
-- A single workflow may be used for multiple tracks, each needing a different seed.

BEGIN;

-- Add nullable track_id column
ALTER TABLE avatar_media_assignments
    ADD COLUMN track_id BIGINT REFERENCES tracks(id) ON DELETE CASCADE;

-- Drop old unique constraint and create new one including track_id
ALTER TABLE avatar_media_assignments
    DROP CONSTRAINT IF EXISTS avatar_media_assignments_avatar_id_media_slot_id_scene_type_key;

CREATE UNIQUE INDEX uq_avatar_media_assignments_avatar_slot_track
    ON avatar_media_assignments (avatar_id, media_slot_id, COALESCE(track_id, -1));

CREATE INDEX idx_avatar_media_assignments_track ON avatar_media_assignments(track_id);

COMMIT;
