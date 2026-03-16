-- Add web_playback_path for browser-compatible full-resolution transcodes,
-- and video_codec to track the source codec for display and delivery validation.
ALTER TABLE scene_video_versions
    ADD COLUMN web_playback_path TEXT,
    ADD COLUMN video_codec TEXT;
