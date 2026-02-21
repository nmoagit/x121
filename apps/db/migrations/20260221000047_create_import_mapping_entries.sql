-- PRD-016: Folder-to-Entity Bulk Importer — per-file mapping entries.
--
-- Table: import_mapping_entries (parsed folder-to-entity mapping for preview and commit).

CREATE TABLE import_mapping_entries (
    id                   BIGSERIAL   PRIMARY KEY,
    session_id           BIGINT      NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    source_path          TEXT        NOT NULL,
    file_name            TEXT        NOT NULL,
    file_size_bytes      BIGINT      NOT NULL DEFAULT 0,
    file_extension       TEXT        NOT NULL,
    derived_entity_type  TEXT        NOT NULL,
    derived_entity_name  TEXT        NOT NULL,
    derived_category     TEXT,
    target_entity_id     BIGINT      NULL,
    action               TEXT        NOT NULL DEFAULT 'create',
    conflict_details     JSONB       NULL,
    validation_errors    JSONB       NOT NULL DEFAULT '[]',
    validation_warnings  JSONB       NOT NULL DEFAULT '[]',
    is_selected          BOOLEAN     NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_mapping_entries_session_id   ON import_mapping_entries(session_id);
CREATE INDEX idx_import_mapping_entries_entity_type  ON import_mapping_entries(derived_entity_type);
CREATE INDEX idx_import_mapping_entries_entity_name  ON import_mapping_entries(derived_entity_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_mapping_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
