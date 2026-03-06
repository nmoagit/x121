-- Add resolution and frame rate columns to scene_video_versions.
-- These are extracted via ffprobe alongside duration_secs on import.
ALTER TABLE scene_video_versions
    ADD COLUMN width        INTEGER,
    ADD COLUMN height       INTEGER,
    ADD COLUMN frame_rate   DOUBLE PRECISION;
