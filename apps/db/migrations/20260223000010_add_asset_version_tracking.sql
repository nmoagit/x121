-- Asset version tracking columns (PRD-69).
-- Adds version chain support to assets, source_images, and derived_images.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS previous_version_id BIGINT REFERENCES assets(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_assets_previous_version_id ON assets(previous_version_id);
CREATE INDEX idx_assets_current_version ON assets(name, is_current_version) WHERE is_current_version = true;

ALTER TABLE source_images ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE source_images ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE source_images ADD COLUMN IF NOT EXISTS previous_version_id BIGINT REFERENCES source_images(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_source_images_previous_version ON source_images(previous_version_id);

ALTER TABLE derived_images ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE derived_images ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE derived_images ADD COLUMN IF NOT EXISTS previous_version_id BIGINT REFERENCES derived_images(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_derived_images_previous_version ON derived_images(previous_version_id);
