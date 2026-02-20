-- User sessions table: refresh-token tracking (PRD-03).

CREATE TABLE user_sessions (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    refresh_token_hash TEXT        NOT NULL,
    expires_at         TIMESTAMPTZ NOT NULL,
    is_revoked         BOOLEAN     NOT NULL DEFAULT false,
    user_agent         TEXT,
    ip_address         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);

-- Token lookup (hash-based)
CREATE INDEX idx_user_sessions_refresh_token_hash ON user_sessions(refresh_token_hash);

-- Active session expiry queries (partial index excludes revoked sessions)
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at) WHERE is_revoked = false;

-- Updated_at trigger
CREATE TRIGGER trg_user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
