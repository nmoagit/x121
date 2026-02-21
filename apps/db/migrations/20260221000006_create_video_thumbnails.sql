-- Video thumbnails table for PRD-83 (Video Playback Engine & Codec Support).
--
-- Stores extracted frame thumbnails for segments and scene video versions.
-- Uses a polymorphic source_type + source_id pattern to reference either
-- the `segments` or `scene_video_versions` table.

CREATE TABLE video_thumbnails (
    id               BIGSERIAL    PRIMARY KEY,
    source_type      TEXT         NOT NULL CHECK (source_type IN ('segment', 'version')),
    source_id        BIGINT       NOT NULL,
    frame_number     INTEGER      NOT NULL,
    thumbnail_path   TEXT         NOT NULL,
    interval_seconds REAL,
    width            INTEGER      NOT NULL,
    height           INTEGER      NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Composite index for lookups by source.
CREATE INDEX idx_video_thumbnails_source
    ON video_thumbnails (source_type, source_id);

-- Each (source_type, source_id, frame_number) triple is unique.
CREATE UNIQUE INDEX uq_video_thumbnails_source_frame
    ON video_thumbnails (source_type, source_id, frame_number);

-- Auto-update updated_at on row modification.
CREATE TRIGGER trg_video_thumbnails_updated_at
    BEFORE UPDATE ON video_thumbnails
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
