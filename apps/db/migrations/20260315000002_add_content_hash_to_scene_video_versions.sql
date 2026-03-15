-- Add content_hash column for import deduplication (idempotent).
-- SHA-256 hex digest of the video file content, computed on upload/import.
ALTER TABLE scene_video_versions
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_scene_video_versions_content_hash
    ON scene_video_versions (content_hash)
    WHERE content_hash IS NOT NULL AND deleted_at IS NULL;
