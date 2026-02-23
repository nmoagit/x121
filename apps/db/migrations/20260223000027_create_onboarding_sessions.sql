-- PRD-67: Bulk Character Onboarding Wizard
-- Wizard state persistence for multi-step character onboarding sessions.

CREATE TABLE onboarding_sessions (
    id          BIGSERIAL   PRIMARY KEY,
    project_id  BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_by_id BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    current_step INTEGER    NOT NULL DEFAULT 1,
    step_data   JSONB       NOT NULL DEFAULT '{}',
    character_ids BIGINT[]  NOT NULL DEFAULT '{}',
    status      TEXT        NOT NULL DEFAULT 'in_progress',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_sessions_project_id ON onboarding_sessions(project_id);
CREATE INDEX idx_onboarding_sessions_created_by_id ON onboarding_sessions(created_by_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON onboarding_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
