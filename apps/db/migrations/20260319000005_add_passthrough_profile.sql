-- Add is_passthrough flag to output format profiles and seed a default passthrough profile.

ALTER TABLE output_format_profiles
    ADD COLUMN is_passthrough BOOLEAN NOT NULL DEFAULT false;

-- Seed a passthrough profile that skips transcoding entirely.
INSERT INTO output_format_profiles (name, description, resolution, codec, container, is_passthrough)
VALUES ('Passthrough', 'No transcoding — delivers original video files as-is', 'original', 'copy', 'original', true);
