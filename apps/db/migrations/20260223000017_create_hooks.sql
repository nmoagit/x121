-- Pipeline Stage Hooks (PRD-77): hooks table.

CREATE TABLE hooks (
    id            BIGSERIAL    PRIMARY KEY,
    name          TEXT         NOT NULL,
    description   TEXT,
    hook_type     TEXT         NOT NULL CHECK (hook_type IN ('shell', 'python', 'webhook')),
    hook_point    TEXT         NOT NULL CHECK (hook_point IN ('post_variant', 'pre_segment', 'post_segment', 'pre_concatenation', 'post_delivery')),
    scope_type    TEXT         NOT NULL CHECK (scope_type IN ('studio', 'project', 'scene_type')),
    scope_id      BIGINT,
    failure_mode  TEXT         NOT NULL DEFAULT 'warn' CHECK (failure_mode IN ('block', 'warn', 'ignore')),
    config_json   JSONB        NOT NULL,
    sort_order    INTEGER      NOT NULL DEFAULT 0,
    enabled       BOOLEAN      NOT NULL DEFAULT true,
    created_by    BIGINT       REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hooks_hook_point  ON hooks(hook_point);
CREATE INDEX idx_hooks_scope       ON hooks(scope_type, scope_id);
CREATE INDEX idx_hooks_created_by  ON hooks(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON hooks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
