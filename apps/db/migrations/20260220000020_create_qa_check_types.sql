-- QA check type lookup table for source image quality assurance (PRD-22).

--------------------------------------------------------------------------------
-- qa_check_types: defines the kinds of quality checks run on images
--------------------------------------------------------------------------------

CREATE TABLE qa_check_types (
    id          BIGSERIAL   PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    category    TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_qa_check_types_updated_at
    BEFORE UPDATE ON qa_check_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed check types

-- Technical checks
INSERT INTO qa_check_types (name, category, description) VALUES
    ('resolution', 'technical', 'Minimum resolution and aspect ratio validation'),
    ('format',     'technical', 'Image format validation (PNG, JPEG, WebP)');

-- Quality checks
INSERT INTO qa_check_types (name, category, description) VALUES
    ('face_detection', 'quality', 'Face presence and detection confidence'),
    ('face_centering', 'quality', 'Face position within the center zone'),
    ('face_size',      'quality', 'Minimum face size as percentage of image'),
    ('sharpness',      'quality', 'Blur detection and sharpness score'),
    ('lighting',       'quality', 'Lighting consistency and exposure assessment'),
    ('artifacts',      'quality', 'AI artifact and compression artifact detection');

-- Likeness checks
INSERT INTO qa_check_types (name, category, description) VALUES
    ('likeness', 'likeness', 'Face similarity between source and variant');
