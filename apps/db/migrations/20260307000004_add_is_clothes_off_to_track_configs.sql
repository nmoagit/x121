-- Add is_clothes_off flag to scene_type_track_configs.
--
-- Allows each (scene_type, track) to have separate workflow/prompt configs
-- for the normal and clothes-off variants.

ALTER TABLE scene_type_track_configs
    ADD COLUMN is_clothes_off BOOLEAN NOT NULL DEFAULT false;

-- Replace the old unique constraint with one that includes the new column.
ALTER TABLE scene_type_track_configs
    DROP CONSTRAINT scene_type_track_configs_scene_type_id_track_id_key;

ALTER TABLE scene_type_track_configs
    ADD CONSTRAINT scene_type_track_configs_scene_type_track_co_key
    UNIQUE (scene_type_id, track_id, is_clothes_off);
