-- Metadata templates and template fields for character ingest (PRD-113)

-- Reusable templates that define what metadata fields a character should have.
CREATE TABLE metadata_templates (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    project_id  BIGINT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    version     INTEGER NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_metadata_templates_updated_at
    BEFORE UPDATE ON metadata_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- At most one global default (project_id IS NULL AND is_default = true)
CREATE UNIQUE INDEX uq_metadata_templates_global_default
    ON metadata_templates ((true))
    WHERE project_id IS NULL AND is_default = true;

-- At most one default per project
CREATE UNIQUE INDEX uq_metadata_templates_project_default
    ON metadata_templates (project_id)
    WHERE project_id IS NOT NULL AND is_default = true;

-- FK index
CREATE INDEX idx_metadata_templates_project_id ON metadata_templates(project_id);

-- Individual fields belonging to a template.
CREATE TABLE metadata_template_fields (
    id          BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES metadata_templates(id) ON DELETE CASCADE ON UPDATE CASCADE,
    field_name  TEXT NOT NULL,
    field_type  TEXT NOT NULL CHECK (field_type IN ('string', 'number', 'boolean', 'array', 'object')),
    is_required BOOLEAN NOT NULL DEFAULT false,
    constraints JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_metadata_template_fields_updated_at
    BEFORE UPDATE ON metadata_template_fields
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Unique field name per template
CREATE UNIQUE INDEX uq_metadata_template_fields_template_field
    ON metadata_template_fields (template_id, field_name);

-- FK index
CREATE INDEX idx_metadata_template_fields_template_id ON metadata_template_fields(template_id);

-- Seed: default global template with common character fields
INSERT INTO metadata_templates (name, description, is_default)
VALUES ('Default Character Template', 'Standard character metadata fields', true);

INSERT INTO metadata_template_fields (template_id, field_name, field_type, is_required, description, sort_order)
VALUES
    (currval('metadata_templates_id_seq'), 'name',       'string',  true,  'Character display name',       0),
    (currval('metadata_templates_id_seq'), 'age',        'number',  false, 'Character age',                1),
    (currval('metadata_templates_id_seq'), 'ethnicity',  'string',  false, 'Character ethnicity',          2),
    (currval('metadata_templates_id_seq'), 'hair_color', 'string',  false, 'Hair color',                   3),
    (currval('metadata_templates_id_seq'), 'eye_color',  'string',  false, 'Eye color',                    4),
    (currval('metadata_templates_id_seq'), 'gender',     'string',  false, 'Character gender',             5),
    (currval('metadata_templates_id_seq'), 'bio',        'string',  false, 'Character biography / notes',  6);
