-- PRD-60: Character Library / Cross-Project
-- Central library of reusable characters shared across projects.

CREATE TABLE library_characters (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    source_character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL ON UPDATE CASCADE,
    source_project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    master_metadata JSONB NOT NULL DEFAULT '{}',
    tags JSONB NOT NULL DEFAULT '[]',
    description TEXT,
    thumbnail_path TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_library_characters_created_by_id ON library_characters(created_by_id);
CREATE INDEX idx_library_characters_source_character_id ON library_characters(source_character_id);
CREATE INDEX idx_library_characters_tags ON library_characters USING gin(tags);
CREATE TRIGGER trg_library_characters_updated_at BEFORE UPDATE ON library_characters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
