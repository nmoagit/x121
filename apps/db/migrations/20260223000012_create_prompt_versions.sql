-- Prompt versioning for scene types (PRD-63).
--
-- Each row stores one version of the positive/negative prompt pair for a scene type.
-- Versions are auto-incremented per scene type (unique constraint enforces this).

CREATE TABLE prompt_versions (
    id              BIGSERIAL    PRIMARY KEY,
    scene_type_id   BIGINT       NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version         INTEGER      NOT NULL,
    positive_prompt TEXT         NOT NULL,
    negative_prompt TEXT,
    change_notes    TEXT,
    created_by_id   BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_versions_scene_type_id ON prompt_versions(scene_type_id);
CREATE UNIQUE INDEX uq_prompt_versions_scene_type_version ON prompt_versions(scene_type_id, version);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompt_versions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
