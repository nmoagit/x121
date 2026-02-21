-- PRD-12: External API & Webhooks — Webhooks and webhook deliveries tables.

-- ---------------------------------------------------------------------------
-- webhooks table
-- ---------------------------------------------------------------------------

CREATE TABLE webhooks (
    id               BIGSERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    url              TEXT NOT NULL,
    secret           TEXT,
    event_types      JSONB NOT NULL DEFAULT '[]',
    is_enabled       BOOLEAN NOT NULL DEFAULT true,
    created_by       BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    last_triggered_at TIMESTAMPTZ,
    failure_count    INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_created_by ON webhooks(created_by);

CREATE TRIGGER trg_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- webhook_deliveries table
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_deliveries (
    id                   BIGSERIAL PRIMARY KEY,
    webhook_id           BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    event_id             BIGINT REFERENCES events(id) ON DELETE SET NULL ON UPDATE CASCADE,
    payload              JSONB NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending',
    response_status_code SMALLINT,
    response_body        TEXT,
    attempt_count        SMALLINT NOT NULL DEFAULT 0,
    max_attempts         SMALLINT NOT NULL DEFAULT 3,
    next_retry_at        TIMESTAMPTZ,
    delivered_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_event_id   ON webhook_deliveries(event_id);
CREATE INDEX idx_webhook_deliveries_pending    ON webhook_deliveries(next_retry_at)
    WHERE status = 'pending' OR status = 'retrying';

CREATE TRIGGER trg_webhook_deliveries_updated_at
    BEFORE UPDATE ON webhook_deliveries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
