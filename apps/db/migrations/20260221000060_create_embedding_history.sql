-- PRD-76: Character Identity Embedding - historical embeddings for audit trail.

CREATE TABLE embedding_history (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    face_embedding vector(512) NOT NULL,
    face_detection_confidence DOUBLE PRECISION NOT NULL,
    face_bounding_box JSONB,
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embedding_history_character_id ON embedding_history(character_id);

CREATE TRIGGER trg_embedding_history_updated_at BEFORE UPDATE ON embedding_history
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
