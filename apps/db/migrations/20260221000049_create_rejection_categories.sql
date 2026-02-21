-- Rejection reason categories for segment review decisions (PRD-35).
--
-- Predefined defect categories used when rejecting a segment during review.

CREATE TABLE IF NOT EXISTS rejection_categories (
    id          BIGSERIAL    PRIMARY KEY,
    name        TEXT         NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_rejection_categories_updated_at
    BEFORE UPDATE ON rejection_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO rejection_categories (name, description) VALUES
    ('face_artifact',      'Face deformation, melting, or identity loss'),
    ('motion_artifact',    'Unnatural movement, jitter, or pops'),
    ('lighting_mismatch',  'Inconsistent lighting or color'),
    ('hand_artifact',      'Hand deformation or extra fingers'),
    ('boundary_pop',       'Visible boundary or transition artifact'),
    ('other',              'Other issue not categorized');
