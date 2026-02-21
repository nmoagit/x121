-- Full-text search indexes (PRD-20).
-- Add tsvector columns and GIN indexes to searchable entity tables.

-- Characters: searchable name and metadata
ALTER TABLE characters ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION characters_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.metadata ->> 'description', '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_characters_search_vector
    BEFORE INSERT OR UPDATE ON characters
    FOR EACH ROW EXECUTE FUNCTION characters_search_vector_update();

CREATE INDEX idx_characters_search ON characters USING GIN(search_vector);

-- Projects: searchable name and description
ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION projects_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_search_vector
    BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION projects_search_vector_update();

CREATE INDEX idx_projects_search ON projects USING GIN(search_vector);

-- Scene types: searchable name and prompt template
ALTER TABLE scene_types ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION scene_types_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.prompt_template, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scene_types_search_vector
    BEFORE INSERT OR UPDATE ON scene_types
    FOR EACH ROW EXECUTE FUNCTION scene_types_search_vector_update();

CREATE INDEX idx_scene_types_search ON scene_types USING GIN(search_vector);

-- Backfill existing rows (triggers fire on UPDATE, setting search_vector)
UPDATE characters SET name = name WHERE search_vector IS NULL;
UPDATE projects SET name = name WHERE search_vector IS NULL;
UPDATE scene_types SET name = name WHERE search_vector IS NULL;
