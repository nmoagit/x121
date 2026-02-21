-- GPU metrics: append-only time-series data for GPU vitals (PRD-06).
-- Recorded by worker agents and queried by the monitoring dashboard.

CREATE TABLE gpu_metrics (
    id                  BIGSERIAL   PRIMARY KEY,
    worker_id           BIGINT      NOT NULL,
    gpu_index           SMALLINT    NOT NULL DEFAULT 0,
    vram_used_mb        INTEGER     NOT NULL,
    vram_total_mb       INTEGER     NOT NULL,
    temperature_celsius SMALLINT    NOT NULL,
    utilization_percent SMALLINT    NOT NULL,
    power_draw_watts    SMALLINT,
    fan_speed_percent   SMALLINT,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No updated_at column or trigger — this table is append-only.
-- No FK on worker_id — the workers table (PRD-46) does not exist yet.

-- Primary query path: fetch recent metrics for a specific worker.
CREATE INDEX idx_gpu_metrics_worker_recorded
    ON gpu_metrics(worker_id, recorded_at DESC);

-- Cleanup job: delete old metrics by timestamp.
CREATE INDEX idx_gpu_metrics_recorded_at
    ON gpu_metrics(recorded_at DESC);
