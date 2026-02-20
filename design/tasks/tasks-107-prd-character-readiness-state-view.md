# Task List: Character Readiness & State View

**PRD Reference:** `design/prds/107-prd-character-readiness-state-view.md`
**Scope:** Readiness state computation and display for each character in the library, showing what is configured, what is pending, and what is missing, with configurable readiness criteria and filtering/sorting by state.

## Overview

When managing a large character library, creators need to see at a glance which characters are ready for production and which need setup. This feature adds a readiness engine that computes per-character state from multiple data sources (source images, variants, metadata completeness, pipeline settings), displays the results as a state view integrated into the character library (PRD-60), and allows filtering/sorting by readiness. Readiness criteria are configurable per studio and per project.

### What Already Exists
- PRD-001: Character entity with metadata JSONB and settings JSONB
- PRD-013: Dual metadata system (character_metadata and video_metadata)
- PRD-014: Data validation and schema rules
- PRD-021: Source image management and variant generation
- PRD-060: Character library (cross-project) with browsing UI
- PRD-066: Character metadata editor with completeness indicator (Req 1.5)

### What We're Building
1. Readiness computation engine (evaluates character against configurable criteria)
2. Readiness criteria configuration (studio-level and project-level)
3. Library state list view with readiness badges and filtering
4. Per-character settings summary inline display
5. Readiness cache for performance

### Key Design Decisions
1. **Readiness is computed, not stored directly** -- A cache table provides performance, but the source of truth is always the live data. Cache is invalidated on character data changes.
2. **Criteria are configurable** -- Different projects may require different fields. A studio default applies unless a project overrides it.
3. **Integrated into existing library** -- This is a mode/tab within PRD-60's library view, not a separate page. Avoids duplication.
4. **Reuse PRD-066 completeness logic** -- Metadata completeness is already computed by PRD-066 Req 1.5. We reuse that, don't duplicate.

---

## Phase 1: Database Schema

### Task 1.1: Readiness Criteria Table
**File:** `migrations/YYYYMMDD_create_readiness_criteria.sql`

```sql
CREATE TABLE readiness_criteria (
    id BIGSERIAL PRIMARY KEY,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('studio', 'project')),
    scope_id BIGINT,  -- NULL for studio scope, project_id for project scope
    criteria_json JSONB NOT NULL DEFAULT '{}',
    -- criteria_json format:
    -- {
    --   "required_fields": {
    --     "source_image": true,
    --     "approved_variant": true,
    --     "metadata_complete": true,
    --     "settings": ["a2c4_model", "elevenlabs_voice", "avatar_json"]
    --   }
    -- }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_readiness_criteria_scope ON readiness_criteria(scope_type, COALESCE(scope_id, 0));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON readiness_criteria
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Insert studio-level default
INSERT INTO readiness_criteria (scope_type, scope_id, criteria_json) VALUES
    ('studio', NULL, '{"required_fields": {"source_image": true, "approved_variant": true, "metadata_complete": true, "settings": ["a2c4_model", "elevenlabs_voice", "avatar_json"]}}');
```

**Acceptance Criteria:**
- [ ] Supports studio scope (scope_id NULL) and project scope
- [ ] Unique constraint prevents duplicate criteria per scope
- [ ] Default studio criteria seeded on creation
- [ ] criteria_json stores required fields and required settings keys as JSONB

### Task 1.2: Readiness Cache Table
**File:** `migrations/YYYYMMDD_create_character_readiness_cache.sql`

```sql
CREATE TABLE character_readiness_cache (
    character_id BIGINT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('ready', 'partially_ready', 'not_started')),
    missing_items JSONB NOT NULL DEFAULT '[]',
    -- missing_items format: ["source_image", "elevenlabs_voice", "metadata_complete"]
    readiness_pct INTEGER NOT NULL DEFAULT 0,  -- 0-100
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Acceptance Criteria:**
- [ ] One row per character (primary key on character_id)
- [ ] State: ready, partially_ready, not_started
- [ ] Missing items as JSON array of string labels
- [ ] Readiness percentage for sorting
- [ ] Cascade delete when character is deleted

---

## Phase 2: Readiness Computation Engine

### Task 2.1: Readiness Evaluator Service
**File:** `src/services/readiness_service.rs`

```rust
pub enum ReadinessState {
    Ready,
    PartiallyReady,
    NotStarted,
}

pub struct ReadinessResult {
    pub character_id: DbId,
    pub state: ReadinessState,
    pub missing_items: Vec<String>,
    pub readiness_pct: u8,
}

pub async fn evaluate_character_readiness(
    pool: &sqlx::PgPool,
    character_id: DbId,
) -> Result<ReadinessResult, anyhow::Error> {
    // 1. Load character (with settings JSONB)
    // 2. Load applicable readiness criteria (project-level or studio fallback)
    // 3. Check each criterion:
    //    a. Source image exists? (query source_images table)
    //    b. At least one approved variant? (query image_variants with approved status)
    //    c. Metadata complete? (reuse PRD-066 completeness logic)
    //    d. Required settings keys present? (check settings JSONB for each required key)
    // 4. Compute missing items list and readiness percentage
    // 5. Update cache table
    // 6. Return result
    todo!()
}

pub async fn evaluate_batch_readiness(
    pool: &sqlx::PgPool,
    character_ids: &[DbId],
) -> Result<Vec<ReadinessResult>, anyhow::Error> {
    // Batch evaluation for performance (single query per criterion type)
    todo!()
}

pub async fn get_applicable_criteria(
    pool: &sqlx::PgPool,
    project_id: Option<DbId>,
) -> Result<ReadinessCriteria, anyhow::Error> {
    // 1. Check for project-level criteria
    // 2. Fall back to studio-level criteria
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Evaluates source image presence, approved variant, metadata completeness, settings keys
- [ ] Uses project-level criteria if available, falls back to studio default
- [ ] Updates cache after each evaluation
- [ ] Batch evaluation for 200+ characters completes in <5 seconds
- [ ] Returns detailed missing items list (not just pass/fail)

### Task 2.2: Cache Invalidation
**File:** `src/services/readiness_service.rs`

```rust
pub async fn invalidate_readiness_cache(
    pool: &sqlx::PgPool,
    character_id: DbId,
) -> Result<(), anyhow::Error> {
    // Delete cache row; next read will recompute
    // Triggered when:
    //   - Character settings are updated
    //   - Source image is added/removed
    //   - Variant status changes
    //   - Metadata is edited
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Cache invalidated on character settings update
- [ ] Cache invalidated on source image change
- [ ] Cache invalidated on variant approval/rejection
- [ ] Cache invalidated on metadata edit
- [ ] Recomputation happens on next read (lazy evaluation)

---

## Phase 3: API Endpoints

### Task 3.1: Readiness API
**File:** `src/routes/readiness_routes.rs`

```rust
/// GET /api/characters/:id/readiness — Get readiness for a single character
/// GET /api/library/characters/readiness-summary — Aggregate readiness stats
/// GET /api/library/characters?readiness_state=not_ready — Filter by state
/// CRUD /api/readiness-criteria — Manage readiness criteria
```

**Acceptance Criteria:**
- [ ] Single character readiness returns state, missing items, percentage
- [ ] Summary returns: "X ready, Y partially ready, Z not started" with breakdown by missing item
- [ ] Filter parameter on library listing: readiness_state=ready|partially_ready|not_started
- [ ] CRUD for readiness criteria with scope validation
- [ ] Criteria changes trigger batch recalculation for affected characters

---

## Phase 4: Frontend Components

### Task 4.1: Readiness State Badge Component
**File:** `frontend/src/components/library/ReadinessStateBadge.tsx`

```typescript
interface ReadinessStateBadgeProps {
  state: 'ready' | 'partially_ready' | 'not_started';
  missingItems: string[];
}

export function ReadinessStateBadge({ state, missingItems }: ReadinessStateBadgeProps) {
  // Color-coded badge: green (ready), yellow (partially_ready), red (not_started)
  // Tooltip or expandable section showing missing items
  // Each missing item as a compact tag
}
```

**Acceptance Criteria:**
- [ ] Green badge for ready, yellow for partially ready, red for not started
- [ ] Missing items shown as compact tags on hover or expand
- [ ] Consistent with PRD-29 design system

### Task 4.2: Library State View Integration
**File:** `frontend/src/components/library/CharacterLibraryStateView.tsx`

```typescript
export function CharacterLibraryStateView() {
  // Integrates into PRD-60 character library as a tab/mode
  // Each character row shows: name, thumbnail, readiness badge, missing items, settings summary
  // Filter controls: state dropdown, missing item filter
  // Sort: by readiness percentage, name, date
}
```

**Acceptance Criteria:**
- [ ] Integrated as tab within existing character library (PRD-60)
- [ ] Each row: name, thumbnail, readiness badge, missing item tags
- [ ] Filter by readiness state (dropdown)
- [ ] Filter by specific missing item (e.g., "show all missing voice setting")
- [ ] Sort by readiness percentage, name, creation date
- [ ] Expandable rows showing detailed settings summary
- [ ] Clicking a missing item navigates to the relevant setup screen

### Task 4.3: Readiness Criteria Configuration UI
**File:** `frontend/src/components/admin/ReadinessCriteriaEditor.tsx`

```typescript
export function ReadinessCriteriaEditor({ scope }: { scope: 'studio' | 'project' }) {
  // Checklist of required items
  // Settings key list with add/remove
  // Save triggers batch recalculation
}
```

**Acceptance Criteria:**
- [ ] Toggle required items: source image, approved variant, metadata complete
- [ ] Dynamic list of required settings keys with add/remove
- [ ] Studio-level and project-level tabs
- [ ] Save shows confirmation: "This will recalculate readiness for N characters"

---

## Phase 5: Testing

### Task 5.1: Readiness Computation Tests
**File:** `tests/readiness_test.rs`

**Acceptance Criteria:**
- [ ] Character with all requirements met -> state: ready
- [ ] Character with some requirements -> state: partially_ready
- [ ] Character with no requirements met -> state: not_started
- [ ] Missing items list correctly identifies each missing criterion
- [ ] Project-level criteria override studio defaults
- [ ] Cache invalidation triggers correct recomputation
- [ ] Batch evaluation handles 200+ characters within performance target

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_readiness_criteria.sql` | Readiness criteria configuration table |
| `migrations/YYYYMMDD_create_character_readiness_cache.sql` | Per-character readiness cache |
| `src/services/readiness_service.rs` | Readiness computation and cache management |
| `src/routes/readiness_routes.rs` | Readiness API endpoints |
| `frontend/src/components/library/ReadinessStateBadge.tsx` | State badge component |
| `frontend/src/components/library/CharacterLibraryStateView.tsx` | Library state view |
| `frontend/src/components/admin/ReadinessCriteriaEditor.tsx` | Criteria configuration UI |

## Dependencies

### Existing Components to Reuse
- PRD-001: Character entity (metadata JSONB, settings JSONB)
- PRD-060: Character library browser (integrate as tab)
- PRD-066: Metadata completeness indicator logic (Req 1.5)
- PRD-029: Design system components for badges, tags, forms

### New Infrastructure Needed
- Readiness computation engine
- Readiness criteria configuration store
- Cache invalidation hooks on character data changes

## Implementation Order

### MVP
1. Phase 1: Database Schema -- Tasks 1.1-1.2
2. Phase 2: Readiness Engine -- Tasks 2.1-2.2
3. Phase 3: API -- Task 3.1
4. Phase 4: Frontend -- Tasks 4.1-4.2

**MVP Success Criteria:**
- Readiness state computed correctly for all characters
- State view integrated into character library
- Filtering and sorting by readiness state works
- Missing items accurately reflect what needs to be set up

### Post-MVP Enhancements
1. Phase 4: Task 4.3 (Configurable criteria UI)
2. Readiness progress dashboard (PRD-107 Req 2.1)
3. Phase 5: Testing

## Notes

1. **Performance:** For libraries with 200+ characters, batch evaluation queries should be optimized (single SQL query per criterion type rather than N+1 queries).
2. **Cache strategy:** Lazy invalidation + on-demand recomputation. Cache TTL is not used; invalidation is event-driven.
3. **Integration with PRD-108:** The Character Settings Dashboard (PRD-108) links back to this readiness view for the "missing items" section. They share the readiness computation engine.
4. **PRD-066 reuse:** The metadata completeness check should call PRD-066's existing logic rather than reimplementing it. If PRD-066 doesn't expose this as a service function yet, it should be extracted.

---

## Version History

- **v1.0** (2026-02-19): Initial task list creation from PRD-107 v1.0
