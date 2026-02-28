-- PRD-72: Project Lifecycle & Archival
--
-- Adds lifecycle-specific statuses, tracking columns, and a project summaries table.

-- 1. Seed lifecycle-specific statuses into the existing project_statuses table.
--    Existing statuses (from seed migration): draft(1), active(2), paused(3), completed(4), archived(5).
INSERT INTO project_statuses (name, label) VALUES
    ('setup', 'Setup')
ON CONFLICT (name) DO NOTHING;

INSERT INTO project_statuses (name, label) VALUES
    ('delivered', 'Delivered')
ON CONFLICT (name) DO NOTHING;

INSERT INTO project_statuses (name, label) VALUES
    ('closed', 'Closed')
ON CONFLICT (name) DO NOTHING;

-- 2. Add lifecycle tracking columns to projects.
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS lifecycle_transitioned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lifecycle_transitioned_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS is_edit_locked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_projects_lifecycle_transitioned_by ON projects(lifecycle_transitioned_by);

-- 3. Create project summaries table for delivery/archival reports.
CREATE TABLE IF NOT EXISTS project_summaries (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    report_json     JSONB NOT NULL,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by    BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_summaries_project_id ON project_summaries(project_id);
CREATE INDEX IF NOT EXISTS idx_project_summaries_generated_by ON project_summaries(generated_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_summaries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
