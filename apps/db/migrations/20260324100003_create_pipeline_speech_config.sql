-- Pipeline-level speech configuration: which speech_type × language combos
-- a pipeline requires, with minimum variant counts.

BEGIN;

-- 1. Create pipeline_speech_config table
CREATE TABLE pipeline_speech_config (
    id             BIGSERIAL   PRIMARY KEY,
    pipeline_id    BIGINT      NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    speech_type_id SMALLINT    NOT NULL REFERENCES speech_types(id) ON DELETE CASCADE,
    language_id    SMALLINT    NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    min_variants   INT         NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pipeline_id, speech_type_id, language_id)
);

CREATE INDEX idx_pipeline_speech_config_pipeline ON pipeline_speech_config(pipeline_id);

-- 2. Seed x121: all x121 speech types × English × min_variants=1
INSERT INTO pipeline_speech_config (pipeline_id, speech_type_id, language_id, min_variants)
SELECT
    p.id,
    st.id,
    l.id,
    1
FROM pipelines p
CROSS JOIN speech_types st
CROSS JOIN languages l
WHERE p.code  = 'x121'
  AND st.pipeline_id = p.id
  AND l.code  = 'en';

COMMIT;
