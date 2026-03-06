# Task List: Speech & TTS Repository

**PRD Reference:** `design/prds/124-prd-speech-tts-repository.md`
**Scope:** Normalized speech text storage for characters, CRUD API, Speech tab in Character Detail page, bulk CSV/JSON import/export, read-only VoiceID display.

## Overview

This PRD adds a `speech_types` lookup table and a `character_speeches` table for storing versioned dialogue text per character. The frontend gets a new "Speech" tab on the Character Detail page with grouped entry display, inline editing, and import/export. MVP is text-only; TTS audio generation is post-MVP.

### What Already Exists
- `characters` table with `settings JSONB` storing `elevenlabs_voice` (PRD-01)
- `CharacterDetailPage.tsx` with 6 tabs defined in `CHARACTER_TABS` (PRD-112)
- `character_statuses` lookup table pattern (SMALLSERIAL PK, name TEXT)
- `FileDropZone` component for file uploads (`@/components/domain/FileDropZone.tsx`)
- Soft delete infrastructure (`deleted_at` column pattern from PRD-109)
- Import/export patterns from PRD-066 (Character Metadata Editor)
- Design system components: `Select`, `Input`, `Button`, `Modal`, `Badge`, `EmptyState`

### What We're Building
1. Database migration: `speech_types` (seeded lookup) + `character_speeches` (versioned entries)
2. Backend models: `SpeechType`, `CharacterSpeech`, `CreateSpeech`, `UpdateSpeech`
3. Backend repos: `SpeechTypeRepo`, `CharacterSpeechRepo`
4. Core module: validation, CSV/JSON import parser
5. API handlers + routes: 8 endpoints (2 for types, 6 for speeches)
6. Frontend hooks: `use-character-speeches.ts`
7. Frontend tab: `CharacterSpeechTab.tsx` with import/export modal
8. Update `CHARACTER_TABS` to include "Speech"

### Key Design Decisions
1. Version numbers auto-increment per (character_id, speech_type_id) pair, including soft-deleted rows.
2. Speech types are seeded but user-extensible -- unknown types in import auto-create rows.
3. Import is all-or-nothing (transactional) -- if any row fails validation, none are imported.
4. `DELETE` is soft delete (sets `deleted_at`); unique constraint is partial (WHERE deleted_at IS NULL).

---

## Phase 1: Database Migration

### Task 1.1: Create migration file
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_speech_tables.sql`

Create a single migration with both tables:

```sql
-- Speech types lookup (seeded, user-extensible)
CREATE TABLE speech_types (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO speech_types (name) VALUES
    ('Greeting'), ('Farewell'), ('Flirty'), ('Angry'),
    ('Sad'), ('Excited'), ('Neutral'), ('Whisper');

-- Character speech entries
CREATE TABLE character_speeches (
    id             BIGSERIAL   PRIMARY KEY,
    character_id   BIGINT      NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    speech_type_id SMALLINT    NOT NULL REFERENCES speech_types(id) ON DELETE RESTRICT,
    version        INT         NOT NULL,
    text           TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_character_speeches_char_type_version
    ON character_speeches (character_id, speech_type_id, version)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_character_speeches_character_id   ON character_speeches(character_id);
CREATE INDEX idx_character_speeches_speech_type_id ON character_speeches(speech_type_id);

CREATE TRIGGER trg_character_speeches_updated_at
    BEFORE UPDATE ON character_speeches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Migration runs cleanly with `sqlx migrate run`
- [ ] 8 default speech types seeded
- [ ] Unique constraint excludes soft-deleted rows
- [ ] `updated_at` trigger fires on UPDATE

---

## Phase 2: Backend Models

### Task 2.1: Create speech type model
**File:** `apps/backend/crates/db/src/models/speech_type.rs`

Define the `SpeechType` struct matching the `speech_types` table.

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct SpeechType {
    pub id: i16,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSpeechType {
    pub name: String,
}
```

**Acceptance Criteria:**
- [ ] Struct derives `FromRow`, `Serialize`, `Deserialize`
- [ ] `id` is `i16` (SMALLSERIAL)
- [ ] `CreateSpeechType` has only `name`

### Task 2.2: Create character speech model
**File:** `apps/backend/crates/db/src/models/character_speech.rs`

Define models for `character_speeches` table.

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::DbId;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct CharacterSpeech {
    pub id: DbId,
    pub character_id: DbId,
    pub speech_type_id: i16,
    pub version: i32,
    pub text: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCharacterSpeech {
    pub speech_type_id: i16,
    pub text: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCharacterSpeech {
    pub text: String,
}
```

**Acceptance Criteria:**
- [ ] `CharacterSpeech` matches all columns in the table
- [ ] `deleted_at` is `Option<DateTime<Utc>>`
- [ ] `CreateCharacterSpeech` does NOT include `version` (auto-assigned)
- [ ] `UpdateCharacterSpeech` only allows `text` changes

### Task 2.3: Register models in mod.rs
**File:** `apps/backend/crates/db/src/models/mod.rs`

Add `pub mod speech_type;` and `pub mod character_speech;` to the models module.

**Acceptance Criteria:**
- [ ] Both modules exported
- [ ] `cargo check` passes

---

## Phase 3: Backend Repositories

### Task 3.1: Create speech type repository
**File:** `apps/backend/crates/db/src/repositories/speech_type_repo.rs`

Implement `SpeechTypeRepo` with:
- `list_all(pool) -> Vec<SpeechType>` -- all types, ordered by name
- `find_by_name(pool, name) -> Option<SpeechType>` -- case-insensitive lookup
- `create(pool, input) -> SpeechType` -- insert, return created row
- `find_or_create(pool, name) -> SpeechType` -- find existing or create new (for import)

```rust
pub struct SpeechTypeRepo;

impl SpeechTypeRepo {
    pub async fn list_all(pool: &PgPool) -> Result<Vec<SpeechType>, sqlx::Error> { ... }
    pub async fn find_by_name(pool: &PgPool, name: &str) -> Result<Option<SpeechType>, sqlx::Error> { ... }
    pub async fn create(pool: &PgPool, input: &CreateSpeechType) -> Result<SpeechType, sqlx::Error> { ... }
    pub async fn find_or_create(pool: &PgPool, name: &str) -> Result<SpeechType, sqlx::Error> { ... }
}
```

**Acceptance Criteria:**
- [ ] `list_all` returns rows ordered by `name ASC`
- [ ] `find_by_name` uses `LOWER(name) = LOWER($1)` for case-insensitive match
- [ ] `create` returns the inserted row with generated id
- [ ] `find_or_create` does not fail on duplicate (uses find first, then create)

### Task 3.2: Create character speech repository
**File:** `apps/backend/crates/db/src/repositories/character_speech_repo.rs`

Implement `CharacterSpeechRepo` with:
- `list_for_character(pool, character_id, include_deleted) -> Vec<CharacterSpeech>`
- `list_by_type(pool, character_id, speech_type_id) -> Vec<CharacterSpeech>`
- `find_by_id(pool, id) -> Option<CharacterSpeech>`
- `next_version(pool, character_id, speech_type_id) -> i32`
- `create(pool, character_id, input, version) -> CharacterSpeech`
- `update(pool, id, input) -> Option<CharacterSpeech>`
- `soft_delete(pool, id) -> bool`
- `bulk_create(pool, character_id, entries: &[(i16, String)]) -> Vec<CharacterSpeech>` (for import)

**Key implementation detail for `next_version`:**
```sql
SELECT COALESCE(MAX(version), 0) + 1
FROM character_speeches
WHERE character_id = $1 AND speech_type_id = $2
```
Note: includes soft-deleted rows (no `deleted_at IS NULL` filter) to prevent version reuse.

**Acceptance Criteria:**
- [ ] `list_for_character` excludes soft-deleted by default, includes with flag
- [ ] `list_for_character` orders by `speech_type_id, version ASC`
- [ ] `next_version` includes soft-deleted rows in MAX computation
- [ ] `create` uses the version from `next_version`
- [ ] `soft_delete` sets `deleted_at = now()`, returns true if row found
- [ ] `update` only modifies `text`, returns None if not found or soft-deleted
- [ ] `bulk_create` assigns versions correctly in sequence per type

### Task 3.3: Register repositories in mod.rs
**File:** `apps/backend/crates/db/src/repositories/mod.rs`

Add both repository modules.

**Acceptance Criteria:**
- [ ] Both modules exported
- [ ] `cargo check` passes

---

## Phase 4: Core Validation & Import Parsing

### Task 4.1: Create speech core module
**File:** `apps/backend/crates/core/src/speech.rs`

Implement:
- `validate_speech_text(text: &str) -> Result<(), CoreError>` -- non-empty, max 5000 chars
- `validate_speech_type_name(name: &str) -> Result<(), CoreError>` -- non-empty, max 100 chars, alphanumeric + spaces
- `parse_csv_import(data: &str) -> Result<Vec<SpeechImportRow>, CoreError>` -- parse CSV with `type,text` columns
- `parse_json_import(data: &str) -> Result<Vec<SpeechImportRow>, CoreError>` -- parse JSON array
- `SpeechImportRow { type_name: String, text: String }`

```rust
#[derive(Debug, Clone)]
pub struct SpeechImportRow {
    pub type_name: String,
    pub text: String,
}

pub fn validate_speech_text(text: &str) -> Result<(), CoreError> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation("Speech text cannot be empty".into()));
    }
    if trimmed.len() > 5000 {
        return Err(CoreError::Validation("Speech text exceeds 5000 character limit".into()));
    }
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] `validate_speech_text` rejects empty/whitespace-only and >5000 chars
- [ ] `validate_speech_type_name` rejects empty and >100 chars
- [ ] `parse_csv_import` handles header row, quoted fields, newlines in quotes
- [ ] `parse_json_import` handles array of objects with `type` and `text` fields
- [ ] Both parsers return `CoreError::Validation` with descriptive messages on failure
- [ ] Unit tests cover: valid input, empty text, missing type, malformed CSV, malformed JSON

### Task 4.2: Register core module
**File:** `apps/backend/crates/core/src/lib.rs`

Add `pub mod speech;` to the core crate.

**Acceptance Criteria:**
- [ ] Module exported
- [ ] `cargo check` passes

---

## Phase 5: API Handlers & Routes

### Task 5.1: Create speech type handlers
**File:** `apps/backend/crates/api/src/handlers/speech_type.rs`

Implement handlers:
- `list_speech_types` -- GET, returns `{ data: SpeechType[] }`
- `create_speech_type` -- POST, validates name, returns `{ data: SpeechType }` or 409 on duplicate

**Acceptance Criteria:**
- [ ] Both handlers use `AppState` for pool access
- [ ] `create_speech_type` calls `validate_speech_type_name` before insert
- [ ] Duplicate name returns 409 Conflict
- [ ] Responses use standard `{ data }` envelope

### Task 5.2: Create character speech handlers
**File:** `apps/backend/crates/api/src/handlers/character_speech.rs`

Implement handlers:
- `list_speeches` -- GET, query params: `?type=Greeting&include_deleted=true`
- `create_speech` -- POST, validates text, auto-assigns version
- `update_speech` -- PUT, validates text, returns updated entry
- `delete_speech` -- DELETE, soft delete, returns 204
- `import_speeches` -- POST, parses CSV/JSON, creates entries transactionally
- `export_speeches` -- POST, generates CSV/JSON response

**Key implementation for `import_speeches`:**
1. Parse input based on `format` field
2. For each row, resolve type name to `speech_type_id` via `SpeechTypeRepo::find_or_create`
3. Validate all texts
4. If any validation fails, return errors without importing
5. Bulk create all entries in a transaction
6. Return summary with `imported` count and `created_types` list

**Acceptance Criteria:**
- [ ] `list_speeches` filters by type name when `?type=` is provided
- [ ] `list_speeches` excludes soft-deleted by default
- [ ] `create_speech` auto-assigns version via repo
- [ ] `update_speech` returns 404 if speech not found or soft-deleted
- [ ] `delete_speech` returns 204 on success, 404 if not found
- [ ] `import_speeches` is transactional (all or nothing)
- [ ] `import_speeches` reports created types in response
- [ ] `export_speeches` sets `Content-Disposition` header for CSV downloads
- [ ] All handlers validate character exists (404 if not)

### Task 5.3: Create route definitions
**File:** `apps/backend/crates/api/src/routes/character_speech.rs`

Define routes:
```rust
pub fn speech_type_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_speech_types).post(create_speech_type))
}

pub fn character_speech_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_speeches).post(create_speech))
        .route("/:speechId", put(update_speech).delete(delete_speech))
        .route("/import", post(import_speeches))
        .route("/export", post(export_speeches))
}
```

Mount:
- `speech_type_routes()` at `/api/v1/speech-types`
- `character_speech_routes()` nested under `/api/v1/characters/:id/speeches`

### Task 5.4: Register handlers and routes
**Files:**
- `apps/backend/crates/api/src/handlers/mod.rs`
- `apps/backend/crates/api/src/routes/mod.rs`
- Main router file (where routes are mounted)

**Acceptance Criteria:**
- [ ] Both handler modules exported
- [ ] Both route modules exported
- [ ] Routes mounted at correct paths
- [ ] `cargo check` passes

---

## Phase 6: Frontend Types & Hooks

### Task 6.1: Add speech TypeScript types
**File:** `apps/frontend/src/features/characters/types.ts` (extend existing)

Add:
```typescript
export interface SpeechType {
  id: number;
  name: string;
  created_at: string;
}

export interface CharacterSpeech {
  id: number;
  character_id: number;
  speech_type_id: number;
  version: number;
  text: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateSpeechPayload {
  speech_type_id: number;
  text: string;
}

export interface UpdateSpeechPayload {
  text: string;
}

export interface SpeechImportPayload {
  format: "csv" | "json";
  data: string;
}

export interface SpeechImportResult {
  imported: number;
  created_types: string[];
  errors: string[];
}

export interface SpeechExportPayload {
  format: "csv" | "json";
}
```

**Acceptance Criteria:**
- [ ] Types match backend API contracts
- [ ] No TypeScript errors (`npx tsc --noEmit`)

### Task 6.2: Create TanStack Query hooks
**File:** `apps/frontend/src/features/characters/hooks/use-character-speeches.ts`

Implement hooks:
- `useSpeechTypes()` -- query `GET /api/v1/speech-types`
- `useCharacterSpeeches(characterId)` -- query `GET /api/v1/characters/:id/speeches`
- `useCreateSpeech(characterId)` -- mutation, invalidates speeches query
- `useUpdateSpeech(characterId)` -- mutation, invalidates speeches query
- `useDeleteSpeech(characterId)` -- mutation, invalidates speeches query
- `useImportSpeeches(characterId)` -- mutation, invalidates speeches query
- `useExportSpeeches(characterId)` -- mutation, triggers download
- `useCreateSpeechType()` -- mutation, invalidates speech types query

Follow existing patterns from `use-metadata-versions.ts` and `use-character-detail.ts`.

**Acceptance Criteria:**
- [ ] All hooks use correct query keys for cache invalidation
- [ ] Mutations invalidate the `["character-speeches", characterId]` query key
- [ ] Export hook handles file download (create Blob + trigger download)
- [ ] Error handling follows existing patterns (toast or inline error)

---

## Phase 7: Frontend Speech Tab

### Task 7.1: Add Speech tab to CHARACTER_TABS
**File:** `apps/frontend/src/features/projects/types.ts`

Add `{ id: "speech", label: "Speech" }` to the `CHARACTER_TABS` array.

**Acceptance Criteria:**
- [ ] Tab appears in Character Detail page after "Settings"
- [ ] Tab ID is `"speech"`

### Task 7.2: Create CharacterSpeechTab component
**File:** `apps/frontend/src/features/characters/tabs/CharacterSpeechTab.tsx`

Implement the main tab component:

**Layout:**
1. **VoiceID Badge** (top) -- reads `elevenlabs_voice` from character settings
   - If configured: `Badge` showing VoiceID value
   - If not configured: muted text "Voice not configured" with link/button to Settings tab
2. **Action Bar** -- "Add Speech" button, "Import" button, "Export" dropdown
3. **Grouped Speech List** -- entries grouped by speech type name
   - Each group is a collapsible section with type name as header and entry count badge
   - Within group: list of `{Type}_{Version}: "{text}"` entries
   - Each entry has Edit (inline) and Delete (with confirmation) actions
4. **Empty State** -- when no speeches exist, show EmptyState with guidance

**Props:** `{ characterId: number; projectId: number }`

**Acceptance Criteria:**
- [ ] VoiceID badge displays correctly for configured and unconfigured states
- [ ] Speech entries grouped by type, sorted by version within group
- [ ] Collapsible groups work (click header to expand/collapse)
- [ ] "Add Speech" opens inline form or modal with type selector + text input
- [ ] Inline editing: click Edit, text becomes editable, Save/Cancel buttons appear
- [ ] Delete shows confirmation modal, then soft-deletes
- [ ] Empty state renders when no speeches exist
- [ ] Loading state while data is fetching

### Task 7.3: Create Import Modal component
**File:** `apps/frontend/src/features/characters/tabs/SpeechImportModal.tsx`

Implement the import modal:
- File upload via `FileDropZone` (accepts `.csv`, `.json`)
- Text area for pasting data directly
- Format auto-detection (CSV if commas/newlines pattern, JSON if starts with `[`)
- Preview table showing parsed entries before confirming
- Error display for invalid rows
- Confirm button triggers import mutation

**Acceptance Criteria:**
- [ ] File upload and paste both work
- [ ] Format auto-detected correctly
- [ ] Preview shows type and text columns
- [ ] Errors shown inline with affected rows
- [ ] Confirm triggers import, success refreshes speech list
- [ ] Cancel closes modal without importing

### Task 7.4: Wire Speech tab into CharacterDetailPage
**File:** `apps/frontend/src/features/characters/CharacterDetailPage.tsx`

Add:
```tsx
import { CharacterSpeechTab } from "./tabs/CharacterSpeechTab";

// In the tab content rendering section:
{activeTab === "speech" && (
  <CharacterSpeechTab key={characterId} characterId={characterId} projectId={projectId} />
)}
```

**Acceptance Criteria:**
- [ ] Speech tab renders when selected
- [ ] `key={characterId}` resets state when navigating between characters
- [ ] No TypeScript errors

---

## Phase 8: Testing

### Task 8.1: Backend unit tests for core speech module
**File:** `apps/backend/crates/core/src/speech.rs` (add `#[cfg(test)]` module)

Test cases:
- `validate_speech_text`: valid text, empty text, whitespace-only, >5000 chars
- `validate_speech_type_name`: valid name, empty, >100 chars
- `parse_csv_import`: valid CSV, with header, quoted fields, empty text field, missing type
- `parse_json_import`: valid JSON array, missing fields, malformed JSON

**Acceptance Criteria:**
- [ ] At least 10 unit tests
- [ ] All pass with `cargo test`

### Task 8.2: Frontend tests for CharacterSpeechTab
**File:** `apps/frontend/src/features/characters/tabs/__tests__/CharacterSpeechTab.test.tsx`

Test cases:
- Renders grouped speech entries
- Shows empty state when no entries
- Add speech form submits correctly
- Edit inline updates text
- Delete shows confirmation
- VoiceID badge shows configured state
- VoiceID badge shows unconfigured state
- Import button opens modal

**Acceptance Criteria:**
- [ ] At least 8 test cases
- [ ] All pass with `pnpm test`

---

## Phase 9: Final Validation

### Task 9.1: TypeScript check
Run `npx tsc --noEmit` and fix any errors.

### Task 9.2: Biome lint/format
Run `pnpm lint` and `pnpm format` and fix any issues.

### Task 9.3: Cargo check + clippy
Run `cargo check` and `cargo clippy` and fix any warnings.

### Task 9.4: DRY-GUY audit
Run the dry-guy agent against all changed files. Log findings in `DRY-TRACKER.md`.

**Acceptance Criteria:**
- [ ] Zero TypeScript errors
- [ ] Zero Biome lint warnings
- [ ] Zero Clippy warnings
- [ ] DRY-GUY audit logged with no unresolved findings
