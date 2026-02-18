# Task List: Production Notes & Internal Comments

**PRD Reference:** `design/prds/095-prd-production-notes-internal-comments.md`
**Scope:** Build a freeform note system attachable to any platform entity (project, character, scene, segment, scene type, workflow) with rich text, categories, threading, pinned notes, visibility scoping, and search integration.

## Overview

PRD-038 handles QA-specific review notes. This PRD provides a separate layer for operational communications: "hold off on generation until new source images arrive," "this workflow crashes on Worker 3," "client requested all dance scenes use the new LoRA." Notes are freeform, attachable to any entity, support rich text with @mentions and entity deep-links, have categories (Instruction, Blocker, FYI), can be pinned for visibility, and support threaded replies with resolution status. Notes are indexed by PRD-020 for platform-wide search.

### What Already Exists
- PRD-010 Event Bus (@mention notifications)
- PRD-020 Search & Discovery Engine (note indexing)
- PRD-038 Collaborative Review (distinct purpose: QA notes)
- PRD-029 design system components
- PRD-000 database infrastructure

### What We're Building
1. Entity-attachable note system (polymorphic entity reference)
2. Rich text editor with Markdown, @mentions, and entity deep-links
3. Note categories (Instruction, Blocker, FYI, Custom)
4. Pinned note banners on entity navigation
5. Threaded replies with resolution status
6. Visibility scoping (Private, Team, Role-specific)
7. Search integration with PRD-020
8. Database table and API for note CRUD

### Key Design Decisions
1. **Polymorphic entity reference** — Notes use (entity_type, entity_id) to attach to any entity type.
2. **Separate from PRD-038** — Production notes are operational; review notes are QA. Different audience, different lifecycle.
3. **Pinned notes display as banners** — When navigating to an entity with pinned notes, a banner appears immediately.
4. **Visibility scoping** — Notes can be private, team-wide, or role-specific.

---

## Phase 1: Database & API

### Task 1.1: Create Production Notes Table
**File:** `migrations/YYYYMMDD_create_production_notes.sql`

```sql
-- Note categories
CREATE TABLE note_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#888888',
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON note_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO note_categories (name, color, icon) VALUES
    ('instruction', '#4488FF', 'book-open'),
    ('blocker', '#FF4444', 'alert-triangle'),
    ('fyi', '#44CC88', 'info'),
    ('custom', '#888888', 'message-circle');

-- Production notes
CREATE TABLE production_notes (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,          -- 'project' | 'character' | 'scene' | 'segment' | 'scene_type' | 'workflow'
    entity_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content_md TEXT NOT NULL,           -- Markdown content
    category_id BIGINT NOT NULL REFERENCES note_categories(id) ON DELETE RESTRICT,
    visibility TEXT NOT NULL DEFAULT 'team',  -- 'private' | 'team' | 'admin_only' | 'creator_only' | 'reviewer_only'
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    parent_note_id BIGINT NULL REFERENCES production_notes(id) ON DELETE CASCADE,
    resolved_at TIMESTAMPTZ,
    resolved_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
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
```

**Acceptance Criteria:**
- [ ] `note_categories` with predefined categories and admin-creatable custom
- [ ] `production_notes` with polymorphic entity reference (entity_type, entity_id)
- [ ] Threading via `parent_note_id`
- [ ] Visibility scoping field
- [ ] Partial index on pinned=TRUE for efficient pinned note queries
- [ ] All FK columns indexed, `updated_at` triggers applied

### Task 1.2: Production Notes Model & Repository
**File:** `src/models/production_note.rs`, `src/repositories/production_note_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProductionNote {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub user_id: DbId,
    pub content_md: String,
    pub category_id: DbId,
    pub visibility: String,
    pub pinned: bool,
    pub parent_note_id: Option<DbId>,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
    pub resolved_by: Option<DbId>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model and repository with full CRUD
- [ ] Query by entity (entity_type, entity_id) with visibility filtering
- [ ] Query pinned notes for entity
- [ ] Search across all notes (for PRD-020 integration)
- [ ] Thread queries (parent + children)
- [ ] Unit tests

### Task 1.3: Production Notes API
**File:** `src/routes/production_notes.rs`

```rust
pub fn production_notes_routes() -> Router<AppState> {
    Router::new()
        .route("/notes", get(list_notes).post(create_note))
        .route("/notes/:id", get(get_note).put(update_note).delete(delete_note))
        .route("/notes/:id/pin", put(toggle_pin))
        .route("/notes/:id/resolve", put(resolve_note))
        .route("/notes/search", get(search_notes))
}

/// GET /notes?entity_type=character&entity_id=123
/// Returns notes for a specific entity, filtered by user's visibility permissions
```

**Acceptance Criteria:**
- [ ] CRUD for notes with entity filtering
- [ ] `PUT /notes/:id/pin` toggles pinned status
- [ ] `PUT /notes/:id/resolve` marks note as resolved with timestamp and resolver
- [ ] `GET /notes/search?q=face+correction` searches across all notes
- [ ] Visibility filtering: users only see notes matching their role

---

## Phase 2: Rich Text Editor

### Task 2.1: Markdown Note Editor
**File:** `frontend/src/features/production-notes/NoteEditor.tsx`

**Acceptance Criteria:**
- [ ] Markdown formatting support with toolbar
- [ ] @mentions triggering PRD-010 notifications
- [ ] Inline images and links to other platform entities (deep-links)
- [ ] Entity deep-link autocomplete (type "/" to link to a character, scene, etc.)
- [ ] Preview mode showing rendered Markdown

---

## Phase 3: Notes Panel & Pinned Banners

### Task 3.1: Entity Notes Panel
**File:** `frontend/src/features/production-notes/NotesPanel.tsx`

**Acceptance Criteria:**
- [ ] Collapsible panel on entity detail views showing attached notes
- [ ] Notes count indicator on entity cards/thumbnails
- [ ] Notes organized by category with color-coded badges
- [ ] Thread view for note replies

### Task 3.2: Pinned Note Banner
**File:** `frontend/src/features/production-notes/PinnedNoteBanner.tsx`

**Acceptance Criteria:**
- [ ] When navigating to an entity with pinned notes, banner appears at top
- [ ] Banner shows note content summary and category badge
- [ ] Attention-grabbing but dismissible
- [ ] Blocker notes use distinct visual treatment (red border, warning icon)
- [ ] Displays 100% of the time when entity has pinned notes

---

## Phase 4: Threading & Resolution

### Task 4.1: Thread Component
**File:** `frontend/src/features/production-notes/NoteThread.tsx`

**Acceptance Criteria:**
- [ ] Reply to notes to create threaded discussions
- [ ] Grouped conversation view
- [ ] Resolve/close threads when issue addressed
- [ ] Resolution status visible (Open, Resolved)

---

## Phase 5: Visibility & Search

### Task 5.1: Visibility Controls
**File:** `frontend/src/features/production-notes/VisibilitySelector.tsx`

**Acceptance Criteria:**
- [ ] Private: only the author sees it
- [ ] Team: all platform users
- [ ] Role-specific: only Admins, only Creators, etc.
- [ ] Default: Team
- [ ] Visibility icon indicator on each note

### Task 5.2: Search Integration
**File:** integration with PRD-020

**Acceptance Criteria:**
- [ ] Notes indexed by PRD-020 Search Engine within 5 seconds of creation
- [ ] "Find all notes mentioning 'face correction'" returns results across all entities
- [ ] Search results link directly to the entity with the note

---

## Phase 6: Testing

### Task 6.1: Comprehensive Tests
**File:** `tests/production_notes_test.rs`, `frontend/src/features/production-notes/__tests__/`

**Acceptance Criteria:**
- [ ] Notes searchable within 5 seconds of creation
- [ ] @mention notifications delivered within 3 seconds
- [ ] Pinned note banners display on entity navigation 100% of the time
- [ ] Visibility filtering correctly restricts note access
- [ ] Threading correctly groups replies
- [ ] Resolution status updates correctly

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_production_notes.sql` | Notes and categories tables |
| `src/models/production_note.rs` | Rust model structs |
| `src/repositories/production_note_repo.rs` | Notes repository |
| `src/routes/production_notes.rs` | Axum API endpoints |
| `frontend/src/features/production-notes/NoteEditor.tsx` | Rich text editor |
| `frontend/src/features/production-notes/NotesPanel.tsx` | Entity notes panel |
| `frontend/src/features/production-notes/PinnedNoteBanner.tsx` | Pinned banners |
| `frontend/src/features/production-notes/NoteThread.tsx` | Thread component |
| `frontend/src/features/production-notes/VisibilitySelector.tsx` | Visibility controls |

## Dependencies
- PRD-010: Event Bus (@mention notifications)
- PRD-020: Search Engine (note indexing)
- PRD-029: Design system
- PRD-003: RBAC (role-based visibility)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — notes storage and CRUD
2. Phase 2 (Editor) — rich text with @mentions and deep-links
3. Phase 3 (Panel & Banners) — entity-attached notes with pinned banners
4. Phase 4 (Threading) — replies and resolution
5. Phase 5 (Visibility & Search) — scoping and PRD-020 integration

### Post-MVP Enhancements
- Note templates: admin-created templates for common note types

## Notes
- Production notes are distinct from PRD-038 review notes — different audience, purpose, and lifecycle.
- Blocker notes should be visually urgent (red) to ensure they're not missed.
- Notes should be archivable (hidden but not deleted) when no longer relevant.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
