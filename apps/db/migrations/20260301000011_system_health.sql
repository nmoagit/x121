-- PRD-80: System Health Page
--
-- health_checks: time-series log of individual service health probes.
-- Each row records the result of a single check (status, latency, errors).
--
-- uptime_records: tracks contiguous periods of each status per service.
-- When a service changes status, the current record is closed and a new one opened.
--
-- health_alert_configs: per-service alerting configuration (escalation delay,
-- webhook URL, notification channel preferences).

CREATE TABLE health_checks (
    id              BIGSERIAL    PRIMARY KEY,
    service_name    TEXT         NOT NULL,
    status          TEXT         NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    latency_ms      INTEGER,
    error_message   TEXT,
    details_json    JSONB,
    checked_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_checks_service_name     ON health_checks(service_name);
CREATE INDEX idx_health_checks_checked_at       ON health_checks(checked_at);
CREATE INDEX idx_health_checks_service_checked  ON health_checks(service_name, checked_at DESC);

CREATE TABLE uptime_records (
    id                  BIGSERIAL    PRIMARY KEY,
    service_name        TEXT         NOT NULL,
    status              TEXT         NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    started_at          TIMESTAMPTZ  NOT NULL,
    ended_at            TIMESTAMPTZ,
    duration_seconds    BIGINT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uptime_records_service_name ON uptime_records(service_name);
CREATE INDEX idx_uptime_records_started_at   ON uptime_records(started_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON uptime_records
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE health_alert_configs (
    id                          BIGSERIAL    PRIMARY KEY,
    service_name                TEXT         NOT NULL,
    escalation_delay_seconds    INTEGER      NOT NULL DEFAULT 300,
    webhook_url                 TEXT,
    notification_channels_json  JSONB,
    enabled                     BOOLEAN      NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_health_alert_configs_service ON health_alert_configs(service_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON health_alert_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
