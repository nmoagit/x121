-- Migration 000089: Model download status lookup table and model_downloads table (PRD-104)

CREATE TABLE download_statuses (
    id SMALLSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_download_statuses_updated_at BEFORE UPDATE ON download_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO download_statuses (name, label) VALUES
    ('queued', 'Queued'),
    ('downloading', 'Downloading'),
    ('paused', 'Paused'),
    ('verifying', 'Verifying'),
    ('registering', 'Registering'),
    ('completed', 'Completed'),
    ('failed', 'Failed'),
    ('cancelled', 'Cancelled');

CREATE TABLE model_downloads (
    id BIGSERIAL PRIMARY KEY,
    status_id SMALLINT NOT NULL REFERENCES download_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    source_type TEXT NOT NULL CHECK (source_type IN ('civitai', 'huggingface', 'direct')),
    source_url TEXT NOT NULL,
    source_model_id TEXT,
    source_version_id TEXT,
    model_name TEXT NOT NULL,
    model_type TEXT NOT NULL,
    base_model TEXT,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT,
    downloaded_bytes BIGINT NOT NULL DEFAULT 0,
    download_speed_bps BIGINT,
    target_path TEXT,
    expected_hash TEXT,
    actual_hash TEXT,
    hash_verified BOOLEAN NOT NULL DEFAULT false,
    hash_mismatch BOOLEAN NOT NULL DEFAULT false,
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    asset_id BIGINT,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    initiated_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_model_downloads_status_id ON model_downloads(status_id);
CREATE INDEX idx_model_downloads_source_type ON model_downloads(source_type);
CREATE INDEX idx_model_downloads_asset_id ON model_downloads(asset_id);
CREATE INDEX idx_model_downloads_initiated_by ON model_downloads(initiated_by);
CREATE INDEX idx_model_downloads_expected_hash ON model_downloads(expected_hash);
CREATE TRIGGER trg_model_downloads_updated_at BEFORE UPDATE ON model_downloads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
