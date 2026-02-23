-- Content Branching & Exploration (PRD-50).
-- Git-like branching for scenes, enabling concurrent creative exploration.

CREATE TABLE branches (
    id BIGSERIAL PRIMARY KEY,
    scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    parent_branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    depth INTEGER NOT NULL DEFAULT 0,
    parameters_snapshot JSONB NOT NULL,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_branches_scene_id ON branches(scene_id);
CREATE INDEX idx_branches_parent_branch_id ON branches(parent_branch_id);
CREATE INDEX idx_branches_created_by_id ON branches(created_by_id);
CREATE UNIQUE INDEX uq_branches_scene_default ON branches(scene_id) WHERE is_default = true;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
