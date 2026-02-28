-- PRD-115: Generation Strategy & Workflow Prompt Management
--
-- 1. Add generation_strategy, expected_chunks, chunk_output_pattern to scene_types.
-- 2. Create workflow_prompt_slots for ComfyUI prompt node mapping.
-- 3. Create scene_type_prompt_defaults for per-slot scene-type prompts.
-- 4. Create character_scene_prompt_overrides for additive fragments.
-- 5. Create prompt_fragments and prompt_fragment_scene_pins for the fragment library.
-- 6. Create scene_artifacts for workflow-managed chunk QA tracking.

-- 1. Generation strategy selection per scene type (Req 1.1).
ALTER TABLE scene_types ADD COLUMN generation_strategy TEXT NOT NULL DEFAULT 'platform_orchestrated';
ALTER TABLE scene_types ADD COLUMN expected_chunks INTEGER;
ALTER TABLE scene_types ADD COLUMN chunk_output_pattern TEXT;

ALTER TABLE scene_types ADD CONSTRAINT ck_scene_types_generation_strategy
    CHECK (generation_strategy IN ('platform_orchestrated', 'workflow_managed'));

-- 2. Workflow prompt node mapping (Req 1.2).
CREATE TABLE workflow_prompt_slots (
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     BIGINT  NOT NULL REFERENCES workflows(id) ON DELETE CASCADE ON UPDATE CASCADE,
    node_id         TEXT    NOT NULL,
    input_name      TEXT    NOT NULL DEFAULT 'text',
    slot_label      TEXT    NOT NULL,
    slot_type       TEXT    NOT NULL DEFAULT 'positive',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    default_text    TEXT,
    is_user_editable BOOLEAN NOT NULL DEFAULT true,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_workflow_prompt_slots_workflow_node_input
    ON workflow_prompt_slots (workflow_id, node_id, input_name);
CREATE INDEX idx_workflow_prompt_slots_workflow_id
    ON workflow_prompt_slots (workflow_id);

ALTER TABLE workflow_prompt_slots ADD CONSTRAINT ck_workflow_prompt_slots_type
    CHECK (slot_type IN ('positive', 'negative'));

CREATE TRIGGER trg_workflow_prompt_slots_updated_at
    BEFORE UPDATE ON workflow_prompt_slots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 3. Scene-type prompt slot defaults (Req 1.3).
CREATE TABLE scene_type_prompt_defaults (
    id              BIGSERIAL PRIMARY KEY,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_slot_id  BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_text     TEXT   NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_scene_type_prompt_defaults_scene_type_slot
    ON scene_type_prompt_defaults (scene_type_id, prompt_slot_id);
CREATE INDEX idx_scene_type_prompt_defaults_scene_type_id
    ON scene_type_prompt_defaults (scene_type_id);
CREATE INDEX idx_scene_type_prompt_defaults_prompt_slot_id
    ON scene_type_prompt_defaults (prompt_slot_id);

CREATE TRIGGER trg_scene_type_prompt_defaults_updated_at
    BEFORE UPDATE ON scene_type_prompt_defaults
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 4. Character+scene prompt overrides with additive fragments (Req 1.4).
CREATE TABLE character_scene_prompt_overrides (
    id              BIGSERIAL PRIMARY KEY,
    character_id    BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_slot_id  BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    fragments       JSONB  NOT NULL DEFAULT '[]'::jsonb,
    notes           TEXT,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_char_scene_prompt_overrides_char_scene_slot
    ON character_scene_prompt_overrides (character_id, scene_type_id, prompt_slot_id);
CREATE INDEX idx_char_scene_prompt_overrides_character_id
    ON character_scene_prompt_overrides (character_id);
CREATE INDEX idx_char_scene_prompt_overrides_scene_type_id
    ON character_scene_prompt_overrides (scene_type_id);
CREATE INDEX idx_char_scene_prompt_overrides_prompt_slot_id
    ON character_scene_prompt_overrides (prompt_slot_id);
CREATE INDEX idx_char_scene_prompt_overrides_created_by
    ON character_scene_prompt_overrides (created_by);
CREATE INDEX idx_char_scene_prompt_overrides_fragments
    ON character_scene_prompt_overrides USING GIN (fragments);

CREATE TRIGGER trg_char_scene_prompt_overrides_updated_at
    BEFORE UPDATE ON character_scene_prompt_overrides
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 5. Prompt fragment library with scene-type pinning (Req 1.5).
CREATE TABLE prompt_fragments (
    id              BIGSERIAL PRIMARY KEY,
    text            TEXT    NOT NULL,
    description     TEXT,
    category        TEXT,
    tags            JSONB   NOT NULL DEFAULT '[]'::jsonb,
    usage_count     INTEGER NOT NULL DEFAULT 0,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_fragments_tags ON prompt_fragments USING GIN (tags);
CREATE INDEX idx_prompt_fragments_text ON prompt_fragments USING GIN (to_tsvector('english', text));
CREATE INDEX idx_prompt_fragments_category ON prompt_fragments (category) WHERE category IS NOT NULL;
CREATE INDEX idx_prompt_fragments_created_by ON prompt_fragments (created_by);

CREATE TRIGGER trg_prompt_fragments_updated_at
    BEFORE UPDATE ON prompt_fragments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE prompt_fragment_scene_pins (
    fragment_id     BIGINT NOT NULL REFERENCES prompt_fragments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (fragment_id, scene_type_id)
);

CREATE INDEX idx_prompt_fragment_scene_pins_scene_type_id
    ON prompt_fragment_scene_pins (scene_type_id);

-- 6. Scene artifacts for workflow-managed chunk QA (Req 1.8).
CREATE TABLE scene_artifacts (
    id              BIGSERIAL PRIMARY KEY,
    scene_id        BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    artifact_type   TEXT   NOT NULL,
    sequence_index  INTEGER,
    file_path       TEXT   NOT NULL,
    duration_secs   DOUBLE PRECISION,
    resolution      TEXT,
    metadata        JSONB  NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scene_artifacts_scene_id ON scene_artifacts (scene_id);

ALTER TABLE scene_artifacts ADD CONSTRAINT ck_scene_artifacts_type
    CHECK (artifact_type IN ('chunk', 'interpolated', 'upscaled', 'final'));

CREATE TRIGGER trg_scene_artifacts_updated_at
    BEFORE UPDATE ON scene_artifacts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
