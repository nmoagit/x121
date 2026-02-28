-- Cloud GPU type catalog (PRD-114).
CREATE TABLE cloud_gpu_types (
    id             BIGSERIAL   PRIMARY KEY,
    provider_id    BIGINT      NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
    gpu_id         TEXT        NOT NULL,                   -- provider's GPU identifier (e.g. "NVIDIA RTX PRO 6000")
    name           TEXT        NOT NULL,                   -- display name
    vram_mb        INTEGER     NOT NULL,
    cost_per_hour_cents INTEGER NOT NULL,                  -- in cents for precision
    max_gpu_count  SMALLINT    NOT NULL DEFAULT 1,
    available      BOOLEAN     NOT NULL DEFAULT true,
    metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cloud_gpu_types_provider_gpu UNIQUE (provider_id, gpu_id)
);

CREATE INDEX idx_cloud_gpu_types_provider  ON cloud_gpu_types(provider_id);
CREATE INDEX idx_cloud_gpu_types_available ON cloud_gpu_types(available) WHERE available = true;

CREATE TRIGGER trg_cloud_gpu_types_updated_at
    BEFORE UPDATE ON cloud_gpu_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
