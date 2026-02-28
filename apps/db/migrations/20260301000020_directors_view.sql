-- PRD-55: Director's View - Mobile/Tablet Review
--
-- push_subscriptions: Web Push API subscription storage for sending push
-- notifications to users' mobile/tablet devices.
--
-- offline_sync_log: Records review actions taken while offline so they can
-- be replayed when the client reconnects.

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE push_subscriptions (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT         NOT NULL,
    p256dh_key  TEXT         NOT NULL,
    auth_key    TEXT         NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_push_subscriptions_user_endpoint
    ON push_subscriptions(user_id, endpoint);

CREATE INDEX idx_push_subscriptions_user_id
    ON push_subscriptions(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- offline_sync_log
-- ---------------------------------------------------------------------------

CREATE TABLE offline_sync_log (
    id               BIGSERIAL    PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type      TEXT         NOT NULL CHECK (action_type IN ('approve', 'reject', 'flag')),
    target_id        BIGINT       NOT NULL,
    payload_json     JSONB,
    synced           BOOLEAN      NOT NULL DEFAULT false,
    synced_at        TIMESTAMPTZ,
    client_timestamp TIMESTAMPTZ  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_offline_sync_log_user_synced
    ON offline_sync_log(user_id, synced);
