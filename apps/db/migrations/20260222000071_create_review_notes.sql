-- Review notes and note-tag associations for collaborative review (PRD-38).

CREATE TABLE review_notes (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    parent_note_id BIGINT NULL REFERENCES review_notes(id) ON DELETE CASCADE,
    timecode TEXT,
    frame_number INTEGER,
    text_content TEXT,
    voice_memo_path TEXT,
    voice_memo_transcript TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_notes_segment_id ON review_notes(segment_id);
CREATE INDEX idx_review_notes_user_id ON review_notes(user_id);
CREATE INDEX idx_review_notes_parent_note_id ON review_notes(parent_note_id);
CREATE INDEX idx_review_notes_status ON review_notes(status);

CREATE TRIGGER trg_review_notes_updated_at BEFORE UPDATE ON review_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE review_note_tags (
    id BIGSERIAL PRIMARY KEY,
    note_id BIGINT NOT NULL REFERENCES review_notes(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES review_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_note_tags_note_id ON review_note_tags(note_id);
CREATE INDEX idx_review_note_tags_tag_id ON review_note_tags(tag_id);
CREATE UNIQUE INDEX uq_review_note_tags ON review_note_tags(note_id, tag_id);
