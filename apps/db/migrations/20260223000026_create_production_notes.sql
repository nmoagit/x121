-- Production notes and internal comments system (PRD-95).

CREATE TABLE production_notes (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    content_md TEXT NOT NULL,
    category_id BIGINT NOT NULL REFERENCES note_categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    visibility TEXT NOT NULL DEFAULT 'team',
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    parent_note_id BIGINT NULL REFERENCES production_notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resolved_at TIMESTAMPTZ,
    resolved_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_notes_entity ON production_notes(entity_type, entity_id);
CREATE INDEX idx_production_notes_user_id ON production_notes(user_id);
CREATE INDEX idx_production_notes_category_id ON production_notes(category_id);
CREATE INDEX idx_production_notes_parent_note_id ON production_notes(parent_note_id);
CREATE INDEX idx_production_notes_pinned ON production_notes(pinned) WHERE pinned = TRUE;
CREATE INDEX idx_production_notes_resolved_by ON production_notes(resolved_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON production_notes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
