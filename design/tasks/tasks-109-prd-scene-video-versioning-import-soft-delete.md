# Task List: Scene Video Versioning, External Import & Soft Delete

**PRD Reference:** `design/prds/109-prd-scene-video-versioning-import-soft-delete.md`
**Scope:** Add scene video versioning with external import, universal soft delete across all entity tables, trash/bin API with restore and purge, and delivery manifest integration with final version selection.

## Overview

This implementation adds three interconnected features: (1) a `scene_video_versions` table tracking every generated or imported video per scene with a `is_final` flag, (2) `deleted_at` soft-delete column on all 9 existing entity tables plus the new version table, replacing hard `DELETE FROM` with `UPDATE SET deleted_at = NOW()`, and (3) trash/bin API endpoints for listing, restoring, and purging soft-deleted entities. The delivery manifest is updated to use the "final" version per scene.

The implementation follows the existing codebase patterns: zero-sized repository structs with `&PgPool` methods, three-struct models (entity/create/update), Axum handlers with `AppState`/`AppResult`, and `#[sqlx::test]` integration tests.

### What Already Exists
- `trulience_db::repositories::*` — 8 CRUD repositories with `delete` (hard) methods
- `trulience_db::models::*` — 8 entity/create/update model struct triplets
- `trulience_core::delivery` — `DeliveryManifest` with `CharacterDelivery.scene_videos: Vec<String>`
- `trulience_api::handlers::*` — 8 handler modules with consistent CRUD pattern
- `trulience_api::routes::*` — Nested route tree with `api_routes()` root
- `trulience_api::error` — `AppError`/`CoreError` with `classify_sqlx_error` for constraint violations
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete` helpers

### What We're Building
1. Database migration: `scene_video_versions` table with partial unique indexes
2. Database migration: `deleted_at` column on all 10 entity tables with partial indexes
3. `SceneVideoVersion` model structs and `SceneVideoVersionRepo`
4. Soft delete infrastructure across all 8 existing repositories
5. Version API endpoints: list, get, set-final, import, soft-delete
6. Trash API endpoints: list, restore, purge, purge-preview
7. Updated `DeliveryManifest` to use final versions
8. Integration tests for all new functionality

### Key Design Decisions
1. **Soft delete in application code** — Cascade soft-delete is implemented in repository methods (not DB triggers), because PostgreSQL `ON DELETE CASCADE` only fires on hard `DELETE`.
2. **Hard delete preserved for purge** — Existing FK `ON DELETE CASCADE` rules remain. The `purge` operation uses real `DELETE FROM` which cascades through the FK tree, cleaning up all children.
3. **Partial unique index for is_final** — `CREATE UNIQUE INDEX ... ON scene_video_versions (scene_id) WHERE is_final = true` ensures at most one final version per scene at the DB level.
4. **No multipart in MVP auto-versioning** — Auto-versioning on generation (Req 1.2) and auto-rebuild ZIP (Req 1.9) are deferred to the pipeline PRDs that depend on this one. This task list implements the repository methods they will call.
5. **`deleted_at` added to COLUMNS const** — All existing repos gain `deleted_at` in their `COLUMNS` string and filter with `WHERE deleted_at IS NULL` in all queries.

---

## Phase 1: Database Migrations

### Task 1.1: Create `scene_video_versions` table migration [COMPLETE]
**File:** `apps/db/migrations/20260220000011_create_scene_video_versions.sql`

Create the versioning table for scene videos. Each row represents one video file (generated or imported) for a scene.

```sql
-- Scene video version tracking (PRD-109 Req 1.1)
CREATE TABLE scene_video_versions (
    id            BIGSERIAL PRIMARY KEY,
    scene_id      BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version_number INTEGER NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('generated', 'imported')),
    file_path     TEXT NOT NULL,
    file_size_bytes BIGINT,
    duration_secs NUMERIC(10,3),
    is_final      BOOLEAN NOT NULL DEFAULT false,
    notes         TEXT,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row change
CREATE TRIGGER set_updated_at_scene_video_versions
    BEFORE UPDATE ON scene_video_versions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Unique version number per scene
CREATE UNIQUE INDEX uq_scene_video_versions_scene_version
    ON scene_video_versions (scene_id, version_number);

-- At most one final version per scene (only among non-deleted rows)
CREATE UNIQUE INDEX uq_scene_video_versions_final
    ON scene_video_versions (scene_id)
    WHERE is_final = true AND deleted_at IS NULL;

-- FK index for scene_id lookups
CREATE INDEX idx_scene_video_versions_scene_id
    ON scene_video_versions (scene_id);

-- Soft-delete filter index
CREATE INDEX idx_scene_video_versions_deleted_at
    ON scene_video_versions (deleted_at)
    WHERE deleted_at IS NOT NULL;
```

**Acceptance Criteria:**
- [x] Table created with `BIGSERIAL` PK, `created_at`/`updated_at` `TIMESTAMPTZ`, `deleted_at` nullable
- [x] `source` CHECK constraint enforces `'generated'` or `'imported'`
- [x] `uq_scene_video_versions_final` partial unique index ensures one final per scene (excluding soft-deleted)
- [x] `uq_scene_video_versions_scene_version` prevents duplicate version numbers
- [x] FK to `scenes(id)` with `ON DELETE CASCADE ON UPDATE CASCADE`
- [x] `update_updated_at()` trigger applied
- [ ] Migration runs cleanly via `sqlx migrate run`

### Task 1.2: Add `deleted_at` column to all existing entity tables [COMPLETE]
**File:** `apps/db/migrations/20260220000012_add_soft_delete_columns.sql`

Add `deleted_at TIMESTAMPTZ DEFAULT NULL` and a partial index to every existing entity table.

```sql
-- Universal soft delete (PRD-109 Req 1.6)
-- Add deleted_at to all entity tables

ALTER TABLE projects       ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE characters     ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE source_images  ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE derived_images ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE image_variants ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE scene_types    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE scenes         ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE segments       ADD COLUMN deleted_at TIMESTAMPTZ;

-- Partial indexes for efficient soft-delete filtering (only index rows that ARE deleted)
CREATE INDEX idx_projects_deleted_at       ON projects       (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_characters_deleted_at     ON characters     (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_source_images_deleted_at  ON source_images  (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_derived_images_deleted_at ON derived_images (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_image_variants_deleted_at ON image_variants (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_scene_types_deleted_at    ON scene_types    (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_scenes_deleted_at         ON scenes         (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_segments_deleted_at       ON segments       (deleted_at) WHERE deleted_at IS NOT NULL;
```

**Acceptance Criteria:**
- [x] `deleted_at TIMESTAMPTZ` column added to all 8 existing entity tables (default NULL)
- [x] Partial index on each table: `WHERE deleted_at IS NOT NULL`
- [x] Existing data remains unaffected (all `deleted_at` values are NULL)
- [ ] Migration runs cleanly on an already-populated database
- [ ] Schema convention tests still pass (new column has correct type, no VARCHAR)

---

## Phase 2: Models & Soft Delete Infrastructure

### Task 2.1: Create `SceneVideoVersion` model structs
**File:** `apps/backend/crates/db/src/models/scene_video_version.rs`

Follow the existing three-struct pattern (entity/create/update) from `models/scene.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `scene_video_versions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneVideoVersion {
    pub id: DbId,
    pub scene_id: DbId,
    pub version_number: i32,
    pub source: String,           // "generated" or "imported"
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<sqlx::types::BigDecimal>,
    pub is_final: bool,
    pub notes: Option<String>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new scene video version.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneVideoVersion {
    pub scene_id: DbId,
    pub source: String,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<sqlx::types::BigDecimal>,
    pub is_final: Option<bool>,
    pub notes: Option<String>,
}

/// DTO for updating a scene video version. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneVideoVersion {
    pub is_final: Option<bool>,
    pub notes: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] Main struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Create DTO derives `Debug, Clone, Deserialize`
- [ ] Update DTO derives `Debug, Clone, Deserialize`
- [ ] Uses `DbId` (`i64`) and `Timestamp` from `trulience_core::types`
- [ ] `deleted_at: Option<Timestamp>` included in main struct
- [ ] `version_number` is `i32` (matches SQL `INTEGER`)
- [ ] `duration_secs` uses appropriate Rust type for `NUMERIC(10,3)`
- [ ] Module registered in `models/mod.rs`

### Task 2.2: Add `deleted_at` field to all existing model structs
**Files:** `apps/backend/crates/db/src/models/{project,character,scene,segment,scene_type,image}.rs`

Add `pub deleted_at: Option<Timestamp>` to every entity struct. This field is read from DB but never set by users directly (managed by soft_delete/restore methods).

**Acceptance Criteria:**
- [ ] `pub deleted_at: Option<Timestamp>` added to: `Project`, `Character`, `Scene`, `Segment`, `SceneType`, `SourceImage`, `DerivedImage`, `ImageVariant`
- [ ] No changes to Create/Update DTOs (deleted_at is not user-settable)
- [ ] All 8 entity structs compile with the new field
- [ ] `deleted_at` field is serialized in JSON responses (value will be `null` for active records)

### Task 2.3: Update all repository COLUMNS and queries for soft delete
**Files:** `apps/backend/crates/db/src/repositories/{project,character,scene,segment,scene_type,source_image,derived_image,image_variant}_repo.rs`

For each of the 8 existing repositories:
1. Add `deleted_at` to the `COLUMNS` const
2. Add `AND deleted_at IS NULL` to `find_by_id` and all `list_*` queries
3. Replace `DELETE FROM ... WHERE id = $1` with `UPDATE ... SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`
4. Add `restore(pool, id)` method: `UPDATE ... SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`

Example diff for `scene_repo.rs`:
```rust
const COLUMNS: &str = "id, character_id, scene_type_id, image_variant_id, \
    status_id, transition_mode, deleted_at, created_at, updated_at";

// find_by_id — add soft-delete filter
pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Scene>, sqlx::Error> {
    let query = format!("SELECT {COLUMNS} FROM scenes WHERE id = $1 AND deleted_at IS NULL");
    // ...
}

// delete → soft_delete
pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE scenes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL"
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

// restore
pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE scenes SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL"
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

// hard_delete — kept for purge operations
pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM scenes WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
```

**Acceptance Criteria:**
- [ ] All 8 repos have `deleted_at` in their `COLUMNS` const
- [ ] All `find_by_id` queries add `AND deleted_at IS NULL`
- [ ] All `list_by_*` queries add `AND deleted_at IS NULL` (or `WHERE deleted_at IS NULL` if no other condition)
- [ ] All `delete` methods renamed to `soft_delete` using `UPDATE SET deleted_at = NOW()`
- [ ] All 8 repos have new `restore(pool, id) -> Result<bool>` method
- [ ] All 8 repos retain `hard_delete(pool, id) -> Result<bool>` for purge operations
- [ ] All existing handlers updated to call `soft_delete` instead of `delete`
- [ ] All code compiles and existing tests updated to use new method names

### Task 2.4: Update delete handlers to use soft_delete
**Files:** `apps/backend/crates/api/src/handlers/{project,character,scene,segment,scene_type,source_image,derived_image,image_variant}.rs`

Update every handler's `delete` function to call `Repo::soft_delete` instead of `Repo::delete`.

**Acceptance Criteria:**
- [ ] All 8 handler `delete` functions call `soft_delete` instead of `delete`
- [ ] Return behavior unchanged: `204 No Content` on success, `404 Not Found` on miss
- [ ] No other handler changes needed (find_by_id filters happen at repo level)
- [ ] All code compiles

---

## Phase 3: Scene Video Version Repository

### Task 3.1: Create `SceneVideoVersionRepo` with CRUD operations
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`

Follow the zero-sized struct pattern from existing repos. Include soft-delete filtering in all read queries.

```rust
pub struct SceneVideoVersionRepo;

impl SceneVideoVersionRepo {
    pub async fn create(pool: &PgPool, input: &CreateSceneVideoVersion) -> Result<SceneVideoVersion, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SceneVideoVersion>, sqlx::Error>;
    pub async fn list_by_scene(pool: &PgPool, scene_id: DbId) -> Result<Vec<SceneVideoVersion>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateSceneVideoVersion) -> Result<Option<SceneVideoVersion>, sqlx::Error>;
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}
```

Key query details:
- `list_by_scene`: `ORDER BY version_number DESC`, filter `deleted_at IS NULL`
- `create`: auto-assign `version_number` via `next_version_number` (Task 3.2)

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all `scene_video_versions` columns
- [ ] `create` inserts with auto-incremented version number and handles `is_final` flag
- [ ] `find_by_id` filters `deleted_at IS NULL`
- [ ] `list_by_scene` returns non-deleted versions ordered by `version_number DESC`
- [ ] `soft_delete`, `restore`, `hard_delete` follow same pattern as other repos
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

### Task 3.2: Add version-specific operations
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`

Add methods specific to the versioning workflow:

```rust
impl SceneVideoVersionRepo {
    /// Get the next version number for a scene (max existing + 1, or 1 if none).
    pub async fn next_version_number(pool: &PgPool, scene_id: DbId) -> Result<i32, sqlx::Error>;

    /// Mark a version as final, un-marking any previously final version.
    /// Runs in a single transaction.
    pub async fn set_final(pool: &PgPool, scene_id: DbId, version_id: DbId) -> Result<Option<SceneVideoVersion>, sqlx::Error>;

    /// Find the current final version for a scene (if any).
    pub async fn find_final_for_scene(pool: &PgPool, scene_id: DbId) -> Result<Option<SceneVideoVersion>, sqlx::Error>;

    /// Create a new version and automatically mark it as final.
    /// Unmarks any previous final in the same transaction.
    pub async fn create_as_final(pool: &PgPool, input: &CreateSceneVideoVersion) -> Result<SceneVideoVersion, sqlx::Error>;
}
```

`set_final` transaction:
```sql
BEGIN;
UPDATE scene_video_versions SET is_final = false
    WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL;
UPDATE scene_video_versions SET is_final = true
    WHERE id = $2 AND scene_id = $1 AND deleted_at IS NULL
    RETURNING {COLUMNS};
COMMIT;
```

`create_as_final` transaction:
```sql
BEGIN;
UPDATE scene_video_versions SET is_final = false
    WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL;
INSERT INTO scene_video_versions (scene_id, version_number, source, file_path, ...)
    VALUES ($1, next_ver, ..., true)
    RETURNING {COLUMNS};
COMMIT;
```

**Acceptance Criteria:**
- [ ] `next_version_number` returns `COALESCE(MAX(version_number), 0) + 1` for the given scene
- [ ] `set_final` unmarks old final and marks new one in a single `sqlx::Transaction`
- [ ] `set_final` returns `None` if `version_id` not found for the given `scene_id`
- [ ] `find_final_for_scene` queries `WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL`
- [ ] `create_as_final` calls `next_version_number`, unmarks old final, inserts new version with `is_final = true` — all in one transaction
- [ ] Transaction correctly rolls back on failure

---

## Phase 4: Version API Endpoints

### Task 4.1: Create version handler module
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Implement handlers for version CRUD and final selection:

```rust
/// GET /api/v1/scenes/{scene_id}/versions
pub async fn list_by_scene(...) -> AppResult<Json<Vec<SceneVideoVersion>>>;

/// GET /api/v1/scenes/{scene_id}/versions/{id}
pub async fn get_by_id(...) -> AppResult<Json<SceneVideoVersion>>;

/// DELETE /api/v1/scenes/{scene_id}/versions/{id}
/// Returns 409 if version is_final (must select different final first)
pub async fn delete(...) -> AppResult<StatusCode>;

/// PUT /api/v1/scenes/{scene_id}/versions/{id}/set-final
pub async fn set_final(...) -> AppResult<Json<SceneVideoVersion>>;

/// POST /api/v1/scenes/{scene_id}/versions/import
/// Multipart file upload — stores file on disk, creates version row as final
pub async fn import_video(...) -> AppResult<(StatusCode, Json<SceneVideoVersion>)>;
```

For `delete`: check `is_final` before soft-deleting:
```rust
pub async fn delete(
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let version = SceneVideoVersionRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound { entity: "SceneVideoVersion", id }))?;
    if version.is_final {
        return Err(AppError::Core(CoreError::Conflict(
            "Cannot delete the final version. Select a different final version first.".into()
        )));
    }
    SceneVideoVersionRepo::soft_delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

For `import_video`: use `axum::extract::Multipart` to receive the file:
```rust
pub async fn import_video(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<SceneVideoVersion>)> {
    // Extract file field and optional notes field from multipart
    // Validate file extension (.mp4, .webm, .mov)
    // Write file to project asset directory
    // Create version via create_as_final
}
```

**Acceptance Criteria:**
- [ ] `list_by_scene` returns all non-deleted versions ordered by version_number DESC
- [ ] `get_by_id` returns 404 if version not found or doesn't belong to scene
- [ ] `delete` returns 409 Conflict if version `is_final == true`
- [ ] `delete` returns 204 No Content on successful soft-delete
- [ ] `set_final` unmarks old final and marks specified version, returns updated version
- [ ] `set_final` returns 404 if version not found for scene
- [ ] `import_video` accepts multipart form with `file` and optional `notes` fields
- [ ] `import_video` validates file extension (`.mp4`, `.webm`, `.mov`)
- [ ] `import_video` returns 400 for unsupported formats
- [ ] `import_video` stores file, creates version row with `source = 'imported'`, returns 201
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.2: Create version routes
**File:** `apps/backend/crates/api/src/routes/scene.rs` (modify existing)

Add version sub-routes nested under `/scenes/{scene_id}/versions`:

```rust
pub fn router() -> Router<AppState> {
    let segment_routes = Router::new()
        .route("/", get(segment::list_by_scene).post(segment::create))
        .route("/{id}", get(segment::get_by_id).put(segment::update).delete(segment::delete));

    let version_routes = Router::new()
        .route("/", get(version::list_by_scene))
        .route("/import", post(version::import_video))
        .route("/{id}", get(version::get_by_id).delete(version::delete))
        .route("/{id}/set-final", put(version::set_final));

    Router::new()
        .nest("/{scene_id}/segments", segment_routes)
        .nest("/{scene_id}/versions", version_routes)
}
```

**Acceptance Criteria:**
- [ ] `GET /scenes/{scene_id}/versions` routes to `list_by_scene`
- [ ] `GET /scenes/{scene_id}/versions/{id}` routes to `get_by_id`
- [ ] `DELETE /scenes/{scene_id}/versions/{id}` routes to `delete`
- [ ] `PUT /scenes/{scene_id}/versions/{id}/set-final` routes to `set_final`
- [ ] `POST /scenes/{scene_id}/versions/import` routes to `import_video`
- [ ] Route module imports `scene_video_version` handler
- [ ] Route tree comment in `routes/mod.rs` updated to include new endpoints
- [ ] `axum::extract::DefaultBodyLimit` configured for import endpoint (video file sizes)

---

## Phase 5: Trash / Bin API Endpoints

### Task 5.1: Create trash query helpers
**File:** `apps/backend/crates/db/src/repositories/trash_repo.rs`

Create a repository that queries across all entity tables for soft-deleted records. This is a cross-cutting concern, not per-entity.

```rust
use serde::Serialize;

/// Summary of a single trashed item.
#[derive(Debug, Clone, Serialize)]
pub struct TrashedItem {
    pub id: DbId,
    pub entity_type: String,          // "project", "character", "scene", etc.
    pub name_or_label: Option<String>, // human-readable identifier
    pub deleted_at: Timestamp,
}

/// Summary of trashed items grouped by type.
#[derive(Debug, Clone, Serialize)]
pub struct TrashSummary {
    pub items: Vec<TrashedItem>,
    pub total_count: i64,
}

/// Purge preview showing what would be permanently deleted.
#[derive(Debug, Clone, Serialize)]
pub struct PurgePreview {
    pub counts_by_type: Vec<(String, i64)>,
    pub total_count: i64,
    pub estimated_bytes: Option<i64>,
}

pub struct TrashRepo;

impl TrashRepo {
    /// List all soft-deleted items, optionally filtered by entity type.
    pub async fn list_trashed(pool: &PgPool, entity_type: Option<&str>) -> Result<TrashSummary, sqlx::Error>;

    /// Get purge preview (counts and estimated disk space).
    pub async fn purge_preview(pool: &PgPool) -> Result<PurgePreview, sqlx::Error>;

    /// Hard delete all trashed items (cascades via FK rules).
    pub async fn purge_all(pool: &PgPool) -> Result<u64, sqlx::Error>;

    /// Hard delete a single trashed item by type and ID.
    pub async fn purge_one(pool: &PgPool, entity_type: &str, id: DbId) -> Result<bool, sqlx::Error>;
}
```

The `list_trashed` query uses `UNION ALL` across entity tables:
```sql
SELECT id, 'project' as entity_type, name as name_or_label, deleted_at FROM projects WHERE deleted_at IS NOT NULL
UNION ALL
SELECT id, 'character', name, deleted_at FROM characters WHERE deleted_at IS NOT NULL
UNION ALL
-- ... for all 9+ entity tables
ORDER BY deleted_at DESC
```

**Acceptance Criteria:**
- [ ] `TrashedItem`, `TrashSummary`, `PurgePreview` structs defined and serializable
- [ ] `list_trashed` queries all entity tables via `UNION ALL`, returns items sorted by `deleted_at DESC`
- [ ] `list_trashed` supports optional `entity_type` filter (skip UNION, query single table)
- [ ] `purge_preview` returns count per type and estimated bytes (from `file_size_bytes` on versions, images)
- [ ] `purge_all` hard-deletes all soft-deleted records across all tables (order matters: parents last to avoid FK violations, or rely on CASCADE)
- [ ] `purge_one` validates `entity_type` is a known type, hard-deletes the specified item
- [ ] Module registered in `repositories/mod.rs`

### Task 5.2: Create trash handler module
**File:** `apps/backend/crates/api/src/handlers/trash.rs`

```rust
/// GET /api/v1/trash?type={entity_type}
pub async fn list_trashed(...) -> AppResult<Json<TrashSummary>>;

/// POST /api/v1/trash/{entity_type}/{id}/restore
/// Returns 409 if parent is trashed (must restore parent first)
pub async fn restore(...) -> AppResult<Json<serde_json::Value>>;

/// DELETE /api/v1/trash/purge
pub async fn purge_all(...) -> AppResult<StatusCode>;

/// DELETE /api/v1/trash/{entity_type}/{id}/purge
pub async fn purge_one(...) -> AppResult<StatusCode>;

/// GET /api/v1/trash/purge-preview
pub async fn purge_preview(...) -> AppResult<Json<PurgePreview>>;
```

For `restore`: check parent status before restoring:
```rust
// Example: restoring a character → check that its project is NOT trashed
let project = ProjectRepo::find_by_id_include_deleted(&state.pool, parent_id).await?;
if project.deleted_at.is_some() {
    return Err(AppError::Core(CoreError::Conflict(
        "Cannot restore: parent project is trashed. Restore the project first.".into()
    )));
}
```

This requires a `find_by_id_include_deleted` method on repos that omits the `deleted_at IS NULL` filter.

**Acceptance Criteria:**
- [ ] `list_trashed` accepts optional `type` query parameter to filter by entity type
- [ ] `restore` dispatches to correct repo's `restore` method based on `entity_type` path param
- [ ] `restore` checks parent entity status — returns 409 Conflict if parent is trashed
- [ ] `restore` cascades to children: restoring a project restores its non-independently-trashed children
- [ ] `purge_all` calls `TrashRepo::purge_all`, returns 204
- [ ] `purge_one` calls `TrashRepo::purge_one`, returns 204 or 404
- [ ] `purge_preview` returns counts by type and estimated disk space
- [ ] Handler module registered in `handlers/mod.rs`

### Task 5.3: Create trash routes
**File:** `apps/backend/crates/api/src/routes/trash.rs` (new)

```rust
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(trash::list_trashed))
        .route("/purge", delete(trash::purge_all))
        .route("/purge-preview", get(trash::purge_preview))
        .route("/{entity_type}/{id}/restore", post(trash::restore))
        .route("/{entity_type}/{id}/purge", delete(trash::purge_one))
}
```

Register in `routes/mod.rs`:
```rust
.nest("/trash", trash::router())
```

**Acceptance Criteria:**
- [ ] All trash routes registered under `/trash` prefix
- [ ] Route module file created and registered in `routes/mod.rs`
- [ ] Route tree comment in `routes/mod.rs` updated with trash endpoints
- [ ] `entity_type` path parameter validated against known entity types

---

## Phase 6: Delivery Integration

### Task 6.1: Update `DeliveryManifest` to use final versions
**File:** `apps/backend/crates/core/src/delivery.rs`

Update `CharacterDelivery` to reference final version file paths instead of naming-engine-generated filenames. Add a field to indicate scenes missing a final version.

```rust
#[derive(Debug, Clone, Serialize)]
pub struct CharacterDelivery {
    pub character_name: String,
    pub metadata_json: String,
    pub clothed_image: String,
    pub topless_image: String,
    /// Final video file paths per scene, resolved from scene_video_versions.
    pub scene_videos: Vec<SceneVideoEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SceneVideoEntry {
    pub scene_id: DbId,
    pub file_path: String,
    pub version_number: i32,
    pub source: String,
}
```

Update `validate()` to:
- Check that `scene_videos` is not empty
- Flag scenes with no final version selected

**Acceptance Criteria:**
- [ ] `CharacterDelivery.scene_videos` changed from `Vec<String>` to `Vec<SceneVideoEntry>`
- [ ] `SceneVideoEntry` includes `scene_id`, `file_path`, `version_number`, `source`
- [ ] `validate()` still checks for empty scene_videos list
- [ ] `validate()` checks that all video file paths are non-empty
- [ ] Existing unit tests updated to use new `SceneVideoEntry` type
- [ ] All code compiles

### Task 6.2: Add delivery validation for missing final versions
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` (add method)

Add a repository method to find scenes in a project that have no final version:

```rust
/// Find scenes in a project that are missing a final video version.
/// Joins scenes → characters → projects to scope by project_id.
pub async fn find_scenes_missing_final(
    pool: &PgPool,
    project_id: DbId,
) -> Result<Vec<DbId>, sqlx::Error>;
```

```sql
SELECT s.id
FROM scenes s
JOIN characters c ON s.character_id = c.id
WHERE c.project_id = $1
  AND s.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM scene_video_versions v
    WHERE v.scene_id = s.id AND v.is_final = true AND v.deleted_at IS NULL
  )
```

**Acceptance Criteria:**
- [ ] Method returns list of scene IDs that have no final version
- [ ] Filters out soft-deleted scenes, characters, and versions
- [ ] Query correctly joins through the entity hierarchy (scene → character → project)
- [ ] Returns empty vec if all scenes have a final version

---

## Phase 7: Integration Tests

### Task 7.1: DB-level soft delete tests
**File:** `apps/backend/crates/db/tests/soft_delete.rs`

Test soft delete behavior across all repositories:

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_hides_from_find_by_id(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_hides_from_list(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_restore_makes_visible_again(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_hard_delete_permanently_removes(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_idempotent_on_already_deleted(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Soft-deleted project is not returned by `find_by_id` or `list`
- [ ] `restore` makes the project visible again
- [ ] `hard_delete` permanently removes the row
- [ ] Soft-deleting an already-deleted record returns `false` (0 rows affected)
- [ ] Tests cover at least 2 entity types (project + scene) to verify pattern consistency
- [ ] All tests pass

### Task 7.2: DB-level version CRUD and set-final tests
**File:** `apps/backend/crates/db/tests/scene_video_version.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_version(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_as_final_unmarks_previous(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_set_final_swaps_correctly(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_set_final_nonexistent_returns_none(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_next_version_number_increments(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_by_scene_ordered_desc(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_unique_constraint_scene_version_number(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_final_for_scene(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_scenes_missing_final(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Creating a version returns correct fields (id, version_number, source, is_final)
- [ ] `create_as_final` auto-assigns version_number and marks as final, unmarks previous
- [ ] `set_final` swaps final flag between versions in a transaction
- [ ] `set_final` with invalid version_id returns `None`
- [ ] `next_version_number` returns 1 for first version, increments by 1 each time
- [ ] `list_by_scene` returns versions in descending version_number order
- [ ] Duplicate `(scene_id, version_number)` violates unique constraint
- [ ] `find_final_for_scene` returns the version with `is_final = true`
- [ ] `find_scenes_missing_final` correctly identifies scenes without a final version
- [ ] All tests pass

### Task 7.3: API-level version endpoint tests
**File:** `apps/backend/crates/api/tests/scene_video_version_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_versions(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_version(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_version_404(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_set_final(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_version_204(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_final_version_409(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_hides_from_get(pool: PgPool);
```

Each test uses `common::build_test_app` and the shared HTTP helpers (`post_json`, `get`, `delete`, `put_json`, `body_json`).

**Acceptance Criteria:**
- [ ] `GET /scenes/{id}/versions` returns list of versions
- [ ] `GET /scenes/{id}/versions/{vid}` returns single version or 404
- [ ] `PUT /scenes/{id}/versions/{vid}/set-final` returns updated version with `is_final: true`
- [ ] `DELETE /scenes/{id}/versions/{vid}` returns 204 for non-final version
- [ ] `DELETE /scenes/{id}/versions/{vid}` returns 409 for final version with error message
- [ ] Soft-deleted version not returned by GET endpoints
- [ ] All tests pass

### Task 7.4: API-level trash endpoint tests
**File:** `apps/backend/crates/api/tests/trash_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_trash_empty(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_trash_after_soft_delete(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_trash_filtered_by_type(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_restore_trashed_item(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_restore_child_with_trashed_parent_409(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_purge_preview(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_purge_single_item(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_purge_all(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Empty trash returns empty items list
- [ ] Soft-deleted project appears in trash list
- [ ] Filtering by `?type=projects` shows only projects
- [ ] Restoring a trashed project makes it visible via GET again
- [ ] Restoring a character whose project is trashed returns 409
- [ ] Purge preview returns correct counts and estimated bytes
- [ ] Purging a single item permanently removes it (not returned by trash list or entity GET)
- [ ] Purge all removes all trashed items
- [ ] All tests pass

### Task 7.5: Update existing tests for soft delete changes
**Files:** `apps/backend/crates/db/tests/entity_crud.rs`, `apps/backend/crates/api/tests/entity_api.rs`

Update existing tests that reference `delete` to use `soft_delete`, and verify that the "delete" in API tests now performs soft delete behavior.

**Acceptance Criteria:**
- [ ] All references to `Repo::delete` changed to `Repo::soft_delete` in DB tests
- [ ] DB cascade-delete test updated: verify that hard-deleting a project still cascades (for purge)
- [ ] API delete tests verify that the entity becomes invisible (soft-deleted, not gone)
- [ ] All existing tests pass with new soft delete behavior
- [ ] Schema convention tests still pass with new `deleted_at` column

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/apps/db/migrations/YYYYMMDDHHMMSS_create_scene_video_versions.sql` | New table migration |
| `apps/backend/apps/db/migrations/YYYYMMDDHHMMSS_add_soft_delete_columns.sql` | Add deleted_at to 8 tables |
| `apps/backend/crates/db/src/models/scene_video_version.rs` | New model structs |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model module |
| `apps/backend/crates/db/src/models/{project,character,scene,segment,scene_type,image}.rs` | Add deleted_at field |
| `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` | New version repository |
| `apps/backend/crates/db/src/repositories/trash_repo.rs` | New trash query repository |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo modules |
| `apps/backend/crates/db/src/repositories/{all 8 existing repos}.rs` | Add soft_delete, restore, hard_delete; update queries |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | Version API handlers |
| `apps/backend/crates/api/src/handlers/trash.rs` | Trash API handlers |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register new handler modules |
| `apps/backend/crates/api/src/handlers/{all 8 existing handlers}.rs` | Call soft_delete instead of delete |
| `apps/backend/crates/api/src/routes/scene.rs` | Add version sub-routes |
| `apps/backend/crates/api/src/routes/trash.rs` | New trash routes |
| `apps/backend/crates/api/src/routes/mod.rs` | Register trash routes, update route tree doc |
| `apps/backend/crates/core/src/delivery.rs` | Update CharacterDelivery and validate() |
| `apps/backend/crates/db/tests/soft_delete.rs` | Soft delete integration tests |
| `apps/backend/crates/db/tests/scene_video_version.rs` | Version CRUD tests |
| `apps/backend/crates/api/tests/scene_video_version_api.rs` | Version API tests |
| `apps/backend/crates/api/tests/trash_api.rs` | Trash API tests |
| `apps/backend/crates/db/tests/entity_crud.rs` | Updated for soft_delete |
| `apps/backend/crates/api/tests/entity_api.rs` | Updated for soft_delete |

---

## Dependencies

### Existing Components to Reuse
- `trulience_db::repositories::*` — CRUD pattern (zero-sized struct, `COLUMNS` const, `&PgPool`)
- `trulience_db::models::*` — Three-struct pattern (entity/create/update)
- `trulience_core::types::{DbId, Timestamp}` — Shared type aliases
- `trulience_core::error::CoreError` — Domain error variants (NotFound, Conflict, Validation)
- `trulience_api::error::{AppError, AppResult, classify_sqlx_error}` — HTTP error mapping
- `trulience_api::state::AppState` — Shared app state with `pool: PgPool`
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete`

### New Infrastructure Needed
- `scene_video_versions` table and migration
- `deleted_at` column migration for 8 existing entity tables
- `SceneVideoVersionRepo` with version-specific transactional operations
- `TrashRepo` for cross-table soft-delete queries
- `find_by_id_include_deleted` variant on repos that need parent-check for restore
- Multipart file upload handling in `import_video` handler (`axum::extract::Multipart`)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations — Tasks 1.1-1.2
2. Phase 2: Models & Soft Delete — Tasks 2.1-2.4
3. Phase 3: Version Repository — Tasks 3.1-3.2
4. Phase 4: Version API — Tasks 4.1-4.2
5. Phase 5: Trash API — Tasks 5.1-5.3
6. Phase 6: Delivery Integration — Tasks 6.1-6.2
7. Phase 7: Integration Tests — Tasks 7.1-7.5

**MVP Success Criteria:**
- All entity tables support soft delete with `deleted_at` column
- Scene video versions can be created, listed, set-final, and soft-deleted
- External video files can be imported for a scene via multipart upload
- Trashed items can be listed, restored, and purged
- Delivery manifest uses final version file paths
- All integration tests pass (DB-level and API-level)

### Post-MVP Enhancements
- Auto-rebuild ZIP on final change (PRD-109 Req 1.9) — depends on pipeline infrastructure from other PRDs
- Version comparison UI (PRD-109 Req 2.1) — frontend only
- Trash retention policies (PRD-109 Req 2.2) — depends on PRD-015 scheduler
- Version annotations (PRD-109 Req 2.3) — frontend + new table
- Bulk import (PRD-109 Req 2.4) — depends on PRD-086

---

## Notes

1. **Migration ordering matters:** The `scene_video_versions` migration (Task 1.1) must run BEFORE the soft-delete migration (Task 1.2) because Task 1.1 already includes `deleted_at` on the new table. Alternatively, combine into a single migration.
2. **Transaction isolation for set_final:** The `set_final` operation must use `SERIALIZABLE` or at minimum `READ COMMITTED` isolation with explicit locking to prevent race conditions on the partial unique index.
3. **Multipart upload size limit:** The `import_video` endpoint needs `axum::extract::DefaultBodyLimit::max(...)` configured. Suggested: 500MB for MVP, configurable later.
4. **Purge order:** When purging all trashed items, delete leaf entities first (segments, versions) to avoid FK violations, OR rely on the existing `ON DELETE CASCADE` FK rules by deleting only top-level entities (projects).
5. **`find_by_id_include_deleted`:** Several restore operations need to find a parent entity regardless of its deleted status. Add a `find_by_id_unfiltered` method to repos that participate in the parent-check (project, character, scene).

---

## Version History

- **v1.0** (2026-02-20): Initial task list creation from PRD-109
