-- Legacy import entity log: per-entity results for each import run (PRD-86).

CREATE TABLE legacy_import_entity_log (
    id          BIGSERIAL PRIMARY KEY,
    run_id      BIGINT NOT NULL REFERENCES legacy_import_runs(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id   BIGINT NULL,
    source_path TEXT NOT NULL,
    action      TEXT NOT NULL,
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legacy_import_entity_log_run_id ON legacy_import_entity_log(run_id);
CREATE INDEX idx_legacy_import_entity_log_entity ON legacy_import_entity_log(entity_type, entity_id);

CREATE TRIGGER trg_legacy_import_entity_log_updated_at
    BEFORE UPDATE ON legacy_import_entity_log
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
