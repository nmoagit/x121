-- PRD-79: Character Duplicate Detection — duplicate_check_statuses + duplicate_checks tables
--
-- Stores duplicate detection check results, linking a source character to a
-- potential match along with similarity score and resolution outcome.

CREATE TABLE IF NOT EXISTS duplicate_check_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_duplicate_check_statuses_updated_at
    BEFORE UPDATE ON duplicate_check_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO duplicate_check_statuses (name, label) VALUES
    ('no_match',            'No Match'),
    ('match_found',         'Match Found'),
    ('confirmed_duplicate', 'Confirmed Duplicate'),
    ('dismissed',           'Dismissed'),
    ('merged',              'Merged');

CREATE TABLE IF NOT EXISTS duplicate_checks (
    id                   BIGSERIAL PRIMARY KEY,
    status_id            SMALLINT NOT NULL REFERENCES duplicate_check_statuses(id)
                             ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    source_character_id  BIGINT NOT NULL REFERENCES characters(id)
                             ON DELETE CASCADE ON UPDATE CASCADE,
    matched_character_id BIGINT REFERENCES characters(id)
                             ON DELETE SET NULL ON UPDATE CASCADE,
    similarity_score     DOUBLE PRECISION,
    threshold_used       DOUBLE PRECISION NOT NULL,
    check_type           TEXT NOT NULL CHECK (check_type IN ('upload', 'batch', 'manual')),
    resolution           TEXT CHECK (resolution IN ('create_new', 'merge', 'dismiss', 'skip')),
    resolved_by          BIGINT REFERENCES users(id)
                             ON DELETE SET NULL ON UPDATE CASCADE,
    resolved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_duplicate_checks_status_id   ON duplicate_checks(status_id);
CREATE INDEX idx_duplicate_checks_source      ON duplicate_checks(source_character_id);
CREATE INDEX idx_duplicate_checks_matched     ON duplicate_checks(matched_character_id);
CREATE INDEX idx_duplicate_checks_resolved_by ON duplicate_checks(resolved_by);
CREATE INDEX idx_duplicate_checks_created_at  ON duplicate_checks(created_at);

CREATE TRIGGER trg_duplicate_checks_updated_at
    BEFORE UPDATE ON duplicate_checks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
