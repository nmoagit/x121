BEGIN;

CREATE TABLE avatar_media_assignments (
    id                   BIGSERIAL PRIMARY KEY,
    avatar_id            BIGINT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    media_slot_id        BIGINT NOT NULL REFERENCES workflow_media_slots(id) ON DELETE CASCADE,
    scene_type_id        BIGINT REFERENCES scene_types(id) ON DELETE CASCADE,
    image_variant_id     BIGINT REFERENCES image_variants(id) ON DELETE SET NULL,
    file_path            TEXT,
    media_type           TEXT NOT NULL DEFAULT 'image',
    is_passthrough       BOOLEAN NOT NULL DEFAULT false,
    passthrough_track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    notes                TEXT,
    created_by           BIGINT REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (avatar_id, media_slot_id, scene_type_id)
);

CREATE INDEX idx_avatar_media_assignments_avatar ON avatar_media_assignments(avatar_id);
CREATE INDEX idx_avatar_media_assignments_slot ON avatar_media_assignments(media_slot_id);

ALTER TABLE avatar_media_assignments ADD CONSTRAINT ck_avatar_media_assignments_media_type
    CHECK (media_type IN ('image', 'video', 'audio', 'other'));

ALTER TABLE avatar_media_assignments ADD CONSTRAINT ck_avatar_media_assignments_source
    CHECK (image_variant_id IS NOT NULL OR file_path IS NOT NULL);

ALTER TABLE avatar_media_assignments ADD CONSTRAINT ck_avatar_media_assignments_passthrough
    CHECK (NOT is_passthrough OR passthrough_track_id IS NOT NULL);

CREATE TRIGGER trg_avatar_media_assignments_updated_at
    BEFORE UPDATE ON avatar_media_assignments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
