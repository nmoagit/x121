-- PRD-153: Add parent-child relationship and clip ordering for derived clips.
-- parent_version_id: self-referencing FK to the approved clip this was derived from.
-- clip_index: sequential ordering for derived clips (chunk 0, 1, 2...).

ALTER TABLE scene_video_versions
    ADD COLUMN parent_version_id BIGINT REFERENCES scene_video_versions(id) ON DELETE SET NULL,
    ADD COLUMN clip_index INTEGER;

CREATE INDEX idx_svv_parent_version_id ON scene_video_versions (parent_version_id)
    WHERE parent_version_id IS NOT NULL;
