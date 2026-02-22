-- PRD-76: Character Identity Embedding - add face embedding columns to characters.

ALTER TABLE characters
    ADD COLUMN face_embedding vector(512),
    ADD COLUMN face_detection_confidence DOUBLE PRECISION,
    ADD COLUMN face_bounding_box JSONB,
    ADD COLUMN embedding_status_id SMALLINT NOT NULL DEFAULT 1 REFERENCES embedding_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD COLUMN embedding_extracted_at TIMESTAMPTZ;

CREATE INDEX idx_characters_embedding_status_id ON characters(embedding_status_id);
CREATE INDEX idx_characters_face_embedding_vec ON characters
    USING hnsw (face_embedding vector_cosine_ops);
