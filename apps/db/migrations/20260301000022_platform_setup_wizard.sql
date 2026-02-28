-- PRD-105: Platform Setup Wizard
--
-- platform_setup: tracks completion state of each platform configuration step.
-- Pre-populated with the canonical step list so the frontend can always display
-- the full wizard even before any step has been attempted.

-- ---------------------------------------------------------------------------
-- platform_setup
-- ---------------------------------------------------------------------------

CREATE TABLE platform_setup (
    id              BIGSERIAL    PRIMARY KEY,
    step_name       TEXT         NOT NULL UNIQUE,
    completed       BOOLEAN      NOT NULL DEFAULT false,
    config_json     JSONB,
    validated_at    TIMESTAMPTZ,
    configured_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    error_message   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_setup_step_name ON platform_setup(step_name);

CREATE TRIGGER set_updated_at_platform_setup BEFORE UPDATE ON platform_setup
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Pre-populate the canonical wizard steps.
INSERT INTO platform_setup (step_name) VALUES
    ('database'),
    ('storage'),
    ('comfyui'),
    ('admin_account'),
    ('worker_registration'),
    ('integrations'),
    ('health_check');
