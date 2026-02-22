-- PRD-49: Automated Quality Gates — qa_thresholds table
--
-- Stores per-project or studio-level (project_id IS NULL) QA thresholds.
-- Project-level overrides take precedence; studio-level serves as the fallback.

CREATE TABLE IF NOT EXISTS qa_thresholds (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type      TEXT NOT NULL,
    warn_threshold  DOUBLE PRECISION NOT NULL,
    fail_threshold  DOUBLE PRECISION NOT NULL,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qa_thresholds_project_id ON qa_thresholds(project_id);

-- One threshold per (project, check_type) for project-level overrides.
CREATE UNIQUE INDEX uq_qa_thresholds_project_check
    ON qa_thresholds(project_id, check_type)
    WHERE project_id IS NOT NULL;

-- One threshold per check_type for studio-level defaults (project_id IS NULL).
CREATE UNIQUE INDEX uq_qa_thresholds_studio_check
    ON qa_thresholds(check_type)
    WHERE project_id IS NULL;

CREATE TRIGGER trg_qa_thresholds_updated_at
    BEFORE UPDATE ON qa_thresholds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default studio-level thresholds.
INSERT INTO qa_thresholds (project_id, check_type, warn_threshold, fail_threshold) VALUES
    (NULL, 'face_confidence',  0.7,  0.4),
    (NULL, 'boundary_ssim',    0.85, 0.65),
    (NULL, 'motion',           0.3,  0.1),
    (NULL, 'resolution',       1.0,  1.0),
    (NULL, 'artifacts',        0.8,  0.5),
    (NULL, 'likeness_drift',   0.8,  0.6);
