-- Extensions table for UI Plugin/Extension Architecture (PRD-85).

CREATE TABLE extensions (
    id          BIGSERIAL    PRIMARY KEY,
    name        TEXT         NOT NULL,
    version     TEXT         NOT NULL,
    author      TEXT,
    description TEXT,
    manifest_json JSONB      NOT NULL,
    settings_json JSONB      NOT NULL DEFAULT '{}'::jsonb,
    enabled     BOOLEAN      NOT NULL DEFAULT false,
    source_path TEXT         NOT NULL,
    api_version TEXT         NOT NULL,
    installed_by BIGINT      REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_extensions_name ON extensions(name);
CREATE INDEX idx_extensions_installed_by ON extensions(installed_by);
CREATE INDEX idx_extensions_enabled ON extensions(enabled) WHERE enabled = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON extensions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
