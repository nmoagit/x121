-- PRD-033: Node-Based Workflow Canvas — canvas layout persistence.
--
-- Table: workflow_layouts (stores React Flow canvas state and node positions per workflow).

CREATE TABLE workflow_layouts (
    id                   BIGSERIAL    PRIMARY KEY,
    workflow_id          BIGINT       NOT NULL,
    canvas_json          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    node_positions_json  JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_workflow_layouts_workflow_id ON workflow_layouts(workflow_id);
CREATE INDEX idx_workflow_layouts_workflow_id ON workflow_layouts(workflow_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflow_layouts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
