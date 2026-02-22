-- PRD-48: External & Tiered Storage — asset location tracking.

CREATE TABLE asset_locations (
    id                BIGSERIAL   PRIMARY KEY,
    entity_type       TEXT        NOT NULL,
    entity_id         BIGINT      NOT NULL,
    file_field        TEXT        NOT NULL DEFAULT 'primary',
    backend_id        BIGINT      NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT,
    storage_path      TEXT        NOT NULL,
    file_size_bytes   BIGINT      NOT NULL DEFAULT 0,
    checksum_sha256   TEXT        NULL,
    last_accessed_at  TIMESTAMPTZ NULL,
    access_count      INTEGER     NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_asset_locations_entity ON asset_locations(entity_type, entity_id, file_field);
CREATE INDEX idx_asset_locations_backend_id      ON asset_locations(backend_id);
CREATE INDEX idx_asset_locations_last_accessed_at ON asset_locations(last_accessed_at);

CREATE TRIGGER trg_asset_locations_updated_at BEFORE UPDATE ON asset_locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
