-- Delivery error/info logs (PRD-39 Amendment A.3).

CREATE TABLE delivery_logs (
    id          BIGSERIAL PRIMARY KEY,
    delivery_export_id BIGINT REFERENCES delivery_exports(id),
    project_id  BIGINT NOT NULL REFERENCES projects(id),
    log_level   TEXT NOT NULL DEFAULT 'info',
    message     TEXT NOT NULL,
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_logs_project ON delivery_logs(project_id);
CREATE INDEX idx_delivery_logs_export  ON delivery_logs(delivery_export_id);
CREATE INDEX idx_delivery_logs_level   ON delivery_logs(project_id, log_level);
