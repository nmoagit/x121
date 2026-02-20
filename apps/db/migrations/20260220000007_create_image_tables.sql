-- Image tables: source_images, derived_images, and image_variants.
-- All three are tightly coupled and created together.

-- ---------------------------------------------------------------
-- source_images: original uploads for a character
-- ---------------------------------------------------------------
CREATE TABLE source_images (
    id           BIGSERIAL PRIMARY KEY,
    character_id BIGINT  NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    file_path    TEXT    NOT NULL,
    description  TEXT,
    is_primary   BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_images_character_id ON source_images(character_id);

CREATE TRIGGER trg_source_images_updated_at
    BEFORE UPDATE ON source_images
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- derived_images: images generated from a source image
-- ---------------------------------------------------------------
CREATE TABLE derived_images (
    id              BIGSERIAL PRIMARY KEY,
    source_image_id BIGINT NOT NULL REFERENCES source_images(id) ON DELETE CASCADE ON UPDATE CASCADE,
    character_id    BIGINT NOT NULL REFERENCES characters(id)    ON DELETE CASCADE ON UPDATE CASCADE,
    file_path       TEXT   NOT NULL,
    variant_type    TEXT   NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_derived_images_source_image_id ON derived_images(source_image_id);
CREATE INDEX idx_derived_images_character_id    ON derived_images(character_id);

CREATE TRIGGER trg_derived_images_updated_at
    BEFORE UPDATE ON derived_images
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- image_variants: approved/rejected variants linking to source or derived
-- ---------------------------------------------------------------
CREATE TABLE image_variants (
    id               BIGSERIAL PRIMARY KEY,
    character_id     BIGINT   NOT NULL REFERENCES characters(id)             ON DELETE CASCADE  ON UPDATE CASCADE,
    source_image_id  BIGINT            REFERENCES source_images(id)          ON DELETE SET NULL ON UPDATE CASCADE,
    derived_image_id BIGINT            REFERENCES derived_images(id)         ON DELETE SET NULL ON UPDATE CASCADE,
    variant_label    TEXT     NOT NULL,
    status_id        SMALLINT NOT NULL REFERENCES image_variant_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    file_path        TEXT     NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_variants_character_id     ON image_variants(character_id);
CREATE INDEX idx_image_variants_source_image_id  ON image_variants(source_image_id);
CREATE INDEX idx_image_variants_derived_image_id ON image_variants(derived_image_id);
CREATE INDEX idx_image_variants_status_id        ON image_variants(status_id);

CREATE TRIGGER trg_image_variants_updated_at
    BEFORE UPDATE ON image_variants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
