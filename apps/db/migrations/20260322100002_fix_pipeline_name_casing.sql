-- Fix pipeline display name casing: uppercase prefix → lowercase

UPDATE pipelines SET name = 'x121 Adult Content' WHERE code = 'x121' AND name = 'X121 Adult Content';
UPDATE pipelines SET name = 'y122 Speaker' WHERE code = 'y122' AND name = 'Y122 Speaker';
