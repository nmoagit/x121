-- PRD-82: Content Sensitivity Controls
-- User sensitivity preferences and studio-wide minimum sensitivity config.

-- User sensitivity preferences
CREATE TABLE user_sensitivity_settings (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    global_level TEXT        NOT NULL DEFAULT 'full'
                             CHECK (global_level IN ('full', 'soft_blur', 'heavy_blur', 'placeholder')),
    view_overrides_json JSONB NOT NULL DEFAULT '{}',
    watermark_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    watermark_text      TEXT,
    watermark_position  TEXT    NOT NULL DEFAULT 'center'
                                CHECK (watermark_position IN ('center', 'corner')),
    watermark_opacity   REAL    NOT NULL DEFAULT 0.3
                                CHECK (watermark_opacity >= 0.0 AND watermark_opacity <= 1.0),
    screen_share_mode   BOOLEAN NOT NULL DEFAULT FALSE,
    sound_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_sensitivity_user_id ON user_sensitivity_settings(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_sensitivity_settings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Studio-wide minimum sensitivity config (singleton row pattern via id=1)
CREATE TABLE studio_sensitivity_config (
    id          BIGSERIAL    PRIMARY KEY,
    min_level   TEXT         NOT NULL DEFAULT 'full'
                             CHECK (min_level IN ('full', 'soft_blur', 'heavy_blur', 'placeholder')),
    updated_by  BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_studio_sensitivity_updated_by ON studio_sensitivity_config(updated_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON studio_sensitivity_config
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
