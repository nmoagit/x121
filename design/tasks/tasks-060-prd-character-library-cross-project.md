# Task List: Character Library (Cross-Project)

**PRD Reference:** `design/prds/060-prd-character-library-cross-project.md`
**Scope:** Studio-level shared character registry spanning projects, enabling reuse of approved characters with their variants and metadata, with linked vs. copied metadata model and cross-project visibility.

## Overview

Characters are expensive to prepare (QA, variant generation, editing, metadata). This feature provides a studio-level character library independent of projects, enabling import of approved characters into new projects without re-generation. The linked metadata model allows per-field choice between synced (auto-update from library) and copied (independent per project) values. Cross-project usage visibility shows all projects using a character.

### What Already Exists
- PRD-001: Character data model, PRD-003: RBAC
- PRD-020: Search, PRD-021: Source images and variants

### What We're Building
1. `library_characters` table (studio-level registry)
2. `project_character_links` table (project imports)
3. Linked metadata tracking (per-field sync vs. copy)
4. Import service (library -> project)
5. Cross-project usage visibility
6. Library browser UI

### Key Design Decisions
1. **References, not copies** — Importing a character creates references to approved images (not duplicating files). Only metadata is potentially copied.
2. **Per-field linking** — Each metadata field individually set to "linked" (syncs with library) or "copied" (diverges independently). Visual indicators distinguish the two.
3. **Non-destructive imports** — Library records are never modified by project-level changes. Only linked fields push updates downstream.

---

## Phase 1: Database Schema

### Task 1.1: Library Characters Table
**File:** `migrations/YYYYMMDD_create_library_characters.sql`

```sql
CREATE TABLE library_characters (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    source_character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL ON UPDATE CASCADE,
    source_image_path TEXT,
    master_metadata JSONB NOT NULL DEFAULT '{}',
    tags TEXT[],
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_library_characters_created_by_id ON library_characters(created_by_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON library_characters
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### Task 1.2: Project Character Links Table
**File:** `migrations/YYYYMMDD_create_project_character_links.sql`

```sql
CREATE TABLE project_character_links (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    library_character_id BIGINT NOT NULL REFERENCES library_characters(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    linked_fields TEXT[] NOT NULL DEFAULT '{}',  -- Fields that auto-sync
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_character_links_project_id ON project_character_links(project_id);
CREATE INDEX idx_project_character_links_library_character_id ON project_character_links(library_character_id);
CREATE INDEX idx_project_character_links_project_character_id ON project_character_links(project_character_id);
CREATE UNIQUE INDEX uq_project_character_links ON project_character_links(project_id, library_character_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_character_links
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Library characters independent of projects
- [ ] Links track which fields are synced vs. copied
- [ ] One link per library character per project (unique)

---

## Phase 2: Services

### Task 2.1: Library Service
**File:** `src/services/character_library_service.rs`

```rust
pub async fn register_to_library(pool: &sqlx::PgPool, character_id: DbId) -> Result<DbId, anyhow::Error> {
    // Create library_character from existing project character
    todo!()
}

pub async fn import_to_project(pool: &sqlx::PgPool, library_id: DbId, project_id: DbId, linked_fields: &[String]) -> Result<DbId, anyhow::Error> {
    // 1. Create project character referencing library images (not copies)
    // 2. Copy metadata (linked fields tracked for sync)
    // 3. Create project_character_link record
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Import creates references to images (not file copies)
- [ ] Linked fields auto-sync from library
- [ ] Non-destructive to library record

### Task 2.2: Metadata Sync Service
**File:** `src/services/metadata_sync_service.rs`

**Acceptance Criteria:**
- [ ] When library metadata changes, linked fields update in all projects
- [ ] Copied fields unaffected by library changes
- [ ] Notifications sent to affected projects

### Task 2.3: Cross-Project Usage
**File:** `src/services/character_library_service.rs`

**Acceptance Criteria:**
- [ ] Library view shows all projects using a character
- [ ] Per-project scene status visible

---

## Phase 3: API & Frontend

### Task 3.1: Library API
**File:** `src/routes/library_routes.rs`

```rust
/// CRUD /api/library/characters
/// POST /api/projects/:id/import-character
/// GET /api/library/characters/:id/usage
```

### Task 3.2: Library Browser
**File:** `frontend/src/components/library/CharacterLibraryBrowser.tsx`

**Acceptance Criteria:**
- [ ] Browse by name, tags, visual similarity
- [ ] Import: select, configure linked fields, confirm
- [ ] Cross-project usage on library profile

### Task 3.3: Linked Field Indicators
**File:** `frontend/src/components/library/LinkedFieldIndicator.tsx`

**Acceptance Criteria:**
- [ ] Visual indicator per field: linked (chain icon) vs. copied (copy icon)
- [ ] Toggle between linked and copied per field

---

## Phase 4: Testing

### Task 4.1: Library Tests
**File:** `tests/character_library_test.rs`

**Acceptance Criteria:**
- [ ] Import creates reference not copy
- [ ] Linked fields sync on library update
- [ ] Copied fields stay independent

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_library_characters.sql` | Library table |
| `migrations/YYYYMMDD_create_project_character_links.sql` | Import links |
| `src/services/character_library_service.rs` | Library and import |
| `src/services/metadata_sync_service.rs` | Linked field sync |
| `src/routes/library_routes.rs` | Library API |
| `frontend/src/components/library/CharacterLibraryBrowser.tsx` | Browser UI |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 2 — Tasks 2.2-2.3 (Sync, usage)
2. Phase 3 — Task 3.3 (Linked indicators)
3. Library access control

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-060 v1.0
- **v1.1** (2026-03-06): Added Phase 5 — Amendment tasks (A.1-A.2)

---

## Phase 5: Amendment — Requirements Gap Fill (2026-03-06)

Tasks in this phase implement the requirements added in the PRD-060 Amendment (2026-03-06).

### Task 5.1: Scene Type & Track Filtering — Backend (Req A.1)
**Files:**
- `apps/backend/crates/db/src/repositories/library_character_repo.rs` (modify)
- `apps/backend/crates/api/src/handlers/library.rs` (modify)

Add query support for filtering library characters by scene type and track.

**Acceptance Criteria:**
- [ ] API: `GET /api/v1/library/characters` accepts optional `scene_type_ids` and `track_ids` query parameters (comma-separated)
- [ ] Query joins `library_characters` -> `project_character_links` -> `characters` -> `scenes` -> `scene_types` to find matches
- [ ] A character matches if any of its project instances have content for the selected scene type/track
- [ ] Filters combine with existing name/tag search via AND logic
- [ ] Returns distinct library characters (no duplicates from multiple project instances)
- [ ] Performance: query completes in <500ms for libraries with 500+ characters

### Task 5.2: Scene Type & Track Filtering — Frontend (Req A.1)
**Files:**
- `apps/frontend/src/features/library/components/CharacterLibraryBrowser.tsx` (modify)
- `apps/frontend/src/features/library/hooks/use-library-characters.ts` (modify)

**Acceptance Criteria:**
- [ ] Scene Type multi-select filter populated from scene catalog (PRD-111)
- [ ] Track multi-select filter populated from track system (PRD-111)
- [ ] Filters are additive and combinable with name/tag search
- [ ] "Clear All Filters" action resets to unfiltered view
- [ ] Filter selections reflected in URL query string for shareability
- [ ] Hook passes `scene_type_ids` and `track_ids` to API call

### Task 5.3: Read-Only Gallery Mode (Req A.2)
**Files:**
- `apps/frontend/src/features/library/components/CharacterLibraryBrowser.tsx` (modify)
- `apps/frontend/src/features/library/components/LibraryCharacterCard.tsx` (new or modify)

**Acceptance Criteria:**
- [ ] Library browser displays character assets in gallery/grid layout without inline edit controls
- [ ] No edit, delete, rename, or metadata modification actions in the library view
- [ ] Each card has a "Go to Character" button navigating to the character's project detail page
- [ ] If character exists in multiple projects, "Go to Character" shows a dropdown/popover listing all projects with links
- [ ] Library profile/detail view is read-only (metadata, variants, usage displayed but not editable)
- [ ] Only write action available is "Import to Project" (Req 1.2)
- [ ] Reuses `CharacterCard` from PRD-112 in read-only mode (no action buttons except "Go to Character" and "Import")
