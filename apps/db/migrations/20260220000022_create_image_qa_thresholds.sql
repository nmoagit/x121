-- Per-project QA threshold overrides for source image quality assurance (PRD-22).

--------------------------------------------------------------------------------
-- image_qa_thresholds: configurable pass/warn/fail thresholds per check type
--------------------------------------------------------------------------------

CREATE TABLE image_qa_thresholds (
    id             BIGSERIAL        PRIMARY KEY,
    project_id     BIGINT           REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type_id  BIGINT           NOT NULL REFERENCES qa_check_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    warn_threshold DOUBLE PRECISION NOT NULL,
    fail_threshold DOUBLE PRECISION NOT NULL,
    is_blocking    BOOLEAN          NOT NULL DEFAULT false,
    config         JSONB,
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_image_qa_thresholds_project_id    ON image_qa_thresholds(project_id);
CREATE INDEX idx_image_qa_thresholds_check_type_id ON image_qa_thresholds(check_type_id);

CREATE TRIGGER trg_image_qa_thresholds_updated_at
    BEFORE UPDATE ON image_qa_thresholds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
