BEGIN;

CREATE TABLE workflow_media_slots (
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    node_id         TEXT NOT NULL,
    input_name      TEXT NOT NULL DEFAULT 'image',
    class_type      TEXT NOT NULL,
    slot_label      TEXT NOT NULL,
    media_type      TEXT NOT NULL DEFAULT 'image',
    is_required     BOOLEAN NOT NULL DEFAULT true,
    fallback_mode   TEXT,
    fallback_value  TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    description     TEXT,
    seed_slot_name  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, node_id, input_name)
);

CREATE INDEX idx_workflow_media_slots_workflow_id ON workflow_media_slots(workflow_id);

ALTER TABLE workflow_media_slots ADD CONSTRAINT ck_workflow_media_slots_media_type
    CHECK (media_type IN ('image', 'video', 'audio', 'other'));

ALTER TABLE workflow_media_slots ADD CONSTRAINT ck_workflow_media_slots_fallback_mode
    CHECK (fallback_mode IS NULL OR fallback_mode IN ('skip_node', 'use_default', 'auto_generate'));

CREATE TRIGGER trg_workflow_media_slots_updated_at
    BEFORE UPDATE ON workflow_media_slots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
