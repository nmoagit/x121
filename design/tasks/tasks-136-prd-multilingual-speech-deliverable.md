# Task List: Multilingual Speech & Deliverable System

**PRD Reference:** `design/prds/136-prd-multilingual-speech-deliverable.md`
**Scope:** Add language infrastructure, approval workflow, deliverable JSON export, completeness tracking, project speech config, bulk import, and language flag indicators to the existing speech system (PRD-124).

## Overview

This implementation extends the existing speech storage system (PRD-124) with multilingual support, an approval workflow, and a defined deliverable output format. The approach adds three new tables (`languages`, `speech_statuses`, `project_speech_config`), extends two existing tables (`character_speeches`, `speech_types`), builds new API endpoints for approval/reorder/deliverable/completeness/config/bulk-import, and enhances the frontend speech tab with language selection, approval badges, and deliverable generation. SVG flag icons (via `circle-flags` library) provide cross-platform language indicators on character cards.

### What Already Exists
- `speech_types` table with 8 seeded types + `SpeechTypeRepo` (list, create, find_by_name, find_or_create)
- `character_speeches` table with versioning + `CharacterSpeechRepo` (list, create, update, soft_delete, bulk_create)
- Speech API handlers: list, create, update, delete, import (JSON/CSV), export
- Frontend: `CharacterSpeechTab`, `AddSpeechModal`, `SpeechImportModal`, `use-character-speeches.ts` hooks
- Character readiness system (PRD-128) with `ReadinessIndicators` component and dashboard endpoint
- Blocking deliverables hierarchy (PRD-107) with `deliverables_required` JSONB on characters

### What We're Building
1. `languages` lookup table + API + frontend hook
2. `speech_statuses` lookup table (draft/approved/rejected)
3. `language_id`, `status_id`, `sort_order` columns on `character_speeches`
4. `sort_order` column on `speech_types`
5. `project_speech_config` table + API + frontend UI
6. Approval workflow (per-entry status update + bulk approve)
7. Variant reorder endpoint
8. Deliverable JSON export (per-character + bulk project zip)
9. Speech completeness computation + enhanced readiness indicator
10. Bulk multi-character import (greetings.json format)
11. SVG language flag indicators on character cards and detail page
12. Enhanced speech tab with language filter, approval, reorder, deliverable

### Key Design Decisions
1. **SVG flags** via `circle-flags` — consistent cross-platform rendering (emoji flags break on Windows/Linux)
2. **English-only default** for new projects — additional languages added via project speech config
3. **`{character_slug}_speech.json`** for deliverable filenames — human-readable
4. **Per-entry approval** — individual draft/approved/rejected; bulk approve is a convenience filter action
5. **Explicit `sort_order`** on `speech_types` — seeded order: Greeting(1)→Sad(8); custom types appended
6. **Single migration** for all schema changes — atomic, ordered (languages first, then alter character_speeches)

---

## Phase 1: Database Migration

### Task 1.1: Create migration file with all schema changes
**File:** `apps/db/migrations/20260318000001_multilingual_speech_system.sql`

Create a single migration that performs all schema changes in the correct order.

```sql
-- 1. Languages lookup table
CREATE TABLE languages (
    id         SMALLSERIAL  PRIMARY KEY,
    code       VARCHAR(10)  NOT NULL UNIQUE,
    name       TEXT         NOT NULL,
    flag_code  VARCHAR(10)  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed 12 languages
INSERT INTO languages (code, name, flag_code) VALUES
    ('en', 'English',    'us'),
    ('es', 'Spanish',    'es'),
    ('fr', 'French',     'fr'),
    ('de', 'German',     'de'),
    ('pt', 'Portuguese', 'br'),
    ('it', 'Italian',    'it'),
    ('ja', 'Japanese',   'jp'),
    ('ko', 'Korean',     'kr'),
    ('zh', 'Chinese',    'cn'),
    ('ru', 'Russian',    'ru'),
    ('ar', 'Arabic',     'sa'),
    ('hi', 'Hindi',      'in');

-- 2. Speech statuses lookup table
CREATE TABLE speech_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO speech_statuses (name) VALUES ('draft'), ('approved'), ('rejected');

-- 3. Add sort_order to speech_types
ALTER TABLE speech_types ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

UPDATE speech_types SET sort_order = CASE name
    WHEN 'Greeting'  THEN 1
    WHEN 'Farewell'  THEN 2
    WHEN 'Flirty'    THEN 3
    WHEN 'Excited'   THEN 4
    WHEN 'Neutral'   THEN 5
    WHEN 'Whisper'   THEN 6
    WHEN 'Angry'     THEN 7
    WHEN 'Sad'       THEN 8
    ELSE 99
END;

-- 4. Add columns to character_speeches
ALTER TABLE character_speeches
    ADD COLUMN language_id SMALLINT NOT NULL DEFAULT 1
        REFERENCES languages(id) ON DELETE RESTRICT,
    ADD COLUMN status_id   SMALLINT NOT NULL DEFAULT 1
        REFERENCES speech_statuses(id) ON DELETE RESTRICT,
    ADD COLUMN sort_order  INT      NOT NULL DEFAULT 0;

-- Backfill sort_order sequentially per (character, type) group
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY character_id, speech_type_id
        ORDER BY version
    ) AS rn
    FROM character_speeches
    WHERE deleted_at IS NULL
)
UPDATE character_speeches cs
SET sort_order = n.rn
FROM numbered n
WHERE cs.id = n.id;

-- 5. Drop old unique constraint, create new one including language_id
ALTER TABLE character_speeches
    DROP CONSTRAINT IF EXISTS uq_character_speeches_char_type_version;

CREATE UNIQUE INDEX uq_character_speeches_char_type_lang_version
    ON character_speeches (character_id, speech_type_id, language_id, version)
    WHERE deleted_at IS NULL;

-- 6. New indexes
CREATE INDEX idx_character_speeches_language_id ON character_speeches(language_id);
CREATE INDEX idx_character_speeches_status_id   ON character_speeches(status_id);

-- 7. Project speech configuration table
CREATE TABLE project_speech_config (
    id             BIGSERIAL   PRIMARY KEY,
    project_id     BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    speech_type_id SMALLINT    NOT NULL REFERENCES speech_types(id) ON DELETE CASCADE,
    language_id    SMALLINT    NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    min_variants   INT         NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_project_speech_config
    ON project_speech_config (project_id, speech_type_id, language_id);

CREATE INDEX idx_project_speech_config_project ON project_speech_config(project_id);
```

**Acceptance Criteria:**
- [ ] Migration runs cleanly on existing database with speech data
- [ ] All existing `character_speeches` rows have `language_id = 1` (English), `status_id = 1` (draft), `sort_order` assigned sequentially
- [ ] `languages` table seeded with 12 languages
- [ ] `speech_statuses` table seeded with draft(1), approved(2), rejected(3)
- [ ] `speech_types` rows have correct `sort_order` values
- [ ] Old unique constraint dropped, new one (including `language_id`) created
- [ ] `project_speech_config` table created with unique constraint on (project_id, speech_type_id, language_id)
- [ ] `sqlx migrate run` succeeds

---

## Phase 2: Backend Models & Repositories

### Task 2.1: Create Language model and LanguageRepo
**Files:** `apps/backend/crates/db/src/models/language.rs`, `apps/backend/crates/db/src/repositories/language_repo.rs`

Create the Language model and repository following existing patterns (SpeechType as template).

```rust
// models/language.rs
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Language {
    pub id: i16,
    pub code: String,
    pub name: String,
    pub flag_code: String,
    pub created_at: Timestamp,
}
```

Repository methods:
- `list_all(pool) -> Result<Vec<Language>>` — ordered by name
- `find_by_id(pool, id) -> Result<Option<Language>>`
- `find_by_code(pool, code) -> Result<Option<Language>>`
- `find_by_name_insensitive(pool, name) -> Result<Option<Language>>` — for import mapping ("english" → en)
- `create(pool, code, name, flag_code) -> Result<Language>`

**Acceptance Criteria:**
- [x] `Language` struct derives `Debug, Clone, FromRow, Serialize`
- [x] `LanguageRepo` with all 5 methods
- [x] `find_by_name_insensitive` uses `LOWER(name) = LOWER($1)`
- [x] Module registered in `models/mod.rs` and `repositories/mod.rs`

### Task 2.2: Create SpeechStatus model
**File:** `apps/backend/crates/db/src/models/speech_status.rs`

Simple lookup model — no repository needed (IDs are hardcoded constants).

```rust
// models/speech_status.rs
pub const SPEECH_STATUS_DRAFT: i16 = 1;
pub const SPEECH_STATUS_APPROVED: i16 = 2;
pub const SPEECH_STATUS_REJECTED: i16 = 3;

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SpeechStatus {
    pub id: i16,
    pub name: String,
    pub created_at: Timestamp,
}
```

**Acceptance Criteria:**
- [x] Constants defined for all 3 status IDs
- [x] `SpeechStatus` struct with `FromRow` and `Serialize`
- [x] Module registered in `models/mod.rs`

### Task 2.3: Update CharacterSpeech model with new fields
**File:** `apps/backend/crates/db/src/models/character_speech.rs`

Add `language_id`, `status_id`, `sort_order` to `CharacterSpeech`. Update `CreateCharacterSpeech` to accept optional `language_id`.

```rust
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterSpeech {
    pub id: DbId,
    pub character_id: DbId,
    pub speech_type_id: i16,
    pub language_id: i16,       // NEW
    pub version: i32,
    pub text: String,
    pub status_id: i16,         // NEW
    pub sort_order: i32,        // NEW
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub deleted_at: Option<Timestamp>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCharacterSpeech {
    pub speech_type_id: i16,
    pub text: String,
    pub language_id: Option<i16>,  // NEW — defaults to 1 (English) if None
}

// NEW
#[derive(Debug, Deserialize)]
pub struct UpdateSpeechStatus {
    pub status: String,  // "draft" | "approved" | "rejected"
}
```

**Acceptance Criteria:**
- [x] `CharacterSpeech` has `language_id`, `status_id`, `sort_order` fields
- [x] `CreateCharacterSpeech` has optional `language_id`
- [x] `UpdateSpeechStatus` DTO created
- [x] Existing `UpdateCharacterSpeech` unchanged (text-only)

### Task 2.4: Update SpeechType model with sort_order
**File:** `apps/backend/crates/db/src/models/speech_type.rs`

```rust
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SpeechType {
    pub id: i16,
    pub name: String,
    pub sort_order: i32,   // NEW
    pub created_at: Timestamp,
}
```

**Acceptance Criteria:**
- [x] `SpeechType` includes `sort_order: i32`
- [x] `SpeechTypeRepo::list_all` ordered by `sort_order ASC, name ASC`
- [x] `SpeechTypeRepo::create` sets `sort_order` to MAX + 1

### Task 2.5: Update CharacterSpeechRepo with new fields and methods
**File:** `apps/backend/crates/db/src/repositories/character_speech_repo.rs`

Update all existing queries to include `language_id`, `status_id`, `sort_order` in SELECT and INSERT. Add new methods.

**Existing methods to update:**
- `list_for_character` — add `language_id`, `status_id`, `sort_order` to SELECT; order by `speech_type_id, language_id, sort_order`
- `list_for_character_by_type` — same column additions
- `create` — accept `language_id` (default to 1), set `status_id = 1` (draft), auto-assign `sort_order`
- `bulk_create` — accept `(i16, i16, String)` tuples (type_id, language_id, text), set status=draft, auto sort_order

**New methods:**
- `list_for_character_by_language(pool, character_id, language_id) -> Result<Vec<CharacterSpeech>>`
- `list_for_character_by_type_and_language(pool, character_id, type_id, language_id) -> Result<Vec<CharacterSpeech>>`
- `update_status(pool, id, status_id) -> Result<Option<CharacterSpeech>>`
- `bulk_approve(pool, character_id, language_id: Option<i16>, type_id: Option<i16>) -> Result<u64>` — updates all draft to approved, returns affected count
- `reorder(pool, speech_ids: &[DbId]) -> Result<()>` — assigns sort_order 1..N in order of provided IDs
- `list_approved_for_character(pool, character_id) -> Result<Vec<CharacterSpeech>>` — only status=approved, ordered by type sort_order, language, variant sort_order
- `count_by_language(pool, character_id) -> Result<Vec<(i16, String, String, i64)>>` — returns (language_id, code, flag_code, count) for language indicators
- `completeness_summary(pool, character_id, config: &[(i16, i16, i32)]) -> Result<CompletenessSummary>` — compares approved counts against config requirements

```rust
#[derive(Debug, Serialize)]
pub struct CompletenessSummary {
    pub total_slots: i32,
    pub filled_slots: i32,
    pub completeness_pct: i32,
    pub breakdown: Vec<CompletenessEntry>,
}

#[derive(Debug, Serialize)]
pub struct CompletenessEntry {
    pub speech_type_id: i16,
    pub speech_type_name: String,
    pub language_id: i16,
    pub language_code: String,
    pub required: i32,
    pub approved: i32,
    pub status: String,  // "complete" | "partial" | "not_started"
}
```

**Acceptance Criteria:**
- [x] All SELECT queries include `language_id, status_id, sort_order`
- [x] `create` accepts optional `language_id`, defaults to 1
- [x] `create` auto-assigns `sort_order` as MAX+1 per (character, type, language) group
- [x] `bulk_create` accepts language_id per entry (via `bulk_create_with_language`)
- [x] All 8 new methods implemented
- [x] `bulk_approve` respects optional filters
- [x] `reorder` uses a transaction to update sort_order atomically
- [x] `list_approved_for_character` orders by speech_types.sort_order, language_id, character_speeches.sort_order

### Task 2.6: Create ProjectSpeechConfig model and repository
**Files:** `apps/backend/crates/db/src/models/project_speech_config.rs`, `apps/backend/crates/db/src/repositories/project_speech_config_repo.rs`

```rust
// models/project_speech_config.rs
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectSpeechConfig {
    pub id: DbId,
    pub project_id: DbId,
    pub speech_type_id: i16,
    pub language_id: i16,
    pub min_variants: i32,
    pub created_at: Timestamp,
}

#[derive(Debug, Deserialize)]
pub struct SpeechConfigEntry {
    pub speech_type_id: i16,
    pub language_id: i16,
    pub min_variants: i32,
}
```

Repository methods:
- `list_for_project(pool, project_id) -> Result<Vec<ProjectSpeechConfig>>`
- `replace_all(pool, project_id, entries: &[SpeechConfigEntry]) -> Result<Vec<ProjectSpeechConfig>>` — DELETE all existing, INSERT new (transaction)
- `get_or_default(pool, project_id) -> Result<Vec<(i16, i16, i32)>>` — returns config tuples; if none exist, returns default (8 types × English × 3 min_variants)

**Acceptance Criteria:**
- [x] Model and DTO structs created
- [x] `replace_all` uses a transaction (DELETE + bulk INSERT)
- [x] `get_or_default` returns sensible defaults when no config exists
- [x] Module registered in `models/mod.rs` and `repositories/mod.rs`

---

## Phase 3: Backend API — Language, Approval & Ordering

### Task 3.1: Create language handler and routes
**Files:** `apps/backend/crates/api/src/handlers/language.rs`, `apps/backend/crates/api/src/routes/language.rs`

```rust
// handlers/language.rs
pub async fn list_languages(State(state)) -> AppResult<impl IntoResponse>
pub async fn create_language(auth: AuthUser, State(state), Json(body)) -> AppResult<impl IntoResponse>

#[derive(Debug, Deserialize)]
pub struct CreateLanguageRequest {
    pub code: String,
    pub name: String,
    pub flag_code: String,
}
```

Routes mounted at `/api/v1/languages`:
- `GET /` → `list_languages`
- `POST /` → `create_language`

**Acceptance Criteria:**
- [x] `list_languages` returns all languages ordered by name
- [x] `create_language` validates non-empty fields, returns 400 on duplicate code
- [x] Routes registered in `routes/mod.rs`
- [x] Structured tracing logs with user_id

### Task 3.2: Add speech status update and bulk approve handlers
**File:** `apps/backend/crates/api/src/handlers/character_speech.rs`

Add two new handler functions to the existing file.

```rust
pub async fn update_speech_status(
    auth: AuthUser,
    State(state),
    Path((character_id, speech_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateSpeechStatus>,
) -> AppResult<impl IntoResponse>

#[derive(Debug, Deserialize)]
pub struct BulkApproveQuery {
    pub language_id: Option<i16>,
    pub type_id: Option<i16>,
}

pub async fn bulk_approve_speeches(
    auth: AuthUser,
    State(state),
    Path(character_id): Path<DbId>,
    Query(params): Query<BulkApproveQuery>,
) -> AppResult<impl IntoResponse>
```

**Acceptance Criteria:**
- [x] `update_speech_status` maps status string to ID (draft=1, approved=2, rejected=3), returns 400 for invalid status
- [x] `update_speech_status` returns updated `CharacterSpeech`
- [x] `bulk_approve_speeches` calls `CharacterSpeechRepo::bulk_approve` with optional filters
- [x] Returns `{ approved_count: N }` response
- [x] Both handlers have tracing logs

### Task 3.3: Add variant reorder handler
**File:** `apps/backend/crates/api/src/handlers/character_speech.rs`

```rust
#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub speech_ids: Vec<DbId>,
}

pub async fn reorder_speeches(
    auth: AuthUser,
    State(state),
    Path(character_id): Path<DbId>,
    Json(body): Json<ReorderRequest>,
) -> AppResult<StatusCode>
```

**Acceptance Criteria:**
- [x] Validates all speech_ids belong to the given character
- [x] Calls `CharacterSpeechRepo::reorder` with the ordered IDs
- [x] Returns 204 NO_CONTENT on success
- [x] Returns 400 if any speech_id doesn't belong to the character

### Task 3.4: Update existing speech handlers for language support
**File:** `apps/backend/crates/api/src/handlers/character_speech.rs`

Modify existing handlers:

- `list_speeches`: Add `language_id: Option<i16>` to `SpeechListQuery`. Join `languages` table to return expanded language object on each entry. Support `?group_by=type,language` query param returning nested structure.
- `create_speech`: Accept `language_id` from body (default to 1). Include language in response.
- `import_speeches`: Update `parse_json_import` to accept optional `language` field per entry. Update `parse_csv_import` to accept optional `language` column. Default to English when not specified.
- `export_speeches`: Include `language` code in output.

**Acceptance Criteria:**
- [x] `SpeechListQuery` extended with `language_id` param
- [x] List response includes `language_id`, `status_id`, `sort_order` on each entry
- [x] Create accepts `language_id`, defaults to 1
- [x] Import parsers handle optional language field, backward-compatible
- [x] Export includes language code
- [ ] Group-by mode returns nested JSON: `{ type_name: { language_code: [...speeches] } }` (deferred to frontend phase)

### Task 3.5: Update speech routes with new endpoints
**File:** `apps/backend/crates/api/src/routes/character_speech.rs`

Add new routes to the existing router:

```
PUT    /{speech_id}/status   -> update_speech_status
POST   /bulk-approve         -> bulk_approve_speeches
PUT    /reorder              -> reorder_speeches
POST   /deliverable          -> generate_deliverable      (Task 4.1)
GET    /completeness         -> speech_completeness        (Task 4.2)
```

**Acceptance Criteria:**
- [x] All new routes registered and accessible
- [x] Route paths match PRD API spec
- [x] No conflicts with existing routes

---

## Phase 4: Backend API — Deliverable, Completeness, Config & Bulk Import

### Task 4.1: Create deliverable JSON generation handler
**File:** `apps/backend/crates/api/src/handlers/character_speech.rs`

```rust
#[derive(Debug, Serialize)]
pub struct SpeechDeliverable {
    pub character_id: DbId,
    pub character_slug: String,
    pub character_name: String,
    pub voice_id: Option<String>,
    pub generated_at: Timestamp,
    pub languages: Vec<String>,            // ISO 639-1 codes
    pub speech: IndexMap<String, IndexMap<String, Vec<String>>>,  // type -> lang -> texts
}

pub async fn generate_deliverable(
    auth: AuthUser,
    State(state),
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse>
```

Logic:
1. Fetch character (for slug, name, settings/voice_id)
2. Fetch all approved speeches via `list_approved_for_character`
3. Fetch speech types and languages for name/code lookups
4. Build nested structure: speech types ordered by `sort_order`, languages alphabetical within each type, variants ordered by `sort_order`
5. Return 422 if no approved speeches exist
6. Use `IndexMap` (from `indexmap` crate) to preserve insertion order in JSON serialization

**Acceptance Criteria:**
- [ ] Deliverable JSON matches PRD format exactly
- [ ] Only approved speeches included
- [ ] Speech types ordered by `speech_types.sort_order`
- [ ] Variant texts ordered by `character_speeches.sort_order`
- [ ] Speech type names converted to lowercase snake_case
- [ ] Language codes are ISO 639-1
- [ ] `languages` array contains only languages present in the speech data
- [ ] `voice_id` extracted from character settings JSONB (`elevenlabs_voice` key)
- [ ] Returns 422 with message when no approved speeches
- [ ] `generated_at` is current UTC timestamp

### Task 4.2: Create speech completeness handler
**File:** `apps/backend/crates/api/src/handlers/character_speech.rs`

```rust
pub async fn speech_completeness(
    auth: AuthUser,
    State(state),
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse>
```

Logic:
1. Look up character's project_id
2. Fetch project speech config via `ProjectSpeechConfigRepo::get_or_default`
3. For each config entry (type, language, min_variants), count approved speeches
4. Build `CompletenessSummary` response
5. `completeness_pct` = (filled_slots / total_slots * 100), where filled_slot = min(approved, required) per entry

**Acceptance Criteria:**
- [ ] Returns `CompletenessSummary` with total_slots, filled_slots, completeness_pct, breakdown
- [ ] Uses project config or defaults if none configured
- [ ] Each breakdown entry has type name, language code, required count, approved count, status string
- [ ] Percentage correctly calculated (0 when no config, 100 when all slots filled)

### Task 4.3: Create project speech config handlers and routes
**Files:** `apps/backend/crates/api/src/handlers/project_speech_config.rs`, `apps/backend/crates/api/src/routes/project_speech_config.rs`

```rust
pub async fn get_speech_config(
    auth: AuthUser,
    State(state),
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse>

#[derive(Debug, Deserialize)]
pub struct SetSpeechConfigRequest {
    pub entries: Vec<SpeechConfigEntry>,
}

pub async fn set_speech_config(
    auth: AuthUser,
    State(state),
    Path(project_id): Path<DbId>,
    Json(body): Json<SetSpeechConfigRequest>,
) -> AppResult<impl IntoResponse>
```

Routes mounted at `/api/v1/projects/{project_id}/speech-config`:
- `GET /` → `get_speech_config`
- `PUT /` → `set_speech_config`

**Acceptance Criteria:**
- [ ] GET returns current config or empty array (frontend computes defaults)
- [ ] PUT replaces all entries atomically (transaction)
- [ ] Validates all speech_type_ids and language_ids exist
- [ ] Returns 400 for invalid references
- [ ] Routes registered under project routes in `routes/mod.rs`

### Task 4.4: Create bulk multi-character import handler
**File:** `apps/backend/crates/api/src/handlers/project_speech_import.rs`

```rust
#[derive(Debug, Serialize)]
pub struct BulkImportReport {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
    pub characters_matched: Vec<String>,
    pub characters_unmatched: Vec<String>,
}

pub async fn bulk_import_speeches(
    auth: AuthUser,
    State(state),
    Path(project_id): Path<DbId>,
    Json(body): Json<ImportProjectSpeechesRequest>,
) -> AppResult<impl IntoResponse>
```

Logic:
1. Parse input as greetings.json format: `{ slug: { type: { language_name: [texts] } } }`
2. Also support CSV format: `character_slug,speech_type,language,text`
3. Load all characters for the project, build slug→id mapping (normalize: lowercase, underscores for spaces)
4. Load all languages, build name→id mapping (case-insensitive)
5. For each character slug, match to character_id. Track unmatched.
6. For each (type, language, text), find_or_create speech_type, resolve language_id, create speech entry as draft
7. Use transactions for atomicity per character
8. Return `BulkImportReport`

Route: `POST /api/v1/projects/{project_id}/speeches/import`

**Acceptance Criteria:**
- [ ] Parses greetings.json format correctly (all 66 characters from sample file)
- [ ] Maps character slugs case-insensitively with underscore/space normalization
- [ ] Maps language names case-insensitively ("english" → en, "spanish" → es)
- [ ] Auto-creates missing speech types
- [ ] All imported entries have `status_id = 1` (draft)
- [ ] Sort order auto-assigned per (character, type, language) group
- [ ] Unmatched characters listed in response
- [ ] CSV format also supported
- [ ] Route registered under project routes

### Task 4.5: Create bulk project deliverable handler
**File:** `apps/backend/crates/api/src/handlers/project_speech_import.rs` (same file, deliverable section)

```rust
pub async fn bulk_generate_deliverables(
    auth: AuthUser,
    State(state),
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse>
```

Logic:
1. Fetch all characters in the project
2. For each character with approved speeches, generate deliverable JSON
3. Bundle into a zip file (using `zip` crate)
4. Each file named `{character_slug}_speech.json`
5. Return zip as `application/zip` with `Content-Disposition: attachment`
6. Characters with no approved speech are skipped (not included in zip)

Route: `POST /api/v1/projects/{project_id}/speech-deliverables`

**Acceptance Criteria:**
- [ ] Returns a valid zip file containing one JSON per character
- [ ] Each JSON matches the deliverable format from Task 4.1
- [ ] Characters without approved speech are excluded
- [ ] Zip filename: `{project_name}_speech_deliverables.zip`
- [ ] Returns 422 if no character has approved speech
- [ ] Route registered under project routes

---

## Phase 5: Frontend Types & Hooks

### Task 5.1: Install circle-flags SVG package
**File:** `apps/frontend/package.json`

```bash
cd apps/frontend && npm install circle-flags
```

If `circle-flags` isn't an npm package, use `@nicedoc/circle-flags` or download SVGs to `public/flags/`. Evaluate which approach works best.

**Acceptance Criteria:**
- [ ] Flag SVG assets accessible in the frontend build
- [ ] Can render a flag given a `flag_code` like `us`, `es`, `jp`
- [ ] Works with Vite asset pipeline

### Task 5.2: Update TypeScript types for speech system
**File:** `apps/frontend/src/features/characters/types.ts`

```typescript
// NEW types
export interface Language {
  id: number;
  code: string;
  name: string;
  flag_code: string;
  created_at: string;
}

export interface SpeechStatus {
  id: number;
  name: string;
}

export const SPEECH_STATUS_DRAFT = 1;
export const SPEECH_STATUS_APPROVED = 2;
export const SPEECH_STATUS_REJECTED = 3;

export interface ProjectSpeechConfigEntry {
  id?: number;
  project_id?: number;
  speech_type_id: number;
  language_id: number;
  min_variants: number;
}

export interface CompletenessSummary {
  total_slots: number;
  filled_slots: number;
  completeness_pct: number;
  breakdown: CompletenessEntry[];
}

export interface CompletenessEntry {
  speech_type_id: number;
  speech_type_name: string;
  language_id: number;
  language_code: string;
  required: number;
  approved: number;
  status: 'complete' | 'partial' | 'not_started';
}

export interface SpeechDeliverable {
  character_id: number;
  character_slug: string;
  character_name: string;
  voice_id: string | null;
  generated_at: string;
  languages: string[];
  speech: Record<string, Record<string, string[]>>;
}

export interface BulkImportReport {
  imported: number;
  skipped: number;
  errors: string[];
  characters_matched: string[];
  characters_unmatched: string[];
}

// UPDATE existing types
export interface SpeechType {
  id: number;
  name: string;
  sort_order: number;     // NEW
  created_at: string;
}

export interface CharacterSpeech {
  id: number;
  character_id: number;
  speech_type_id: number;
  language_id: number;      // NEW
  version: number;
  text: string;
  status_id: number;        // NEW
  sort_order: number;       // NEW
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// UPDATE ImportSpeechesResponse — same as before, no change needed
```

**Acceptance Criteria:**
- [ ] All new types and interfaces exported
- [ ] Existing `SpeechType` and `CharacterSpeech` updated with new fields
- [ ] Status constants exported
- [ ] No TypeScript errors (`npx tsc --noEmit`)

### Task 5.3: Create language hooks
**File:** `apps/frontend/src/features/characters/hooks/use-languages.ts`

```typescript
export const languageKeys = {
  all: () => ['languages'] as const,
};

export function useLanguages(): UseQueryResult<Language[], Error>
export function useCreateLanguage(): UseMutationResult<Language, Error, { code: string; name: string; flag_code: string }>
```

**Acceptance Criteria:**
- [ ] `useLanguages` fetches `GET /api/v1/languages`
- [ ] `useCreateLanguage` posts to `POST /api/v1/languages` with invalidation
- [ ] Query key factory pattern followed

### Task 5.4: Update speech hooks with language, approval, reorder, deliverable, completeness
**File:** `apps/frontend/src/features/characters/hooks/use-character-speeches.ts`

Add new hooks to existing file:

```typescript
// UPDATE existing hooks
export function useCreateSpeech(characterId: number): UseMutationResult<
  CharacterSpeech, Error,
  { speech_type_id: number; text: string; language_id?: number }  // language_id added
>

// NEW hooks
export function useUpdateSpeechStatus(characterId: number): UseMutationResult<
  CharacterSpeech, Error,
  { speechId: number; status: 'draft' | 'approved' | 'rejected' }
>

export function useBulkApproveSpeeches(characterId: number): UseMutationResult<
  { approved_count: number }, Error,
  { language_id?: number; type_id?: number }
>

export function useReorderSpeeches(characterId: number): UseMutationResult<
  void, Error,
  { speech_ids: number[] }
>

export function useGenerateDeliverable(characterId: number): UseMutationResult<
  SpeechDeliverable, Error, void
>

export function useSpeechCompleteness(characterId: number): UseQueryResult<
  CompletenessSummary, Error
>
```

**Acceptance Criteria:**
- [ ] `useCreateSpeech` passes `language_id` in body
- [ ] All 5 new hooks implemented with correct API paths
- [ ] Query invalidation: approval/reorder/bulk-approve invalidate `speechKeys.list(characterId)`
- [ ] Completeness query key: `["characters", characterId, "speech-completeness"]`
- [ ] Deliverable hook returns parsed JSON (for preview) or triggers download

### Task 5.5: Create project speech config hooks
**File:** `apps/frontend/src/features/projects/hooks/use-project-speech-config.ts`

```typescript
export const speechConfigKeys = {
  config: (projectId: number) => ['projects', projectId, 'speech-config'] as const,
};

export function useProjectSpeechConfig(projectId: number): UseQueryResult<ProjectSpeechConfigEntry[], Error>
export function useSetProjectSpeechConfig(projectId: number): UseMutationResult<
  ProjectSpeechConfigEntry[], Error,
  { entries: ProjectSpeechConfigEntry[] }
>
```

**Acceptance Criteria:**
- [ ] GET/PUT hooks for project speech config
- [ ] Mutation invalidates config query key
- [ ] Follows existing project hook patterns

### Task 5.6: Create bulk import hook
**File:** `apps/frontend/src/features/projects/hooks/use-project-speech-import.ts`

```typescript
export function useBulkImportSpeeches(projectId: number): UseMutationResult<
  BulkImportReport, Error,
  { format: string; data: string }
>

export function useBulkGenerateDeliverables(projectId: number): UseMutationResult<
  Blob, Error, void
>
```

**Acceptance Criteria:**
- [ ] Import hook posts to `POST /api/v1/projects/{id}/speeches/import`
- [ ] Deliverables hook posts to `POST /api/v1/projects/{id}/speech-deliverables` and returns blob
- [ ] Import invalidates all speech query keys for the project

---

## Phase 6: Frontend Speech Tab Enhancement

### Task 6.1: Create FlagIcon component
**File:** `apps/frontend/src/components/primitives/FlagIcon.tsx`

Reusable component that renders a circular SVG flag given a `flag_code`.

```typescript
interface FlagIconProps {
  flagCode: string;
  size?: number;  // px, default 16
  className?: string;
}

export function FlagIcon({ flagCode, size = 16, className }: FlagIconProps): React.ReactNode
```

**Acceptance Criteria:**
- [ ] Renders SVG flag image from circle-flags assets
- [ ] Accepts size prop for width/height
- [ ] Falls back gracefully if flag_code not found (show language code text)
- [ ] Circular shape (border-radius: 50% or SVG already circular)

### Task 6.2: Create SpeechStatusBadge component
**File:** `apps/frontend/src/features/characters/components/SpeechStatusBadge.tsx`

```typescript
interface SpeechStatusBadgeProps {
  statusId: number;
}

export function SpeechStatusBadge({ statusId }: SpeechStatusBadgeProps): React.ReactNode
```

Renders a `Badge` component with appropriate color:
- Draft (1) → grey/muted
- Approved (2) → green/success
- Rejected (3) → red/danger

**Acceptance Criteria:**
- [ ] Uses design system `Badge` component
- [ ] Correct color mapping for all 3 statuses
- [ ] Accessible text label

### Task 6.3: Update AddSpeechModal with language selector
**File:** `apps/frontend/src/features/characters/tabs/AddSpeechModal.tsx`

Add a language dropdown that defaults to English. Use `useLanguages()` to populate options.

**Acceptance Criteria:**
- [ ] Language `Select` dropdown added between type selector and text area
- [ ] Defaults to English (id=1)
- [ ] `onSave` callback passes `language_id` along with `speech_type_id` and `text`
- [ ] Props interface updated: `onSave: (input: { speech_type_id: number; text: string; language_id: number }) => void`
- [ ] Flag icon shown next to each language option

### Task 6.4: Update SpeechImportModal with language support
**File:** `apps/frontend/src/features/characters/tabs/SpeechImportModal.tsx`

Add a "Default language" selector for imports that don't specify per-entry language. Update preview to show language column.

**Acceptance Criteria:**
- [ ] Default language selector added (for files without language field)
- [ ] Preview table shows language column when per-entry language detected
- [ ] Backward-compatible: files without language column use the selected default
- [ ] JSON import recognizes optional `language` field per entry

### Task 6.5: Rewrite CharacterSpeechTab with language filter, approval, reorder, deliverable
**File:** `apps/frontend/src/features/characters/tabs/CharacterSpeechTab.tsx`

Major enhancement of the existing tab. Keep the existing structure but add:

1. **Language filter tabs** at top: All | 🇺🇸 English | 🇪🇸 Spanish | ... (from character's actual languages)
2. **Grouped display**: Type → Language → Variants (collapsible)
3. **Status badge** per entry (SpeechStatusBadge)
4. **Approve/reject buttons** per entry (inline, small icon buttons)
5. **Reorder controls**: up/down arrow buttons within a type/language group
6. **Toolbar additions**: Bulk Approve button, Generate Deliverable button
7. **Bulk approve**: opens confirmation dialog, respects current language filter
8. **Generate deliverable**: calls API, triggers JSON file download

**Acceptance Criteria:**
- [ ] Language filter tabs rendered from character's actual speech languages
- [ ] "All" tab shows all languages with flag icons next to each group
- [ ] Entries grouped by Type (collapsible) → Language (sub-header with flag) → Variants (list)
- [ ] Each entry shows: text, status badge, sort order, approve/reject/draft buttons
- [ ] Approve button on draft → approved; reject button on draft → rejected; reset button on approved/rejected → draft
- [ ] Up/down arrow reorder within type/language group, calls reorder API on change
- [ ] Bulk Approve button in toolbar, applies to current filter (all or specific language)
- [ ] Generate Deliverable button triggers download of `{slug}_speech.json`
- [ ] Existing edit/delete functionality preserved
- [ ] VoiceID badge still shown

---

## Phase 7: Frontend Language Indicators, Readiness & Project Config

### Task 7.1: Add language flags to character cards
**File:** `apps/frontend/src/features/projects/components/CharacterCard.tsx`

Add a row of SVG flag icons below the readiness indicators. Data comes from the character's speech language aggregation.

**Acceptance Criteria:**
- [ ] Flag icons displayed using `FlagIcon` component
- [ ] Maximum 5 flags visible; "+N more" chip for overflow
- [ ] No flags shown when character has no speech
- [ ] Flags appear below readiness indicator circles
- [ ] Data fetched from character speech language aggregation (backend provides `speech_languages` on character list or dashboard)

### Task 7.2: Add language flags to character detail page header
**File:** `apps/frontend/src/features/characters/CharacterDetailPage.tsx`

Show language flags with speech counts in the page header area.

**Acceptance Criteria:**
- [ ] Flags shown with counts: e.g., 🇺🇸 24 🇪🇸 12
- [ ] Clicking a flag scrolls to/activates the Speech tab with that language filter
- [ ] Uses `FlagIcon` component + count text
- [ ] Data from `useSpeechCompleteness` or a dedicated language summary query

### Task 7.3: Enhance speech readiness indicator
**File:** Readiness computation in character dashboard handler + frontend `ReadinessIndicators` component

Update the speech section of the readiness indicator from binary VoiceID check to completeness percentage.

**Backend change:** In the dashboard handler or readiness computation, fetch speech completeness and use it for the speech readiness section.

**Frontend change:** Update `ReadinessIndicators` to use completeness_pct for the speech (Mic) circle:
- `not_started` (0%) → muted color
- `partial` (1-99%) → warning color
- `complete` (100%) → success color

Tooltip: "Speech: X/Y slots filled (Z%)"

**Acceptance Criteria:**
- [ ] Speech readiness circle reflects actual completeness, not just VoiceID presence
- [ ] Tooltip shows slot counts and percentage
- [ ] Color transitions: muted → warning → success
- [ ] Backward-compatible: if no project speech config, uses defaults

### Task 7.4: Create Project Speech Config UI
**File:** `apps/frontend/src/features/projects/tabs/ProjectConfigTab.tsx` (extend existing)

Add a "Speech Requirements" section to the project config tab with a matrix/grid editor.

```
                    | 🇺🇸 English | 🇪🇸 Spanish | + Add Language
Greeting            |     3       |     3       |
Farewell            |     3       |     0       |
Flirty              |     3       |     0       |
...                 |             |             |
+ Add Speech Type   |             |             |
```

- Rows = speech types (from `useSpeechTypes()`)
- Columns = configured languages
- Cells = min_variants number input (0 = not required for this combination)
- "Apply Defaults" button: sets all types × English × 3
- Save button: calls `useSetProjectSpeechConfig`

**Acceptance Criteria:**
- [ ] Matrix grid renders all speech types × configured languages
- [ ] Number inputs for min_variants per cell
- [ ] 0 means "not required" (row/col still visible but not tracked for completeness)
- [ ] Add language column button (opens language selector from `useLanguages`)
- [ ] Apply Defaults button populates sensible defaults
- [ ] Save persists via PUT API
- [ ] Dirty state tracking (unsaved changes indicator)

### Task 7.5: Create Bulk Import UI for project-level speech import
**File:** `apps/frontend/src/features/projects/components/BulkSpeechImportModal.tsx`

Modal component for importing multi-character speech files at project level.

**Acceptance Criteria:**
- [ ] File drop zone + file picker (.json, .csv)
- [ ] Paste area for direct data input
- [ ] Format auto-detection
- [ ] Preview panel: left column = matched characters (green), right = unmatched (orange warning)
- [ ] Expandable character rows showing what will be imported (type, language, count)
- [ ] "Import Matched" button (skips unmatched)
- [ ] Result summary: imported count, created types, errors
- [ ] Accessible from Project Config tab ("Import Speech" button in Speech Requirements section)
- [ ] Uses `useBulkImportSpeeches` hook

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260318000001_multilingual_speech_system.sql` | Migration: languages, speech_statuses, project_speech_config, alter character_speeches + speech_types |
| `apps/backend/crates/db/src/models/language.rs` | Language model struct |
| `apps/backend/crates/db/src/models/speech_status.rs` | SpeechStatus model + constants |
| `apps/backend/crates/db/src/models/speech_type.rs` | Updated with sort_order field |
| `apps/backend/crates/db/src/models/character_speech.rs` | Updated with language_id, status_id, sort_order |
| `apps/backend/crates/db/src/models/project_speech_config.rs` | ProjectSpeechConfig model |
| `apps/backend/crates/db/src/repositories/language_repo.rs` | Language repository |
| `apps/backend/crates/db/src/repositories/character_speech_repo.rs` | Updated + 8 new methods |
| `apps/backend/crates/db/src/repositories/project_speech_config_repo.rs` | Project speech config repository |
| `apps/backend/crates/api/src/handlers/language.rs` | Language CRUD handlers |
| `apps/backend/crates/api/src/handlers/character_speech.rs` | Updated + approval/reorder/deliverable/completeness handlers |
| `apps/backend/crates/api/src/handlers/project_speech_config.rs` | Project speech config handlers |
| `apps/backend/crates/api/src/handlers/project_speech_import.rs` | Bulk import + bulk deliverable handlers |
| `apps/backend/crates/api/src/routes/language.rs` | Language routes |
| `apps/backend/crates/api/src/routes/character_speech.rs` | Updated with new endpoints |
| `apps/backend/crates/api/src/routes/project_speech_config.rs` | Project speech config routes |
| `apps/frontend/src/features/characters/types.ts` | Updated types + new interfaces |
| `apps/frontend/src/features/characters/hooks/use-languages.ts` | Language hooks |
| `apps/frontend/src/features/characters/hooks/use-character-speeches.ts` | Updated + new speech hooks |
| `apps/frontend/src/features/projects/hooks/use-project-speech-config.ts` | Project speech config hooks |
| `apps/frontend/src/features/projects/hooks/use-project-speech-import.ts` | Bulk import + deliverable hooks |
| `apps/frontend/src/components/primitives/FlagIcon.tsx` | Reusable SVG flag component |
| `apps/frontend/src/features/characters/components/SpeechStatusBadge.tsx` | Status badge component |
| `apps/frontend/src/features/characters/tabs/CharacterSpeechTab.tsx` | Major enhancement |
| `apps/frontend/src/features/characters/tabs/AddSpeechModal.tsx` | Updated with language selector |
| `apps/frontend/src/features/characters/tabs/SpeechImportModal.tsx` | Updated with language support |
| `apps/frontend/src/features/characters/CharacterDetailPage.tsx` | Language flags in header |
| `apps/frontend/src/features/projects/components/CharacterCard.tsx` | Language flags on card |
| `apps/frontend/src/features/projects/tabs/ProjectConfigTab.tsx` | Speech config matrix UI |
| `apps/frontend/src/features/projects/components/BulkSpeechImportModal.tsx` | Project bulk import modal |

---

## Dependencies

### Existing Components to Reuse
- `SpeechTypeRepo` from `db/src/repositories/speech_type_repo.rs` — extend with sort_order
- `CharacterSpeechRepo` from `db/src/repositories/character_speech_repo.rs` — extend with new columns and methods
- `CharacterSpeechTab` from `features/characters/tabs/CharacterSpeechTab.tsx` — enhance in-place
- `AddSpeechModal`, `SpeechImportModal` — enhance in-place
- `Badge`, `Button`, `Input`, `Select`, `Modal`, `EmptyState` from design system
- `ReadinessIndicators` component — extend speech section
- `BlockingDeliverablesEditor` — add speech option
- Import/export handler patterns from existing `character_speech.rs`

### New Infrastructure Needed
- `circle-flags` SVG package (or equivalent) for frontend flag rendering
- `indexmap` Rust crate for ordered JSON serialization in deliverables
- `zip` Rust crate for bulk deliverable zip generation

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migration — Task 1.1
2. Phase 2: Backend Models & Repos — Tasks 2.1–2.6
3. Phase 3: Backend API (Language, Approval, Ordering) — Tasks 3.1–3.5
4. Phase 4: Backend API (Deliverable, Completeness, Config, Import) — Tasks 4.1–4.5
5. Phase 5: Frontend Types & Hooks — Tasks 5.1–5.6
6. Phase 6: Frontend Speech Tab — Tasks 6.1–6.5
7. Phase 7: Frontend Indicators, Readiness, Config, Import — Tasks 7.1–7.5

**MVP Success Criteria:**
- Languages table seeded and accessible via API
- Speech entries tagged with language, status, and sort order
- Per-entry approval workflow functional
- Deliverable JSON generated for characters with approved speech
- Speech completeness tracked against project config
- Language flags visible on character cards
- Bulk import of greetings.json works at project level

### Post-MVP Enhancements
- LLM-powered translation (PRD-136 Req 2.1)
- LLM speech generation from character profile (PRD-136 Req 2.2)
- TTS preview via ElevenLabs (PRD-136 Req 2.3)
- Multilingual metadata translation (PRD-136 Req 2.4)

---

## Notes

1. **Migration ordering**: The `languages` table must be created before `character_speeches` is altered (FK reference). Single migration file handles this with correct statement order.
2. **Backward compatibility**: All existing speech data is backfilled with English language, draft status, and sequential sort order. No data loss.
3. **IndexMap dependency**: Add `indexmap = { version = "2", features = ["serde"] }` to the api crate's `Cargo.toml` for ordered JSON serialization in deliverables.
4. **Zip dependency**: Add `zip = "2"` to the api crate's `Cargo.toml` for bulk deliverable generation.
5. **circle-flags**: Evaluate `circle-flags` npm availability. Fallback: download SVGs to `apps/frontend/public/flags/` and reference via `/flags/{code}.svg`.
6. **TypeScript verification**: Run `npx tsc --noEmit` after each frontend task to catch type errors early.
7. **Query invalidation cascade**: Approval, reorder, and import mutations should invalidate both `speechKeys.list(characterId)` and `["characters", characterId, "speech-completeness"]` to keep UI in sync.

---

## Version History

- **v1.0** (2026-03-18): Initial task list creation from PRD-136
