-- Migration 000090: User API tokens for external services (PRD-104)

CREATE TABLE user_api_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    service_name TEXT NOT NULL CHECK (service_name IN ('civitai', 'huggingface')),
    encrypted_token BYTEA NOT NULL,
    token_hint TEXT NOT NULL DEFAULT '',
    is_valid BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_user_api_tokens_user_service ON user_api_tokens(user_id, service_name);
CREATE INDEX idx_user_api_tokens_user_id ON user_api_tokens(user_id);
CREATE TRIGGER trg_user_api_tokens_updated_at BEFORE UPDATE ON user_api_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
