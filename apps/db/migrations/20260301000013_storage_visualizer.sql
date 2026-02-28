-- Storage Visualizer / Treemap (PRD-19)
-- File type categories for grouping, and storage usage snapshots.

-- File type categories for grouping
CREATE TABLE file_type_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    extensions TEXT[] NOT NULL DEFAULT '{}',
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON file_type_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed default categories
INSERT INTO file_type_categories (name, description, extensions, color) VALUES
    ('video', 'Video files', '{mp4,webm,mov,avi,mkv}', '#4F46E5'),
    ('image', 'Image files', '{jpg,jpeg,png,webp,tiff,bmp}', '#059669'),
    ('intermediate', 'Intermediate/processing files', '{pt,bin,ckpt}', '#D97706'),
    ('metadata', 'Metadata & config files', '{json,yaml,yml,toml}', '#7C3AED'),
    ('model', 'AI model files', '{safetensors,onnx,pth}', '#DC2626')
ON CONFLICT (name) DO NOTHING;

-- Storage usage snapshots (materialized aggregate data)
CREATE TABLE storage_usage_snapshots (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('segment', 'scene', 'character', 'project')),
    entity_id BIGINT NOT NULL,
    entity_name TEXT,
    parent_entity_type TEXT,
    parent_entity_id BIGINT,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    video_bytes BIGINT NOT NULL DEFAULT 0,
    image_bytes BIGINT NOT NULL DEFAULT 0,
    intermediate_bytes BIGINT NOT NULL DEFAULT 0,
    metadata_bytes BIGINT NOT NULL DEFAULT 0,
    model_bytes BIGINT NOT NULL DEFAULT 0,
    reclaimable_bytes BIGINT NOT NULL DEFAULT 0,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_storage_snapshots_entity ON storage_usage_snapshots(entity_type, entity_id);
CREATE INDEX idx_storage_snapshots_parent ON storage_usage_snapshots(parent_entity_type, parent_entity_id);
CREATE INDEX idx_storage_snapshots_snapshot_at ON storage_usage_snapshots(snapshot_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_usage_snapshots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
