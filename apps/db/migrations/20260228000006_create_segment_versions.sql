-- PRD-101: Segment Regeneration Comparison
-- Full version table for segments with QA scores, generation params, and selection.

CREATE TABLE segment_versions (
    id              BIGSERIAL       PRIMARY KEY,
    segment_id      BIGINT          NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    version_number  INTEGER         NOT NULL,
    video_path      TEXT            NOT NULL,
    thumbnail_path  TEXT,
    qa_scores_json  JSONB,
    params_json     JSONB,
    selected        BOOLEAN         NOT NULL DEFAULT FALSE,
    created_by      BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segment_versions_segment_id ON segment_versions(segment_id);
CREATE UNIQUE INDEX uq_segment_versions_segment_version ON segment_versions(segment_id, version_number);
CREATE INDEX idx_segment_versions_selected ON segment_versions(segment_id, selected) WHERE selected = TRUE;
CREATE INDEX idx_segment_versions_created_by ON segment_versions(created_by);

ALTER TABLE segment_versions ADD CONSTRAINT chk_version_number_positive CHECK (version_number > 0);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_versions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
