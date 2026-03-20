-- Update naming category descriptions to say "archive" instead of "ZIP".

UPDATE naming_categories SET description = 'Video files in delivery archive' WHERE id = 6;
UPDATE naming_categories SET description = 'Images in delivery archive' WHERE id = 7;
UPDATE naming_categories SET description = 'Metadata in delivery archive' WHERE id = 8;
UPDATE naming_categories SET description = 'Folder structure in delivery archive' WHERE id = 9;
UPDATE naming_categories SET description = 'Speech JSON in delivery archive' WHERE id = 14;
