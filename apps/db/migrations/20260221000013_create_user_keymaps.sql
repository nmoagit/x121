-- User keyboard shortcut keymaps (PRD-52).
-- Stores per-user active preset and custom key binding overrides.

CREATE TABLE user_keymaps (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_preset TEXT NOT NULL DEFAULT 'default',
    custom_bindings_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_keymaps_user_id ON user_keymaps(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_keymaps
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
