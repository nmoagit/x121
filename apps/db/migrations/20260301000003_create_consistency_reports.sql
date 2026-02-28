-- PRD-94: Character Consistency Report
-- Stores per-character consistency analysis results including pairwise
-- similarity scores, overall consistency, and outlier scene identification.

CREATE TABLE consistency_reports (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scores_json JSONB NOT NULL,
    overall_consistency_score DOUBLE PRECISION,
    outlier_scene_ids BIGINT[],
    report_type TEXT NOT NULL DEFAULT 'face' CHECK (report_type IN ('face', 'color', 'full')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consistency_reports_character_id ON consistency_reports(character_id);
CREATE INDEX idx_consistency_reports_project_id ON consistency_reports(project_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON consistency_reports FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
