BEGIN;

CREATE TABLE export_jobs (
    id              BIGSERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    requested_by    BIGINT NOT NULL REFERENCES users(id),
    pipeline_id     BIGINT REFERENCES pipelines(id),
    item_count      INTEGER NOT NULL,
    split_size_mb   INTEGER NOT NULL DEFAULT 500,
    filter_snapshot JSONB,
    status          TEXT NOT NULL DEFAULT 'queued',
    parts           JSONB DEFAULT '[]'::jsonb,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ DEFAULT now() + interval '24 hours',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE export_jobs ADD CONSTRAINT ck_export_jobs_status
    CHECK (status IN ('queued', 'processing', 'completed', 'failed'));

CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_requested_by ON export_jobs(requested_by);

CREATE TRIGGER trg_export_jobs_updated_at
    BEFORE UPDATE ON export_jobs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
