-- Segment approval decisions for review workflow (PRD-35).
--
-- Records each approve/reject/flag decision with full metadata:
-- who decided, what decision, reason category, comment, segment version, when.

CREATE TABLE IF NOT EXISTS segment_approvals (
    id                 BIGSERIAL    PRIMARY KEY,
    segment_id         BIGINT       NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    user_id            BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision           TEXT         NOT NULL,
    reason_category_id BIGINT       NULL REFERENCES rejection_categories(id) ON DELETE SET NULL,
    comment            TEXT,
    segment_version    INTEGER      NOT NULL DEFAULT 1,
    decided_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segment_approvals_segment_id          ON segment_approvals(segment_id);
CREATE INDEX idx_segment_approvals_user_id             ON segment_approvals(user_id);
CREATE INDEX idx_segment_approvals_decision            ON segment_approvals(decision);
CREATE INDEX idx_segment_approvals_reason_category_id  ON segment_approvals(reason_category_id);

CREATE TRIGGER trg_segment_approvals_updated_at
    BEFORE UPDATE ON segment_approvals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
