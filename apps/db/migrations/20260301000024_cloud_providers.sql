-- Cloud GPU providers (PRD-114).
CREATE TABLE cloud_providers (
    id                BIGSERIAL   PRIMARY KEY,
    name              TEXT        NOT NULL,
    provider_type     TEXT        NOT NULL,               -- 'runpod', 'lambda', etc.
    api_key_encrypted BYTEA       NOT NULL,
    api_key_nonce     BYTEA       NOT NULL,
    base_url          TEXT,                                -- override for self-hosted
    settings          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status_id         SMALLINT    NOT NULL REFERENCES cloud_provider_statuses(id) ON DELETE RESTRICT DEFAULT 1,
    budget_limit_cents BIGINT,                             -- monthly budget cap (NULL = unlimited)
    budget_period_start TIMESTAMPTZ,                       -- current budget period start
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cloud_providers_name UNIQUE (name)
);

CREATE INDEX idx_cloud_providers_status ON cloud_providers(status_id);
CREATE INDEX idx_cloud_providers_type   ON cloud_providers(provider_type);
CREATE INDEX idx_cloud_providers_settings ON cloud_providers USING GIN (settings);

CREATE TRIGGER trg_cloud_providers_updated_at
    BEFORE UPDATE ON cloud_providers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
