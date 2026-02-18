# Task List: Prompt Editor & Versioning

**PRD Reference:** `design/prds/063-prd-prompt-editor-versioning.md`
**Scope:** Dedicated prompt template editor with syntax highlighting, version history with diff, a prompt library for sharing proven prompts, live preview with metadata substitution, and test shot annotations linking results to prompt versions.

## Overview

Prompts are the most-iterated parameter but often managed as raw text with no history. This feature provides a rich editor with placeholder syntax highlighting and auto-complete, full version history with side-by-side diff and restore, a shared prompt library with usage/ratings, and live preview showing resolved prompts for specific characters.

### What Already Exists
- PRD-023: Scene type configuration (prompt template storage)
- PRD-058: Scene preview (test shots to link to prompt versions)

### What We're Building
1. `prompt_versions` table for version history
2. `prompt_library` table for shared prompts
3. Rich template editor component (CodeMirror/Monaco based)
4. Version diff engine
5. Live preview with character metadata substitution
6. Prompt library UI with search and ratings

### Key Design Decisions
1. **Version on every save** — Each save creates a new version automatically. No explicit version management needed by the user.
2. **Library is separate from scene types** — Prompt library entries are standalone. They can be copied into scene types but are not linked.
3. **Token estimate display** — Show approximate CLIP token count alongside character count for model compatibility awareness.

---

## Phase 1: Database Schema

### Task 1.1: Prompt Versions Table
**File:** `migrations/YYYYMMDD_create_prompt_versions.sql`

```sql
CREATE TABLE prompt_versions (
    id BIGSERIAL PRIMARY KEY,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version INTEGER NOT NULL,
    positive_prompt TEXT NOT NULL,
    negative_prompt TEXT,
    change_notes TEXT,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_versions_scene_type_id ON prompt_versions(scene_type_id);
CREATE UNIQUE INDEX uq_prompt_versions_scene_type_version ON prompt_versions(scene_type_id, version);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompt_versions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### Task 1.2: Prompt Library Table
**File:** `migrations/YYYYMMDD_create_prompt_library.sql`

```sql
CREATE TABLE prompt_library (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    positive_prompt TEXT NOT NULL,
    negative_prompt TEXT,
    tags TEXT[],
    model_compatibility TEXT[],
    usage_count INTEGER NOT NULL DEFAULT 0,
    avg_rating DOUBLE PRECISION,
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_library_owner_id ON prompt_library(owner_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompt_library
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Version Service

### Task 2.1: Prompt Version Service
**File:** `src/services/prompt_version_service.rs`

```rust
pub async fn save_prompt(pool: &sqlx::PgPool, scene_type_id: DbId, positive: &str, negative: &str, notes: &str, user_id: DbId) -> Result<DbId, anyhow::Error> {
    // 1. Get current max version for scene_type
    // 2. Create version + 1
    // 3. Update scene_type's prompt_template
    todo!()
}

pub async fn diff_versions(pool: &sqlx::PgPool, version_a_id: DbId, version_b_id: DbId) -> Result<PromptDiff, anyhow::Error> {
    // Compute line-by-line diff between two versions
    todo!()
}

pub async fn restore_version(pool: &sqlx::PgPool, version_id: DbId) -> Result<DbId, anyhow::Error> {
    // Create new version with old content (restore = new version, not rollback)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Auto-versioning on every save
- [ ] Side-by-side diff between any two versions
- [ ] One-click restore (creates new version with old content)
- [ ] Change notes per version

---

## Phase 3: API & Frontend

### Task 3.1: Prompt API
**File:** `src/routes/prompt_routes.rs`

```rust
/// GET /api/scene-types/:id/prompt-versions — Version history
/// GET /api/prompt-versions/:a/diff/:b — Diff two versions
/// POST /api/prompt-versions/:id/restore — Restore version
/// CRUD /api/prompt-library — Library management
```

### Task 3.2: Prompt Editor Component
**File:** `frontend/src/components/prompts/PromptEditor.tsx`

```typescript
export function PromptEditor({ sceneTypeId, initialValue, availablePlaceholders }: PromptEditorProps) {
  // CodeMirror/Monaco-based editor
  // Syntax highlighting for {placeholder} tokens
  // Auto-complete for metadata field names
  // Character count + approximate token estimate
  // Positive and negative prompt sections
}
```

**Acceptance Criteria:**
- [ ] Syntax highlighting for `{placeholder}` tokens
- [ ] Auto-complete for available metadata fields
- [ ] Character and token count display
- [ ] Positive/negative prompt sections

### Task 3.3: Version History Timeline
**File:** `frontend/src/components/prompts/VersionTimeline.tsx`

**Acceptance Criteria:**
- [ ] Timeline with clickable versions
- [ ] Diff view between any two versions
- [ ] Restore button per version
- [ ] Change notes displayed

### Task 3.4: Live Preview Panel
**File:** `frontend/src/components/prompts/LivePreview.tsx`

**Acceptance Criteria:**
- [ ] Character selector for preview
- [ ] Real-time placeholder substitution as user types
- [ ] Unresolvable placeholders highlighted
- [ ] Updates within 300ms of edit

### Task 3.5: Prompt Library Browser
**File:** `frontend/src/components/prompts/PromptLibraryBrowser.tsx`

**Acceptance Criteria:**
- [ ] Searchable/browsable catalog
- [ ] Tags, model compatibility, ratings displayed
- [ ] Copy to scene type action

---

## Phase 4: Testing

### Task 4.1: Prompt Version Tests
**File:** `tests/prompt_version_test.rs`

**Acceptance Criteria:**
- [ ] Save creates new version
- [ ] Diff correctly identifies changes
- [ ] Restore creates new version (not destructive rollback)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_prompt_versions.sql` | Version history |
| `migrations/YYYYMMDD_create_prompt_library.sql` | Shared library |
| `src/services/prompt_version_service.rs` | Versioning service |
| `src/routes/prompt_routes.rs` | Prompt API |
| `frontend/src/components/prompts/PromptEditor.tsx` | Rich editor |
| `frontend/src/components/prompts/VersionTimeline.tsx` | Version UI |
| `frontend/src/components/prompts/LivePreview.tsx` | Live preview |
| `frontend/src/components/prompts/PromptLibraryBrowser.tsx` | Library |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1-3.3

### Post-MVP
1. Phase 3 — Tasks 3.4-3.5
2. A/B annotations linking test shots to prompt versions

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-063 v1.0
