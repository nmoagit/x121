-- Cloud GPU instances / provisioned pods (PRD-114).
CREATE TABLE cloud_instances (
    id              BIGSERIAL   PRIMARY KEY,
    provider_id     BIGINT      NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
    gpu_type_id     BIGINT      NOT NULL REFERENCES cloud_gpu_types(id) ON DELETE RESTRICT,
    external_id     TEXT        NOT NULL,                 -- provider's pod/instance ID
    name            TEXT,
    status_id       SMALLINT    NOT NULL REFERENCES cloud_instance_statuses(id) ON DELETE RESTRICT DEFAULT 1,
    ip_address      TEXT,
    ssh_port        INTEGER,
    gpu_count       SMALLINT    NOT NULL DEFAULT 1,
    cost_per_hour_cents INTEGER NOT NULL,
    total_cost_cents BIGINT     NOT NULL DEFAULT 0,       -- accumulated cost
    metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    started_at      TIMESTAMPTZ,
    stopped_at      TIMESTAMPTZ,
    last_health_check TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cloud_instances_external UNIQUE (provider_id, external_id)
);

CREATE INDEX idx_cloud_instances_provider   ON cloud_instances(provider_id);
CREATE INDEX idx_cloud_instances_gpu_type   ON cloud_instances(gpu_type_id);
CREATE INDEX idx_cloud_instances_status     ON cloud_instances(status_id);
CREATE INDEX idx_cloud_instances_external   ON cloud_instances(external_id);
CREATE INDEX idx_cloud_instances_metadata   ON cloud_instances USING GIN (metadata);

-- Active instances (non-terminated) for scaling queries
CREATE INDEX idx_cloud_instances_active
    ON cloud_instances(provider_id, gpu_type_id)
    WHERE status_id NOT IN (7, 8);  -- not terminated, not error

CREATE TRIGGER trg_cloud_instances_updated_at
    BEFORE UPDATE ON cloud_instances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
