-- Trigger Workflows (PRD-97)
-- Job dependency chains and triggered workflows.

-- ---------------------------------------------------------------------------
-- Trigger rule definitions
-- ---------------------------------------------------------------------------

CREATE TABLE triggers (
    id                BIGSERIAL    PRIMARY KEY,
    project_id        BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name              TEXT         NOT NULL,
    description       TEXT,
    event_type        TEXT         NOT NULL CHECK (event_type IN ('completed', 'approved', 'failed')),
    entity_type       TEXT         NOT NULL CHECK (entity_type IN ('variant', 'scene', 'segment', 'production_run')),
    scope             JSONB,                  -- e.g. {"character_id": 42, "scene_type_id": 7}
    conditions        JSONB,                  -- key-value conditions on event data
    actions           JSONB        NOT NULL DEFAULT '[]',  -- array of {action, params}
    execution_mode    TEXT         NOT NULL DEFAULT 'sequential' CHECK (execution_mode IN ('sequential', 'parallel')),
    max_chain_depth   INTEGER      NOT NULL DEFAULT 10,
    requires_approval BOOLEAN      NOT NULL DEFAULT false,
    is_enabled        BOOLEAN      NOT NULL DEFAULT true,
    sort_order        INTEGER      NOT NULL DEFAULT 0,
    created_by_id     BIGINT       REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triggers_project        ON triggers(project_id);
CREATE INDEX idx_triggers_event_entity   ON triggers(event_type, entity_type);
CREATE INDEX idx_triggers_enabled        ON triggers(is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_triggers_created_by     ON triggers(created_by_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON triggers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger execution log
-- ---------------------------------------------------------------------------

CREATE TABLE trigger_log (
    id              BIGSERIAL    PRIMARY KEY,
    trigger_id      BIGINT       NOT NULL REFERENCES triggers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    event_data      JSONB        NOT NULL DEFAULT '{}',
    actions_taken   JSONB        NOT NULL DEFAULT '[]',
    chain_depth     INTEGER      NOT NULL DEFAULT 0,
    result          TEXT         NOT NULL CHECK (result IN ('success', 'failed', 'blocked', 'dry_run')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trigger_log_trigger    ON trigger_log(trigger_id);
CREATE INDEX idx_trigger_log_result     ON trigger_log(result);
CREATE INDEX idx_trigger_log_created_at ON trigger_log(created_at);
