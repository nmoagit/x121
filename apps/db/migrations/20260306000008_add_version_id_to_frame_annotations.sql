-- Add version_id to frame_annotations so annotations can be linked to
-- scene_video_versions (clip review) in addition to segments.
--
-- segment_id becomes nullable; exactly one of segment_id / version_id must be set.

ALTER TABLE frame_annotations
    ALTER COLUMN segment_id DROP NOT NULL,
    ADD COLUMN version_id BIGINT NULL REFERENCES scene_video_versions(id)
        ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one parent FK must be populated.
ALTER TABLE frame_annotations
    ADD CONSTRAINT chk_frame_annotations_parent
        CHECK (
            (segment_id IS NOT NULL AND version_id IS NULL) OR
            (segment_id IS NULL AND version_id IS NOT NULL)
        );

CREATE INDEX idx_frame_annotations_version_id ON frame_annotations(version_id)
    WHERE version_id IS NOT NULL;

CREATE INDEX idx_frame_annotations_version_frame
    ON frame_annotations(version_id, frame_number)
    WHERE version_id IS NOT NULL;
