-- Add file_purged flag to track clips whose video files have been deleted
-- from disk for space reclamation while preserving DB records.

ALTER TABLE scene_video_versions
  ADD COLUMN file_purged BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE scene_video_version_artifacts
  ADD COLUMN file_purged BOOLEAN NOT NULL DEFAULT false;
