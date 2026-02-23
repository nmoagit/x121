-- PRD-79: Character Duplicate Detection — duplicate_detection_settings table
--
-- Per-project (or studio-level where project_id IS NULL) configuration for
-- the duplicate detection feature: similarity threshold and auto-check toggles.

CREATE TABLE IF NOT EXISTS duplicate_detection_settings (
    id                    BIGSERIAL PRIMARY KEY,
    project_id            BIGINT REFERENCES projects(id)
                              ON DELETE CASCADE ON UPDATE CASCADE,
    similarity_threshold  DOUBLE PRECISION NOT NULL DEFAULT 0.90,
    auto_check_on_upload  BOOLEAN NOT NULL DEFAULT true,
    auto_check_on_batch   BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_duplicate_settings_project
    ON duplicate_detection_settings(project_id);

CREATE TRIGGER trg_duplicate_detection_settings_updated_at
    BEFORE UPDATE ON duplicate_detection_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed studio-level default settings (project_id IS NULL).
INSERT INTO duplicate_detection_settings (project_id, similarity_threshold)
    VALUES (NULL, 0.90);
