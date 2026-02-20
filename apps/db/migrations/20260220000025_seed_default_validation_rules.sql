-- Seed default validation rules for core entity types (PRD-14).

-- Character validation rules
INSERT INTO validation_rules (entity_type, field_name, rule_type_id, config, error_message, sort_order) VALUES
    ('characters', 'name',       (SELECT id FROM validation_rule_types WHERE name = 'required'),      '{}',                                'Character name is required',                                                          1),
    ('characters', 'name',       (SELECT id FROM validation_rule_types WHERE name = 'max_length'),    '{"max": 200}',                      'Character name must be 200 characters or fewer',                                      2),
    ('characters', 'name',       (SELECT id FROM validation_rule_types WHERE name = 'regex_pattern'), '{"pattern": "^[a-zA-Z0-9_ -]+$"}', 'Character name may only contain letters, numbers, spaces, hyphens, and underscores',  3),
    ('characters', 'project_id', (SELECT id FROM validation_rule_types WHERE name = 'required'),      '{}',                                'Project is required',                                                                 4);

-- Scene validation rules
INSERT INTO validation_rules (entity_type, field_name, rule_type_id, config, error_message, sort_order) VALUES
    ('scenes', 'character_id',  (SELECT id FROM validation_rule_types WHERE name = 'required'), '{}', 'Character is required for a scene', 1),
    ('scenes', 'scene_type_id', (SELECT id FROM validation_rule_types WHERE name = 'required'), '{}', 'Scene type is required',            2);

-- Segment validation rules
INSERT INTO validation_rules (entity_type, field_name, rule_type_id, config, error_message, sort_order) VALUES
    ('segments', 'scene_id',       (SELECT id FROM validation_rule_types WHERE name = 'required'),  '{}',         'Scene is required for a segment',   1),
    ('segments', 'sequence_index', (SELECT id FROM validation_rule_types WHERE name = 'min_value'), '{"min": 1}', 'Sequence index must be at least 1', 2);

-- Project validation rules
INSERT INTO validation_rules (entity_type, field_name, rule_type_id, config, error_message, sort_order) VALUES
    ('projects', 'name', (SELECT id FROM validation_rule_types WHERE name = 'required'),   '{}',            'Project name is required',                   1),
    ('projects', 'name', (SELECT id FROM validation_rule_types WHERE name = 'max_length'), '{"max": 200}',  'Project name must be 200 characters or fewer', 2);
