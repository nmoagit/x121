-- PRD-21: Source Image Management & Variant Generation
-- Extends existing image_variant_statuses and image_variants tables.

-- Add new statuses (existing: pending=1, approved=2, rejected=3)
INSERT INTO image_variant_statuses (name, label) VALUES
    ('generating', 'Generating'),
    ('generated',  'Generated'),
    ('editing',    'Editing');

-- Add new columns to image_variants for variant lifecycle management.
ALTER TABLE image_variants ADD COLUMN variant_type TEXT;
ALTER TABLE image_variants ADD COLUMN provenance TEXT NOT NULL DEFAULT 'generated';
ALTER TABLE image_variants ADD COLUMN is_hero BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE image_variants ADD COLUMN file_size_bytes BIGINT;
ALTER TABLE image_variants ADD COLUMN width INTEGER;
ALTER TABLE image_variants ADD COLUMN height INTEGER;
ALTER TABLE image_variants ADD COLUMN format TEXT;
ALTER TABLE image_variants ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE image_variants ADD COLUMN parent_variant_id BIGINT
    REFERENCES image_variants(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE image_variants ADD COLUMN generation_params JSONB;

-- Partial unique index: one hero per character per variant_type.
CREATE UNIQUE INDEX uq_image_variants_character_hero
    ON image_variants(character_id, variant_type) WHERE is_hero = true;

-- Index for parent_variant_id lookups (version chain).
CREATE INDEX idx_image_variants_parent_variant_id ON image_variants(parent_variant_id);
