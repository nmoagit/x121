-- Pattern fixes table (PRD-64).
--
-- Records discovered fixes for failure patterns, including effectiveness
-- ratings, so future alerts for the same pattern can suggest known solutions.

CREATE TABLE pattern_fixes (
    id              BIGSERIAL PRIMARY KEY,
    pattern_id      BIGINT NOT NULL REFERENCES failure_patterns(id) ON DELETE CASCADE ON UPDATE CASCADE,
    fix_description TEXT NOT NULL,
    fix_parameters  JSONB,
    effectiveness   TEXT,
    reported_by_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pattern_fixes_pattern_id ON pattern_fixes(pattern_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON pattern_fixes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
