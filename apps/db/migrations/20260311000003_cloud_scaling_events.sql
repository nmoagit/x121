-- Audit log for auto-scaling decisions.
--
-- Records every scaling evaluation with the decision, reason, and context
-- so operators can understand why scaling happened (or didn't).

CREATE TABLE cloud_scaling_events (
    id          BIGSERIAL PRIMARY KEY,
    rule_id     BIGINT NOT NULL REFERENCES cloud_scaling_rules(id) ON DELETE CASCADE,
    provider_id BIGINT NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,          -- 'scale_up', 'scale_down', 'no_change'
    reason      TEXT NOT NULL,          -- human-readable explanation
    instances_changed SMALLINT NOT NULL DEFAULT 0,
    queue_depth INTEGER NOT NULL DEFAULT 0,
    current_count SMALLINT NOT NULL DEFAULT 0,
    budget_spent_cents BIGINT NOT NULL DEFAULT 0,
    cooldown_remaining_secs INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scaling_events_rule_id ON cloud_scaling_events(rule_id);
CREATE INDEX idx_scaling_events_provider_id ON cloud_scaling_events(provider_id);
CREATE INDEX idx_scaling_events_created_at ON cloud_scaling_events(created_at DESC);
