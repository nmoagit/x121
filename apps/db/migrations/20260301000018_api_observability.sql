-- PRD-106: API Usage & Observability Dashboard
--
-- api_metrics: time-bucketed API metrics with percentiles, error counts, and
-- bandwidth tracking. Rows are upserted (INSERT ON CONFLICT UPDATE) so there
-- is no updated_at column.
--
-- api_alert_configs: configurable alert thresholds for error rate, response
-- time, and rate limit spike detection.
--
-- rate_limit_utilization: per-key rate limit tracking per time bucket with
-- pre-computed utilization percentage.

-- ---------------------------------------------------------------------------
-- api_metrics
-- ---------------------------------------------------------------------------

CREATE TABLE api_metrics (
    id                    BIGSERIAL    PRIMARY KEY,
    period_start          TIMESTAMPTZ  NOT NULL,
    period_granularity    TEXT         NOT NULL CHECK (period_granularity IN ('1m', '5m', '1h', '1d')),
    endpoint              TEXT         NOT NULL,
    http_method           TEXT         NOT NULL,
    api_key_id            BIGINT,
    request_count         INTEGER      NOT NULL DEFAULT 0,
    error_count_4xx       INTEGER      NOT NULL DEFAULT 0,
    error_count_5xx       INTEGER      NOT NULL DEFAULT 0,
    response_time_p50_ms  REAL,
    response_time_p95_ms  REAL,
    response_time_p99_ms  REAL,
    response_time_avg_ms  REAL,
    total_request_bytes   BIGINT       NOT NULL DEFAULT 0,
    total_response_bytes  BIGINT       NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_metrics_period      ON api_metrics(period_start, period_granularity);
CREATE INDEX idx_api_metrics_endpoint    ON api_metrics(endpoint, http_method);
CREATE INDEX idx_api_metrics_api_key_id  ON api_metrics(api_key_id);

CREATE UNIQUE INDEX uq_api_metrics_bucket
    ON api_metrics(period_start, period_granularity, endpoint, http_method, COALESCE(api_key_id, -1));

-- ---------------------------------------------------------------------------
-- api_alert_configs
-- ---------------------------------------------------------------------------

CREATE TABLE api_alert_configs (
    id                BIGSERIAL    PRIMARY KEY,
    name              TEXT         NOT NULL,
    alert_type        TEXT         NOT NULL CHECK (alert_type IN ('error_rate', 'response_time', 'rate_limit')),
    endpoint_filter   TEXT,
    api_key_filter    BIGINT,
    threshold_value   REAL         NOT NULL,
    comparison        TEXT         NOT NULL CHECK (comparison IN ('gt', 'lt', 'gte', 'lte')),
    window_minutes    INTEGER      NOT NULL DEFAULT 5,
    cooldown_minutes  INTEGER      NOT NULL DEFAULT 30,
    enabled           BOOLEAN      NOT NULL DEFAULT true,
    last_fired_at     TIMESTAMPTZ,
    created_by        BIGINT       REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_alert_configs_alert_type  ON api_alert_configs(alert_type);
CREATE INDEX idx_api_alert_configs_created_by  ON api_alert_configs(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_alert_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- rate_limit_utilization
-- ---------------------------------------------------------------------------

CREATE TABLE rate_limit_utilization (
    id                   BIGSERIAL    PRIMARY KEY,
    api_key_id           BIGINT       NOT NULL,
    period_start         TIMESTAMPTZ  NOT NULL,
    period_granularity   TEXT         NOT NULL CHECK (period_granularity IN ('1m', '5m', '1h')),
    requests_made        INTEGER      NOT NULL DEFAULT 0,
    rate_limit           INTEGER      NOT NULL,
    utilization_pct      REAL         NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_utilization_api_key_id ON rate_limit_utilization(api_key_id);
CREATE INDEX idx_rate_limit_utilization_period      ON rate_limit_utilization(period_start, period_granularity);

CREATE UNIQUE INDEX uq_rate_limit_utilization_bucket
    ON rate_limit_utilization(api_key_id, period_start, period_granularity);
