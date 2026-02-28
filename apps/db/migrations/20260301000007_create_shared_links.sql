-- PRD-84: External Review / Shareable Preview Links

CREATE TABLE shared_links (
    id BIGSERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('segment', 'scene', 'character', 'project')),
    scope_id BIGINT NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    max_views INTEGER,
    current_views INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    settings_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_links_token_hash ON shared_links(token_hash);
CREATE INDEX idx_shared_links_created_by ON shared_links(created_by);
CREATE INDEX idx_shared_links_scope ON shared_links(scope_type, scope_id);
CREATE INDEX idx_shared_links_expires_at ON shared_links(expires_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON shared_links
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE link_access_log (
    id BIGSERIAL PRIMARY KEY,
    link_id BIGINT NOT NULL REFERENCES shared_links(id) ON DELETE CASCADE ON UPDATE CASCADE,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    feedback_text TEXT,
    decision TEXT CHECK (decision IN ('approved', 'rejected')),
    viewer_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_link_access_log_link_id ON link_access_log(link_id);
CREATE INDEX idx_link_access_log_accessed_at ON link_access_log(accessed_at);
