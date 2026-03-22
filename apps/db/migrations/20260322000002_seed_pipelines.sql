-- Seed initial pipeline records: x121 (adult content) and y122 (speaker)

INSERT INTO pipelines (code, name, description, seed_slots, naming_rules, delivery_config)
VALUES
(
    'x121',
    'x121 Adult Content',
    'Two-track adult content pipeline with clothed and topless seed images',
    '[
        {"name": "clothed", "required": true, "description": "Clothed reference image"},
        {"name": "topless", "required": true, "description": "Topless reference image"}
    ]'::jsonb,
    '{
        "video_template": "{prefix}{scene_type}{transition}{index}.mp4",
        "prefix_rules": {"topless": "topless_", "clothed": ""},
        "transition_suffix": "_clothes_off"
    }'::jsonb,
    '{
        "archive_template": "{project}_{character}_{profile}",
        "folder_structure": "flat"
    }'::jsonb
),
(
    'y122',
    'y122 Speaker',
    'Single-track speaker pipeline with one seed image',
    '[
        {"name": "speaker", "required": true, "description": "Speaker reference image"}
    ]'::jsonb,
    '{
        "video_template": "{scene_type}{index}.mp4",
        "prefix_rules": {},
        "transition_suffix": ""
    }'::jsonb,
    '{
        "archive_template": "{project}_{character}_{profile}",
        "folder_structure": "flat"
    }'::jsonb
);
