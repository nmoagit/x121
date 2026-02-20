-- Characters table: a character belongs to a project.

CREATE TABLE characters (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT   NOT NULL REFERENCES projects(id)           ON DELETE CASCADE  ON UPDATE CASCADE,
    name       TEXT     NOT NULL,
    status_id  SMALLINT NOT NULL REFERENCES character_statuses(id)  ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    metadata   JSONB,
    settings   JSONB    NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_characters_project_id ON characters(project_id);
CREATE INDEX idx_characters_status_id  ON characters(status_id);

-- Unique constraints
CREATE UNIQUE INDEX uq_characters_project_id_name ON characters(project_id, name);

-- GIN index for JSONB columns
CREATE INDEX idx_characters_settings ON characters USING GIN (settings);

-- Updated_at trigger
CREATE TRIGGER trg_characters_updated_at
    BEFORE UPDATE ON characters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
