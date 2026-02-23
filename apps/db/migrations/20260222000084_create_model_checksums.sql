-- PRD-43: System Integrity & Repair Tools — model_checksums table
--
-- Stores expected SHA-256 checksums for known models so that integrity
-- scans can verify files on workers against a trusted manifest.

CREATE TABLE IF NOT EXISTS model_checksums (
    id              BIGSERIAL PRIMARY KEY,
    model_name      TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    expected_hash   TEXT NOT NULL,
    file_size_bytes BIGINT,
    model_type      TEXT,
    source_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_model_checksums_model_name ON model_checksums(model_name);

CREATE TRIGGER trg_model_checksums_updated_at
    BEFORE UPDATE ON model_checksums
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
