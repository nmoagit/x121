-- Naming category lookup table (PRD-116)
CREATE TABLE naming_categories (
    id          SMALLINT PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    example_output TEXT
);

INSERT INTO naming_categories (id, name, description, example_output) VALUES
    (1,  'scene_video',        'Generated scene video files',                'topless_dance_clothes_off_1.mp4'),
    (2,  'image_variant',      'Source image variants',                      'variant_chloe_clothed_v2.png'),
    (3,  'scene_video_import', 'Imported scene videos',                      'scene_chloe_dance_20260224.mp4'),
    (4,  'thumbnail',          'Video frame thumbnails',                     'frame_000042.jpg'),
    (5,  'metadata_export',    'Metadata JSON files',                        'chloe_character_metadata.json'),
    (6,  'delivery_video',     'Video files in delivery ZIP',                'dance.mp4'),
    (7,  'delivery_image',     'Images in delivery ZIP',                     'clothed.png'),
    (8,  'delivery_metadata',  'Metadata in delivery ZIP',                   'metadata.json'),
    (9,  'delivery_folder',    'Folder structure in delivery ZIP',           'project_name/character_name'),
    (10, 'test_shot',          'Test shot outputs',                          'test_chloe_dance_001.mp4'),
    (11, 'chunk_artifact',     'Intermediate chunk files',                   'chunk_001_chloe_dance.mp4'),
    (12, 'delivery_zip',       'Delivery ZIP file',                          'project_alpha_delivery_20260224.zip');

-- Naming rules table
CREATE TABLE naming_rules (
    id          BIGSERIAL PRIMARY KEY,
    category_id SMALLINT NOT NULL REFERENCES naming_categories(id),
    project_id  BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    template    TEXT NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    changelog   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by  BIGINT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_naming_rules_category_project
    ON naming_rules (category_id, COALESCE(project_id, 0));
CREATE INDEX idx_naming_rules_category_id ON naming_rules (category_id);
CREATE INDEX idx_naming_rules_project_id ON naming_rules (project_id) WHERE project_id IS NOT NULL;

CREATE TRIGGER set_updated_at_naming_rules
    BEFORE UPDATE ON naming_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default global rules matching current hardcoded patterns
INSERT INTO naming_rules (category_id, project_id, template, description) VALUES
    (1,  NULL, '{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4', 'Default scene video naming'),
    (2,  NULL, 'variant_{character_slug}_{variant_label}_v{version}.{ext}', 'Default image variant naming'),
    (3,  NULL, 'scene_{character_slug}_{scene_type_slug}_{date_compact}.{ext}', 'Default imported video naming'),
    (4,  NULL, 'frame_{frame_number:06}.jpg', 'Default thumbnail naming'),
    (5,  NULL, '{character_slug}_{metadata_type}.json', 'Default metadata export naming'),
    (6,  NULL, '{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4', 'Default delivery video naming'),
    (7,  NULL, '{variant_label}.{ext}', 'Default delivery image naming'),
    (8,  NULL, 'metadata.json', 'Default delivery metadata naming'),
    (9,  NULL, '{project_slug}/{character_slug}', 'Default delivery folder structure'),
    (10, NULL, 'test_{character_slug}_{scene_type_slug}_{sequence:03}.mp4', 'Default test shot naming'),
    (11, NULL, 'chunk_{sequence:03}_{character_slug}_{scene_type_slug}.mp4', 'Default chunk artifact naming'),
    (12, NULL, '{project_slug}_delivery_{date_compact}.zip', 'Default delivery ZIP naming');
