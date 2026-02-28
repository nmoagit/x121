-- Cloud cost audit log (PRD-114).
CREATE TABLE cloud_cost_events (
    id            BIGSERIAL   PRIMARY KEY,
    instance_id   BIGINT      NOT NULL REFERENCES cloud_instances(id) ON DELETE CASCADE,
    provider_id   BIGINT      NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
    event_type    TEXT        NOT NULL,                    -- 'hourly_charge', 'provision', 'terminate', 'adjustment'
    amount_cents  BIGINT      NOT NULL,
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_cost_events_instance   ON cloud_cost_events(instance_id);
CREATE INDEX idx_cloud_cost_events_provider   ON cloud_cost_events(provider_id);
CREATE INDEX idx_cloud_cost_events_type       ON cloud_cost_events(event_type);
CREATE INDEX idx_cloud_cost_events_created_at ON cloud_cost_events(created_at);

-- Composite index for provider cost summaries in a date range
CREATE INDEX idx_cloud_cost_events_provider_range
    ON cloud_cost_events(provider_id, created_at);
