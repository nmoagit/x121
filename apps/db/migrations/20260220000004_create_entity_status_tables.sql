-- Additional status lookup tables for PRD-01 entities.
-- Convention: SMALLSERIAL PK, name (unique key), label (display text).

CREATE TABLE character_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_character_statuses_updated_at
    BEFORE UPDATE ON character_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO character_statuses (name, label) VALUES
    ('draft',    'Draft'),
    ('active',   'Active'),
    ('archived', 'Archived');

CREATE TABLE image_variant_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_image_variant_statuses_updated_at
    BEFORE UPDATE ON image_variant_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO image_variant_statuses (name, label) VALUES
    ('pending',  'Pending'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected');

CREATE TABLE scene_type_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_scene_type_statuses_updated_at
    BEFORE UPDATE ON scene_type_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO scene_type_statuses (name, label) VALUES
    ('draft',      'Draft'),
    ('active',     'Active'),
    ('deprecated', 'Deprecated');
