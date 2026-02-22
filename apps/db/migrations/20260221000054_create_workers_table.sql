-- Create the workers table for worker pool management (PRD-46).
--
-- Workers are GPU-equipped machines that run ComfyUI generation jobs.
-- Each worker self-registers via an agent endpoint and must be approved
-- by an admin before receiving jobs.

CREATE TABLE workers (
    id              BIGSERIAL     PRIMARY KEY,
    name            TEXT          NOT NULL UNIQUE,
    hostname        TEXT          NOT NULL,
    ip_address      TEXT,
    gpu_model       TEXT,
    gpu_count       SMALLINT      NOT NULL DEFAULT 1,
    vram_total_mb   INTEGER,
    status_id       SMALLINT      NOT NULL REFERENCES worker_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    tags            JSONB         NOT NULL DEFAULT '[]',
    comfyui_instance_id BIGINT   REFERENCES comfyui_instances(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_approved     BOOLEAN       NOT NULL DEFAULT false,
    is_enabled      BOOLEAN       NOT NULL DEFAULT true,
    last_heartbeat_at TIMESTAMPTZ,
    registered_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    decommissioned_at TIMESTAMPTZ,
    metadata        JSONB         NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workers_status_id ON workers(status_id);
CREATE INDEX idx_workers_comfyui_instance_id ON workers(comfyui_instance_id);
CREATE INDEX idx_workers_tags ON workers USING gin(tags);

CREATE TRIGGER trg_workers_updated_at BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
