CREATE TABLE avatar_images (
    id                      BIGSERIAL PRIMARY KEY,
    avatar_id               BIGINT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    image_type_id           BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id                BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    media_variant_id        BIGINT REFERENCES media_variants(id) ON DELETE SET NULL,
    status_id               SMALLINT NOT NULL DEFAULT 1,
    generation_started_at   TIMESTAMPTZ,
    generation_completed_at TIMESTAMPTZ,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One image per avatar + image_type + track combo
CREATE UNIQUE INDEX uq_avatar_images_combo
    ON avatar_images (avatar_id, image_type_id, COALESCE(track_id, -1))
    WHERE deleted_at IS NULL;

CREATE INDEX idx_avatar_images_avatar_id ON avatar_images (avatar_id);
CREATE INDEX idx_avatar_images_image_type_id ON avatar_images (image_type_id);
CREATE INDEX idx_avatar_images_status_id ON avatar_images (status_id);

CREATE TRIGGER trg_avatar_images_updated_at
    BEFORE UPDATE ON avatar_images
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
