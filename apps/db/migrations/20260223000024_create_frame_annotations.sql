-- Frame Annotations (PRD-70): On-Frame Annotation & Markup
--
-- Drawing and annotation tools for marking up specific video frames.
-- Annotations are stored as JSONB and linked to PRD-038 review notes.

CREATE TABLE frame_annotations (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    frame_number INTEGER NOT NULL,
    annotations_json JSONB NOT NULL,
    review_note_id BIGINT NULL REFERENCES review_notes(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_frame_annotations_segment_id ON frame_annotations(segment_id);
CREATE INDEX idx_frame_annotations_user_id ON frame_annotations(user_id);
CREATE INDEX idx_frame_annotations_frame_number ON frame_annotations(segment_id, frame_number);
CREATE INDEX idx_frame_annotations_review_note_id ON frame_annotations(review_note_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON frame_annotations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
