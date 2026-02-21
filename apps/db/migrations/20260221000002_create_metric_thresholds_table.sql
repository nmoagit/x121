-- Metric thresholds: configurable alert levels for hardware metrics (PRD-06).
-- NULL worker_id means the threshold is a global default.

CREATE TABLE metric_thresholds (
    id             BIGSERIAL   PRIMARY KEY,
    worker_id      BIGINT,
    metric_name    TEXT        NOT NULL,
    warning_value  INTEGER     NOT NULL,
    critical_value INTEGER     NOT NULL,
    is_enabled     BOOLEAN     NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No FK on worker_id — the workers table (PRD-46) does not exist yet.

-- FK index for future worker lookups.
CREATE INDEX idx_metric_thresholds_worker_id
    ON metric_thresholds(worker_id);

-- Prevent duplicate thresholds per worker per metric.
-- COALESCE handles NULL worker_id so that only one global default per metric exists.
CREATE UNIQUE INDEX uq_metric_thresholds_worker_metric
    ON metric_thresholds(COALESCE(worker_id, 0), metric_name);

CREATE TRIGGER trg_metric_thresholds_updated_at
    BEFORE UPDATE ON metric_thresholds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed global default thresholds (worker_id NULL = applies to all workers).
INSERT INTO metric_thresholds (worker_id, metric_name, warning_value, critical_value) VALUES
    (NULL, 'temperature_celsius', 70, 85),
    (NULL, 'vram_used_percent',   85, 95),
    (NULL, 'utilization_percent', 95, 99);
