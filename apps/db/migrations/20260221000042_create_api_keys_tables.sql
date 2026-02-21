-- PRD-12: External API & Webhooks — API key scopes and API keys tables.

-- ---------------------------------------------------------------------------
-- api_key_scopes lookup table
-- ---------------------------------------------------------------------------

CREATE TABLE api_key_scopes (
    id   BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_api_key_scopes_updated_at
    BEFORE UPDATE ON api_key_scopes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO api_key_scopes (name, description) VALUES
    ('read_only',     'Read access to all entities'),
    ('project_read',  'Read access scoped to specific projects'),
    ('full_access',   'Read and write access to all entities'),
    ('project_full',  'Read and write access scoped to specific projects');

-- ---------------------------------------------------------------------------
-- api_keys table
-- ---------------------------------------------------------------------------

CREATE TABLE api_keys (
    id                     BIGSERIAL PRIMARY KEY,
    name                   TEXT NOT NULL,
    description            TEXT,
    key_hash               TEXT NOT NULL,
    key_prefix             TEXT NOT NULL,
    scope_id               BIGINT NOT NULL REFERENCES api_key_scopes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_id             BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_by             BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    rate_limit_read_per_min  INTEGER NOT NULL DEFAULT 100,
    rate_limit_write_per_min INTEGER NOT NULL DEFAULT 20,
    is_active              BOOLEAN NOT NULL DEFAULT true,
    last_used_at           TIMESTAMPTZ,
    expires_at             TIMESTAMPTZ,
    revoked_at             TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key_hash    ON api_keys(key_hash);
CREATE INDEX idx_api_keys_key_prefix  ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_scope_id    ON api_keys(scope_id);
CREATE INDEX idx_api_keys_project_id  ON api_keys(project_id);
CREATE INDEX idx_api_keys_created_by  ON api_keys(created_by);

CREATE TRIGGER trg_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
