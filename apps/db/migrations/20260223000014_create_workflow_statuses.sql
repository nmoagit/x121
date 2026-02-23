-- PRD-75: ComfyUI Workflow Import & Validation
-- Lookup table for workflow lifecycle statuses.

CREATE TABLE workflow_statuses (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflow_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO workflow_statuses (name, description) VALUES
    ('draft',       'Workflow imported but not yet validated or tested'),
    ('validated',   'All nodes and models verified present on workers'),
    ('tested',      'Dry-run test passed successfully'),
    ('production',  'Approved for use in scene type configurations'),
    ('deprecated',  'Replaced by a newer version, no new assignments');
