-- PRD-169: Asynchronous Post-Import Video Transcoding Pipeline
--
-- Polymorphic transcode job queue (`entity_type` column so future entity types
-- can register via a CHECK extension without schema restructuring). In v1 the
-- only registered entity type is `scene_video_version`.

BEGIN;

-- Lookup table (PRD-00 lookup-table convention: id + name + label).
CREATE TABLE transcode_job_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_transcode_job_statuses_updated_at
    BEFORE UPDATE ON transcode_job_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO transcode_job_statuses (id, name, label) VALUES
    (1, 'pending',     'Pending'),
    (2, 'in_progress', 'In Progress'),
    (3, 'completed',   'Completed'),
    (4, 'failed',      'Failed'),
    (5, 'cancelled',   'Cancelled');

-- Reset the sequence past the seeded rows.
SELECT setval(
    pg_get_serial_sequence('transcode_job_statuses', 'id'),
    (SELECT MAX(id) FROM transcode_job_statuses)
);

-- Polymorphic queue table. Platform ID strategy: BIGSERIAL id + UUID uuid.
CREATE TABLE transcode_jobs (
    id                  BIGSERIAL PRIMARY KEY,
    uuid                UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    entity_type         TEXT NOT NULL
        CHECK (entity_type IN ('scene_video_version')),  -- v1 only; extend CHECK to add types.
    entity_id           BIGINT NOT NULL,
    status_id           SMALLINT NOT NULL REFERENCES transcode_job_statuses(id),
    attempts            INT NOT NULL DEFAULT 0,
    max_attempts        INT NOT NULL DEFAULT 3,
    next_attempt_at     TIMESTAMPTZ,
    source_codec        TEXT,
    source_storage_key  TEXT NOT NULL,
    target_storage_key  TEXT,
    error_message       TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE TRIGGER trg_transcode_jobs_updated_at
    BEFORE UPDATE ON transcode_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One active (pending or in_progress) job per entity at a time.
-- status_id IN (1, 2) = pending, in_progress
CREATE UNIQUE INDEX uq_transcode_jobs_active_entity
    ON transcode_jobs (entity_type, entity_id)
    WHERE deleted_at IS NULL AND status_id IN (1, 2);

-- Worker claim-query index: O(1) claim via (status_id, next_attempt_at).
CREATE INDEX idx_transcode_jobs_claim
    ON transcode_jobs (status_id, next_attempt_at)
    WHERE deleted_at IS NULL;

-- Frontend lookup-by-entity.
CREATE INDEX idx_transcode_jobs_entity
    ON transcode_jobs (entity_type, entity_id)
    WHERE deleted_at IS NULL;

COMMIT;
