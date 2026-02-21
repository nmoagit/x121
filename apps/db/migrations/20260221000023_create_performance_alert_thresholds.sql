-- Performance alert thresholds (PRD-41).
--
-- Configurable warning/critical thresholds for performance metrics.
-- Supports global, per-workflow, and per-worker scopes.

CREATE TABLE performance_alert_thresholds (
    id                  BIGSERIAL PRIMARY KEY,
    metric_name         TEXT NOT NULL,         -- e.g. 'time_per_frame_ms', 'vram_peak_mb'
    scope_type          TEXT NOT NULL CHECK (scope_type IN ('global', 'workflow', 'worker')),
    scope_id            BIGINT,                -- workflow_id or worker_id; NULL for global
    warning_threshold   REAL NOT NULL,
    critical_threshold  REAL NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_perf_alert_thresholds_scope ON performance_alert_thresholds(scope_type, scope_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON performance_alert_thresholds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
