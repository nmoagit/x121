-- Migration: Add default flag to output_format_profiles, seed standard profiles,
-- and link projects to a default format profile.

BEGIN;

-- 1. Add is_default column
ALTER TABLE output_format_profiles
    ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;

-- 2. Unique partial index: only one profile can be the default
CREATE UNIQUE INDEX uq_output_format_profiles_default
    ON output_format_profiles (is_default) WHERE is_default = true;

-- 3. Seed standard profiles (idempotent)
INSERT INTO output_format_profiles (name, resolution, codec, container, bitrate_kbps, framerate, is_default)
VALUES
    ('720p H.264',  '1280x720',   'h264', 'mp4',  5000, 30, false),
    ('1080p H.264', '1920x1080',  'h264', 'mp4',  8000, 30, true),
    ('4K H.264',    '3840x2160',  'h264', 'mp4', 20000, 30, false)
ON CONFLICT (name) DO NOTHING;

-- 4. Add default_format_profile_id to projects
ALTER TABLE projects
    ADD COLUMN default_format_profile_id BIGINT
        REFERENCES output_format_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_default_format_profile_id
    ON projects(default_format_profile_id);

COMMIT;
