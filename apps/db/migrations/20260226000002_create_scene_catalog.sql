-- PRD-111: Scene Catalog & Track Management
-- Create scene_catalog table (studio-level registry of content concepts)

CREATE TABLE scene_catalog (
    id                          BIGSERIAL PRIMARY KEY,
    name                        TEXT NOT NULL UNIQUE,
    slug                        TEXT NOT NULL UNIQUE,
    description                 TEXT,
    has_clothes_off_transition  BOOLEAN NOT NULL DEFAULT false,
    sort_order                  INTEGER NOT NULL DEFAULT 0,
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_scene_catalog_updated_at BEFORE UPDATE ON scene_catalog
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO scene_catalog (name, slug, has_clothes_off_transition, sort_order) VALUES
    ('Intro',              'intro',              false, 1),
    ('Idle',               'idle',               false, 2),
    ('Boobs Fondle',       'boobs_fondle',       true,  3),
    ('BJ',                 'bj',                 false, 4),
    ('Boobs Jumping',      'boobs_jumping',      true,  5),
    ('Bottom',             'bottom',             false, 6),
    ('Cowgirl',            'cowgirl',            false, 7),
    ('Cumshot',            'cumshot',            false, 8),
    ('Dance',              'dance',              false, 9),
    ('Deal',               'deal',               false, 10),
    ('Doggy',              'doggy',              false, 11),
    ('Feet',               'feet',               false, 12),
    ('From Behind',        'from_behind',        false, 13),
    ('Gloryhole Blowjob',  'gloryhole_blowjob', false, 14),
    ('Handjob',            'handjob',            false, 15),
    ('Kiss',               'kiss',               false, 16),
    ('Masturbation',       'masturbation',       false, 17),
    ('Missionary',         'missionary',         false, 18),
    ('Orgasm',             'orgasm',             false, 19),
    ('Pussy',              'pussy',              false, 20),
    ('Pussy Finger',       'pussy_finger',       false, 21),
    ('Reverse Cowgirl',    'reverse_cowgirl',    false, 22),
    ('Sex',                'sex',                false, 23),
    ('Side Fuck',          'side_fuck',          false, 24),
    ('Titwank',            'titwank',            false, 25),
    ('Twerking',           'twerking',           false, 26);
