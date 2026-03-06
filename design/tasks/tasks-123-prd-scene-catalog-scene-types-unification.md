# Task List: Scene Catalog & Scene Types Unification

**PRD Reference:** `design/prds/123-prd-scene-catalog-scene-types-unification.md`
**Scope:** Absorb `scene_catalog` into `scene_types`, migrate all FKs and junction tables, remove the duplicate backend/frontend code paths, and present a single unified "Scene Catalog" page backed by the `scene_types` table.

## Overview

The platform has two disconnected tables (`scene_types` and `scene_catalog`) representing the same concept at different abstraction levels. This implementation unifies them by:
1. Adding `slug` and `has_clothes_off_transition` columns to `scene_types`.
2. Creating a `scene_type_tracks` junction table to replace `scene_catalog_tracks`.
3. Migrating `project_scene_settings` and `character_scene_overrides` FKs from `scene_catalog_id` to `scene_type_id`.
4. Dropping the `scene_catalog` and `scene_catalog_tracks` tables.
5. Updating the backend model, repo, handler, and route layers.
6. Unifying the frontend types, hooks, components, and navigation.

### What Already Exists
- `SceneType` model with 35 columns in `crates/db/src/models/scene_type.rs` -- extend with `slug`, `has_clothes_off_transition`
- `SceneTypeRepo` with full CRUD + soft delete + inheritance queries in `crates/db/src/repositories/scene_type_repo.rs` -- extend with track methods
- `SceneCatalogRepo` with track association patterns (get_tracks, set_tracks, add_track, remove_track) in `crates/db/src/repositories/scene_catalog_repo.rs` -- port to SceneTypeRepo
- `ProjectSceneSettingRepo` and `CharacterSceneOverrideRepo` with three-level inheritance queries -- rename `scene_catalog_id` -> `scene_type_id`
- `EffectiveSceneSetting` struct in `crates/db/src/models/scene_catalog.rs` -- move to `scene_type.rs`
- Frontend `SceneCatalogList`, `TrackBadge`, `SourceBadge`, `SceneCatalogForm` components in `features/scene-catalog/`
- Frontend `SceneTypeEditor`, `PromptTemplateEditor`, `InheritanceTree`, `OverrideIndicator` components in `features/scene-types/`
- Frontend hooks: `use-scene-catalog.ts`, `use-project-scene-settings.ts`, `use-character-scene-settings.ts`, `use-scene-types.ts`
- Navigation entries for both "Scene Types" and "Scene Catalog" in `navigation.ts` (line 85-86)
- Router entries for both `/content/scene-types` and `/content/scene-catalog` in `router.tsx`

### What We're Building
1. Five database migrations: add columns, create junction, migrate project_scene_settings FK, migrate character_scene_overrides FK, drop old tables
2. Updated `SceneType` model and `SceneTypeRepo` with track association methods
3. Unified three-level inheritance chain pointing to `scene_type_id`
4. Track management endpoints on `/scene-types/{id}/tracks`
5. Single "Scene Catalog" frontend page backed by scene types with click-through to configuration
6. Removal of all `scene_catalog` backend and frontend code

### Key Design Decisions
1. **scene_types is canonical** -- it drives video generation, so all data moves there (not the other way around)
2. **Five sequential migrations** -- each migration is independently reversible, with backfill data mapping in a temporary table
3. **slug uniqueness is partial** -- `WHERE deleted_at IS NULL` to allow soft-deleted duplicates
4. **Slug is immutable after creation** -- enforced in the update handler, not the database (matching original scene_catalog behavior)
5. **Studio-level scene types only get slugs from catalog** -- project-scoped types get auto-generated slugs
6. **Three-level inheritance queries join scene_types instead of scene_catalog** -- the `EffectiveSceneSetting.scene_catalog_id` field becomes `scene_type_id`

---

## Phase 1: Database Migrations

### Task 1.1: Add Catalog Columns to scene_types
**File:** `apps/db/migrations/20260301000031_add_catalog_columns_to_scene_types.sql`

Create a migration that adds `slug` and `has_clothes_off_transition` to the `scene_types` table, creates a temporary mapping table, backfills data from `scene_catalog`, and enforces uniqueness.

```sql
-- Step 1: Add new columns (slug nullable initially for backfill)
ALTER TABLE scene_types
    ADD COLUMN slug TEXT,
    ADD COLUMN has_clothes_off_transition BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Create temporary mapping table for catalog -> scene_type
CREATE TABLE _scene_catalog_to_scene_type_map (
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id),
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id),
    PRIMARY KEY (scene_catalog_id)
);

-- Step 3: Match existing studio-level scene_types by name and populate map
INSERT INTO _scene_catalog_to_scene_type_map (scene_catalog_id, scene_type_id)
SELECT sc.id, st.id
FROM scene_catalog sc
JOIN scene_types st ON LOWER(TRIM(st.name)) = LOWER(TRIM(sc.name))
    AND st.project_id IS NULL
    AND st.deleted_at IS NULL;

-- Step 4: Backfill slug and has_clothes_off_transition for matched rows
UPDATE scene_types st
SET slug = sc.slug,
    has_clothes_off_transition = sc.has_clothes_off_transition
FROM _scene_catalog_to_scene_type_map m
JOIN scene_catalog sc ON sc.id = m.scene_catalog_id
WHERE st.id = m.scene_type_id;

-- Step 5: Insert new studio-level scene_types for unmatched catalog entries
INSERT INTO scene_types (name, slug, description, has_clothes_off_transition,
    sort_order, is_active, is_studio_level, status_id, generation_strategy)
SELECT sc.name, sc.slug, sc.description, sc.has_clothes_off_transition,
    sc.sort_order, sc.is_active, true, 1, 'platform_orchestrated'
FROM scene_catalog sc
WHERE sc.id NOT IN (SELECT scene_catalog_id FROM _scene_catalog_to_scene_type_map);

-- Step 5b: Add newly inserted rows to the mapping table
INSERT INTO _scene_catalog_to_scene_type_map (scene_catalog_id, scene_type_id)
SELECT sc.id, st.id
FROM scene_catalog sc
JOIN scene_types st ON st.slug = sc.slug
    AND st.project_id IS NULL
    AND st.deleted_at IS NULL
WHERE sc.id NOT IN (SELECT scene_catalog_id FROM _scene_catalog_to_scene_type_map);

-- Step 6: Auto-generate slugs for scene_types that still have NULL slug
UPDATE scene_types
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9 ]', '', 'g'), '\s+', '_', 'g'))
WHERE slug IS NULL;

-- Step 7: Handle duplicate auto-generated slugs by appending suffix
-- (uses a window function to number duplicates)
WITH dupes AS (
    SELECT id, slug,
           ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
    FROM scene_types
    WHERE deleted_at IS NULL
)
UPDATE scene_types st
SET slug = dupes.slug || '_' || dupes.rn
FROM dupes
WHERE st.id = dupes.id AND dupes.rn > 1;

-- Step 8: Make slug NOT NULL and add partial unique index
ALTER TABLE scene_types ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX uq_scene_types_slug ON scene_types(slug) WHERE deleted_at IS NULL;
```

**Acceptance Criteria:**
- [ ] Migration adds `slug TEXT` column (nullable initially, then NOT NULL after backfill)
- [ ] Migration adds `has_clothes_off_transition BOOLEAN NOT NULL DEFAULT false`
- [ ] Temporary mapping table `_scene_catalog_to_scene_type_map` is created
- [ ] Studio-level scene_types matched by name get their slug and has_clothes_off_transition from scene_catalog
- [ ] Unmatched scene_catalog entries create new studio-level scene_types rows
- [ ] All newly created rows are also added to the mapping table
- [ ] Scene_types without slugs get auto-generated slugs (lowercase, underscores, alphanumeric)
- [ ] Duplicate auto-generated slugs get numeric suffixes (`_2`, `_3`, etc.)
- [ ] `slug` is set to NOT NULL after backfill
- [ ] Partial unique index `uq_scene_types_slug` created on `slug WHERE deleted_at IS NULL`

### Task 1.2: Create scene_type_tracks Junction Table
**File:** `apps/db/migrations/20260301000032_create_scene_type_tracks.sql`

Create the new `scene_type_tracks` junction table and copy data from `scene_catalog_tracks` using the mapping table from Task 1.1.

```sql
-- Step 1: Create new junction table
CREATE TABLE scene_type_tracks (
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    track_id BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scene_type_id, track_id)
);

CREATE INDEX idx_scene_type_tracks_track_id ON scene_type_tracks(track_id);

-- Step 2: Copy data from scene_catalog_tracks using the mapping
INSERT INTO scene_type_tracks (scene_type_id, track_id, created_at)
SELECT m.scene_type_id, sct.track_id, sct.created_at
FROM scene_catalog_tracks sct
JOIN _scene_catalog_to_scene_type_map m ON m.scene_catalog_id = sct.scene_catalog_id
ON CONFLICT DO NOTHING;
```

**Acceptance Criteria:**
- [ ] `scene_type_tracks` table created with columns: `scene_type_id BIGINT NOT NULL`, `track_id BIGINT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- [ ] Composite primary key on `(scene_type_id, track_id)`
- [ ] FK to `scene_types(id) ON DELETE CASCADE`
- [ ] FK to `tracks(id) ON DELETE CASCADE`
- [ ] Index on `track_id` for reverse lookups
- [ ] All `scene_catalog_tracks` data copied using the mapping table, with `ON CONFLICT DO NOTHING` for safety

### Task 1.3: Migrate project_scene_settings FK
**File:** `apps/db/migrations/20260301000033_migrate_project_scene_settings_fk.sql`

Add `scene_type_id` to `project_scene_settings`, backfill from the mapping, drop `scene_catalog_id`, and update constraints.

```sql
-- Step 1: Add new FK column
ALTER TABLE project_scene_settings
    ADD COLUMN scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE;

-- Step 2: Backfill from mapping
UPDATE project_scene_settings pss
SET scene_type_id = m.scene_type_id
FROM _scene_catalog_to_scene_type_map m
WHERE pss.scene_catalog_id = m.scene_catalog_id;

-- Step 3: Delete orphaned rows (catalog entries that didn't map to a scene type)
DELETE FROM project_scene_settings WHERE scene_type_id IS NULL;

-- Step 4: Make scene_type_id NOT NULL
ALTER TABLE project_scene_settings ALTER COLUMN scene_type_id SET NOT NULL;

-- Step 5: Drop old column and constraints
ALTER TABLE project_scene_settings DROP COLUMN scene_catalog_id;

-- Step 6: Add new unique constraint and index
ALTER TABLE project_scene_settings
    ADD CONSTRAINT uq_project_scene_settings_project_scene_type
    UNIQUE (project_id, scene_type_id);

CREATE INDEX idx_project_scene_settings_scene_type_id
    ON project_scene_settings(scene_type_id);
```

**Acceptance Criteria:**
- [ ] `scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE` added to `project_scene_settings`
- [ ] Backfill populates `scene_type_id` from the `_scene_catalog_to_scene_type_map`
- [ ] Orphaned rows (unmapped `scene_catalog_id`) are deleted with a warning
- [ ] `scene_type_id` set to NOT NULL after backfill
- [ ] `scene_catalog_id` column dropped
- [ ] New unique constraint on `(project_id, scene_type_id)`
- [ ] Index on `scene_type_id`

### Task 1.4: Migrate character_scene_overrides FK
**File:** `apps/db/migrations/20260301000034_migrate_character_scene_overrides_fk.sql`

Add `scene_type_id` to `character_scene_overrides`, backfill from the mapping, drop `scene_catalog_id`, and update constraints.

```sql
-- Step 1: Add new FK column
ALTER TABLE character_scene_overrides
    ADD COLUMN scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE;

-- Step 2: Backfill from mapping
UPDATE character_scene_overrides cso
SET scene_type_id = m.scene_type_id
FROM _scene_catalog_to_scene_type_map m
WHERE cso.scene_catalog_id = m.scene_catalog_id;

-- Step 3: Delete orphaned rows
DELETE FROM character_scene_overrides WHERE scene_type_id IS NULL;

-- Step 4: Make scene_type_id NOT NULL
ALTER TABLE character_scene_overrides ALTER COLUMN scene_type_id SET NOT NULL;

-- Step 5: Drop old column and constraints
ALTER TABLE character_scene_overrides DROP COLUMN scene_catalog_id;

-- Step 6: Add new unique constraint and index
ALTER TABLE character_scene_overrides
    ADD CONSTRAINT uq_character_scene_overrides_character_scene_type
    UNIQUE (character_id, scene_type_id);

CREATE INDEX idx_character_scene_overrides_scene_type_id
    ON character_scene_overrides(scene_type_id);
```

**Acceptance Criteria:**
- [ ] `scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE` added to `character_scene_overrides`
- [ ] Backfill populates `scene_type_id` from the mapping
- [ ] Orphaned rows deleted
- [ ] `scene_type_id` set to NOT NULL after backfill
- [ ] `scene_catalog_id` column dropped
- [ ] New unique constraint on `(character_id, scene_type_id)`
- [ ] Index on `scene_type_id`

### Task 1.5: Drop scene_catalog Tables
**File:** `apps/db/migrations/20260301000035_drop_scene_catalog_tables.sql`

Drop the old junction table, the `scene_catalog` table, and the temporary mapping table.

```sql
-- Drop old junction table first (depends on scene_catalog)
DROP TABLE IF EXISTS scene_catalog_tracks;

-- Drop the scene_catalog table
DROP TABLE IF EXISTS scene_catalog CASCADE;

-- Drop the temporary mapping table
DROP TABLE IF EXISTS _scene_catalog_to_scene_type_map;
```

**Acceptance Criteria:**
- [ ] `scene_catalog_tracks` table dropped
- [ ] `scene_catalog` table dropped with CASCADE
- [ ] `_scene_catalog_to_scene_type_map` temporary table dropped
- [ ] Migration runs successfully after all prior migrations

---

## Phase 2: Backend Model & DTO Updates

### Task 2.1: Add Catalog Fields to SceneType Model
**File:** `crates/db/src/models/scene_type.rs`

Add `slug` and `has_clothes_off_transition` fields to the `SceneType`, `CreateSceneType`, and `UpdateSceneType` structs.

**Changes:**
- `SceneType` struct: add `pub slug: String` and `pub has_clothes_off_transition: bool` (after `is_active`)
- `CreateSceneType` struct: add `pub slug: String` and `pub has_clothes_off_transition: Option<bool>`
- `UpdateSceneType` struct: add `pub slug: Option<String>` and `pub has_clothes_off_transition: Option<bool>`

**Acceptance Criteria:**
- [ ] `SceneType` has `slug: String` field
- [ ] `SceneType` has `has_clothes_off_transition: bool` field
- [ ] `CreateSceneType` has `slug: String` (required for new scene types)
- [ ] `CreateSceneType` has `has_clothes_off_transition: Option<bool>` (defaults to false)
- [ ] `UpdateSceneType` has `slug: Option<String>` (for admin modification)
- [ ] `UpdateSceneType` has `has_clothes_off_transition: Option<bool>`
- [ ] All structs derive the same traits as before

### Task 2.2: Move EffectiveSceneSetting to scene_type.rs
**File:** `crates/db/src/models/scene_type.rs`

Move `EffectiveSceneSetting` from `scene_catalog.rs` to `scene_type.rs`, renaming `scene_catalog_id` to `scene_type_id`.

**Changes:**
- Copy `EffectiveSceneSetting` struct to `scene_type.rs`
- Rename field `scene_catalog_id: DbId` -> `scene_type_id: DbId`
- Add `SceneTypeWithTracks` struct (flattens `SceneType` + `tracks: Vec<Track>`)

```rust
/// Computed effective scene setting for the three-level inheritance chain.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EffectiveSceneSetting {
    pub scene_type_id: DbId,
    pub name: String,
    pub slug: String,
    pub is_enabled: bool,
    pub source: String,
}

/// A scene type enriched with its associated tracks.
#[derive(Debug, Clone, Serialize)]
pub struct SceneTypeWithTracks {
    #[serde(flatten)]
    pub scene_type: SceneType,
    pub tracks: Vec<Track>,
}
```

**Acceptance Criteria:**
- [ ] `EffectiveSceneSetting` struct lives in `scene_type.rs` with `scene_type_id: DbId`
- [ ] `SceneTypeWithTracks` struct created with `#[serde(flatten)]` on `scene_type` field
- [ ] Import `Track` from `super::track::Track`
- [ ] Add `use` for `Track` type

### Task 2.3: Update ProjectSceneSetting Model
**File:** `crates/db/src/models/project_scene_setting.rs`

Rename `scene_catalog_id` -> `scene_type_id` in all structs and update imports.

**Changes:**
- `ProjectSceneSetting`: `scene_catalog_id` -> `scene_type_id`
- `SceneSettingUpdate`: `scene_catalog_id` -> `scene_type_id`
- Update re-export: `pub use super::scene_catalog::EffectiveSceneSetting` -> `pub use super::scene_type::EffectiveSceneSetting`
- Update module doc comments

**Acceptance Criteria:**
- [ ] `ProjectSceneSetting.scene_catalog_id` renamed to `scene_type_id`
- [ ] `SceneSettingUpdate.scene_catalog_id` renamed to `scene_type_id`
- [ ] `EffectiveSceneSetting` re-exported from `scene_type` module instead of `scene_catalog`
- [ ] Doc comments updated to reference `scene_types` instead of `scene_catalog`

### Task 2.4: Update CharacterSceneOverride Model
**File:** `crates/db/src/models/character_scene_override.rs`

Rename `scene_catalog_id` -> `scene_type_id` in all structs and update imports.

**Changes:**
- `CharacterSceneOverride`: `scene_catalog_id` -> `scene_type_id`
- Update re-exports: both `SceneSettingUpdate` (via project_scene_setting) and `EffectiveSceneSetting` (via scene_catalog -> scene_type)
- Update `pub use super::scene_catalog::EffectiveSceneSetting` -> `pub use super::scene_type::EffectiveSceneSetting`

**Acceptance Criteria:**
- [ ] `CharacterSceneOverride.scene_catalog_id` renamed to `scene_type_id`
- [ ] `EffectiveSceneSetting` re-exported from `scene_type` instead of `scene_catalog`
- [ ] `SceneSettingUpdate` import chain still works (via `project_scene_setting`)
- [ ] Doc comments updated

---

## Phase 3: Backend Repository Updates

### Task 3.1: Update SceneTypeRepo COLUMNS and CRUD Queries
**File:** `crates/db/src/repositories/scene_type_repo.rs`

Add `slug` and `has_clothes_off_transition` to the `COLUMNS` constant and update `create` and `update` queries.

**Changes:**
- Add `slug, has_clothes_off_transition` to `COLUMNS` constant
- Update `create` INSERT query: add `slug` and `has_clothes_off_transition` columns and bind params
- Update `update` query: add `slug = COALESCE($N, slug)` and `has_clothes_off_transition = COALESCE($N, has_clothes_off_transition)` clauses

**Acceptance Criteria:**
- [ ] `COLUMNS` includes `slug, has_clothes_off_transition` (positioned after `is_active`)
- [ ] `create` method binds `slug` (required) and `has_clothes_off_transition` (COALESCE to false)
- [ ] `update` method binds optional `slug` and `has_clothes_off_transition`
- [ ] All bind parameter positions are correct (no off-by-one errors)
- [ ] `cargo check` passes with the updated queries

### Task 3.2: Add Track Association Methods to SceneTypeRepo
**File:** `crates/db/src/repositories/scene_type_repo.rs`

Port track association methods from `SceneCatalogRepo`, adapted for `scene_type_tracks`.

**Changes:**
- Add `TRACK_COLUMNS` constant (same as SceneCatalogRepo)
- Add `get_tracks_for_scene_type(pool, scene_type_id) -> Vec<Track>`
- Add `set_tracks(pool, scene_type_id, track_ids)` with transaction
- Add `set_tracks_inner(tx, scene_type_id, track_ids)` private helper
- Add `add_track(pool, scene_type_id, track_id)` (idempotent, ON CONFLICT DO NOTHING)
- Add `remove_track(pool, scene_type_id, track_id) -> bool`
- Add `find_by_id_with_tracks(pool, id) -> Option<SceneTypeWithTracks>`
- Add `list_studio_level_with_tracks(pool) -> Vec<SceneTypeWithTracks>`
- Import `Track` model and `SceneTypeWithTracks` DTO

```rust
/// Column list for the `tracks` table (used in JOIN queries).
const TRACK_COLUMNS: &str =
    "t.id, t.name, t.slug, t.sort_order, t.is_active, t.created_at, t.updated_at";
```

**Acceptance Criteria:**
- [ ] `get_tracks_for_scene_type` joins via `scene_type_tracks` and returns `Vec<Track>`
- [ ] `set_tracks` replaces all associations in a transaction (delete + insert)
- [ ] `add_track` is idempotent (ON CONFLICT DO NOTHING)
- [ ] `remove_track` returns `true` if association was deleted
- [ ] `find_by_id_with_tracks` returns `Option<SceneTypeWithTracks>` (scene type + tracks)
- [ ] `list_studio_level_with_tracks` returns `Vec<SceneTypeWithTracks>` for all studio-level types
- [ ] Query patterns match the existing `SceneCatalogRepo` implementation (just different table name)

### Task 3.3: Update ProjectSceneSettingRepo
**File:** `crates/db/src/repositories/project_scene_setting_repo.rs`

Update all queries to use `scene_type_id` instead of `scene_catalog_id`, and join `scene_types` instead of `scene_catalog`.

**Changes:**
- Update `COLUMNS` constant: `scene_catalog_id` -> `scene_type_id`
- Update `list_effective` query: join `scene_types st` instead of `scene_catalog sc`, select `st.id AS scene_type_id`, filter `WHERE st.deleted_at IS NULL AND st.is_active = true`, join `ON pss.scene_type_id = st.id`
- Update `upsert` query: `scene_catalog_id` -> `scene_type_id` in INSERT and ON CONFLICT
- Update `bulk_upsert` query: same column rename
- Update `delete` method: parameter name and WHERE clause
- Update import: use `EffectiveProjectSceneSetting` from updated model

**Acceptance Criteria:**
- [ ] `COLUMNS` constant uses `scene_type_id` instead of `scene_catalog_id`
- [ ] `list_effective` joins `scene_types` (with `deleted_at IS NULL` filter) instead of `scene_catalog`
- [ ] `list_effective` selects `st.id AS scene_type_id` instead of `sc.id AS scene_catalog_id`
- [ ] `upsert` and `bulk_upsert` use `scene_type_id` column in INSERT/ON CONFLICT
- [ ] `delete` method uses `scene_type_id` parameter
- [ ] All binding accesses use the renamed `scene_type_id` field from `SceneSettingUpdate`

### Task 3.4: Update CharacterSceneOverrideRepo
**File:** `crates/db/src/repositories/character_scene_override_repo.rs`

Update all queries to use `scene_type_id` instead of `scene_catalog_id`, and join `scene_types` instead of `scene_catalog`.

**Changes:**
- Update `COLUMNS` constant: `scene_catalog_id` -> `scene_type_id`
- Update `list_effective` query: join `scene_types st` instead of `scene_catalog sc`, update all column references, add `st.deleted_at IS NULL` filter
- Update `upsert` and `bulk_upsert` queries: column rename
- Update `delete` and `delete_all` methods: parameter rename

**Acceptance Criteria:**
- [ ] `COLUMNS` constant uses `scene_type_id`
- [ ] `list_effective` three-level merge query joins `scene_types` instead of `scene_catalog`
- [ ] `list_effective` filters on `st.deleted_at IS NULL AND st.is_active = true`
- [ ] `list_effective` selects `st.id AS scene_type_id`
- [ ] Both JOIN conditions use `scene_type_id` (`pss.scene_type_id = st.id`, `cso.scene_type_id = st.id`)
- [ ] `upsert`, `bulk_upsert`, `delete` all reference `scene_type_id` column
- [ ] Binding accesses use the renamed field from `CharacterSceneOverrideUpdate` (alias of `SceneSettingUpdate`)

---

## Phase 4: Backend Handler & Route Updates

### Task 4.1: Add Track Endpoints to Scene Type Handler
**File:** `crates/api/src/handlers/scene_type.rs`

Add track management handlers: `add_tracks` and `remove_track`.

**Changes:**
- Add `AddTracksRequest` struct (with `track_ids: Vec<DbId>`)
- Add `add_tracks` handler: `POST /scene-types/{id}/tracks` -- verify scene type exists, add tracks idempotently, return `SceneTypeWithTracks`
- Add `remove_track` handler: `DELETE /scene-types/{id}/tracks/{track_id}` -- remove track association, return 204 or 404
- Update `list_studio_level` handler to optionally return tracks based on `include_tracks` query param
- Import `SceneTypeWithTracks` from models

**Acceptance Criteria:**
- [ ] `AddTracksRequest` struct defined with `track_ids: Vec<DbId>`
- [ ] `add_tracks` handler verifies scene type exists before adding tracks
- [ ] `add_tracks` handler returns `SceneTypeWithTracks` wrapped in `DataResponse`
- [ ] `remove_track` handler returns 204 on success, 404 if not found
- [ ] `list_studio_level` handler can return `SceneTypeWithTracks[]` when `include_tracks=true`

### Task 4.2: Update Scene Type Routes
**File:** `crates/api/src/routes/scene_type.rs`

Add track management routes to the studio router.

**Changes:**
- Add `POST /{id}/tracks` route -> `scene_type::add_tracks`
- Add `DELETE /{id}/tracks/{track_id}` route -> `scene_type::remove_track`
- Import `delete` from `axum::routing`

```rust
.route("/{id}/tracks", post(scene_type::add_tracks))
.route("/{id}/tracks/{track_id}", delete(scene_type::remove_track))
```

**Acceptance Criteria:**
- [ ] `POST /{id}/tracks` route added to studio router
- [ ] `DELETE /{id}/tracks/{track_id}` route added to studio router
- [ ] Route doc comments updated to include track endpoints

### Task 4.3: Update Project Scene Settings Handler
**File:** `crates/api/src/handlers/project_scene_settings.rs`

Rename `scene_catalog_id` to `scene_type_id` in path parameters and doc comments.

**Changes:**
- `toggle_single`: path param tuple `(project_id, scene_catalog_id)` -> `(project_id, scene_type_id)`
- Update variable name in `ProjectSceneSettingRepo::upsert` call
- Update doc comments

**Acceptance Criteria:**
- [ ] `toggle_single` path parameter renamed to `scene_type_id`
- [ ] Handler passes `scene_type_id` to `ProjectSceneSettingRepo::upsert`
- [ ] Doc comment updated: `PUT /api/v1/projects/{project_id}/scene-settings/{scene_type_id}`

### Task 4.4: Update Character Scene Overrides Handler
**File:** `crates/api/src/handlers/character_scene_overrides.rs`

Rename `scene_catalog_id` to `scene_type_id` in path parameters and doc comments.

**Changes:**
- `toggle_single`: path param `scene_catalog_id` -> `scene_type_id`
- `remove_override`: path param `scene_catalog_id` -> `scene_type_id`
- Update `CharacterSceneOverrideRepo::upsert` and `::delete` calls
- Update doc comments

**Acceptance Criteria:**
- [ ] `toggle_single` path parameter renamed to `scene_type_id`
- [ ] `remove_override` path parameter renamed to `scene_type_id`
- [ ] Both handlers pass `scene_type_id` to their respective repo methods
- [ ] Doc comments updated to reference `scene_type_id`

### Task 4.5: Update Project Scene Settings Route
**File:** `crates/api/src/routes/project_scene_settings.rs`

Rename the path parameter in the route definition.

**Changes:**
- `"/{scene_catalog_id}"` -> `"/{scene_type_id}"`
- Update doc comments

**Acceptance Criteria:**
- [ ] Route path uses `/{scene_type_id}` instead of `/{scene_catalog_id}`
- [ ] Doc comments updated

### Task 4.6: Update Character Scene Overrides Route
**File:** `crates/api/src/routes/character_scene_overrides.rs`

Rename the path parameter in the route definition.

**Changes:**
- `"/{scene_catalog_id}"` -> `"/{scene_type_id}"`
- Update doc comments

**Acceptance Criteria:**
- [ ] Route path uses `/{scene_type_id}` instead of `/{scene_catalog_id}`
- [ ] Doc comments updated

---

## Phase 5: Backend Cleanup (Remove scene_catalog Code)

### Task 5.1: Remove SceneCatalog Model
**File:** `crates/db/src/models/scene_catalog.rs` (DELETE)
**File:** `crates/db/src/models/mod.rs` (EDIT)

Delete the `scene_catalog.rs` model file and remove its `pub mod scene_catalog;` line from `mod.rs`.

**Acceptance Criteria:**
- [ ] `crates/db/src/models/scene_catalog.rs` deleted
- [ ] `pub mod scene_catalog;` removed from `crates/db/src/models/mod.rs`
- [ ] No remaining imports of `scene_catalog` module in models
- [ ] `cargo check` passes

### Task 5.2: Remove SceneCatalogRepo
**File:** `crates/db/src/repositories/scene_catalog_repo.rs` (DELETE)
**File:** `crates/db/src/repositories/mod.rs` (EDIT)

Delete the `scene_catalog_repo.rs` file and remove its `pub mod` and `pub use` lines from `mod.rs`.

**Acceptance Criteria:**
- [ ] `crates/db/src/repositories/scene_catalog_repo.rs` deleted
- [ ] `pub mod scene_catalog_repo;` removed from `crates/db/src/repositories/mod.rs`
- [ ] `pub use scene_catalog_repo::SceneCatalogRepo;` removed from `crates/db/src/repositories/mod.rs`
- [ ] No remaining imports of `SceneCatalogRepo` in the codebase
- [ ] `cargo check` passes

### Task 5.3: Remove Scene Catalog Handler and Route
**File:** `crates/api/src/handlers/scene_catalog.rs` (DELETE)
**File:** `crates/api/src/handlers/mod.rs` (EDIT)
**File:** `crates/api/src/routes/scene_catalog.rs` (DELETE)
**File:** `crates/api/src/routes/mod.rs` (EDIT)

Delete the scene catalog handler and route files, and remove their registrations.

**Changes:**
- Delete `crates/api/src/handlers/scene_catalog.rs`
- Remove `pub mod scene_catalog;` from `crates/api/src/handlers/mod.rs`
- Delete `crates/api/src/routes/scene_catalog.rs`
- Remove `pub mod scene_catalog;` from `crates/api/src/routes/mod.rs`
- Remove `.nest("/scene-catalog", scene_catalog::router())` from the main router in `crates/api/src/routes/mod.rs` (line ~888)

**Acceptance Criteria:**
- [ ] `crates/api/src/handlers/scene_catalog.rs` deleted
- [ ] `crates/api/src/routes/scene_catalog.rs` deleted
- [ ] `pub mod scene_catalog;` removed from both `handlers/mod.rs` and `routes/mod.rs`
- [ ] `.nest("/scene-catalog", ...)` removed from the main router
- [ ] No remaining references to `scene_catalog` handler or route modules
- [ ] `cargo check` passes

### Task 5.4: Remove Scene Catalog Test Files
**File:** `crates/db/tests/scene_catalog.rs` (DELETE)
**File:** `crates/api/tests/scene_catalog_api.rs` (DELETE)

Delete the test files for the removed scene catalog functionality.

**Acceptance Criteria:**
- [ ] `crates/db/tests/scene_catalog.rs` deleted
- [ ] `crates/api/tests/scene_catalog_api.rs` deleted
- [ ] `cargo check --tests` passes

### Task 5.5: Verify No Remaining scene_catalog References
**Files:** Entire `apps/backend/` directory

Run a codebase-wide search for any remaining `scene_catalog` references in backend code and fix them.

**Acceptance Criteria:**
- [ ] `grep -r "scene_catalog" crates/` returns no results (excluding this task file)
- [ ] `grep -r "SceneCatalog" crates/` returns no results
- [ ] `cargo check` passes
- [ ] `cargo build` passes

---

## Phase 6: Frontend Type & Hook Updates

### Task 6.1: Add Catalog Fields to SceneType TypeScript Interface
**File:** `apps/frontend/src/features/scene-types/types.ts`

Add `slug`, `has_clothes_off_transition`, and optional `tracks` to the `SceneType` interface and DTOs.

**Changes:**
- `SceneType`: add `slug: string`, `has_clothes_off_transition: boolean`, `tracks?: Track[]`
- `CreateSceneType`: add `slug: string`, `has_clothes_off_transition?: boolean`, `track_ids?: number[]`
- `UpdateSceneType`: add `slug?: string`, `has_clothes_off_transition?: boolean`, `track_ids?: number[]`
- Add `EffectiveSceneSetting` interface with `scene_type_id` (replaces the one in scene-catalog types)
- Add `SceneSettingUpdate` interface with `scene_type_id`
- Import `Track` type from `features/scene-catalog/types` (or move `Track` to a shared location)

**Acceptance Criteria:**
- [ ] `SceneType` interface has `slug: string` field
- [ ] `SceneType` interface has `has_clothes_off_transition: boolean` field
- [ ] `SceneType` interface has optional `tracks?: Track[]` field
- [ ] `CreateSceneType` has `slug: string`, `has_clothes_off_transition?: boolean`, `track_ids?: number[]`
- [ ] `UpdateSceneType` has `slug?: string`, `has_clothes_off_transition?: boolean`, `track_ids?: number[]`
- [ ] `EffectiveSceneSetting` interface has `scene_type_id: number` (not `scene_catalog_id`)
- [ ] `SceneSettingUpdate` interface has `scene_type_id: number` (not `scene_catalog_id`)
- [ ] `Track` type is imported or re-exported

### Task 6.2: Update Scene Catalog Hooks to Use Scene Type API
**File:** `apps/frontend/src/features/scene-catalog/hooks/use-scene-catalog.ts`

Update all hooks to call the unified scene type API endpoints instead of `/scene-catalog`.

**Changes:**
- `useSceneCatalog`: call `GET /scene-types?include_tracks=true` instead of `GET /scene-catalog`
- `useSceneCatalogEntry`: call `GET /scene-types/{id}` instead of `GET /scene-catalog/{id}`
- `useCreateSceneCatalogEntry`: call `POST /scene-types` instead of `POST /scene-catalog`
- `useUpdateSceneCatalogEntry`: call `PUT /scene-types/{id}` instead of `PUT /scene-catalog/{id}`
- `useDeactivateSceneCatalogEntry`: call `DELETE /scene-types/{id}` instead of `DELETE /scene-catalog/{id}`
- Update return types to use `SceneType` (imported from `features/scene-types/types`)
- Update query keys to include `scene-types` namespace

**Acceptance Criteria:**
- [ ] All hooks call `/scene-types` API endpoints instead of `/scene-catalog`
- [ ] Return types use `SceneType` or `SceneType` with tracks
- [ ] Query keys updated (can still use `scene-catalog` namespace for caching since it's the page name, or change to `scene-types`)
- [ ] `npx tsc --noEmit` passes

### Task 6.3: Update Project Scene Settings Hooks
**File:** `apps/frontend/src/features/scene-catalog/hooks/use-project-scene-settings.ts`

Update `SceneSettingUpdate` usage from `scene_catalog_id` to `scene_type_id`.

**Changes:**
- Import `EffectiveSceneSetting` and `SceneSettingUpdate` from `features/scene-types/types` instead of `../types`
- Update `useToggleProjectSceneSetting`: use `update.scene_type_id` instead of `update.scene_catalog_id` in API path

**Acceptance Criteria:**
- [ ] `EffectiveSceneSetting` and `SceneSettingUpdate` imported from `features/scene-types/types`
- [ ] `useToggleProjectSceneSetting` uses `scene_type_id` in the API path
- [ ] `npx tsc --noEmit` passes

### Task 6.4: Update Character Scene Settings Hooks
**File:** `apps/frontend/src/features/scene-catalog/hooks/use-character-scene-settings.ts`

Update `SceneSettingUpdate` usage from `scene_catalog_id` to `scene_type_id`.

**Changes:**
- Import `EffectiveSceneSetting` and `SceneSettingUpdate` from `features/scene-types/types` instead of `../types`
- Update `useToggleCharacterSceneSetting`: use `update.scene_type_id` instead of `update.scene_catalog_id` in API path
- Update `useRemoveCharacterSceneOverride`: parameter name from `sceneCatalogId` to `sceneTypeId` in API path

**Acceptance Criteria:**
- [ ] `EffectiveSceneSetting` and `SceneSettingUpdate` imported from `features/scene-types/types`
- [ ] `useToggleCharacterSceneSetting` uses `scene_type_id` in the API path
- [ ] `useRemoveCharacterSceneOverride` uses `sceneTypeId` in the API path
- [ ] `npx tsc --noEmit` passes

### Task 6.5: Update Scene Types Hooks to Include Tracks
**File:** `apps/frontend/src/features/scene-types/hooks/use-scene-types.ts`

Update the `useSceneTypes` hook to support an `includeTracks` option.

**Changes:**
- Add `include_tracks` query parameter support to `useSceneTypes`
- Update query key to include `includeTracks` flag
- Update return type to `SceneType[]` (which now optionally includes `tracks`)

**Acceptance Criteria:**
- [ ] `useSceneTypes` accepts optional `includeTracks` parameter
- [ ] When `includeTracks` is true, appends `?include_tracks=true` to the API call
- [ ] Query key includes the `includeTracks` flag for proper cache separation
- [ ] `npx tsc --noEmit` passes

---

## Phase 7: Frontend Component Updates

### Task 7.1: Update SceneCatalogList Component
**File:** `apps/frontend/src/features/scene-catalog/SceneCatalogList.tsx`

Update the catalog list to render `SceneType` data instead of `SceneCatalogEntry`.

**Changes:**
- Import `SceneType` from `features/scene-types/types` instead of `SceneCatalogEntry` from local types
- Update prop types and data mapping
- Add click handler to navigate to scene type detail (using TanStack Router's `useNavigate`)
- Display: name, slug, description, tracks (as `TrackBadge`), clothes-off flag, active status, sort order

**Acceptance Criteria:**
- [ ] Component renders `SceneType` data (not `SceneCatalogEntry`)
- [ ] Catalog list displays name, slug, tracks as badges, clothes-off flag, active status
- [ ] Clicking an entry navigates to scene type detail/configuration view
- [ ] `TrackBadge` component still renders correctly with track data from `SceneType.tracks`

### Task 7.2: Update ProjectSceneSettings Component
**File:** `apps/frontend/src/features/scene-catalog/ProjectSceneSettings.tsx`

Update all references from `scene_catalog_id` to `scene_type_id`.

**Changes:**
- Update `EffectiveSceneSetting` usage to use `scene_type_id` field
- Update `SceneSettingUpdate` construction to use `scene_type_id`
- Import types from `features/scene-types/types`

**Acceptance Criteria:**
- [ ] All `scene_catalog_id` references replaced with `scene_type_id`
- [ ] Types imported from `features/scene-types/types`
- [ ] Toggle handler constructs `SceneSettingUpdate` with `scene_type_id`
- [ ] `npx tsc --noEmit` passes

### Task 7.3: Update CharacterSceneOverrides Component
**File:** `apps/frontend/src/features/scene-catalog/CharacterSceneOverrides.tsx`

Update all references from `scene_catalog_id` to `scene_type_id`.

**Changes:**
- Update `EffectiveSceneSetting` usage to use `scene_type_id` field
- Update `SceneSettingUpdate` construction to use `scene_type_id`
- Import types from `features/scene-types/types`
- Update `useRemoveCharacterSceneOverride` call: pass `scene_type_id` instead of `scene_catalog_id`

**Acceptance Criteria:**
- [ ] All `scene_catalog_id` references replaced with `scene_type_id`
- [ ] Types imported from `features/scene-types/types`
- [ ] Remove override handler passes `scene_type_id`
- [ ] `npx tsc --noEmit` passes

### Task 7.4: Update SceneCatalogForm Component
**File:** `apps/frontend/src/features/scene-catalog/SceneCatalogForm.tsx`

Update the form to create/edit scene types instead of scene catalog entries.

**Changes:**
- Import `CreateSceneType` / `UpdateSceneType` from `features/scene-types/types`
- Update form fields to match `CreateSceneType` (slug is now part of scene type creation)
- Keep slug as read-only when editing (immutable after creation)
- Use `useCreateSceneType` / `useUpdateSceneType` hooks or the updated scene-catalog hooks

**Acceptance Criteria:**
- [ ] Form uses `CreateSceneType` / `UpdateSceneType` types
- [ ] Slug field rendered as text input (editable on create, read-only on edit)
- [ ] Form submits to scene type API endpoints
- [ ] `npx tsc --noEmit` passes

### Task 7.5: Update SceneCatalogPage to Navigate to SceneTypeEditor
**File:** `apps/frontend/src/app/pages/SceneCatalogPage.tsx`

Update the catalog page to act as the unified entry point, linking through to the scene type editor for detail/configuration.

**Changes:**
- Page fetches from `GET /scene-types?include_tracks=true` (via updated hooks)
- Renders `SceneCatalogList` with `SceneType` data
- Click-through navigates to a scene type detail view that renders `SceneTypeEditor`
- May need to add a detail sub-route or use a slide-over panel

**Acceptance Criteria:**
- [ ] Scene Catalog page fetches scene types with tracks
- [ ] List displays catalog metadata (name, slug, tracks, clothes-off, active)
- [ ] Clicking an entry opens the `SceneTypeEditor` for that scene type
- [ ] Full configuration (workflow, prompts, duration, LoRA, auto-retry, inheritance) accessible from detail

---

## Phase 8: Navigation & Router Cleanup

### Task 8.1: Remove Scene Types Nav Item
**File:** `apps/frontend/src/app/navigation.ts`

Remove the "Scene Types" entry from the Content navigation section.

**Changes:**
- Remove line: `{ label: "Scene Types", path: "/content/scene-types", icon: Settings }`
- Keep: `{ label: "Scene Catalog", path: "/content/scene-catalog", icon: List }`

**Acceptance Criteria:**
- [ ] "Scene Types" nav item removed
- [ ] "Scene Catalog" nav item remains
- [ ] No duplicate or dead links in navigation

### Task 8.2: Remove Scene Types Route
**File:** `apps/frontend/src/app/router.tsx`

Remove the `/content/scene-types` route and its lazy-loaded page component.

**Changes:**
- Remove the route entry for `path: "/content/scene-types"` and its `createRoute` / `lazy` import
- Keep the route for `path: "/content/scene-catalog"`

**Acceptance Criteria:**
- [ ] `/content/scene-types` route removed from `router.tsx`
- [ ] `/content/scene-catalog` route remains
- [ ] No broken imports

### Task 8.3: Delete SceneTypesPage
**File:** `apps/frontend/src/app/pages/SceneTypesPage.tsx` (DELETE)

Delete the now-unused `SceneTypesPage` component.

**Acceptance Criteria:**
- [ ] `SceneTypesPage.tsx` deleted
- [ ] No remaining imports of `SceneTypesPage` in the codebase
- [ ] `npx tsc --noEmit` passes

### Task 8.4: Clean Up Scene Catalog Types File
**File:** `apps/frontend/src/features/scene-catalog/types.ts` (EDIT)

Remove the duplicated types that have been moved to `scene-types/types.ts`. Keep `Track`, `CreateTrack`, and `UpdateTrack` (since tracks are their own entity).

**Changes:**
- Remove `SceneCatalogEntry`, `CreateSceneCatalogEntry`, `UpdateSceneCatalogEntry`
- Remove `EffectiveSceneSetting`, `SceneSettingUpdate`
- Keep `Track`, `CreateTrack`, `UpdateTrack`
- Update any remaining imports across the codebase

**Acceptance Criteria:**
- [ ] `SceneCatalogEntry`, `CreateSceneCatalogEntry`, `UpdateSceneCatalogEntry` removed
- [ ] `EffectiveSceneSetting`, `SceneSettingUpdate` removed (now in `scene-types/types.ts`)
- [ ] `Track`, `CreateTrack`, `UpdateTrack` remain
- [ ] All imports across the frontend updated
- [ ] `npx tsc --noEmit` passes

---

## Phase 9: Verification & Testing

### Task 9.1: Backend Compilation Check
**Files:** Entire `apps/backend/` directory

Run `cargo check` and `cargo build` to verify the entire backend compiles.

**Acceptance Criteria:**
- [ ] `cargo check` passes with no errors
- [ ] `cargo build` passes with no errors
- [ ] No warnings related to scene_catalog

### Task 9.2: Frontend TypeScript Check
**Files:** Entire `apps/frontend/` directory

Run `npx tsc --noEmit` to verify no TypeScript errors.

**Acceptance Criteria:**
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No remaining `scene_catalog_id` references in `.ts` or `.tsx` files
- [ ] No remaining `SceneCatalogEntry` type references

### Task 9.3: Verify No scene_catalog References in Codebase
**Files:** Entire project

Search for any remaining `scene_catalog` references across the full codebase (backend + frontend).

**Acceptance Criteria:**
- [ ] `grep -r "scene_catalog" apps/backend/crates/` returns no hits (excluding migration files)
- [ ] `grep -r "scene_catalog" apps/frontend/src/` returns no hits (except Track-related type file if kept)
- [ ] `grep -r "SceneCatalog" apps/` returns no hits (excluding migration files and this task file)
- [ ] No references to removed API endpoints (`/scene-catalog`)

### Task 9.4: Write SceneType Track Repo Tests
**File:** `crates/db/tests/scene_type.rs` (or new test file)

Add integration tests for the new track association methods on `SceneTypeRepo`.

**Test Cases:**
- `find_by_id_with_tracks` returns scene type with its tracks
- `set_tracks` replaces all track associations
- `add_track` is idempotent (calling twice with same track_id succeeds)
- `remove_track` returns false for non-existent association
- `list_studio_level_with_tracks` returns all studio-level types with tracks

**Acceptance Criteria:**
- [ ] Test for `find_by_id_with_tracks` verifies tracks are loaded
- [ ] Test for `set_tracks` verifies replacement behavior
- [ ] Test for `add_track` verifies idempotency
- [ ] Test for `remove_track` verifies return value
- [ ] Test for `list_studio_level_with_tracks` verifies studio-level filter + tracks

### Task 9.5: Write Updated Inheritance Chain Tests
**File:** `crates/db/tests/project_scene_settings.rs` (or existing test file)

Add/update integration tests for the updated three-level inheritance chain.

**Test Cases:**
- `ProjectSceneSettingRepo::list_effective` joins `scene_types` and returns `scene_type_id`
- `CharacterSceneOverrideRepo::list_effective` three-level merge returns correct `scene_type_id` and `source`
- Upsert/delete operations use `scene_type_id` correctly

**Acceptance Criteria:**
- [ ] Test verifies `list_effective` returns `scene_type_id` (not `scene_catalog_id`)
- [ ] Test verifies three-level merge produces correct `is_enabled` and `source` values
- [ ] Test verifies upsert with `scene_type_id` creates/updates correctly

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260301000031_add_catalog_columns_to_scene_types.sql` | Migration: add slug + has_clothes_off_transition, backfill from catalog |
| `apps/db/migrations/20260301000032_create_scene_type_tracks.sql` | Migration: create scene_type_tracks junction table |
| `apps/db/migrations/20260301000033_migrate_project_scene_settings_fk.sql` | Migration: scene_catalog_id -> scene_type_id in project_scene_settings |
| `apps/db/migrations/20260301000034_migrate_character_scene_overrides_fk.sql` | Migration: scene_catalog_id -> scene_type_id in character_scene_overrides |
| `apps/db/migrations/20260301000035_drop_scene_catalog_tables.sql` | Migration: drop scene_catalog and scene_catalog_tracks tables |
| `crates/db/src/models/scene_type.rs` | SceneType model + EffectiveSceneSetting + SceneTypeWithTracks |
| `crates/db/src/models/project_scene_setting.rs` | ProjectSceneSetting model (scene_catalog_id -> scene_type_id) |
| `crates/db/src/models/character_scene_override.rs` | CharacterSceneOverride model (scene_catalog_id -> scene_type_id) |
| `crates/db/src/models/scene_catalog.rs` | **DELETED** -- absorbed into scene_type.rs |
| `crates/db/src/repositories/scene_type_repo.rs` | SceneTypeRepo + track methods |
| `crates/db/src/repositories/project_scene_setting_repo.rs` | Updated queries (scene_type_id) |
| `crates/db/src/repositories/character_scene_override_repo.rs` | Updated queries (scene_type_id) |
| `crates/db/src/repositories/scene_catalog_repo.rs` | **DELETED** -- track methods moved to SceneTypeRepo |
| `crates/api/src/handlers/scene_type.rs` | Scene type handlers + track management |
| `crates/api/src/handlers/project_scene_settings.rs` | Updated path params (scene_type_id) |
| `crates/api/src/handlers/character_scene_overrides.rs` | Updated path params (scene_type_id) |
| `crates/api/src/handlers/scene_catalog.rs` | **DELETED** |
| `crates/api/src/routes/scene_type.rs` | Track routes added |
| `crates/api/src/routes/project_scene_settings.rs` | Path param renamed |
| `crates/api/src/routes/character_scene_overrides.rs` | Path param renamed |
| `crates/api/src/routes/scene_catalog.rs` | **DELETED** |
| `crates/api/src/routes/mod.rs` | scene_catalog nest removed |
| `apps/frontend/src/features/scene-types/types.ts` | Unified types (slug, tracks, EffectiveSceneSetting) |
| `apps/frontend/src/features/scene-catalog/types.ts` | Trimmed to Track types only |
| `apps/frontend/src/features/scene-catalog/hooks/use-scene-catalog.ts` | Updated to call /scene-types API |
| `apps/frontend/src/features/scene-catalog/hooks/use-project-scene-settings.ts` | scene_type_id |
| `apps/frontend/src/features/scene-catalog/hooks/use-character-scene-settings.ts` | scene_type_id |
| `apps/frontend/src/features/scene-types/hooks/use-scene-types.ts` | includeTracks support |
| `apps/frontend/src/features/scene-catalog/SceneCatalogList.tsx` | Uses SceneType data |
| `apps/frontend/src/features/scene-catalog/ProjectSceneSettings.tsx` | scene_type_id |
| `apps/frontend/src/features/scene-catalog/CharacterSceneOverrides.tsx` | scene_type_id |
| `apps/frontend/src/features/scene-catalog/SceneCatalogForm.tsx` | Uses SceneType DTOs |
| `apps/frontend/src/app/pages/SceneCatalogPage.tsx` | Unified entry point |
| `apps/frontend/src/app/pages/SceneTypesPage.tsx` | **DELETED** |
| `apps/frontend/src/app/navigation.ts` | Scene Types nav item removed |
| `apps/frontend/src/app/router.tsx` | /content/scene-types route removed |
| `crates/db/tests/scene_catalog.rs` | **DELETED** |
| `crates/api/tests/scene_catalog_api.rs` | **DELETED** |

---

## Dependencies

### Existing Components to Reuse
- `SceneTypeRepo` CRUD methods from `crates/db/src/repositories/scene_type_repo.rs`
- `SceneCatalogRepo` track association patterns from `crates/db/src/repositories/scene_catalog_repo.rs` (ported, not duplicated)
- `SceneTypeEditor`, `PromptTemplateEditor`, `InheritanceTree`, `OverrideIndicator` components from `features/scene-types/`
- `TrackBadge`, `SourceBadge` components from `features/scene-catalog/`
- `SceneCatalogList`, `SceneCatalogForm` components from `features/scene-catalog/` (adapted to use SceneType)
- `DataResponse` envelope from `crates/api/src/response.rs`
- `CoreError::NotFound` from `crates/core/src/error.rs`
- `Track` model from `crates/db/src/models/track.rs`

### New Infrastructure Needed
- `SceneTypeWithTracks` DTO struct in `scene_type.rs`
- `scene_type_tracks` junction table
- Track management endpoints on scene type routes
- Temporary `_scene_catalog_to_scene_type_map` table (created and dropped during migration)

---

## Implementation Order

### MVP (Minimum for Feature)
1. **Phase 1:** Database Migrations -- Tasks 1.1-1.5
2. **Phase 2:** Backend Model & DTO Updates -- Tasks 2.1-2.4
3. **Phase 3:** Backend Repository Updates -- Tasks 3.1-3.4
4. **Phase 4:** Backend Handler & Route Updates -- Tasks 4.1-4.6
5. **Phase 5:** Backend Cleanup -- Tasks 5.1-5.5
6. **Phase 6:** Frontend Type & Hook Updates -- Tasks 6.1-6.5
7. **Phase 7:** Frontend Component Updates -- Tasks 7.1-7.5
8. **Phase 8:** Navigation & Router Cleanup -- Tasks 8.1-8.4
9. **Phase 9:** Verification & Testing -- Tasks 9.1-9.5

**MVP Success Criteria:**
- Zero data loss: every `scene_catalog` entry has a corresponding `scene_types` row
- Three-level inheritance produces identical `is_enabled` results (with `scene_type_id` instead of `scene_catalog_id`)
- Single "Scene Catalog" page at `/content/scene-catalog` backed by scene types with tracks
- "Scene Types" nav item and route removed
- No `scene_catalog_id` references remain in source code (backend or frontend)
- `cargo check` and `npx tsc --noEmit` pass with zero errors

### Post-MVP Enhancements
- **Slug auto-generation** in the create handler when slug is omitted
- **Scene catalog search & filtering** by name, track, active status
- **Drag-and-drop reordering** of scene types in the catalog view

---

## Notes

1. **Migration ordering is critical:** Task 1.1 must run before 1.2-1.4 (they depend on the mapping table). Task 1.5 must run last (drops tables that 1.2-1.4 reference).
2. **Deploy backend before frontend:** If the frontend is deployed first, `/scene-catalog` API calls will fail because the table no longer exists. Deploy database migrations + backend first, then frontend.
3. **The temporary mapping table `_scene_catalog_to_scene_type_map`** exists across migrations 1.1-1.5 and is only dropped in 1.5. This is intentional -- it's the bridge that connects catalog IDs to scene type IDs for FK migration.
4. **Slug immutability** is enforced in the update handler (not the database). The `UpdateSceneType` DTO includes `slug: Option<String>` but the handler should reject slug changes after creation. This matches the original `scene_catalog` behavior.
5. **Project-scoped scene types** (those with `project_id IS NOT NULL`) do not come from the catalog and will have auto-generated slugs. They will have no track associations after migration -- this is expected since tracks are a studio-level concept.

---

## Version History

- **v1.0** (2026-03-01): Initial task list creation from PRD-123
