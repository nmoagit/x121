-- PRD-51: Undo/Redo Architecture
-- Per-user, per-entity undo tree storage with branching support.

CREATE TABLE undo_trees (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    tree_json JSONB NOT NULL DEFAULT '{}',
    current_node_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_undo_trees_user_id ON undo_trees(user_id);
CREATE INDEX idx_undo_trees_entity ON undo_trees(entity_type, entity_id);
CREATE UNIQUE INDEX uq_undo_trees_user_entity ON undo_trees(user_id, entity_type, entity_id);
CREATE TRIGGER trg_undo_trees_updated_at BEFORE UPDATE ON undo_trees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
