-- Rename delivery_zip category to delivery_archive and switch to RAR format
-- with per-character naming via {character_slug} token.

UPDATE naming_categories
SET name = 'delivery_archive',
    description = 'Delivery archive file per model',
    example_output = 'luna.rar'
WHERE id = 12;

UPDATE naming_rules
SET template = '{character_slug}.rar',
    description = 'Default delivery archive naming (per model)'
WHERE category_id = 12 AND project_id IS NULL;
