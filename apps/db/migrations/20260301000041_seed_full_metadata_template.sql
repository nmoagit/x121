-- Seed full 31-field metadata template matching production schema.
-- Replaces the minimal default template seed from 20260227000006.

-- Delete existing seed fields from the global default template.
DELETE FROM metadata_template_fields
WHERE template_id = (
    SELECT id FROM metadata_templates
    WHERE is_default = true AND project_id IS NULL
    LIMIT 1
);

-- Insert the full production schema (31 fields).
-- Uses a CTE to fetch the template id once.
WITH tpl AS (
    SELECT id FROM metadata_templates
    WHERE is_default = true AND project_id IS NULL
    LIMIT 1
)
INSERT INTO metadata_template_fields (template_id, field_name, field_type, is_required, description, sort_order)
SELECT tpl.id, v.field_name, v.field_type, v.is_required, v.description, v.sort_order
FROM tpl, (VALUES
    -- Required biographical (0-9)
    ('VoiceProvider',                'string', true,  'Voice provider name',          0),
    ('VoiceID',                      'string', true,  'Voice ID',                     1),
    ('bio',                          'string', true,  'Character biography',          2),
    ('gender',                       'string', true,  'Gender',                       3),
    ('sexual_orientation',           'string', true,  'Sexual orientation',           4),
    ('age',                          'number', true,  'Age',                          5),
    ('relationship_status',          'string', true,  'Relationship status',          6),
    ('birthplace',                   'string', true,  'Birthplace',                   7),
    ('current_job',                  'string', true,  'Current job',                  8),
    ('ethnicity',                    'string', true,  'Ethnicity',                    9),
    -- Required appearance (100-102)
    ('appearance.hair',              'string', true,  'Hair description',           100),
    ('appearance.eye_color',         'string', true,  'Eye color',                  101),
    ('appearance.body_type',         'string', true,  'Body type',                  102),
    -- Required favorites (200-204)
    ('favorites.color',              'string', true,  'Favorite color',             200),
    ('favorites.food',               'string', true,  'Favorite food',              201),
    ('favorites.beverage',           'string', true,  'Favorite beverage',          202),
    ('favorites.movie',              'string', true,  'Favorite movie',             203),
    ('favorites.tv_show',            'string', true,  'Favorite TV show',           204),
    -- Required sexual_preferences (300-301)
    ('sexual_preferences.positions', 'string', true,  'Preferred positions',        300),
    ('sexual_preferences.kinks',     'string', true,  'Kinks',                      301),
    -- Optional (400+)
    ('hobbies',                      'string', false, 'Hobbies',                    400),
    ('dislikes',                     'string', false, 'Dislikes',                   401),
    ('biggest_dream',                'string', false, 'Biggest dream',              402),
    ('guilty_pleasure',              'string', false, 'Guilty pleasure',            403),
    ('love_language',                'string', false, 'Love language',              404),
    ('phobia',                       'string', false, 'Phobia',                     405),
    ('habits',                       'string', false, 'Habits',                     406),
    ('personality',                  'string', false, 'Personality description',    407),
    ('backstory',                    'string', false, 'Backstory',                  408),
    ('interesting_facts',            'string', false, 'Interesting facts',          409),
    ('personal_experience',          'string', false, 'Personal experience',        410)
) AS v(field_name, field_type, is_required, description, sort_order);
