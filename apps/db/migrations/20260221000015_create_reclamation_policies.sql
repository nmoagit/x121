-- Reclamation policies for deferred disk cleanup (PRD-15).
--
-- Policies define which entity types are eligible for cleanup based on
-- age thresholds and conditions. Policies can be scoped to the entire
-- studio or a specific project.

-- Lookup table for policy scopes.
CREATE TABLE reclamation_policy_scopes (
    id          BIGSERIAL    PRIMARY KEY,
    name        TEXT         NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON reclamation_policy_scopes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO reclamation_policy_scopes (name, description) VALUES
    ('studio',  'Studio-wide reclamation policy'),
    ('project', 'Project-scoped reclamation policy');

-- Reclamation policies.
CREATE TABLE reclamation_policies (
    id                  BIGSERIAL    PRIMARY KEY,
    name                TEXT         NOT NULL,
    description         TEXT,
    scope_id            BIGINT       NOT NULL REFERENCES reclamation_policy_scopes(id),
    project_id          BIGINT       REFERENCES projects(id) ON DELETE CASCADE,
    entity_type         TEXT         NOT NULL,
    condition_field     TEXT         NOT NULL,
    condition_operator  TEXT         NOT NULL,
    condition_value     TEXT         NOT NULL,
    age_threshold_days  INT          NOT NULL DEFAULT 30,
    grace_period_days   INT          NOT NULL DEFAULT 7,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    priority            INT          NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON reclamation_policies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_reclamation_policies_scope_id ON reclamation_policies (scope_id);
CREATE INDEX idx_reclamation_policies_project_id ON reclamation_policies (project_id);
CREATE INDEX idx_reclamation_policies_entity_type ON reclamation_policies (entity_type);
CREATE INDEX idx_reclamation_policies_active ON reclamation_policies (is_active) WHERE is_active = true;

-- Seed default studio-wide policies.
INSERT INTO reclamation_policies (name, description, scope_id, entity_type, condition_field, condition_operator, condition_value, age_threshold_days, grace_period_days, priority) VALUES
    ('cleanup_rejected_variants',  'Remove rejected image variants after 14 days',  1, 'image_variant', 'status', 'eq', 'rejected',  14, 7, 10),
    ('cleanup_draft_scenes',       'Remove draft scene outputs after 30 days',      1, 'scene',         'status', 'eq', 'draft',     30, 7, 20),
    ('cleanup_failed_jobs',        'Remove failed job artifacts after 7 days',      1, 'job',           'status', 'eq', 'failed',     7, 3, 30);
