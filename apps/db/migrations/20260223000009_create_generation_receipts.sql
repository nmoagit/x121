-- Generation provenance receipts (PRD-69).
-- Each row is an immutable record of the exact inputs used to produce a segment.

CREATE TABLE generation_receipts (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    source_image_hash TEXT NOT NULL,
    variant_image_hash TEXT NOT NULL,
    workflow_version TEXT NOT NULL,
    workflow_hash TEXT NOT NULL,
    model_asset_id BIGINT REFERENCES assets(id) ON DELETE SET NULL ON UPDATE CASCADE,
    model_version TEXT NOT NULL,
    model_hash TEXT NOT NULL,
    lora_configs JSONB NOT NULL DEFAULT '[]',
    prompt_text TEXT NOT NULL,
    negative_prompt TEXT,
    cfg_scale DOUBLE PRECISION NOT NULL,
    seed BIGINT NOT NULL,
    resolution_width INTEGER NOT NULL,
    resolution_height INTEGER NOT NULL,
    steps INTEGER NOT NULL,
    sampler TEXT NOT NULL,
    additional_params JSONB NOT NULL DEFAULT '{}',
    inputs_hash TEXT NOT NULL,
    generation_started_at TIMESTAMPTZ NOT NULL,
    generation_completed_at TIMESTAMPTZ,
    generation_duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generation_receipts_segment_id ON generation_receipts(segment_id);
CREATE INDEX idx_generation_receipts_model_asset_id ON generation_receipts(model_asset_id);
CREATE INDEX idx_generation_receipts_inputs_hash ON generation_receipts(inputs_hash);
CREATE INDEX idx_generation_receipts_source_image_hash ON generation_receipts(source_image_hash);
CREATE INDEX idx_generation_receipts_model_hash ON generation_receipts(model_hash);
