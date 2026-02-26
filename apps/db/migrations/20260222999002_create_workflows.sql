-- PRD-75: ComfyUI Workflow Import & Validation
-- Main workflows table storing imported ComfyUI workflow definitions.

CREATE TABLE workflows (
    id                      BIGSERIAL PRIMARY KEY,
    name                    TEXT NOT NULL,
    description             TEXT,
    current_version         INTEGER NOT NULL DEFAULT 1,
    status_id               BIGINT NOT NULL REFERENCES workflow_statuses(id)
                                ON DELETE RESTRICT ON UPDATE CASCADE,
    json_content            JSONB NOT NULL,
    discovered_params_json  JSONB,
    validation_results_json JSONB,
    imported_from           TEXT,
    imported_by             BIGINT REFERENCES users(id)
                                ON DELETE SET NULL ON UPDATE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflows_status_id    ON workflows(status_id);
CREATE INDEX idx_workflows_imported_by  ON workflows(imported_by);
CREATE UNIQUE INDEX uq_workflows_name   ON workflows(name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
