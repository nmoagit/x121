-- Projects table: top-level organisational entity.

CREATE TABLE projects (
    id             BIGSERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    status_id      SMALLINT NOT NULL REFERENCES project_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    retention_days INTEGER,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_projects_status_id ON projects(status_id);

-- Unique constraints
CREATE UNIQUE INDEX uq_projects_name ON projects(name);

-- Updated_at trigger
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
