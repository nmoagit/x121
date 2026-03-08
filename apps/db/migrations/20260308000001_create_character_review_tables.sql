-- Character review status lookup
CREATE TABLE character_review_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO character_review_statuses (name, label) VALUES
    ('unassigned', 'Unassigned'),
    ('assigned', 'Assigned'),
    ('in_review', 'In Review'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('rework', 'Rework'),
    ('re_queued', 'Re-queued');

-- Add review status to characters (default = 1 = unassigned)
ALTER TABLE characters ADD COLUMN review_status_id SMALLINT NOT NULL DEFAULT 1 REFERENCES character_review_statuses(id);
CREATE INDEX idx_characters_review_status_id ON characters(review_status_id);

-- Assignment tracking
CREATE TABLE character_review_assignments (
    id                  BIGSERIAL PRIMARY KEY,
    character_id        BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    reviewer_user_id    BIGINT NOT NULL REFERENCES users(id),
    assigned_by         BIGINT NOT NULL REFERENCES users(id),
    reassigned_from     BIGINT REFERENCES character_review_assignments(id),
    review_round        INT NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'reassigned')),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    deadline            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_char_review_assign_character ON character_review_assignments(character_id);
CREATE INDEX idx_char_review_assign_reviewer ON character_review_assignments(reviewer_user_id);
CREATE INDEX idx_char_review_assign_status ON character_review_assignments(status);
CREATE TRIGGER trg_character_review_assignments_updated_at
    BEFORE UPDATE ON character_review_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Review decisions
CREATE TABLE character_review_decisions (
    id                  BIGSERIAL PRIMARY KEY,
    assignment_id       BIGINT NOT NULL REFERENCES character_review_assignments(id),
    character_id        BIGINT NOT NULL REFERENCES characters(id),
    reviewer_user_id    BIGINT NOT NULL REFERENCES users(id),
    decision            TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    comment             TEXT,
    review_round        INT NOT NULL DEFAULT 1,
    review_duration_sec INT,
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_char_review_decisions_character ON character_review_decisions(character_id);
CREATE INDEX idx_char_review_decisions_assignment ON character_review_decisions(assignment_id);

-- Audit log
CREATE TABLE character_review_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    character_id        BIGINT NOT NULL REFERENCES characters(id),
    action              TEXT NOT NULL CHECK (action IN (
        'assigned', 'reassigned', 'review_started',
        'approved', 'rejected', 'rework_submitted', 're_queued'
    )),
    actor_user_id       BIGINT NOT NULL REFERENCES users(id),
    target_user_id      BIGINT REFERENCES users(id),
    comment             TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_char_review_audit_character ON character_review_audit_log(character_id);
CREATE INDEX idx_char_review_audit_actor ON character_review_audit_log(actor_user_id);
CREATE INDEX idx_char_review_audit_action ON character_review_audit_log(action);
CREATE INDEX idx_char_review_audit_created ON character_review_audit_log(created_at);
