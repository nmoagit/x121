-- Fix unique hero index to exclude soft-deleted variants.
--
-- The original index only filtered on `is_hero = true` but did not exclude
-- soft-deleted rows, causing 409 Conflict when uploading a new hero variant
-- for a character+variant_type that had a soft-deleted hero.

DROP INDEX IF EXISTS uq_image_variants_character_hero;

CREATE UNIQUE INDEX uq_image_variants_character_hero
    ON image_variants(character_id, variant_type)
    WHERE is_hero = true AND deleted_at IS NULL;
