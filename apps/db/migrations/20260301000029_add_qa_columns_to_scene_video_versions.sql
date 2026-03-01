-- PRD-121: Add QA columns to scene_video_versions for clip quality assurance.
ALTER TABLE scene_video_versions
    ADD COLUMN qa_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (qa_status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN qa_reviewed_by BIGINT REFERENCES users(id),
    ADD COLUMN qa_reviewed_at TIMESTAMPTZ,
    ADD COLUMN qa_rejection_reason TEXT,
    ADD COLUMN qa_notes TEXT;

CREATE INDEX idx_scene_video_versions_qa_status
    ON scene_video_versions (qa_status)
    WHERE deleted_at IS NULL;
