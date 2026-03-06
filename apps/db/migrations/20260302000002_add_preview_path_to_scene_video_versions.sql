-- Add preview_path column for low-res video preview copies (640x360).
-- Nullable: existing rows get NULL and the stream handler falls back to the full file.
ALTER TABLE scene_video_versions ADD COLUMN IF NOT EXISTS preview_path TEXT;
