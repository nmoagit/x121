-- PRD-98: Session Management & Active Users
-- Active sessions tracking, login attempts, and session configuration.

-- Active sessions tracking
CREATE TABLE active_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'terminated')),
    ip_address TEXT,
    user_agent TEXT,
    current_view TEXT,
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_status ON active_sessions(status);
CREATE INDEX idx_active_sessions_last_activity ON active_sessions(last_activity);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON active_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Login attempts
CREATE TABLE login_attempts (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX idx_login_attempts_username ON login_attempts(username);
CREATE INDEX idx_login_attempts_created_at ON login_attempts(created_at);
CREATE INDEX idx_login_attempts_ip_address ON login_attempts(ip_address);

-- Session configuration (key-value admin settings)
CREATE TABLE session_configs (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON session_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed default config
INSERT INTO session_configs (key, value, description) VALUES
    ('idle_timeout_minutes', '15', 'Minutes before session marked idle'),
    ('terminate_timeout_minutes', '120', 'Minutes before idle session auto-terminated'),
    ('max_sessions_admin', '3', 'Max concurrent sessions for admin role'),
    ('max_sessions_creator', '2', 'Max concurrent sessions for creator role'),
    ('max_sessions_reviewer', '1', 'Max concurrent sessions for reviewer role')
ON CONFLICT (key) DO NOTHING;
