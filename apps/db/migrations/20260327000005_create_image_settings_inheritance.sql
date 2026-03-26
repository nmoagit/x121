-- Level 1: Project image settings
CREATE TABLE project_image_settings (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT REFERENCES tracks(id) ON DELETE CASCADE,
    is_enabled    BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_project_image_settings
    ON project_image_settings (project_id, image_type_id, COALESCE(track_id, -1));

-- Level 2: Group image settings
CREATE TABLE group_image_settings (
    id            BIGSERIAL PRIMARY KEY,
    group_id      BIGINT NOT NULL REFERENCES avatar_groups(id) ON DELETE CASCADE,
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT REFERENCES tracks(id) ON DELETE CASCADE,
    is_enabled    BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_group_image_settings
    ON group_image_settings (group_id, image_type_id, COALESCE(track_id, -1));

-- Level 3: Avatar image overrides
CREATE TABLE avatar_image_overrides (
    id            BIGSERIAL PRIMARY KEY,
    avatar_id     BIGINT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT REFERENCES tracks(id) ON DELETE CASCADE,
    is_enabled    BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_avatar_image_overrides
    ON avatar_image_overrides (avatar_id, image_type_id, COALESCE(track_id, -1));

-- Triggers
CREATE TRIGGER trg_project_image_settings_updated_at
    BEFORE UPDATE ON project_image_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_group_image_settings_updated_at
    BEFORE UPDATE ON group_image_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_avatar_image_overrides_updated_at
    BEFORE UPDATE ON avatar_image_overrides FOR EACH ROW EXECUTE FUNCTION set_updated_at();
