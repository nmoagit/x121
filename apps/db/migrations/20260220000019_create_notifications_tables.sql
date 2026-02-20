-- Notification delivery, preferences, and user settings (PRD-10).

--------------------------------------------------------------------------------
-- notifications: per-user delivery records tied to events
--------------------------------------------------------------------------------

CREATE TABLE notifications (
    id           BIGSERIAL   PRIMARY KEY,
    event_id     BIGINT      NOT NULL REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    channel      TEXT        NOT NULL DEFAULT 'in_app',
    is_read      BOOLEAN     NOT NULL DEFAULT false,
    read_at      TIMESTAMPTZ,
    is_delivered BOOLEAN     NOT NULL DEFAULT false,
    delivered_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_notifications_user_id  ON notifications(user_id);
CREATE INDEX idx_notifications_event_id ON notifications(event_id);

-- Fast unread-count queries per user (partial index)
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read)
    WHERE is_read = false;

--------------------------------------------------------------------------------
-- notification_preferences: per-user, per-event-type opt-in/out and channels
--------------------------------------------------------------------------------

CREATE TABLE notification_preferences (
    id            BIGSERIAL   PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    event_type_id BIGINT      NOT NULL REFERENCES event_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    is_enabled    BOOLEAN     NOT NULL DEFAULT true,
    channels      JSONB       NOT NULL DEFAULT '["in_app"]',
    scope         TEXT        NOT NULL DEFAULT 'all',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One preference row per user + event type
CREATE UNIQUE INDEX uq_notification_preferences_user_event
    ON notification_preferences(user_id, event_type_id);

-- FK indexes (event_type_id covered by unique index above)
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

CREATE TRIGGER trg_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--------------------------------------------------------------------------------
-- user_notification_settings: global notification settings per user
--------------------------------------------------------------------------------

CREATE TABLE user_notification_settings (
    id                 BIGSERIAL   PRIMARY KEY,
    user_id            BIGINT      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    dnd_enabled        BOOLEAN     NOT NULL DEFAULT false,
    dnd_until          TIMESTAMPTZ,
    digest_enabled     BOOLEAN     NOT NULL DEFAULT false,
    digest_interval    TEXT        NOT NULL DEFAULT 'daily',
    digest_last_sent_at TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_notification_settings_updated_at
    BEFORE UPDATE ON user_notification_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
