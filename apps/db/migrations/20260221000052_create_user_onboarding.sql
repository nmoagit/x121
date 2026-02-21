-- User onboarding state for PRD-53 (First-Run Experience & Onboarding).
--
-- Tracks per-user onboarding progress: guided tour completion, dismissed
-- contextual hints, checklist progress, feature reveal state, and an
-- optional sample project reference.

CREATE TABLE user_onboarding (
    id                      BIGSERIAL   PRIMARY KEY,
    user_id                 BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tour_completed          BOOLEAN     NOT NULL DEFAULT FALSE,
    hints_dismissed_json    JSONB       NOT NULL DEFAULT '[]',
    checklist_progress_json JSONB       NOT NULL DEFAULT '{}',
    feature_reveal_json     JSONB       NOT NULL DEFAULT '{}',
    sample_project_id       BIGINT      NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_onboarding_user_id ON user_onboarding(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_onboarding
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
