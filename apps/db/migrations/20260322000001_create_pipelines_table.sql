-- Create the pipelines table for managing video generation pipeline configurations.

CREATE TABLE pipelines (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    seed_slots      JSONB NOT NULL DEFAULT '[]'::jsonb,
    naming_rules    JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_pipelines_updated_at
    BEFORE UPDATE ON pipelines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_pipelines_code ON pipelines(code);
CREATE INDEX idx_pipelines_is_active ON pipelines(is_active);
