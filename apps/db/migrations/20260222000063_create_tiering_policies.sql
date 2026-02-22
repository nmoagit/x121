-- PRD-48: External & Tiered Storage — automated tiering policies.

CREATE TABLE tiering_policies (
    id                    BIGSERIAL   PRIMARY KEY,
    name                  TEXT        NOT NULL,
    description           TEXT        NULL,
    source_tier           TEXT        NOT NULL CHECK (source_tier IN ('hot', 'cold')),
    target_tier           TEXT        NOT NULL CHECK (target_tier IN ('hot', 'cold')),
    target_backend_id     BIGINT      NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT,
    entity_type           TEXT        NOT NULL,
    condition_field       TEXT        NULL,
    condition_operator    TEXT        NULL,
    condition_value       TEXT        NULL,
    age_threshold_days    INTEGER     NULL,
    access_threshold_days INTEGER     NULL,
    project_id            BIGINT      NULL REFERENCES projects(id) ON DELETE SET NULL,
    is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tiering_policies_updated_at BEFORE UPDATE ON tiering_policies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
