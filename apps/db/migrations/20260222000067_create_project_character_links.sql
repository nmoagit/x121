-- PRD-60: Project-to-library character links
-- Tracks which library characters have been imported into which projects
-- and which fields remain linked for synchronization.

CREATE TABLE project_character_links (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    library_character_id BIGINT NOT NULL REFERENCES library_characters(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    linked_fields JSONB NOT NULL DEFAULT '[]',
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_character_links_project_id ON project_character_links(project_id);
CREATE INDEX idx_project_character_links_library_character_id ON project_character_links(library_character_id);
CREATE INDEX idx_project_character_links_project_character_id ON project_character_links(project_character_id);
CREATE UNIQUE INDEX uq_project_character_links ON project_character_links(project_id, library_character_id);
CREATE TRIGGER trg_project_character_links_updated_at BEFORE UPDATE ON project_character_links
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
