-- Universal soft delete (PRD-109 Req 1.6)
-- Add deleted_at to all existing entity tables.
-- The new scene_video_versions table already includes deleted_at from migration 000011.

ALTER TABLE projects       ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE characters     ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE source_images  ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE derived_images ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE image_variants ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE scene_types    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE scenes         ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE segments       ADD COLUMN deleted_at TIMESTAMPTZ;

-- Partial indexes for efficient soft-delete filtering.
-- Only index rows that ARE deleted — active rows (deleted_at IS NULL) don't need indexing.
CREATE INDEX idx_projects_deleted_at       ON projects       (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_characters_deleted_at     ON characters     (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_source_images_deleted_at  ON source_images  (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_derived_images_deleted_at ON derived_images (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_image_variants_deleted_at ON image_variants (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_scene_types_deleted_at    ON scene_types    (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_scenes_deleted_at         ON scenes         (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_segments_deleted_at       ON segments       (deleted_at) WHERE deleted_at IS NOT NULL;
