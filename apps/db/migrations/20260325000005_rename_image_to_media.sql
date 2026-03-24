-- Rename all image-related tables and FK columns to media.
-- PostgreSQL automatically updates FK constraint definitions when
-- tables/columns are renamed, so no constraint recreation is needed.

BEGIN;

-- ============================================================
-- Phase 1: Rename tables
-- ============================================================

ALTER TABLE IF EXISTS source_images RENAME TO source_media;
ALTER TABLE IF EXISTS derived_images RENAME TO derived_media;
ALTER TABLE IF EXISTS image_variants RENAME TO media_variants;
ALTER TABLE IF EXISTS image_variant_statuses RENAME TO media_variant_statuses;

-- ============================================================
-- Phase 2: Rename FK columns on the renamed tables
-- ============================================================

ALTER TABLE derived_media RENAME COLUMN source_image_id TO source_media_id;
ALTER TABLE media_variants RENAME COLUMN source_image_id TO source_media_id;
ALTER TABLE media_variants RENAME COLUMN derived_image_id TO derived_media_id;

-- ============================================================
-- Phase 3: Rename FK columns on OTHER tables that reference
--          the renamed tables (discovered via information_schema)
-- ============================================================

ALTER TABLE avatar_media_assignments RENAME COLUMN image_variant_id TO media_variant_id;
ALTER TABLE scenes RENAME COLUMN image_variant_id TO media_variant_id;
ALTER TABLE image_quality_scores RENAME COLUMN image_variant_id TO media_variant_id;
ALTER TABLE frame_annotations RENAME COLUMN image_variant_id TO media_variant_id;

-- NOTE: generation_receipts has source_image_hash and variant_image_hash
-- columns but these are content hashes (TEXT), not FK references.
-- They will be renamed for consistency.
ALTER TABLE generation_receipts RENAME COLUMN source_image_hash TO source_media_hash;
ALTER TABLE generation_receipts RENAME COLUMN variant_image_hash TO variant_media_hash;

-- NOTE: image_quality_scores.is_source_image is a boolean flag.
-- Rename for consistency.
ALTER TABLE image_quality_scores RENAME COLUMN is_source_image TO is_source_media;

-- NOTE: detected_faces and embedding_history do NOT have image-related
-- columns (verified via information_schema query).

-- ============================================================
-- Phase 4: Add new columns for multi-media support
-- ============================================================

ALTER TABLE source_media ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE source_media ADD COLUMN duration_secs NUMERIC;
ALTER TABLE media_variants ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE media_variants ADD COLUMN duration_secs NUMERIC;

ALTER TABLE source_media ADD CONSTRAINT ck_source_media_media_kind
    CHECK (media_kind IN ('image', 'video', 'audio'));
ALTER TABLE media_variants ADD CONSTRAINT ck_media_variants_media_kind
    CHECK (media_kind IN ('image', 'video', 'audio'));

COMMIT;
