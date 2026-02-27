-- Platform settings key-value store (PRD-110).
CREATE TABLE platform_settings (
    id          BIGSERIAL PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,
    value       TEXT NOT NULL,
    category    TEXT NOT NULL,
    updated_by  BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_platform_settings_updated_at
    BEFORE UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_platform_settings_category ON platform_settings (category);
CREATE INDEX idx_platform_settings_updated_by ON platform_settings (updated_by);
