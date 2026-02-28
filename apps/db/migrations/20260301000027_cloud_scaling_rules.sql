-- Cloud auto-scaling rules (PRD-114).
CREATE TABLE cloud_scaling_rules (
    id               BIGSERIAL   PRIMARY KEY,
    provider_id      BIGINT      NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
    gpu_type_id      BIGINT      NOT NULL REFERENCES cloud_gpu_types(id) ON DELETE CASCADE,
    min_instances    SMALLINT    NOT NULL DEFAULT 0,
    max_instances    SMALLINT    NOT NULL DEFAULT 1,
    queue_threshold  INTEGER     NOT NULL DEFAULT 5,       -- pending jobs before scale-up
    cooldown_secs    INTEGER     NOT NULL DEFAULT 300,     -- seconds between scaling actions
    budget_limit_cents BIGINT,                             -- per-rule budget cap (NULL = use provider's)
    enabled          BOOLEAN     NOT NULL DEFAULT true,
    last_scaled_at   TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cloud_scaling_rules_provider_gpu UNIQUE (provider_id, gpu_type_id)
);

CREATE INDEX idx_cloud_scaling_rules_provider ON cloud_scaling_rules(provider_id);
CREATE INDEX idx_cloud_scaling_rules_enabled  ON cloud_scaling_rules(enabled) WHERE enabled = true;

CREATE TRIGGER trg_cloud_scaling_rules_updated_at
    BEFORE UPDATE ON cloud_scaling_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
