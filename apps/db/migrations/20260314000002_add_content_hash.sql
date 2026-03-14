-- Add content_hash column to image_variants and scene_video_versions
-- for deduplication during import (SHA-256 hex digest of file bytes).

ALTER TABLE image_variants ADD COLUMN content_hash VARCHAR(64);
ALTER TABLE scene_video_versions ADD COLUMN content_hash VARCHAR(64);

-- Index for fast hash lookups during bulk deduplication checks.
CREATE INDEX idx_image_variants_content_hash ON image_variants (content_hash) WHERE content_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_scene_video_versions_content_hash ON scene_video_versions (content_hash) WHERE content_hash IS NOT NULL AND deleted_at IS NULL;
