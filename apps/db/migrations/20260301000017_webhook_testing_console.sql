-- PRD-99: Webhook Integration Testing Console
-- Tables for delivery logging, mock endpoints, and payload capture.

-- ---------------------------------------------------------------------------
-- webhook_delivery_log (append-only full request/response capture)
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_delivery_log (
    id                    BIGSERIAL PRIMARY KEY,
    endpoint_id           BIGINT NOT NULL,
    endpoint_type         TEXT NOT NULL DEFAULT 'webhook',
    event_type            TEXT NOT NULL,
    request_method        TEXT NOT NULL DEFAULT 'POST',
    request_url           TEXT NOT NULL,
    request_headers_json  JSONB,
    request_body_json     JSONB,
    response_status       SMALLINT,
    response_headers_json JSONB,
    response_body         TEXT,
    duration_ms           INTEGER NOT NULL DEFAULT 0,
    success               BOOLEAN NOT NULL DEFAULT false,
    error_message         TEXT,
    is_test               BOOLEAN NOT NULL DEFAULT false,
    is_replay             BOOLEAN NOT NULL DEFAULT false,
    replay_of_id          BIGINT REFERENCES webhook_delivery_log(id)
                              ON DELETE SET NULL ON UPDATE CASCADE,
    retry_count           SMALLINT NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_log_endpoint
    ON webhook_delivery_log(endpoint_id, endpoint_type);
CREATE INDEX idx_delivery_log_event_type
    ON webhook_delivery_log(event_type);
CREATE INDEX idx_delivery_log_success
    ON webhook_delivery_log(success);
CREATE INDEX idx_delivery_log_created_at
    ON webhook_delivery_log(created_at DESC);
CREATE INDEX idx_delivery_log_is_test
    ON webhook_delivery_log(is_test) WHERE is_test = true;
CREATE INDEX idx_delivery_log_replay_of
    ON webhook_delivery_log(replay_of_id) WHERE replay_of_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- mock_endpoints (mock endpoint definitions with unique tokens)
-- ---------------------------------------------------------------------------

CREATE TABLE mock_endpoints (
    id                  BIGSERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    token               TEXT NOT NULL,
    webhook_endpoint_id BIGINT REFERENCES webhooks(id)
                            ON DELETE SET NULL ON UPDATE CASCADE,
    capture_enabled     BOOLEAN NOT NULL DEFAULT true,
    retention_hours     INTEGER NOT NULL DEFAULT 24,
    created_by          BIGINT NOT NULL REFERENCES users(id)
                            ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_mock_endpoints_token ON mock_endpoints(token);
CREATE INDEX idx_mock_endpoints_webhook ON mock_endpoints(webhook_endpoint_id);

CREATE TRIGGER trg_mock_endpoints_updated_at
    BEFORE UPDATE ON mock_endpoints
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- mock_endpoint_captures (append-only captured payloads)
-- ---------------------------------------------------------------------------

CREATE TABLE mock_endpoint_captures (
    id                   BIGSERIAL PRIMARY KEY,
    mock_endpoint_id     BIGINT NOT NULL REFERENCES mock_endpoints(id)
                             ON DELETE CASCADE ON UPDATE CASCADE,
    request_method       TEXT NOT NULL DEFAULT 'POST',
    request_headers_json JSONB,
    request_body_json    JSONB,
    source_ip            TEXT,
    received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mock_captures_endpoint
    ON mock_endpoint_captures(mock_endpoint_id);
CREATE INDEX idx_mock_captures_received_at
    ON mock_endpoint_captures(received_at DESC);
