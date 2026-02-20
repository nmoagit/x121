-- Per-image QA score records for source image quality assurance (PRD-22).

--------------------------------------------------------------------------------
-- image_quality_scores: individual check results per image variant or source
--------------------------------------------------------------------------------

CREATE TABLE image_quality_scores (
    id               BIGSERIAL        PRIMARY KEY,
    image_variant_id BIGINT           REFERENCES image_variants(id) ON DELETE CASCADE ON UPDATE CASCADE,
    character_id     BIGINT           NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type_id    BIGINT           NOT NULL REFERENCES qa_check_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    score            DOUBLE PRECISION,
    status           TEXT             NOT NULL,
    details          JSONB,
    is_source_image  BOOLEAN          NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_image_quality_scores_image_variant_id ON image_quality_scores(image_variant_id);
CREATE INDEX idx_image_quality_scores_character_id     ON image_quality_scores(character_id);
CREATE INDEX idx_image_quality_scores_check_type_id    ON image_quality_scores(check_type_id);

-- Query by status (pass / warn / fail filtering)
CREATE INDEX idx_image_quality_scores_status ON image_quality_scores(status);

CREATE TRIGGER trg_image_quality_scores_updated_at
    BEFORE UPDATE ON image_quality_scores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
