-- Add metadata approval audit actions to character_review_audit_log CHECK constraint.
-- These actions are logged when metadata versions are approved, rejected, or unapproved.

ALTER TABLE character_review_audit_log
    DROP CONSTRAINT character_review_audit_log_action_check;

ALTER TABLE character_review_audit_log
    ADD CONSTRAINT character_review_audit_log_action_check
    CHECK (action IN (
        'assigned', 'reassigned', 'review_started',
        'approved', 'rejected', 'rework_submitted', 're_queued',
        'metadata_approved', 'metadata_rejected', 'metadata_unapproved'
    ));
