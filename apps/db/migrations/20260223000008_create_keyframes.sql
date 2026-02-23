-- Keyframes table for storyboard thumbnails (PRD-62).
--
-- Stores extracted keyframe data for each segment, enabling
-- filmstrip previews and hover-scrub in the storyboard view.

CREATE TABLE keyframes (
    id              BIGSERIAL       PRIMARY KEY,
    segment_id      BIGINT          NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    frame_number    INTEGER         NOT NULL,
    timestamp_secs  DOUBLE PRECISION NOT NULL,
    thumbnail_path  TEXT            NOT NULL,
    full_res_path   TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_keyframes_segment_id ON keyframes(segment_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON keyframes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
