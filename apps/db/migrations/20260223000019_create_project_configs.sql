-- Project Configuration Templates (PRD-74)
--
-- Stores reusable project configuration snapshots that can be exported
-- from existing projects and imported (fully or selectively) into new ones.

CREATE TABLE project_configs (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    config_json JSONB NOT NULL,
    source_project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_recommended BOOLEAN NOT NULL DEFAULT false,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_configs_created_by_id ON project_configs(created_by_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
