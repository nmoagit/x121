-- Character groups within a project (PRD-112 Req 1.4)
CREATE TABLE character_groups (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_character_groups_updated_at
    BEFORE UPDATE ON character_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK index
CREATE INDEX idx_character_groups_project_id ON character_groups(project_id);

-- Unique group name per project (among non-deleted)
CREATE UNIQUE INDEX uq_character_groups_project_name
    ON character_groups (project_id, name)
    WHERE deleted_at IS NULL;

-- Soft-delete filter index
CREATE INDEX idx_character_groups_deleted_at
    ON character_groups (deleted_at)
    WHERE deleted_at IS NOT NULL;
