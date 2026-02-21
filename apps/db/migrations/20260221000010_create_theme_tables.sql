-- Theme statuses lookup table
CREATE TABLE theme_statuses (
    id SMALLSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO theme_statuses (name, label) VALUES
    ('draft', 'Draft'),
    ('active', 'Active'),
    ('archived', 'Archived');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON theme_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- User theme preferences (one per user)
CREATE TABLE user_theme_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    color_scheme TEXT NOT NULL DEFAULT 'dark',
    brand_palette TEXT NOT NULL DEFAULT 'obsidian',
    high_contrast BOOLEAN NOT NULL DEFAULT FALSE,
    custom_theme_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_theme_preferences_user_id ON user_theme_preferences(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_theme_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Custom themes (admin-created)
CREATE TABLE custom_themes (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status_id SMALLINT NOT NULL DEFAULT 1 REFERENCES theme_statuses(id),
    tokens JSONB NOT NULL DEFAULT '{}',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_custom_themes_name ON custom_themes(name);
CREATE INDEX idx_custom_themes_status_id ON custom_themes(status_id);
CREATE INDEX idx_custom_themes_created_by ON custom_themes(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON custom_themes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add FK now that custom_themes exists
ALTER TABLE user_theme_preferences
    ADD CONSTRAINT fk_user_theme_preferences_custom_theme
    FOREIGN KEY (custom_theme_id) REFERENCES custom_themes(id) ON DELETE SET NULL;

CREATE INDEX idx_user_theme_preferences_custom_theme_id ON user_theme_preferences(custom_theme_id);
