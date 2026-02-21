-- Per-user dashboard configuration (PRD-42: Studio Pulse Dashboard).
-- Stores widget layout and settings per user, extensible for PRD-89.

CREATE TABLE dashboard_configs (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    layout_json   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    widget_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Each user has exactly one dashboard config row.
CREATE UNIQUE INDEX uq_dashboard_configs_user_id ON dashboard_configs(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dashboard_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
