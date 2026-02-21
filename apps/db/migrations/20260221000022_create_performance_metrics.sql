-- Performance metrics per generation job (PRD-41).
--
-- Captures timing, GPU, and quality data for every completed generation job.
-- Immutable once recorded (no updated_at).

CREATE TABLE performance_metrics (
    id          BIGSERIAL PRIMARY KEY,
    job_id      BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    -- FK to workflows(id) deferred until PRD-75
    workflow_id BIGINT,
    -- FK to workers(id) deferred until PRD-46
    worker_id   BIGINT,
    project_id  BIGINT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL ON UPDATE CASCADE,
    scene_id    BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE,

    -- Performance metrics
    time_per_frame_ms   REAL,
    total_gpu_time_ms   BIGINT,
    total_wall_time_ms  BIGINT,
    vram_peak_mb        INTEGER,
    frame_count         INTEGER,

    -- Quality metrics (flexible JSON for varying measures)
    quality_scores_json JSONB,         -- {"likeness": 0.92, "face_confidence": 0.87, ...}

    -- Pipeline breakdown
    pipeline_stages_json JSONB,        -- [{"name": "load_model", "duration_ms": 1200}, ...]

    -- Resolution tier for grouping
    resolution_tier TEXT,              -- e.g. '1080p', '720p', '4k'

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index every FK column and created_at for efficient querying.
CREATE INDEX idx_performance_metrics_job_id       ON performance_metrics(job_id);
CREATE INDEX idx_performance_metrics_workflow_id   ON performance_metrics(workflow_id);
CREATE INDEX idx_performance_metrics_worker_id     ON performance_metrics(worker_id);
CREATE INDEX idx_performance_metrics_project_id    ON performance_metrics(project_id);
CREATE INDEX idx_performance_metrics_character_id  ON performance_metrics(character_id);
CREATE INDEX idx_performance_metrics_scene_id      ON performance_metrics(scene_id);
CREATE INDEX idx_performance_metrics_created_at    ON performance_metrics(created_at);
