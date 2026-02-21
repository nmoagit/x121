-- Per-user workspace state persistence (PRD-04: Session & Workspace Persistence).
-- Stores panel layout, navigation state, and preferences per user per device as JSONB.

CREATE TABLE workspace_states (
    id               BIGSERIAL    PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    device_type      TEXT         NOT NULL DEFAULT 'desktop',
    layout_state     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    navigation_state JSONB        NOT NULL DEFAULT '{}'::jsonb,
    preferences      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FK index for user_id lookups and CASCADE performance.
CREATE INDEX idx_workspace_states_user_id ON workspace_states(user_id);

-- One workspace state per user per device type.
CREATE UNIQUE INDEX uq_workspace_states_user_device ON workspace_states(user_id, device_type);

CREATE TRIGGER trg_workspace_states_updated_at
    BEFORE UPDATE ON workspace_states
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
