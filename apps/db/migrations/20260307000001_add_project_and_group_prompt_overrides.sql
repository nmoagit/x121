-- Project-level and group-level prompt overrides.
--
-- Extends the prompt override hierarchy:
--   project_prompt_overrides  -> broadest scope
--   group_prompt_overrides    -> character-group scope
--   character_scene_prompt_overrides -> narrowest scope (already exists)

-- 1. Project-level prompt overrides.
CREATE TABLE project_prompt_overrides (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_slot_id  BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    fragments       JSONB  NOT NULL DEFAULT '[]'::jsonb,
    notes           TEXT,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_project_prompt_overrides_project_scene_slot
    ON project_prompt_overrides (project_id, scene_type_id, prompt_slot_id);
CREATE INDEX idx_project_prompt_overrides_project_id
    ON project_prompt_overrides (project_id);
CREATE INDEX idx_project_prompt_overrides_scene_type_id
    ON project_prompt_overrides (scene_type_id);
CREATE INDEX idx_project_prompt_overrides_prompt_slot_id
    ON project_prompt_overrides (prompt_slot_id);
CREATE INDEX idx_project_prompt_overrides_created_by
    ON project_prompt_overrides (created_by);
CREATE INDEX idx_project_prompt_overrides_fragments
    ON project_prompt_overrides USING GIN (fragments);

CREATE TRIGGER trg_project_prompt_overrides_updated_at
    BEFORE UPDATE ON project_prompt_overrides
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. Group-level prompt overrides.
CREATE TABLE group_prompt_overrides (
    id              BIGSERIAL PRIMARY KEY,
    group_id        BIGINT NOT NULL REFERENCES character_groups(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_slot_id  BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    fragments       JSONB  NOT NULL DEFAULT '[]'::jsonb,
    notes           TEXT,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_group_prompt_overrides_group_scene_slot
    ON group_prompt_overrides (group_id, scene_type_id, prompt_slot_id);
CREATE INDEX idx_group_prompt_overrides_group_id
    ON group_prompt_overrides (group_id);
CREATE INDEX idx_group_prompt_overrides_scene_type_id
    ON group_prompt_overrides (scene_type_id);
CREATE INDEX idx_group_prompt_overrides_prompt_slot_id
    ON group_prompt_overrides (prompt_slot_id);
CREATE INDEX idx_group_prompt_overrides_created_by
    ON group_prompt_overrides (created_by);
CREATE INDEX idx_group_prompt_overrides_fragments
    ON group_prompt_overrides USING GIN (fragments);

CREATE TRIGGER trg_group_prompt_overrides_updated_at
    BEFORE UPDATE ON group_prompt_overrides
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
