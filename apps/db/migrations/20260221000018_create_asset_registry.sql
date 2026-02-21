-- Asset type lookup table (PRD-17).
CREATE TABLE asset_types (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO asset_types (name, description) VALUES
    ('model', 'AI model checkpoint (e.g., Stable Diffusion, AnimateDiff)'),
    ('lora', 'LoRA fine-tuning weights'),
    ('custom_node', 'Custom ComfyUI node package');

-- Asset status lookup table.
CREATE TABLE asset_statuses (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO asset_statuses (name, description) VALUES
    ('active', 'Available for use'),
    ('deprecated', 'Available but not recommended for new work'),
    ('removed', 'Removed from the system');

-- Core asset registry table.
CREATE TABLE assets (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    version         TEXT NOT NULL,
    asset_type_id   BIGINT NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT,
    status_id       BIGINT NOT NULL REFERENCES asset_statuses(id) ON DELETE RESTRICT,
    file_path       TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    checksum_sha256 TEXT NOT NULL,
    description     TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    registered_by   BIGINT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_asset_type_id ON assets(asset_type_id);
CREATE INDEX idx_assets_status_id ON assets(status_id);
CREATE INDEX idx_assets_name ON assets(name);
CREATE UNIQUE INDEX uq_assets_name_version ON assets(name, version);
CREATE INDEX idx_assets_checksum ON assets(checksum_sha256);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
