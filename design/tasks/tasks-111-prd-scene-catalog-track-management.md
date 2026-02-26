# Task List: Scene Catalog & Track Management

**PRD Reference:** `design/prds/111-prd-scene-catalog-track-management.md`
**Scope:** Build a studio-level scene catalog registry, a normalized tracks system replacing the `variant_applicability` string, many-to-many scene-track assignments, per-project scene enablement, per-character scene overrides with three-level inheritance (catalog → project → character), and full CRUD UI for all entities.

## Overview

The platform currently uses a `variant_applicability` string field on `scene_types` to control which variants (clothed, topless, both, clothes_off) a scene supports. This is rigid and doesn't scale. This PRD introduces a **scene catalog** — a master registry of ~28 scene concepts — and a **tracks** system that replaces the string with a normalized many-to-many relationship. Projects select which catalog scenes are enabled for generation, and characters can override those settings. The UI provides a browsable catalog with track badges, inline editing, and hierarchical enablement controls.

### What Already Exists
- `scene_types` table with `variant_applicability TEXT NOT NULL DEFAULT 'both'` column
- `x121_core::scene_type_config` — `expand_variants()`, `VARIANT_CLOTHED`, `VARIANT_TOPLESS`, `VARIANT_BOTH` constants
- `x121_db::repositories::SceneTypeRepo` — CRUD with soft delete, `list_by_project`, `list_studio_level`
- `x121_db::models::scene_type` — `SceneType`, `CreateSceneType`, `UpdateSceneType` with `variant_applicability` field
- `apps/frontend/src/features/scene-types/types.ts` — `VARIANT_OPTIONS` constant, `SceneType` interface with `variant_applicability`
- `apps/frontend/src/features/scene-types/hooks/use-scene-types.ts` — TanStack Query hooks with key factory pattern
- `apps/frontend/src/features/scene-types/SceneTypeEditor.tsx` — form component referencing `variant_applicability`
- `projects` table, `characters` table — both with `BIGSERIAL` PK, soft delete, `updated_at` trigger
- PRD-029 design system components: Card, Table, Badge, Toggle, Input, Select, Modal, Drawer
- `apps/frontend/src/lib/api.ts` — shared API client

### What We're Building
1. Database migration: `tracks`, `scene_catalog`, `scene_catalog_tracks` tables with seed data
2. Database migration: `project_scene_settings`, `character_scene_overrides` tables
3. Database migration: drop `variant_applicability` column from `scene_types`
4. Rust models and repositories for all 5 new tables
5. API handlers for scene catalog CRUD, track management, scene-track junction management
6. API handlers for project scene settings and character scene overrides (three-level merge)
7. Update `x121_core::scene_type_config` to query tracks instead of using string constants
8. Frontend feature module: `scene-catalog` with catalog list, form, track manager
9. Frontend components for project scene settings and character scene override panels
10. Integration tests for all new functionality

### Key Design Decisions
1. **Scene catalog is studio-level** — It's a global registry, not per-project. Scene catalog entries are content concepts (e.g., "sex"), not per-character scene instances.
2. **Tracks replace variant_applicability** — The `variant_applicability` string column is dropped. Track assignments are the normalized replacement.
3. **Three-level enablement** — Catalog → project → character. Absence of a row means "inherit from parent level." A row explicitly overrides.
4. **Slug immutability** — Both track and scene catalog slugs are immutable after creation because they're used in file naming conventions.
5. **Soft-deactivate, not delete** — Scenes and tracks are deactivated (`is_active = false`), never hard-deleted, because slugs may be referenced in file paths.

---

## Phase 1: Database Migrations

### Task 1.1: Create `tracks` table migration
**File:** `apps/db/migrations/20260225000001_create_tracks.sql`

Create the tracks table to define variant categories (replaces hardcoded variant strings).

```sql
-- Tracks: variant categories for scene generation (PRD-111 Req 1.1)
CREATE TABLE tracks (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on name
CREATE UNIQUE INDEX uq_tracks_name ON tracks(name);

-- Updated_at trigger
CREATE TRIGGER trg_tracks_updated_at
    BEFORE UPDATE ON tracks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed initial tracks
INSERT INTO tracks (name, slug, sort_order) VALUES
    ('Clothed', 'clothed', 1),
    ('Topless', 'topless', 2);
```

**Acceptance Criteria:**
- [ ] `tracks` table created with `BIGSERIAL` PK, `created_at`/`updated_at` `TIMESTAMPTZ`
- [ ] `slug` has UNIQUE constraint (used in file naming, immutable after creation)
- [ ] `name` has UNIQUE constraint (display label)
- [ ] `sort_order` defaults to 0
- [ ] `is_active` defaults to `true`
- [ ] `set_updated_at()` trigger applied
- [ ] Two seed tracks inserted: Clothed (sort_order=1) and Topless (sort_order=2)
- [ ] Migration runs cleanly via `sqlx migrate run`

### Task 1.2: Create `scene_catalog` table migration
**File:** `apps/db/migrations/20260225000002_create_scene_catalog.sql`

Create the master scene catalog table — studio-level registry of content concepts.

```sql
-- Scene catalog: master registry of scene content concepts (PRD-111 Req 1.2)
CREATE TABLE scene_catalog (
    id                          BIGSERIAL PRIMARY KEY,
    name                        TEXT NOT NULL UNIQUE,
    slug                        TEXT NOT NULL UNIQUE,
    description                 TEXT,
    has_clothes_off_transition  BOOLEAN NOT NULL DEFAULT false,
    sort_order                  INTEGER NOT NULL DEFAULT 0,
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER trg_scene_catalog_updated_at
    BEFORE UPDATE ON scene_catalog
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed 26 scene concepts (from PRD-111 Section 8)
INSERT INTO scene_catalog (name, slug, has_clothes_off_transition, sort_order) VALUES
    ('Intro',              'intro',              false, 1),
    ('Idle',               'idle',               false, 2),
    ('Boobs Fondle',       'boobs_fondle',       true,  3),
    ('BJ',                 'bj',                 false, 4),
    ('Boobs Jumping',      'boobs_jumping',      true,  5),
    ('Bottom',             'bottom',             false, 6),
    ('Cowgirl',            'cowgirl',             false, 7),
    ('Cumshot',            'cumshot',             false, 8),
    ('Dance',              'dance',              false, 9),
    ('Deal',               'deal',               false, 10),
    ('Doggy',              'doggy',              false, 11),
    ('Feet',               'feet',               false, 12),
    ('From Behind',        'from_behind',        false, 13),
    ('Gloryhole Blowjob',  'gloryhole_blowjob', false, 14),
    ('Handjob',            'handjob',            false, 15),
    ('Kiss',               'kiss',               false, 16),
    ('Masturbation',       'masturbation',       false, 17),
    ('Missionary',         'missionary',         false, 18),
    ('Orgasm',             'orgasm',             false, 19),
    ('Pussy',              'pussy',              false, 20),
    ('Pussy Finger',       'pussy_finger',       false, 21),
    ('Reverse Cowgirl',    'reverse_cowgirl',    false, 22),
    ('Sex',                'sex',                false, 23),
    ('Side Fuck',          'side_fuck',          false, 24),
    ('Titwank',            'titwank',            false, 25),
    ('Twerking',           'twerking',           false, 26);
```

**Acceptance Criteria:**
- [ ] `scene_catalog` table created with `BIGSERIAL` PK, `TIMESTAMPTZ` timestamps
- [ ] `name` and `slug` both have UNIQUE constraints
- [ ] `has_clothes_off_transition` boolean defaults to `false`
- [ ] `is_active` defaults to `true`
- [ ] `set_updated_at()` trigger applied
- [ ] 26 seed scene concepts inserted with correct transition flags and sort_order
- [ ] Migration runs cleanly

### Task 1.3: Create `scene_catalog_tracks` junction table migration
**File:** `apps/db/migrations/20260225000003_create_scene_catalog_tracks.sql`

Create the many-to-many junction table between scene catalog entries and tracks, with seed data.

```sql
-- Scene catalog <-> tracks junction (PRD-111 Req 1.3)
CREATE TABLE scene_catalog_tracks (
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    track_id         BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scene_catalog_id, track_id)
);

-- FK indexes
CREATE INDEX idx_scene_catalog_tracks_track_id ON scene_catalog_tracks(track_id);

-- Seed track assignments
-- Clothed track (id=1): all scenes
INSERT INTO scene_catalog_tracks (scene_catalog_id, track_id)
SELECT id, 1 FROM scene_catalog;

-- Topless track (id=2): scenes that support topless variant
INSERT INTO scene_catalog_tracks (scene_catalog_id, track_id)
SELECT id, 2 FROM scene_catalog
WHERE slug IN (
    'idle', 'bj', 'bottom', 'cumshot', 'dance', 'deal',
    'feet', 'from_behind', 'handjob', 'kiss', 'orgasm',
    'pussy', 'sex', 'titwank'
);
```

**Acceptance Criteria:**
- [ ] Composite primary key on `(scene_catalog_id, track_id)`
- [ ] Foreign keys to `scene_catalog` and `tracks` with `ON DELETE CASCADE`
- [ ] FK index on `track_id` for reverse lookups
- [ ] All 26 scene catalog entries seeded with clothed track assignment
- [ ] 14 scene catalog entries seeded with topless track assignment (matching PRD Section 8)
- [ ] No `updated_at` column needed (junction row is created or deleted, never updated)
- [ ] Migration runs cleanly

### Task 1.4: Create `project_scene_settings` table migration
**File:** `apps/db/migrations/20260225000004_create_project_scene_settings.sql`

Create the table for project-level scene enablement overrides.

```sql
-- Project-level scene enablement (PRD-111 Req 1.9)
CREATE TABLE project_scene_settings (
    id               BIGSERIAL PRIMARY KEY,
    project_id       BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    is_enabled       BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite unique constraint
CREATE UNIQUE INDEX uq_project_scene_settings_project_scene
    ON project_scene_settings(project_id, scene_catalog_id);

-- FK indexes
CREATE INDEX idx_project_scene_settings_project_id ON project_scene_settings(project_id);
CREATE INDEX idx_project_scene_settings_scene_catalog_id ON project_scene_settings(scene_catalog_id);

-- Updated_at trigger
CREATE TRIGGER trg_project_scene_settings_updated_at
    BEFORE UPDATE ON project_scene_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] `project_scene_settings` table with `BIGSERIAL` PK
- [ ] Composite unique constraint on `(project_id, scene_catalog_id)`
- [ ] FKs to `projects` and `scene_catalog` with `ON DELETE CASCADE`
- [ ] FK indexes on both foreign key columns
- [ ] `is_enabled` defaults to `true`
- [ ] No rows inserted by default — absence means "use catalog default"
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

### Task 1.5: Create `character_scene_overrides` table migration
**File:** `apps/db/migrations/20260225000005_create_character_scene_overrides.sql`

Create the table for character-level scene enablement overrides.

```sql
-- Character-level scene enablement overrides (PRD-111 Req 1.10)
CREATE TABLE character_scene_overrides (
    id               BIGSERIAL PRIMARY KEY,
    character_id     BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    is_enabled       BOOLEAN NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite unique constraint
CREATE UNIQUE INDEX uq_character_scene_overrides_character_scene
    ON character_scene_overrides(character_id, scene_catalog_id);

-- FK indexes
CREATE INDEX idx_character_scene_overrides_character_id ON character_scene_overrides(character_id);
CREATE INDEX idx_character_scene_overrides_scene_catalog_id ON character_scene_overrides(scene_catalog_id);

-- Updated_at trigger
CREATE TRIGGER trg_character_scene_overrides_updated_at
    BEFORE UPDATE ON character_scene_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] `character_scene_overrides` table with `BIGSERIAL` PK
- [ ] Composite unique constraint on `(character_id, scene_catalog_id)`
- [ ] FKs to `characters` and `scene_catalog` with `ON DELETE CASCADE`
- [ ] FK indexes on both foreign key columns
- [ ] `is_enabled` is `NOT NULL` (no default — explicit override required)
- [ ] No rows inserted by default — absence means "inherit from project"
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

### Task 1.6: Drop `variant_applicability` column migration
**File:** `apps/db/migrations/20260225000006_drop_variant_applicability.sql`

Remove the replaced `variant_applicability` column from `scene_types` after the new tracks system is in place.

```sql
-- Drop variant_applicability, replaced by tracks system (PRD-111 Req 1.5)
ALTER TABLE scene_types DROP COLUMN variant_applicability;
```

**Acceptance Criteria:**
- [ ] `variant_applicability` column dropped from `scene_types`
- [ ] Migration runs cleanly after Tasks 1.1–1.5
- [ ] Existing `scene_types` rows are not affected (other columns preserved)
- [ ] All code references to `variant_applicability` must be updated before this migration runs

---

## Phase 2: Rust Models

### Task 2.1: Create `Track` model structs
**File:** `apps/backend/crates/db/src/models/track.rs`

Follow the existing three-struct pattern (entity/create/update) from `models/scene_type.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `tracks` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Track {
    pub id: DbId,
    pub name: String,
    pub slug: String,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new track.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTrack {
    pub name: String,
    pub slug: String,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
}

/// DTO for updating an existing track. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTrack {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
    // slug is intentionally omitted — immutable after creation
}
```

**Acceptance Criteria:**
- [ ] Main struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Create DTO derives `Debug, Clone, Deserialize`
- [ ] Update DTO derives `Debug, Clone, Deserialize`; no `slug` field (immutable)
- [ ] Uses `DbId` (`i64`) and `Timestamp` from `x121_core::types`
- [ ] Module registered in `models/mod.rs` with `pub mod track;`

### Task 2.2: Create `SceneCatalog` model structs
**File:** `apps/backend/crates/db/src/models/scene_catalog.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_catalog` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneCatalogEntry {
    pub id: DbId,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub has_clothes_off_transition: bool,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Scene catalog entry with joined track data for API responses.
#[derive(Debug, Clone, Serialize)]
pub struct SceneCatalogWithTracks {
    #[serde(flatten)]
    pub entry: SceneCatalogEntry,
    pub tracks: Vec<super::track::Track>,
}

/// DTO for creating a new scene catalog entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneCatalogEntry {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub has_clothes_off_transition: Option<bool>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
    pub track_ids: Vec<DbId>,
}

/// DTO for updating a scene catalog entry. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneCatalogEntry {
    pub name: Option<String>,
    pub description: Option<String>,
    pub has_clothes_off_transition: Option<bool>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
    pub track_ids: Option<Vec<DbId>>,
    // slug is intentionally omitted — immutable after creation
}
```

**Acceptance Criteria:**
- [ ] `SceneCatalogEntry` maps to `scene_catalog` table row
- [ ] `SceneCatalogWithTracks` wraps entry + joined tracks for API responses
- [ ] `CreateSceneCatalogEntry` includes `track_ids: Vec<DbId>` for initial track assignment
- [ ] `UpdateSceneCatalogEntry` includes `track_ids: Option<Vec<DbId>>` for bulk track replacement
- [ ] No `slug` in update DTO (immutable)
- [ ] Module registered in `models/mod.rs`

### Task 2.3: Create `ProjectSceneSetting` model structs
**File:** `apps/backend/crates/db/src/models/project_scene_setting.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `project_scene_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectSceneSetting {
    pub id: DbId,
    pub project_id: DbId,
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Effective scene setting for a project (merged catalog + project override).
#[derive(Debug, Clone, Serialize)]
pub struct EffectiveProjectSceneSetting {
    pub scene_catalog_id: DbId,
    pub name: String,
    pub slug: String,
    pub is_enabled: bool,
    pub source: String,  // "catalog_default" | "project_override"
}

/// DTO for bulk-updating project scene settings.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkProjectSceneSettings {
    pub settings: Vec<ProjectSceneSettingUpdate>,
}

/// Single scene setting update within a bulk operation.
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectSceneSettingUpdate {
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
}
```

**Acceptance Criteria:**
- [ ] `ProjectSceneSetting` maps to table row with `FromRow`
- [ ] `EffectiveProjectSceneSetting` includes `source` field for UI display
- [ ] `BulkProjectSceneSettings` supports the bulk PUT endpoint
- [ ] Module registered in `models/mod.rs`

### Task 2.4: Create `CharacterSceneOverride` model structs
**File:** `apps/backend/crates/db/src/models/character_scene_override.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_scene_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterSceneOverride {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Effective scene setting for a character (three-level merge: catalog → project → character).
#[derive(Debug, Clone, Serialize)]
pub struct EffectiveCharacterSceneSetting {
    pub scene_catalog_id: DbId,
    pub name: String,
    pub slug: String,
    pub is_enabled: bool,
    pub source: String,  // "catalog_default" | "project_override" | "character_override"
}

/// DTO for bulk-updating character scene overrides.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkCharacterSceneOverrides {
    pub overrides: Vec<CharacterSceneOverrideUpdate>,
}

/// Single scene override update within a bulk operation.
#[derive(Debug, Clone, Deserialize)]
pub struct CharacterSceneOverrideUpdate {
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
}
```

**Acceptance Criteria:**
- [ ] `CharacterSceneOverride` maps to table row with `FromRow`
- [ ] `EffectiveCharacterSceneSetting` includes `source` field with three possible values
- [ ] `BulkCharacterSceneOverrides` supports the bulk PUT endpoint
- [ ] Module registered in `models/mod.rs`

### Task 2.5: Remove `variant_applicability` from `SceneType` model
**Files:** `apps/backend/crates/db/src/models/scene_type.rs`, `apps/backend/crates/db/src/repositories/scene_type_repo.rs`

Remove the `variant_applicability` field from `SceneType`, `CreateSceneType`, and `UpdateSceneType` structs. Update `SceneTypeRepo` COLUMNS constant and all queries that reference this field.

**Acceptance Criteria:**
- [ ] `variant_applicability` removed from `SceneType` struct
- [ ] `variant_applicability` removed from `CreateSceneType` and `UpdateSceneType` DTOs
- [ ] `variant_applicability` removed from `SceneTypeRepo::COLUMNS`
- [ ] All `SceneTypeRepo` queries updated (create, update bindings)
- [ ] All code compiles after removal

---

## Phase 3: Rust Repositories

### Task 3.1: Create `TrackRepo`
**File:** `apps/backend/crates/db/src/repositories/track_repo.rs`

Follow the zero-sized struct pattern from `SceneTypeRepo`.

```rust
pub struct TrackRepo;

impl TrackRepo {
    pub async fn create(pool: &PgPool, input: &CreateTrack) -> Result<Track, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Track>, sqlx::Error>;
    pub async fn list(pool: &PgPool, include_inactive: bool) -> Result<Vec<Track>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateTrack) -> Result<Option<Track>, sqlx::Error>;
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}
```

Key details:
- `list` with `include_inactive = false` filters `WHERE is_active = true`
- `list` ordered by `sort_order ASC, name ASC`
- No hard delete — tracks are deactivated only

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all `tracks` columns
- [ ] `create` inserts with `COALESCE` defaults for `sort_order` and `is_active`
- [ ] `find_by_id` returns active or inactive tracks (no activity filter on single lookup)
- [ ] `list` supports `include_inactive` parameter
- [ ] `update` uses `COALESCE` pattern for optional fields; no `slug` update
- [ ] `deactivate` sets `is_active = false`
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

### Task 3.2: Create `SceneCatalogRepo`
**File:** `apps/backend/crates/db/src/repositories/scene_catalog_repo.rs`

```rust
pub struct SceneCatalogRepo;

impl SceneCatalogRepo {
    pub async fn create(pool: &PgPool, input: &CreateSceneCatalogEntry) -> Result<SceneCatalogEntry, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SceneCatalogEntry>, sqlx::Error>;
    pub async fn list(pool: &PgPool, include_inactive: bool) -> Result<Vec<SceneCatalogEntry>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateSceneCatalogEntry) -> Result<Option<SceneCatalogEntry>, sqlx::Error>;
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;

    // Track junction methods
    pub async fn get_tracks_for_scene(pool: &PgPool, scene_catalog_id: DbId) -> Result<Vec<Track>, sqlx::Error>;
    pub async fn set_tracks(pool: &PgPool, scene_catalog_id: DbId, track_ids: &[DbId]) -> Result<(), sqlx::Error>;
    pub async fn add_track(pool: &PgPool, scene_catalog_id: DbId, track_id: DbId) -> Result<(), sqlx::Error>;
    pub async fn remove_track(pool: &PgPool, scene_catalog_id: DbId, track_id: DbId) -> Result<bool, sqlx::Error>;

    // Bulk query: list all entries with their tracks pre-joined
    pub async fn list_with_tracks(pool: &PgPool, include_inactive: bool) -> Result<Vec<SceneCatalogWithTracks>, sqlx::Error>;
    pub async fn find_by_id_with_tracks(pool: &PgPool, id: DbId) -> Result<Option<SceneCatalogWithTracks>, sqlx::Error>;
}
```

Key details:
- `create` inserts the catalog entry then calls `set_tracks` to insert junction rows
- `set_tracks` deletes existing junction rows and re-inserts (replace strategy)
- `list_with_tracks` uses a query + Rust-side grouping (fetch all entries, fetch all junction+tracks, merge)
- `list` ordered by `sort_order ASC, name ASC`

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const
- [ ] `create` inserts entry and junction rows in a transaction
- [ ] `update` optionally replaces track assignments if `track_ids` is `Some`
- [ ] `set_tracks` uses DELETE + INSERT in a transaction
- [ ] `add_track` uses `INSERT ... ON CONFLICT DO NOTHING`
- [ ] `remove_track` deletes junction row, returns whether row existed
- [ ] `list_with_tracks` returns entries with populated `tracks` vec
- [ ] Module registered in `repositories/mod.rs`

### Task 3.3: Create `ProjectSceneSettingRepo`
**File:** `apps/backend/crates/db/src/repositories/project_scene_setting_repo.rs`

```rust
pub struct ProjectSceneSettingRepo;

impl ProjectSceneSettingRepo {
    /// List effective scene settings for a project (catalog entries merged with overrides).
    pub async fn list_effective(pool: &PgPool, project_id: DbId) -> Result<Vec<EffectiveProjectSceneSetting>, sqlx::Error>;

    /// Upsert a single scene setting for a project.
    pub async fn upsert(pool: &PgPool, project_id: DbId, scene_catalog_id: DbId, is_enabled: bool) -> Result<ProjectSceneSetting, sqlx::Error>;

    /// Bulk upsert scene settings for a project.
    pub async fn bulk_upsert(pool: &PgPool, project_id: DbId, settings: &[ProjectSceneSettingUpdate]) -> Result<Vec<ProjectSceneSetting>, sqlx::Error>;

    /// Delete a project scene setting (revert to catalog default).
    pub async fn delete(pool: &PgPool, project_id: DbId, scene_catalog_id: DbId) -> Result<bool, sqlx::Error>;
}
```

Key query for `list_effective`:
```sql
SELECT
    sc.id AS scene_catalog_id,
    sc.name,
    sc.slug,
    COALESCE(pss.is_enabled, sc.is_active) AS is_enabled,
    CASE WHEN pss.id IS NOT NULL THEN 'project_override' ELSE 'catalog_default' END AS source
FROM scene_catalog sc
LEFT JOIN project_scene_settings pss
    ON pss.scene_catalog_id = sc.id AND pss.project_id = $1
ORDER BY sc.sort_order, sc.name
```

**Acceptance Criteria:**
- [ ] `list_effective` returns all catalog entries with merged project-level status
- [ ] `source` field correctly reports `catalog_default` or `project_override`
- [ ] `upsert` uses `INSERT ... ON CONFLICT (project_id, scene_catalog_id) DO UPDATE`
- [ ] `bulk_upsert` processes all settings in a single transaction
- [ ] `delete` removes the override row (reverts to catalog default)
- [ ] Module registered in `repositories/mod.rs`

### Task 3.4: Create `CharacterSceneOverrideRepo`
**File:** `apps/backend/crates/db/src/repositories/character_scene_override_repo.rs`

```rust
pub struct CharacterSceneOverrideRepo;

impl CharacterSceneOverrideRepo {
    /// List effective scene settings for a character (three-level merge).
    pub async fn list_effective(pool: &PgPool, character_id: DbId, project_id: DbId) -> Result<Vec<EffectiveCharacterSceneSetting>, sqlx::Error>;

    /// Upsert a single scene override for a character.
    pub async fn upsert(pool: &PgPool, character_id: DbId, scene_catalog_id: DbId, is_enabled: bool) -> Result<CharacterSceneOverride, sqlx::Error>;

    /// Bulk upsert scene overrides for a character.
    pub async fn bulk_upsert(pool: &PgPool, character_id: DbId, overrides: &[CharacterSceneOverrideUpdate]) -> Result<Vec<CharacterSceneOverride>, sqlx::Error>;

    /// Delete a character scene override (revert to project default).
    pub async fn delete(pool: &PgPool, character_id: DbId, scene_catalog_id: DbId) -> Result<bool, sqlx::Error>;

    /// Delete all overrides for a character (reset to project defaults).
    pub async fn delete_all(pool: &PgPool, character_id: DbId) -> Result<u64, sqlx::Error>;
}
```

Key query for `list_effective` (three-level merge):
```sql
SELECT
    sc.id AS scene_catalog_id,
    sc.name,
    sc.slug,
    COALESCE(
        cso.is_enabled,
        pss.is_enabled,
        sc.is_active
    ) AS is_enabled,
    CASE
        WHEN cso.id IS NOT NULL THEN 'character_override'
        WHEN pss.id IS NOT NULL THEN 'project_override'
        ELSE 'catalog_default'
    END AS source
FROM scene_catalog sc
LEFT JOIN project_scene_settings pss
    ON pss.scene_catalog_id = sc.id AND pss.project_id = $2
LEFT JOIN character_scene_overrides cso
    ON cso.scene_catalog_id = sc.id AND cso.character_id = $1
ORDER BY sc.sort_order, sc.name
```

**Acceptance Criteria:**
- [ ] `list_effective` performs the three-level merge: catalog → project → character
- [ ] `source` field correctly reports one of three values
- [ ] `upsert` uses `INSERT ... ON CONFLICT (character_id, scene_catalog_id) DO UPDATE`
- [ ] `bulk_upsert` processes all overrides in a single transaction
- [ ] `delete` removes a single override (reverts to project default)
- [ ] `delete_all` removes all overrides for a character
- [ ] Module registered in `repositories/mod.rs`

---

## Phase 4: Backend API Handlers

### Task 4.1: Create scene catalog handler module
**File:** `apps/backend/crates/api/src/handlers/scene_catalog.rs`

Implement handlers for scene catalog CRUD with track assignments.

```rust
/// GET /api/v1/scene-catalog?include_inactive=false
pub async fn list(State(state): State<AppState>, Query(params): Query<ListParams>) -> AppResult<Json<Vec<SceneCatalogWithTracks>>>;

/// POST /api/v1/scene-catalog
pub async fn create(State(state): State<AppState>, Json(input): Json<CreateSceneCatalogEntry>) -> AppResult<(StatusCode, Json<SceneCatalogWithTracks>)>;

/// GET /api/v1/scene-catalog/{id}
pub async fn get_by_id(State(state): State<AppState>, Path(id): Path<DbId>) -> AppResult<Json<SceneCatalogWithTracks>>;

/// PUT /api/v1/scene-catalog/{id}
pub async fn update(State(state): State<AppState>, Path(id): Path<DbId>, Json(input): Json<UpdateSceneCatalogEntry>) -> AppResult<Json<SceneCatalogWithTracks>>;

/// DELETE /api/v1/scene-catalog/{id}  (soft-deactivate)
pub async fn deactivate(State(state): State<AppState>, Path(id): Path<DbId>) -> AppResult<StatusCode>;

/// POST /api/v1/scene-catalog/{id}/tracks
pub async fn add_tracks(State(state): State<AppState>, Path(id): Path<DbId>, Json(body): Json<TrackIdsBody>) -> AppResult<StatusCode>;

/// DELETE /api/v1/scene-catalog/{id}/tracks/{track_id}
pub async fn remove_track(State(state): State<AppState>, Path((id, track_id)): Path<(DbId, DbId)>) -> AppResult<StatusCode>;
```

**Acceptance Criteria:**
- [ ] `list` returns all entries with tracks, supports `?include_inactive=true`
- [ ] `create` validates name required, slug unique, at least one track_id; returns 201
- [ ] `get_by_id` returns entry with tracks or 404
- [ ] `update` applies partial update and optionally replaces tracks; returns 200
- [ ] `deactivate` sets `is_active = false`, returns 204 (not hard delete)
- [ ] `add_tracks` adds one or more tracks to a scene; returns 201
- [ ] `remove_track` removes a track from a scene; returns 204 or 404
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.2: Create track handler module
**File:** `apps/backend/crates/api/src/handlers/track.rs`

```rust
/// GET /api/v1/tracks?include_inactive=false
pub async fn list(State(state): State<AppState>, Query(params): Query<ListParams>) -> AppResult<Json<Vec<Track>>>;

/// POST /api/v1/tracks
pub async fn create(State(state): State<AppState>, Json(input): Json<CreateTrack>) -> AppResult<(StatusCode, Json<Track>)>;

/// PUT /api/v1/tracks/{id}
pub async fn update(State(state): State<AppState>, Path(id): Path<DbId>, Json(input): Json<UpdateTrack>) -> AppResult<Json<Track>>;
```

**Acceptance Criteria:**
- [ ] `list` returns all tracks, supports `?include_inactive=true`
- [ ] `create` validates name and slug required, slug unique; returns 201
- [ ] `update` applies partial update (name, sort_order, is_active only); returns 200
- [ ] No delete endpoint — tracks are deactivated, never deleted
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.3: Create project scene settings handler
**File:** `apps/backend/crates/api/src/handlers/project_scene_settings.rs`

```rust
/// GET /api/v1/projects/{project_id}/scene-settings
pub async fn list_effective(State(state): State<AppState>, Path(project_id): Path<DbId>) -> AppResult<Json<Vec<EffectiveProjectSceneSetting>>>;

/// PUT /api/v1/projects/{project_id}/scene-settings
pub async fn bulk_update(State(state): State<AppState>, Path(project_id): Path<DbId>, Json(body): Json<BulkProjectSceneSettings>) -> AppResult<Json<Vec<ProjectSceneSetting>>>;

/// PUT /api/v1/projects/{project_id}/scene-settings/{scene_catalog_id}
pub async fn toggle(State(state): State<AppState>, Path((project_id, scene_catalog_id)): Path<(DbId, DbId)>, Json(body): Json<ToggleBody>) -> AppResult<Json<ProjectSceneSetting>>;
```

**Acceptance Criteria:**
- [ ] `list_effective` returns merged catalog + project override view with `source` field
- [ ] `bulk_update` upserts multiple scene settings in one call; returns 200
- [ ] `toggle` upserts a single scene setting; returns 200
- [ ] All responses include `source` field indicating override or default
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.4: Create character scene overrides handler
**File:** `apps/backend/crates/api/src/handlers/character_scene_overrides.rs`

```rust
/// GET /api/v1/characters/{character_id}/scene-settings
pub async fn list_effective(State(state): State<AppState>, Path(character_id): Path<DbId>) -> AppResult<Json<Vec<EffectiveCharacterSceneSetting>>>;

/// PUT /api/v1/characters/{character_id}/scene-settings
pub async fn bulk_update(State(state): State<AppState>, Path(character_id): Path<DbId>, Json(body): Json<BulkCharacterSceneOverrides>) -> AppResult<Json<Vec<CharacterSceneOverride>>>;

/// PUT /api/v1/characters/{character_id}/scene-settings/{scene_catalog_id}
pub async fn toggle(State(state): State<AppState>, Path((character_id, scene_catalog_id)): Path<(DbId, DbId)>, Json(body): Json<ToggleBody>) -> AppResult<Json<CharacterSceneOverride>>;

/// DELETE /api/v1/characters/{character_id}/scene-settings/{scene_catalog_id}
pub async fn remove_override(State(state): State<AppState>, Path((character_id, scene_catalog_id)): Path<(DbId, DbId)>) -> AppResult<StatusCode>;
```

Note: The character handler needs to look up the character to find its `project_id` for the three-level merge query.

**Acceptance Criteria:**
- [ ] `list_effective` returns three-level merged view with `source` field
- [ ] `bulk_update` upserts multiple overrides in one call; returns 200
- [ ] `toggle` upserts a single override; returns 200
- [ ] `remove_override` deletes the override row (reverts to project default); returns 204
- [ ] Character's `project_id` is resolved internally for the merge query
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.5: Register routes for all new endpoints
**File:** `apps/backend/crates/api/src/lib.rs` (modify existing route tree)

Register all new route groups in the API route tree:

```
/api/v1/scene-catalog                          → scene_catalog::{list, create}
/api/v1/scene-catalog/{id}                     → scene_catalog::{get_by_id, update, deactivate}
/api/v1/scene-catalog/{id}/tracks              → scene_catalog::add_tracks
/api/v1/scene-catalog/{id}/tracks/{track_id}   → scene_catalog::remove_track
/api/v1/tracks                                 → track::{list, create}
/api/v1/tracks/{id}                            → track::update
/api/v1/projects/{id}/scene-settings           → project_scene_settings::{list_effective, bulk_update}
/api/v1/projects/{id}/scene-settings/{sid}     → project_scene_settings::toggle
/api/v1/characters/{id}/scene-settings         → character_scene_overrides::{list_effective, bulk_update}
/api/v1/characters/{id}/scene-settings/{sid}   → character_scene_overrides::{toggle, remove_override}
```

**Acceptance Criteria:**
- [ ] All scene catalog routes registered under `/scene-catalog` prefix
- [ ] All track routes registered under `/tracks` prefix
- [ ] Project scene settings nested under `/projects/{id}/scene-settings`
- [ ] Character scene overrides nested under `/characters/{id}/scene-settings`
- [ ] Route tree imports all new handler modules
- [ ] All new routes compile and are reachable

### Task 4.6: Update `scene_type_config` core module for tracks
**Files:** `apps/backend/crates/core/src/scene_type_config.rs`

Update `expand_variants()` and related functions. The constants `VARIANT_CLOTHED`, `VARIANT_TOPLESS`, `VARIANT_BOTH`, `VARIANT_CLOTHES_OFF` are retained as backward-compatible helpers, but `expand_variants()` should no longer be the primary mechanism. Add a new function that works with track data.

```rust
/// Expand tracks into variant labels (new, track-based approach).
pub fn expand_tracks(track_slugs: &[String]) -> Vec<String> {
    track_slugs.to_vec()
}

/// Validate that given variant strings map to known values (for backward compat).
/// Kept for existing callers during migration period.
pub fn validate_variant_applicability(value: &str) -> Result<(), String> { ... }
```

**Acceptance Criteria:**
- [ ] `expand_variants()` still works for backward compatibility during migration
- [ ] New `expand_tracks()` function accepts track slug lists
- [ ] `VALID_VARIANT_TYPES` retained for backward compatibility
- [ ] No breaking changes to existing callers until Phase 1 Task 1.6 migration runs
- [ ] Handler code in `scene_type.rs` updated to use tracks where appropriate

---

## Phase 5: Frontend — Scene Catalog Feature Module

### Task 5.1: Create TypeScript types
**File:** `apps/frontend/src/features/scene-catalog/types.ts`

```typescript
export interface Track {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SceneCatalogEntry {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  has_clothes_off_transition: boolean;
  sort_order: number;
  is_active: boolean;
  tracks: Track[];
  created_at: string;
  updated_at: string;
}

export interface CreateSceneCatalogEntry {
  name: string;
  slug: string;
  description?: string | null;
  has_clothes_off_transition?: boolean;
  sort_order?: number;
  is_active?: boolean;
  track_ids: number[];
}

export interface UpdateSceneCatalogEntry {
  name?: string;
  description?: string | null;
  has_clothes_off_transition?: boolean;
  sort_order?: number;
  is_active?: boolean;
  track_ids?: number[];
}

export interface EffectiveSceneSetting {
  scene_catalog_id: number;
  name: string;
  slug: string;
  is_enabled: boolean;
  source: 'catalog_default' | 'project_override' | 'character_override';
}
```

**Acceptance Criteria:**
- [ ] All interfaces match corresponding Rust response structs
- [ ] `EffectiveSceneSetting` used by both project and character scene settings views
- [ ] No `any` types — all fields properly typed

### Task 5.2: Create TanStack Query hooks
**Files:**
- `apps/frontend/src/features/scene-catalog/hooks/use-scene-catalog.ts`
- `apps/frontend/src/features/scene-catalog/hooks/use-tracks.ts`
- `apps/frontend/src/features/scene-catalog/hooks/use-project-scene-settings.ts`
- `apps/frontend/src/features/scene-catalog/hooks/use-character-scene-overrides.ts`

Follow the query key factory pattern from `use-scene-types.ts`.

```typescript
// use-scene-catalog.ts
export const sceneCatalogKeys = {
  all: ['scene-catalog'] as const,
  lists: () => [...sceneCatalogKeys.all, 'list'] as const,
  list: (includeInactive?: boolean) => [...sceneCatalogKeys.lists(), { includeInactive }] as const,
  details: () => [...sceneCatalogKeys.all, 'detail'] as const,
  detail: (id: number) => [...sceneCatalogKeys.details(), id] as const,
};

export function useSceneCatalog(includeInactive?: boolean);
export function useSceneCatalogEntry(id: number | null);
export function useCreateSceneCatalogEntry();
export function useUpdateSceneCatalogEntry(id: number);
export function useDeactivateSceneCatalogEntry();
export function useAddTrackToScene();
export function useRemoveTrackFromScene();

// use-tracks.ts
export const trackKeys = { ... };
export function useTracks(includeInactive?: boolean);
export function useCreateTrack();
export function useUpdateTrack(id: number);

// use-project-scene-settings.ts
export const projectSceneSettingsKeys = { ... };
export function useProjectSceneSettings(projectId: number);
export function useBulkUpdateProjectSceneSettings(projectId: number);
export function useToggleProjectSceneSetting(projectId: number);

// use-character-scene-overrides.ts
export const characterSceneOverrideKeys = { ... };
export function useCharacterSceneOverrides(characterId: number);
export function useBulkUpdateCharacterSceneOverrides(characterId: number);
export function useToggleCharacterSceneOverride(characterId: number);
export function useRemoveCharacterSceneOverride(characterId: number);
```

**Acceptance Criteria:**
- [ ] All hooks follow query key factory pattern
- [ ] Mutations invalidate relevant queries on success
- [ ] All API paths match the registered backend routes
- [ ] Hooks use the shared `api` client from `@/lib/api.ts`
- [ ] Named exports only (no default exports)

### Task 5.3: Create `SceneCatalogList` component
**File:** `apps/frontend/src/features/scene-catalog/SceneCatalogList.tsx`

Table view of all scene catalog entries with track badges.

**Acceptance Criteria:**
- [ ] Table columns: Name, Description, Tracks (as color-coded badges), Transition (icon), Status (active/inactive), Sort Order
- [ ] Track badges use distinct colors per track (e.g., blue for clothed, pink for topless)
- [ ] Rows sortable by name and sort_order
- [ ] Filter controls: by track, by active/inactive, by has_transition
- [ ] Search input for scene name
- [ ] Inline toggle for active/inactive status
- [ ] "Add Scene" button opens the create form (Task 5.4)
- [ ] "Manage Tracks" button opens the track manager (Task 5.5)
- [ ] Uses design system components: Table, Badge, Toggle, Input
- [ ] Reuses `useSceneCatalog` hook for data fetching

### Task 5.4: Create `SceneCatalogForm` component
**File:** `apps/frontend/src/features/scene-catalog/SceneCatalogForm.tsx`

Slide-out panel or modal for creating/editing scene catalog entries.

**Acceptance Criteria:**
- [ ] Fields: Name, Slug (auto-generated from name, editable on create, read-only after), Description, Tracks (multi-select checkboxes), Has Clothes-Off Transition (toggle), Sort Order, Active (toggle)
- [ ] Slug auto-generation: lowercases, replaces spaces with underscores, strips special characters
- [ ] Validation with React Hook Form + Zod: name required, at least one track selected
- [ ] Edit mode pre-fills all fields, slug read-only
- [ ] Save triggers API call and refreshes the list
- [ ] Uses design system components: Input, Select, Toggle, Modal/Drawer
- [ ] Uses `useCreateSceneCatalogEntry` or `useUpdateSceneCatalogEntry` hooks

### Task 5.5: Create `TrackManager` component
**File:** `apps/frontend/src/features/scene-catalog/TrackManager.tsx`

Inline section or modal for managing tracks.

**Acceptance Criteria:**
- [ ] List of tracks with: Name, Slug, Sort Order, Active toggle
- [ ] Add new track form with name and slug fields
- [ ] Edit track name and sort order (slug read-only after creation)
- [ ] Deactivate track toggle (cannot delete)
- [ ] Warning dialog when deactivating a track that has scene assignments
- [ ] Uses `useTracks`, `useCreateTrack`, `useUpdateTrack` hooks
- [ ] Uses design system components: Table, Input, Toggle, Modal

### Task 5.6: Create `TrackBadge` component
**File:** `apps/frontend/src/features/scene-catalog/TrackBadge.tsx`

Reusable badge component for displaying track labels with consistent colors.

**Acceptance Criteria:**
- [ ] Accepts `track: Track` or `name: string` + `slug: string` props
- [ ] Color mapping: clothed=blue, topless=pink, custom tracks get deterministic colors from slug hash
- [ ] Uses design system `Badge` primitive with track-specific color variant
- [ ] Exported for reuse in other features (scene-types, project settings, character settings)

### Task 5.7: Create barrel export
**File:** `apps/frontend/src/features/scene-catalog/index.ts`

**Acceptance Criteria:**
- [ ] Barrel exports all public components: `SceneCatalogList`, `SceneCatalogForm`, `TrackManager`, `TrackBadge`
- [ ] Named exports only

---

## Phase 6: Frontend — Project & Character Scene Settings

### Task 6.1: Create `ProjectSceneSettings` component
**File:** `apps/frontend/src/features/scene-catalog/ProjectSceneSettings.tsx`

Scene enablement panel for project settings/detail page.

**Acceptance Criteria:**
- [ ] Displays all catalog scenes as a checklist/toggle grid
- [ ] Each row shows: scene name, track badges (reuse `TrackBadge`), enabled toggle
- [ ] Rows grouped or filterable by track
- [ ] Bulk actions: "Enable All", "Disable All", "Reset to Catalog Defaults"
- [ ] Visual indicator when a scene deviates from catalog default (e.g., bold or highlight)
- [ ] Summary bar: "X of Y scenes enabled"
- [ ] Changes saved via bulk PUT endpoint using `useBulkUpdateProjectSceneSettings`
- [ ] Uses `useProjectSceneSettings` hook for data fetching

### Task 6.2: Create `CharacterSceneOverrides` component
**File:** `apps/frontend/src/features/scene-catalog/CharacterSceneOverrides.tsx`

Scene override panel for character detail page.

**Acceptance Criteria:**
- [ ] Displays all catalog scenes with effective enabled state from three-level merge
- [ ] Each row shows: scene name, track badges, effective state, source indicator (catalog/project/character)
- [ ] Toggle to override: clicking flips from "inherited" to "character override"
- [ ] "Reset" button per scene to remove the override and revert to project default
- [ ] Bulk action: "Reset All to Project Defaults" using `useRemoveCharacterSceneOverride`
- [ ] Visual distinction: inherited rows dimmed, overrides bold/highlighted
- [ ] Uses `useCharacterSceneOverrides` hook for data fetching

### Task 6.3: Update `variant_applicability` references in frontend
**Files:**
- `apps/frontend/src/features/scene-types/types.ts` — remove `variant_applicability` field and `VARIANT_OPTIONS` constant
- `apps/frontend/src/features/scene-types/SceneTypeEditor.tsx` — remove variant selector, add reference to track system
- `apps/frontend/src/features/scene-types/__tests__/SceneTypeEditor.test.tsx` — update tests

**Acceptance Criteria:**
- [ ] `VARIANT_OPTIONS` constant removed from `types.ts`
- [ ] `variant_applicability` field removed from `SceneType`, `CreateSceneType`, `UpdateSceneType` interfaces
- [ ] `SceneTypeEditor.tsx` no longer renders a variant applicability selector
- [ ] Tests updated to reflect removal
- [ ] All TypeScript compiles without errors

---

## Phase 7: Integration Tests

### Task 7.1: DB-level track and scene catalog tests
**File:** `apps/backend/crates/db/tests/scene_catalog.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_track(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_tracks_active_only(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_scene_catalog_entry_with_tracks(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_scene_catalog_with_tracks(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_set_tracks_replaces_existing(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_add_remove_track_from_scene(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_deactivate_scene_catalog_entry(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_slug_unique_constraint(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Creating a track returns correct fields
- [ ] `list` with `include_inactive=false` excludes deactivated tracks
- [ ] Creating a scene catalog entry with track_ids populates junction table
- [ ] `list_with_tracks` returns entries with correct tracks populated
- [ ] `set_tracks` replaces existing junction rows
- [ ] `add_track` / `remove_track` modify junction correctly
- [ ] Deactivating a scene sets `is_active = false` without removing it
- [ ] Duplicate slug insertion violates unique constraint
- [ ] All tests pass

### Task 7.2: DB-level project scene settings tests
**File:** `apps/backend/crates/db/tests/project_scene_settings.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_effective_defaults_to_catalog(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_upsert_project_scene_setting(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_bulk_upsert_project_scene_settings(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_reverts_to_catalog_default(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Without any project settings, `list_effective` returns all catalog entries with `source = "catalog_default"`
- [ ] After upserting a setting, `list_effective` shows `source = "project_override"`
- [ ] Bulk upsert applies multiple settings in one transaction
- [ ] Deleting a setting reverts that scene to catalog default
- [ ] All tests pass

### Task 7.3: DB-level character scene override tests
**File:** `apps/backend/crates/db/tests/character_scene_overrides.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_effective_inherits_from_project(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_character_override_takes_precedence(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_three_level_merge(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_override_reverts_to_project(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_all_overrides(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Without overrides, character inherits project settings (or catalog defaults)
- [ ] Character override takes precedence over project setting
- [ ] Three-level merge correctly reports `source` at each level
- [ ] Deleting an override reverts to project setting
- [ ] `delete_all` removes all overrides for a character
- [ ] All tests pass

### Task 7.4: API-level scene catalog endpoint tests
**File:** `apps/backend/crates/api/tests/scene_catalog_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_scene_catalog(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_scene_catalog_entry(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_scene_catalog_entry(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_scene_catalog_entry(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_deactivate_scene_catalog_entry(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_add_remove_track(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_tracks(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_track(pool: PgPool);
```

Uses `common::build_test_app` and shared HTTP helpers (`post_json`, `get`, `put_json`, `delete`, `body_json`).

**Acceptance Criteria:**
- [ ] `GET /scene-catalog` returns seeded entries with tracks
- [ ] `POST /scene-catalog` creates entry with track assignments, returns 201
- [ ] `GET /scene-catalog/{id}` returns entry with tracks or 404
- [ ] `PUT /scene-catalog/{id}` updates entry fields and optionally replaces tracks
- [ ] `DELETE /scene-catalog/{id}` sets `is_active = false`, returns 204
- [ ] `POST /scene-catalog/{id}/tracks` adds tracks, returns 201
- [ ] `DELETE /scene-catalog/{id}/tracks/{track_id}` removes track, returns 204
- [ ] `GET /tracks` returns seeded tracks
- [ ] `POST /tracks` creates new track, returns 201
- [ ] All tests pass

### Task 7.5: Update existing tests for `variant_applicability` removal
**Files:**
- `apps/backend/crates/db/tests/entity_crud.rs`
- `apps/backend/crates/api/tests/entity_api.rs`
- `apps/backend/crates/db/tests/scene_video_version.rs`
- `apps/backend/crates/api/tests/scene_video_version_api.rs`

Remove all references to `variant_applicability` from test code.

**Acceptance Criteria:**
- [ ] All `CreateSceneType` test values no longer include `variant_applicability`
- [ ] All assertions on `SceneType` no longer check `variant_applicability`
- [ ] Matrix generation tests updated to use track-based approach
- [ ] All existing tests pass after migration

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260225000001_create_tracks.sql` | Tracks table migration |
| `apps/db/migrations/20260225000002_create_scene_catalog.sql` | Scene catalog table migration |
| `apps/db/migrations/20260225000003_create_scene_catalog_tracks.sql` | Junction table migration with seed data |
| `apps/db/migrations/20260225000004_create_project_scene_settings.sql` | Project scene settings table |
| `apps/db/migrations/20260225000005_create_character_scene_overrides.sql` | Character scene overrides table |
| `apps/db/migrations/20260225000006_drop_variant_applicability.sql` | Drop replaced column |
| `apps/backend/crates/db/src/models/track.rs` | Track model structs |
| `apps/backend/crates/db/src/models/scene_catalog.rs` | SceneCatalogEntry model structs |
| `apps/backend/crates/db/src/models/project_scene_setting.rs` | ProjectSceneSetting model structs |
| `apps/backend/crates/db/src/models/character_scene_override.rs` | CharacterSceneOverride model structs |
| `apps/backend/crates/db/src/models/scene_type.rs` | Remove variant_applicability field |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model modules |
| `apps/backend/crates/db/src/repositories/track_repo.rs` | Track repository |
| `apps/backend/crates/db/src/repositories/scene_catalog_repo.rs` | Scene catalog repository with junction methods |
| `apps/backend/crates/db/src/repositories/project_scene_setting_repo.rs` | Project scene settings repository |
| `apps/backend/crates/db/src/repositories/character_scene_override_repo.rs` | Character scene overrides repository |
| `apps/backend/crates/db/src/repositories/scene_type_repo.rs` | Remove variant_applicability from COLUMNS and queries |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo modules |
| `apps/backend/crates/core/src/scene_type_config.rs` | Update expand_variants, add expand_tracks |
| `apps/backend/crates/api/src/handlers/scene_catalog.rs` | Scene catalog API handlers |
| `apps/backend/crates/api/src/handlers/track.rs` | Track API handlers |
| `apps/backend/crates/api/src/handlers/project_scene_settings.rs` | Project scene settings handlers |
| `apps/backend/crates/api/src/handlers/character_scene_overrides.rs` | Character scene overrides handlers |
| `apps/backend/crates/api/src/handlers/scene_type.rs` | Update matrix generation to use tracks |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register new handler modules |
| `apps/backend/crates/api/src/lib.rs` | Register new routes |
| `apps/frontend/src/features/scene-catalog/types.ts` | TypeScript types |
| `apps/frontend/src/features/scene-catalog/hooks/use-scene-catalog.ts` | Scene catalog query hooks |
| `apps/frontend/src/features/scene-catalog/hooks/use-tracks.ts` | Track query hooks |
| `apps/frontend/src/features/scene-catalog/hooks/use-project-scene-settings.ts` | Project scene settings hooks |
| `apps/frontend/src/features/scene-catalog/hooks/use-character-scene-overrides.ts` | Character scene override hooks |
| `apps/frontend/src/features/scene-catalog/SceneCatalogList.tsx` | Catalog list view |
| `apps/frontend/src/features/scene-catalog/SceneCatalogForm.tsx` | Create/edit form |
| `apps/frontend/src/features/scene-catalog/TrackManager.tsx` | Track management panel |
| `apps/frontend/src/features/scene-catalog/TrackBadge.tsx` | Reusable track badge component |
| `apps/frontend/src/features/scene-catalog/ProjectSceneSettings.tsx` | Project scene enablement UI |
| `apps/frontend/src/features/scene-catalog/CharacterSceneOverrides.tsx` | Character scene override UI |
| `apps/frontend/src/features/scene-catalog/index.ts` | Barrel export |
| `apps/frontend/src/features/scene-types/types.ts` | Remove variant_applicability |
| `apps/frontend/src/features/scene-types/SceneTypeEditor.tsx` | Remove variant selector |
| `apps/backend/crates/db/tests/scene_catalog.rs` | DB-level catalog tests |
| `apps/backend/crates/db/tests/project_scene_settings.rs` | DB-level project settings tests |
| `apps/backend/crates/db/tests/character_scene_overrides.rs` | DB-level character override tests |
| `apps/backend/crates/api/tests/scene_catalog_api.rs` | API-level catalog endpoint tests |

---

## Dependencies

### Existing Components to Reuse
- `x121_db::repositories::*` — CRUD pattern (zero-sized struct, `COLUMNS` const, `&PgPool`)
- `x121_db::models::*` — Three-struct pattern (entity/create/update)
- `x121_core::types::{DbId, Timestamp}` — Shared type aliases
- `x121_core::error::CoreError` — Domain error variants (NotFound, Conflict, Validation)
- `x121_api::error::{AppError, AppResult}` — HTTP error mapping
- `x121_api::state::AppState` — Shared app state with `pool: PgPool`
- `x121_api::response::DataResponse` — Standard `{ data }` envelope
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete`
- Design system: `Badge`, `Table`, `Toggle`, `Input`, `Select`, `Modal/Drawer`
- `@/lib/api.ts` — Shared API client
- `apps/frontend/src/features/scene-types/hooks/use-scene-types.ts` — Query key factory pattern

### New Infrastructure Needed
- `tracks` table + model + repository + handler
- `scene_catalog` table + model + repository + handler
- `scene_catalog_tracks` junction table + repository methods
- `project_scene_settings` table + model + repository + handler
- `character_scene_overrides` table + model + repository + handler
- Three-level merge query logic (catalog → project → character)
- `TrackBadge` reusable component
- Frontend feature module: `scene-catalog`

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations — Tasks 1.1–1.5 (defer Task 1.6 until Phase 4 complete)
2. Phase 2: Rust Models — Tasks 2.1–2.4
3. Phase 3: Rust Repositories — Tasks 3.1–3.4
4. Phase 4: Backend API Handlers — Tasks 4.1–4.5, then Task 4.6 + Phase 1 Task 1.6 + Phase 2 Task 2.5
5. Phase 5: Frontend Scene Catalog — Tasks 5.1–5.7
6. Phase 6: Frontend Project & Character Settings — Tasks 6.1–6.3
7. Phase 7: Integration Tests — Tasks 7.1–7.5

**Critical ordering note:** Task 1.6 (drop `variant_applicability`) must run AFTER Tasks 2.5 and 4.6 (code updates to remove all references to that column). Run the migration last to avoid breaking existing code.

**MVP Success Criteria:**
- Scene catalog page loads with all seeded scenes and track badges in <500ms
- Adding a new scene with track assignments takes <30 seconds
- Adding a new track takes <15 seconds
- Track toggle on an existing scene is a single click
- Zero data loss during `variant_applicability` migration
- Frontend renders correct track badges for all scenes
- Project scene settings load with correct effective state in <500ms
- Character scene overrides correctly show source (catalog/project/character)
- Bulk enable/disable across all scenes completes in a single API call

### Post-MVP Enhancements
- Scene catalog bulk import from CSV/JSON (PRD-111 Req 2.1)
- Track-based file naming integration with delivery (PRD-111 Req 2.2)
- Scene type linking to scene catalog entries (PRD-111 Req 2.3)
- Scene catalog categories/grouping

---

## Notes

1. **Migration ordering matters:** Tasks 1.1–1.5 must run before Task 1.6. The code changes (Task 2.5, 4.6, 6.3) that remove `variant_applicability` references must happen before the migration that drops the column.
2. **Seed data accuracy:** The 26 scene concepts and their track assignments in Tasks 1.2 and 1.3 match the PRD Section 8 table exactly. Verify the clothed/topless assignments against the production content matrix.
3. **Three-level merge performance:** The `list_effective` query for characters uses two LEFT JOINs which should be fast with the FK indexes. No caching needed for MVP.
4. **Slug immutability enforcement:** Slug immutability is enforced in the Rust `UpdateTrack` and `UpdateSceneCatalogEntry` DTOs (field omitted) and optionally via a DB trigger for defense-in-depth.
5. **Track deactivation cascade:** Deactivating a track does NOT remove junction rows or affect existing generated scenes. It only prevents the track from appearing in "active" lists and new assignments.
6. **`variant_applicability` backward compat:** During the transition period (between adding tracks and dropping the column), both systems coexist. The scene type handler's `generate_matrix` endpoint continues using `expand_variants()` until tracks are wired in.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-111
