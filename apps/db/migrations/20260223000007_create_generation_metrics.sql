-- PRD-61: Cost & Resource Estimation
-- Stores per-workflow/resolution-tier averages for GPU time and disk usage,
-- updated incrementally after each generation completes.

CREATE TABLE generation_metrics (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resolution_tier_id BIGINT NOT NULL REFERENCES resolution_tiers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    avg_gpu_secs_per_segment DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    avg_disk_mb_per_segment DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_generation_metrics_workflow_tier ON generation_metrics(workflow_id, resolution_tier_id);
CREATE INDEX idx_generation_metrics_workflow_id ON generation_metrics(workflow_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON generation_metrics
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
