-- Dashboard Widget Customization (PRD-89)
-- User dashboard presets with layout and widget settings,
-- plus role-based default layouts for admin, creator, reviewer.

-- ---------------------------------------------------------------------------
-- Dashboard presets (per-user, named layouts)
-- ---------------------------------------------------------------------------

CREATE TABLE dashboard_presets (
    id                  BIGSERIAL    PRIMARY KEY,
    user_id             BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                TEXT         NOT NULL,
    layout_json         JSONB        NOT NULL,
    widget_settings_json JSONB       NOT NULL DEFAULT '{}'::jsonb,
    is_active           BOOLEAN      NOT NULL DEFAULT false,
    share_token         TEXT         UNIQUE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dashboard_presets_user_name UNIQUE (user_id, name)
);

CREATE INDEX idx_dashboard_presets_user ON dashboard_presets(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dashboard_presets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Dashboard role defaults (one layout per role)
-- ---------------------------------------------------------------------------

CREATE TABLE dashboard_role_defaults (
    id                   BIGSERIAL    PRIMARY KEY,
    role_name            TEXT         NOT NULL UNIQUE,
    layout_json          JSONB        NOT NULL,
    widget_settings_json JSONB        NOT NULL DEFAULT '{}'::jsonb,
    configured_by        BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dashboard_role_defaults
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed role defaults with sample layouts
-- ---------------------------------------------------------------------------

INSERT INTO dashboard_role_defaults (role_name, layout_json, widget_settings_json) VALUES
(
    'admin',
    '[
        {"widget_id": "system-health",     "instance_id": "system-health-1",     "x": 0, "y": 0, "w": 4, "h": 3},
        {"widget_id": "gpu-utilization",   "instance_id": "gpu-utilization-1",   "x": 4, "y": 0, "w": 4, "h": 3},
        {"widget_id": "job-queue",         "instance_id": "job-queue-1",         "x": 8, "y": 0, "w": 4, "h": 3},
        {"widget_id": "activity-feed",     "instance_id": "activity-feed-1",     "x": 0, "y": 3, "w": 6, "h": 4},
        {"widget_id": "render-timeline",   "instance_id": "render-timeline-1",   "x": 6, "y": 3, "w": 6, "h": 4}
    ]'::jsonb,
    '{}'::jsonb
),
(
    'creator',
    '[
        {"widget_id": "active-tasks",      "instance_id": "active-tasks-1",      "x": 0, "y": 0, "w": 6, "h": 3},
        {"widget_id": "project-progress",  "instance_id": "project-progress-1",  "x": 6, "y": 0, "w": 6, "h": 3},
        {"widget_id": "render-timeline",   "instance_id": "render-timeline-1",   "x": 0, "y": 3, "w": 8, "h": 4},
        {"widget_id": "activity-feed",     "instance_id": "activity-feed-1",     "x": 8, "y": 3, "w": 4, "h": 4}
    ]'::jsonb,
    '{}'::jsonb
),
(
    'reviewer',
    '[
        {"widget_id": "review-queue",       "instance_id": "review-queue-1",       "x": 0, "y": 0, "w": 6, "h": 4},
        {"widget_id": "recent-approvals",   "instance_id": "recent-approvals-1",   "x": 6, "y": 0, "w": 6, "h": 4},
        {"widget_id": "project-progress",   "instance_id": "project-progress-1",   "x": 0, "y": 4, "w": 6, "h": 3},
        {"widget_id": "activity-feed",      "instance_id": "activity-feed-1",      "x": 6, "y": 4, "w": 6, "h": 3}
    ]'::jsonb,
    '{}'::jsonb
);
