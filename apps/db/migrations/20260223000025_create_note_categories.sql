-- Note categories for the production notes system (PRD-95).

CREATE TABLE note_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#888888',
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON note_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO note_categories (name, color, icon) VALUES
    ('instruction', '#4488FF', 'book-open'),
    ('blocker', '#FF4444', 'alert-triangle'),
    ('fyi', '#44CC88', 'info'),
    ('custom', '#888888', 'message-circle');
