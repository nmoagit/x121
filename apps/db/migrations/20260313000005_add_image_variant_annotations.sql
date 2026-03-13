-- Add image_variant_id to frame_annotations for image variant annotation support.
-- Mirrors the existing version-scoped annotation pattern.

-- Add nullable FK column.
ALTER TABLE frame_annotations
    ADD COLUMN image_variant_id BIGINT NULL
        REFERENCES image_variants(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the old two-way check constraint.
ALTER TABLE frame_annotations
    DROP CONSTRAINT chk_frame_annotations_parent;

-- Add new three-way check: exactly one parent FK must be populated.
ALTER TABLE frame_annotations
    ADD CONSTRAINT chk_frame_annotations_parent
        CHECK (
            (segment_id IS NOT NULL AND version_id IS NULL AND image_variant_id IS NULL) OR
            (segment_id IS NULL AND version_id IS NOT NULL AND image_variant_id IS NULL) OR
            (segment_id IS NULL AND version_id IS NULL AND image_variant_id IS NOT NULL)
        );

-- Partial index on image_variant_id for lookups.
CREATE INDEX idx_frame_annotations_image_variant_id
    ON frame_annotations (image_variant_id)
    WHERE image_variant_id IS NOT NULL;

-- Composite index for variant + frame queries.
CREATE INDEX idx_frame_annotations_image_variant_frame
    ON frame_annotations (image_variant_id, frame_number)
    WHERE image_variant_id IS NOT NULL;
