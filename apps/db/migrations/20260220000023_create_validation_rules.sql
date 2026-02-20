-- Validation rules engine: rule type lookup and per-entity/per-field validation rules (PRD-14).

--------------------------------------------------------------------------------
-- validation_rule_types: lookup table for built-in rule kinds
--------------------------------------------------------------------------------

CREATE TABLE validation_rule_types (
    id          BIGSERIAL   PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_validation_rule_types_updated_at
    BEFORE UPDATE ON validation_rule_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed built-in rule types
INSERT INTO validation_rule_types (name, description) VALUES
    ('required',        'Field must be present and non-null'),
    ('type_check',      'Field must match expected data type'),
    ('min_length',      'String field minimum length'),
    ('max_length',      'String field maximum length'),
    ('min_value',       'Numeric field minimum value'),
    ('max_value',       'Numeric field maximum value'),
    ('enum_values',     'Field must be one of allowed values'),
    ('regex_pattern',   'Field must match regex pattern'),
    ('unique_in_scope', 'Field must be unique within a scope'),
    ('custom',          'Custom validation logic reference');

--------------------------------------------------------------------------------
-- validation_rules: per-entity, per-field rules with JSONB config
--------------------------------------------------------------------------------

CREATE TABLE validation_rules (
    id            BIGSERIAL   PRIMARY KEY,
    entity_type   TEXT        NOT NULL,
    field_name    TEXT        NOT NULL,
    rule_type_id  BIGINT      NOT NULL REFERENCES validation_rule_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    config        JSONB       NOT NULL DEFAULT '{}',
    error_message TEXT        NOT NULL,
    severity      TEXT        NOT NULL DEFAULT 'error',
    is_active     BOOLEAN     NOT NULL DEFAULT true,
    project_id    BIGINT      REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    sort_order    INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_validation_rules_rule_type_id ON validation_rules(rule_type_id);
CREATE INDEX idx_validation_rules_project_id   ON validation_rules(project_id);

-- Query indexes
CREATE INDEX idx_validation_rules_entity_type  ON validation_rules(entity_type);
CREATE INDEX idx_validation_rules_active       ON validation_rules(entity_type, is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE TRIGGER trg_validation_rules_updated_at
    BEFORE UPDATE ON validation_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
