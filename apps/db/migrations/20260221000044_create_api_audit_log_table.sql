-- PRD-12: External API & Webhooks — API audit log (append-only).

CREATE TABLE api_audit_log (
    id                BIGSERIAL PRIMARY KEY,
    api_key_id        BIGINT REFERENCES api_keys(id) ON DELETE SET NULL ON UPDATE CASCADE,
    method            TEXT NOT NULL,
    path              TEXT NOT NULL,
    query_params      TEXT,
    request_body_size INTEGER,
    response_status   SMALLINT NOT NULL,
    response_time_ms  INTEGER,
    ip_address        TEXT,
    user_agent        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No updated_at column or trigger: this is an append-only audit log.

CREATE INDEX idx_api_audit_log_api_key_id  ON api_audit_log(api_key_id);
CREATE INDEX idx_api_audit_log_created_at  ON api_audit_log(created_at DESC);
CREATE INDEX idx_api_audit_log_path        ON api_audit_log(path);
