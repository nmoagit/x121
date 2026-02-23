-- Segment Trimming & Frame-Level Editing (PRD-78).
--
-- Stores non-destructive trim metadata for generated segments, allowing
-- frame-accurate in/out point trimming without modifying the original file.

CREATE TABLE segment_trims (
    id              BIGSERIAL   PRIMARY KEY,
    segment_id      BIGINT      NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    original_path   TEXT        NOT NULL,
    trimmed_path    TEXT,
    in_frame        INTEGER     NOT NULL DEFAULT 0,
    out_frame       INTEGER     NOT NULL,
    total_original_frames INTEGER NOT NULL,
    created_by      BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segment_trims_segment_id ON segment_trims(segment_id);
CREATE INDEX idx_segment_trims_created_by ON segment_trims(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_trims
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
