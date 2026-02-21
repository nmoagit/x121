-- PRD-30: Modular Layout & Panel Management
-- Creates tables for user-saved layouts and admin layout presets.

CREATE TABLE user_layouts (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    layout_name TEXT         NOT NULL,
    layout_json JSONB        NOT NULL,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_shared   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_layouts_user_id ON user_layouts(user_id);
CREATE UNIQUE INDEX uq_user_layouts_user_id_name ON user_layouts(user_id, layout_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_layouts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE admin_layout_presets (
    id               BIGSERIAL    PRIMARY KEY,
    name             TEXT         NOT NULL UNIQUE,
    role_default_for TEXT,
    layout_json      JSONB        NOT NULL,
    created_by       BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_layout_presets_created_by ON admin_layout_presets(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON admin_layout_presets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
