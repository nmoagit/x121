-- Migration 000074: Create templates table (PRD-27)
--
-- Stores workflow templates that define reusable pipeline configurations
-- with parameter slots for customisation.

CREATE TABLE templates (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope           TEXT NOT NULL DEFAULT 'personal',
    project_id      BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    workflow_config  JSONB NOT NULL,
    parameter_slots  JSONB,
    version         INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_owner_id ON templates(owner_id);
CREATE INDEX idx_templates_project_id ON templates(project_id);
CREATE INDEX idx_templates_scope ON templates(scope);

CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
