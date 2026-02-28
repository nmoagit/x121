-- Time-Based Job Scheduling (PRD-119)
-- Adds schedules, schedule execution history, and off-peak configuration.

-- ---------------------------------------------------------------------------
-- Schedules (one-time or recurring)
-- ---------------------------------------------------------------------------

CREATE TABLE schedules (
    id            BIGSERIAL    PRIMARY KEY,
    name          TEXT         NOT NULL,
    description   TEXT,
    schedule_type TEXT         NOT NULL CHECK (schedule_type IN ('one_time', 'recurring')),
    cron_expression TEXT,           -- For recurring: "0 2 * * *"
    scheduled_at    TIMESTAMPTZ,   -- For one_time: specific datetime
    timezone        TEXT         NOT NULL DEFAULT 'UTC',
    is_off_peak_only BOOLEAN    NOT NULL DEFAULT false,
    action_type   TEXT         NOT NULL CHECK (action_type IN ('submit_job', 'submit_batch')),
    action_config JSONB        NOT NULL DEFAULT '{}',
    owner_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    last_run_at   TIMESTAMPTZ,
    next_run_at   TIMESTAMPTZ,
    run_count     INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_owner   ON schedules(owner_id);
CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE is_active = true;
CREATE INDEX idx_schedules_type    ON schedules(schedule_type);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Schedule execution history
-- ---------------------------------------------------------------------------

CREATE TABLE schedule_history (
    id                    BIGSERIAL    PRIMARY KEY,
    schedule_id           BIGINT       NOT NULL REFERENCES schedules(id) ON DELETE CASCADE ON UPDATE CASCADE,
    executed_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status                TEXT         NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
    result_job_id         BIGINT,
    error_message         TEXT,
    execution_duration_ms INTEGER,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_history_schedule    ON schedule_history(schedule_id);
CREATE INDEX idx_schedule_history_executed_at ON schedule_history(executed_at);

-- ---------------------------------------------------------------------------
-- Off-peak configuration
-- ---------------------------------------------------------------------------

CREATE TABLE off_peak_config (
    id          BIGSERIAL    PRIMARY KEY,
    day_of_week INTEGER      NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
    start_hour  INTEGER      NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
    end_hour    INTEGER      NOT NULL CHECK (end_hour BETWEEN 0 AND 23),
    timezone    TEXT         NOT NULL DEFAULT 'UTC',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_off_peak_day_tz ON off_peak_config(day_of_week, timezone);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON off_peak_config
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed default off-peak: weekdays 10pm-6am, weekends all day
INSERT INTO off_peak_config (day_of_week, start_hour, end_hour) VALUES
    (0, 0, 23),  -- Sunday: all day
    (1, 22, 6),  -- Monday: 10pm-6am
    (2, 22, 6),  -- Tuesday
    (3, 22, 6),  -- Wednesday
    (4, 22, 6),  -- Thursday
    (5, 22, 6),  -- Friday
    (6, 0, 23)   -- Saturday: all day
ON CONFLICT DO NOTHING;
