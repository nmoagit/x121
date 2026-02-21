-- PRD-32: Progressive Disclosure & UX Intelligence
-- Tables for user proficiency tracking and focus mode preferences.

CREATE TABLE user_proficiency (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_area      TEXT  NOT NULL,
    proficiency_level TEXT  NOT NULL DEFAULT 'beginner',
    usage_count       INTEGER NOT NULL DEFAULT 0,
    manual_override   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_proficiency_user_id ON user_proficiency(user_id);
CREATE UNIQUE INDEX uq_user_proficiency_user_area ON user_proficiency(user_id, feature_area);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_proficiency
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_focus_preferences (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    focus_mode TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_focus_preferences_user_id ON user_focus_preferences(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_focus_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
