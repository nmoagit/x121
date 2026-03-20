-- Speech JSON naming category (id=14) for speech data in delivery exports.

INSERT INTO naming_categories (id, name, description, example_output) VALUES
    (14, 'delivery_speech', 'Speech JSON in delivery ZIP', 'speech.json');

INSERT INTO naming_rules (category_id, project_id, template, description) VALUES
    (14, NULL, 'speech.json', 'Default speech delivery naming');
