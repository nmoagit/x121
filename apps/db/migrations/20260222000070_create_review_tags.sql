-- Review tags for categorizing failure types in review notes (PRD-38).

CREATE TABLE review_tags (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#888888',
    category TEXT NOT NULL DEFAULT 'general',
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_tags_created_by ON review_tags(created_by);

CREATE TRIGGER trg_review_tags_updated_at BEFORE UPDATE ON review_tags
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default failure tags.
INSERT INTO review_tags (name, color, category) VALUES
    ('Face Melt', '#FF4444', 'face'),
    ('Jitter', '#FF8844', 'motion'),
    ('Boundary Pop', '#FFAA44', 'transition'),
    ('Hand Artifact', '#FF4488', 'body'),
    ('Lighting Mismatch', '#4488FF', 'lighting'),
    ('Motion Stutter', '#FF6644', 'motion'),
    ('Other', '#888888', 'general');
