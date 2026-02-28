-- PRD-87: GPU Power Management & Idle Scheduling
--
-- Adds power schedules, power state columns on workers, and a power
-- consumption log for tracking energy usage and savings.

-- 1. Power schedules table
CREATE TABLE power_schedules (
    id                      BIGSERIAL    PRIMARY KEY,
    worker_id               BIGINT       REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scope                   TEXT         NOT NULL DEFAULT 'individual'
                                         CHECK (scope IN ('individual', 'fleet')),
    schedule_json           JSONB        NOT NULL,
    timezone                TEXT         NOT NULL DEFAULT 'UTC',
    override_for_queued_jobs BOOLEAN     NOT NULL DEFAULT true,
    enabled                 BOOLEAN      NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_power_schedules_worker_id ON power_schedules(worker_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON power_schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. Power state columns on workers
ALTER TABLE workers
    ADD COLUMN IF NOT EXISTS power_state TEXT NOT NULL DEFAULT 'on'
        CHECK (power_state IN ('on', 'idle', 'shutting_down', 'sleeping', 'waking')),
    ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS wake_method TEXT CHECK (wake_method IN ('wol', 'ssh', 'api')),
    ADD COLUMN IF NOT EXISTS wake_config_json JSONB,
    ADD COLUMN IF NOT EXISTS gpu_tdp_watts INTEGER,
    ADD COLUMN IF NOT EXISTS min_fleet_member BOOLEAN NOT NULL DEFAULT false;

-- 3. Power consumption log
CREATE TABLE power_consumption_log (
    id              BIGSERIAL    PRIMARY KEY,
    worker_id       BIGINT       NOT NULL REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    date            DATE         NOT NULL,
    active_minutes  INTEGER      NOT NULL DEFAULT 0,
    idle_minutes    INTEGER      NOT NULL DEFAULT 0,
    off_minutes     INTEGER      NOT NULL DEFAULT 0,
    estimated_kwh   REAL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_power_consumption_log_worker_id ON power_consumption_log(worker_id);
CREATE INDEX idx_power_consumption_log_date ON power_consumption_log(date);
CREATE UNIQUE INDEX uq_power_consumption_log_worker_date ON power_consumption_log(worker_id, date);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON power_consumption_log
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
