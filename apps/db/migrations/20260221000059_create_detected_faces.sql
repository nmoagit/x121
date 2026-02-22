-- PRD-76: Character Identity Embedding - detected faces from multi-face images.

CREATE TABLE detected_faces (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    bounding_box JSONB NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    embedding vector(512) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detected_faces_character_id ON detected_faces(character_id);

CREATE TRIGGER trg_detected_faces_updated_at BEFORE UPDATE ON detected_faces
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
