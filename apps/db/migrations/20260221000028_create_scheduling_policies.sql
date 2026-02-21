-- Scheduling policies table (PRD-08).
-- Stores configurable scheduling rules: off-peak windows, quota policies, etc.
-- The JSONB config column allows policy-specific parameters without schema changes.

CREATE TABLE scheduling_policies (
    id         BIGSERIAL   PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    policy_type TEXT       NOT NULL,
    config     JSONB       NOT NULL DEFAULT '{}',
    is_enabled BOOLEAN     NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_scheduling_policies_updated_at
    BEFORE UPDATE ON scheduling_policies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Default off-peak policy: 10pm-8am UTC.
INSERT INTO scheduling_policies (name, policy_type, config) VALUES
    ('default_off_peak', 'off_peak', '{"start_hour": 22, "end_hour": 8, "timezone": "UTC"}');
