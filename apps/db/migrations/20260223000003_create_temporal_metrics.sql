-- Temporal Continuity: Normalization & Sync (PRD-26)
--
-- Per-segment drift, centering, and grain metrics used for detecting
-- and correcting subject drift across chained generation segments.

-- ---------------------------------------------------------------------------
-- temporal_metrics (per segment)
-- ---------------------------------------------------------------------------

CREATE TABLE temporal_metrics (
    id              BIGSERIAL       PRIMARY KEY,
    segment_id      BIGINT          NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    drift_score     DOUBLE PRECISION,
    centering_offset_x DOUBLE PRECISION,
    centering_offset_y DOUBLE PRECISION,
    grain_variance  DOUBLE PRECISION,
    grain_match_score DOUBLE PRECISION,
    subject_bbox    JSONB,
    analysis_version TEXT           NOT NULL DEFAULT 'v1',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_temporal_metrics_segment_id ON temporal_metrics(segment_id);
CREATE UNIQUE INDEX uq_temporal_metrics_segment_version ON temporal_metrics(segment_id, analysis_version);

CREATE TRIGGER trg_temporal_metrics_updated_at
    BEFORE UPDATE ON temporal_metrics
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- temporal_settings (per project / scene-type threshold overrides)
-- ---------------------------------------------------------------------------

CREATE TABLE temporal_settings (
    id                  BIGSERIAL       PRIMARY KEY,
    project_id          BIGINT          NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id       BIGINT          REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    drift_threshold     DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    grain_threshold     DOUBLE PRECISION NOT NULL DEFAULT 0.80,
    centering_threshold DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    auto_flag_enabled   BOOLEAN         NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_temporal_settings_project_id ON temporal_settings(project_id);
CREATE UNIQUE INDEX uq_temporal_settings_project_scene ON temporal_settings(project_id, scene_type_id);

CREATE TRIGGER trg_temporal_settings_updated_at
    BEFORE UPDATE ON temporal_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
