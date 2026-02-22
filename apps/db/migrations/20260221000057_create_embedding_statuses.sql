-- PRD-76: Character Identity Embedding - embedding status lookup table.

CREATE TABLE embedding_statuses (
    id SMALLSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_embedding_statuses_updated_at BEFORE UPDATE ON embedding_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO embedding_statuses (name, label) VALUES
    ('pending', 'Pending'),
    ('extracting', 'Extracting'),
    ('completed', 'Completed'),
    ('failed', 'Failed'),
    ('low_confidence', 'Low Confidence'),
    ('multi_face_pending', 'Multi-Face Pending');
