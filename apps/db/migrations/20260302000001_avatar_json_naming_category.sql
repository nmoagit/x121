-- Avatar JSON naming category (id=13) for character avatar export filenames.

INSERT INTO naming_categories (id, name, description, example_output) VALUES
    (13, 'avatar_json', 'Avatar JSON export', 'project_alpha_chloe.json');

INSERT INTO naming_rules (category_id, project_id, template, description) VALUES
    (13, NULL, '{project_slug}_{character_slug}.json', 'Default avatar JSON naming');
