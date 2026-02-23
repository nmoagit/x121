-- PRD-75: ComfyUI Workflow Import & Validation
-- Workflow version history for tracking changes over time.

CREATE TABLE workflow_versions (
    id                      BIGSERIAL PRIMARY KEY,
    workflow_id             BIGINT NOT NULL REFERENCES workflows(id)
                                ON DELETE CASCADE ON UPDATE CASCADE,
    version                 INTEGER NOT NULL,
    json_content            JSONB NOT NULL,
    discovered_params_json  JSONB,
    change_summary          TEXT,
    created_by              BIGINT REFERENCES users(id)
                                ON DELETE SET NULL ON UPDATE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_versions_workflow_id   ON workflow_versions(workflow_id);
CREATE UNIQUE INDEX uq_workflow_versions_workflow_version
    ON workflow_versions(workflow_id, version);
CREATE INDEX idx_workflow_versions_created_by    ON workflow_versions(created_by);
