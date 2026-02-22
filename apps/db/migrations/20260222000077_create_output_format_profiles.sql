-- Migration 000077: Create output_format_profiles table (PRD-39)
--
-- Stores named output format profiles that define encoding settings
-- (codec, container, resolution, bitrate, framerate) for delivery exports.

CREATE TABLE IF NOT EXISTS output_format_profiles (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    resolution      TEXT NOT NULL,
    codec           TEXT NOT NULL,
    container       TEXT NOT NULL,
    bitrate_kbps    INTEGER,
    framerate       REAL,
    pixel_format    TEXT,
    extra_ffmpeg_args TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_output_format_profiles_name ON output_format_profiles(name);

CREATE TRIGGER trg_output_format_profiles_updated_at
    BEFORE UPDATE ON output_format_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
