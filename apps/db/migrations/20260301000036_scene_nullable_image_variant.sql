-- Allow scenes to exist without a seed image (for manual video imports).
-- When importing finished videos, no seed image is needed.

ALTER TABLE scenes ALTER COLUMN image_variant_id DROP NOT NULL;
