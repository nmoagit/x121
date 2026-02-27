-- Activity log lookup: levels (PRD-118 Req 1.1)
CREATE TABLE activity_log_levels (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO activity_log_levels (name, label) VALUES
    ('debug', 'Debug'),
    ('info', 'Info'),
    ('warn', 'Warn'),
    ('error', 'Error');

-- Activity log lookup: sources (PRD-118 Req 1.1)
CREATE TABLE activity_log_sources (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO activity_log_sources (name, label) VALUES
    ('api', 'API Server'),
    ('comfyui', 'ComfyUI Bridge'),
    ('worker', 'Worker Process'),
    ('agent', 'GPU Agent'),
    ('pipeline', 'Pipeline Engine');

-- Activity logs (PRD-118 Req 1.1)
CREATE TABLE activity_logs (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    level_id        SMALLINT NOT NULL REFERENCES activity_log_levels(id),
    source_id       SMALLINT NOT NULL REFERENCES activity_log_sources(id),
    message         TEXT NOT NULL,
    fields          JSONB NOT NULL DEFAULT '{}'::jsonb,
    category        TEXT NOT NULL DEFAULT 'verbose',
    entity_type     TEXT,
    entity_id       BIGINT,
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    job_id          BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    project_id      BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    trace_id        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No updated_at trigger: activity logs are append-only

CREATE INDEX idx_activity_logs_timestamp ON activity_logs (timestamp DESC);
CREATE INDEX idx_activity_logs_level_id ON activity_logs (level_id);
CREATE INDEX idx_activity_logs_source_id ON activity_logs (source_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs (entity_type, entity_id) WHERE entity_type IS NOT NULL;
CREATE INDEX idx_activity_logs_user_id ON activity_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_activity_logs_job_id ON activity_logs (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_activity_logs_project_id ON activity_logs (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_activity_logs_trace_id ON activity_logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX idx_activity_logs_category ON activity_logs (category);
CREATE INDEX idx_activity_logs_fields ON activity_logs USING GIN (fields);

-- Activity log settings (singleton row) (PRD-118 Req 1.5)
CREATE TABLE activity_log_settings (
    id                      BIGSERIAL PRIMARY KEY,
    retention_days_debug    INT NOT NULL DEFAULT 7,
    retention_days_info     INT NOT NULL DEFAULT 30,
    retention_days_warn     INT NOT NULL DEFAULT 30,
    retention_days_error    INT NOT NULL DEFAULT 90,
    batch_size              INT NOT NULL DEFAULT 100,
    flush_interval_ms       INT NOT NULL DEFAULT 1000,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO activity_log_settings (id) VALUES (1);

CREATE TRIGGER trg_activity_log_settings_updated_at
    BEFORE UPDATE ON activity_log_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
