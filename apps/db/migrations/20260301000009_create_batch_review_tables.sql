-- PRD-92: Batch Review & Approval Workflows
--
-- review_assignments: track which reviewer is assigned to review
-- segments in a project, with optional filter criteria and deadline.
--
-- review_sessions: track reviewer session statistics (how many
-- segments reviewed/approved/rejected, average pace).

CREATE TABLE review_assignments (
    id                  BIGSERIAL    PRIMARY KEY,
    project_id          BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reviewer_user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    filter_criteria_json JSONB       NOT NULL DEFAULT '{}',
    deadline            TIMESTAMPTZ,
    status              TEXT         NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'completed', 'overdue')),
    assigned_by         BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_assignments_project     ON review_assignments(project_id);
CREATE INDEX idx_review_assignments_reviewer    ON review_assignments(reviewer_user_id);
CREATE INDEX idx_review_assignments_assigned_by ON review_assignments(assigned_by);
CREATE INDEX idx_review_assignments_status      ON review_assignments(status);
CREATE INDEX idx_review_assignments_deadline    ON review_assignments(deadline);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON review_assignments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE review_sessions (
    id                  BIGSERIAL    PRIMARY KEY,
    user_id             BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    segments_reviewed   INTEGER      NOT NULL DEFAULT 0,
    segments_approved   INTEGER      NOT NULL DEFAULT 0,
    segments_rejected   INTEGER      NOT NULL DEFAULT 0,
    avg_pace_seconds    REAL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_sessions_user_id ON review_sessions(user_id);

CREATE TRIGGER set_updated_at_review_sessions BEFORE UPDATE ON review_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
