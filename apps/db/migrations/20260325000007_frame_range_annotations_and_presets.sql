BEGIN;

-- Frame range support
ALTER TABLE frame_annotations ADD COLUMN frame_end INTEGER;
ALTER TABLE frame_annotations ADD COLUMN note TEXT;

ALTER TABLE frame_annotations ADD CONSTRAINT ck_frame_annotations_frame_end
    CHECK (frame_end IS NULL OR frame_end > frame_number);

-- Annotation presets (pipeline-scoped)
CREATE TABLE annotation_presets (
    id          BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    color       TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_annotation_presets_pipeline_label
    ON annotation_presets (COALESCE(pipeline_id, -1), label);

CREATE INDEX idx_annotation_presets_pipeline ON annotation_presets(pipeline_id);

COMMIT;
