# Task List: Project, Character & Scene Data Model

**PRD Reference:** `design/prds/001-prd-project-character-scene-data-model.md`
**Scope:** Create the core entity hierarchy (Projects, Characters, Source Images, Derived Images, Image Variants, Scene Types, Scenes, Segments) with full CRUD operations, naming convention enforcement, and delivery ZIP structure definition.

## Overview

This PRD defines the foundational data model that every other PRD depends on. We build the complete entity hierarchy in PostgreSQL using the conventions from PRD-000 (BIGSERIAL PKs, BIGINT FKs, TIMESTAMPTZ, status lookup tables, FK indexes). On the Rust side, we create SQLx models, repository modules, and Axum API endpoints for each entity. The naming convention logic and delivery ZIP structure are implemented as pure Rust utility functions with comprehensive tests.

### What Already Exists
- PRD-000 infrastructure: Cargo workspace, SQLx migrations, `DbId = i64`, status lookup tables (`project_statuses`, `scene_statuses`, `segment_statuses`), `trigger_set_updated_at()` function
- Database connection pool and health check in `src/db.rs`
- Configuration module in `src/config.rs`

### What We're Building
1. Database migrations for 8 entity tables: `projects`, `characters`, `source_images`, `derived_images`, `image_variants`, `scene_types`, `scenes`, `segments`
2. Additional status lookup tables: `character_statuses`, `image_variant_statuses`, `scene_type_statuses`
3. Rust model structs for all entities
4. Repository layer with CRUD operations for each entity
5. Axum REST API endpoints with hierarchical routing
6. Naming convention engine for scene video file names
7. Delivery ZIP structure definition and validation

### Key Design Decisions
1. **Hierarchical ownership via CASCADE** — Deleting a project cascades to characters, scenes, segments. This matches the production workflow where a project is the unit of lifecycle management.
2. **Scene = Character + Scene Type + Image Variant** — Scenes are uniquely identified by this triple. A composite unique constraint enforces this at the database level.
3. **Naming convention as pure function** — The video naming logic is a stateless function that takes entity properties and returns the filename. No database queries needed, easy to test.
4. **Status via lookup tables** — All entity statuses reference their respective `{domain}_statuses` table, following PRD-000 conventions.

---

## Phase 1: Database Migrations — Entity Tables

### Task 1.1: Create Character and Image Status Lookup Tables
**File:** `migrations/20260218100001_create_entity_status_tables.sql`

Create additional status lookup tables needed for the entity model that were not already created in PRD-000.

```sql
-- Character statuses
CREATE TABLE character_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON character_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO character_statuses (name, description) VALUES
    ('draft', 'Character is being set up'),
    ('active', 'Character is ready for scene generation'),
    ('archived', 'Character is archived');

-- Image variant statuses
CREATE TABLE image_variant_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON image_variant_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO image_variant_statuses (name, description) VALUES
    ('pending', 'Variant is awaiting review'),
    ('approved', 'Variant has been approved for use'),
    ('rejected', 'Variant has been rejected');

-- Scene type statuses
CREATE TABLE scene_type_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON scene_type_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO scene_type_statuses (name, description) VALUES
    ('draft', 'Scene type is being configured'),
    ('active', 'Scene type is ready for use'),
    ('deprecated', 'Scene type is no longer used');
```

**Acceptance Criteria:**
- [ ] `character_statuses`, `image_variant_statuses`, `scene_type_statuses` tables created with BIGSERIAL PK
- [ ] All tables have `created_at`, `updated_at` with TIMESTAMPTZ and trigger
- [ ] Seed data inserted for all three tables
- [ ] Migration applies cleanly via `sqlx migrate run`

### Task 1.2: Create Projects Table
**File:** `migrations/20260218100002_create_projects_table.sql`

Create the top-level projects entity table.

```sql
CREATE TABLE projects (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status_id BIGINT NOT NULL REFERENCES project_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    retention_days INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_status_id ON projects(status_id);
CREATE UNIQUE INDEX uq_projects_name ON projects(name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `projects` table created with `id BIGSERIAL PRIMARY KEY`
- [ ] `status_id BIGINT NOT NULL` references `project_statuses(id)` with `ON DELETE RESTRICT`
- [ ] `name TEXT NOT NULL` with unique constraint
- [ ] FK index `idx_projects_status_id` created
- [ ] `updated_at` trigger attached
- [ ] Migration applies cleanly

### Task 1.3: Create Characters Table
**File:** `migrations/20260218100003_create_characters_table.sql`

Create the characters table, belonging to a project.

```sql
CREATE TABLE characters (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    status_id BIGINT NOT NULL REFERENCES character_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_characters_project_id ON characters(project_id);
CREATE INDEX idx_characters_status_id ON characters(status_id);
CREATE UNIQUE INDEX uq_characters_project_id_name ON characters(project_id, name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON characters
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `characters` table with `project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
- [ ] Unique constraint on `(project_id, name)` — character names unique within a project
- [ ] FK indexes on `project_id` and `status_id`
- [ ] `metadata JSONB` column for structured character data
- [ ] `updated_at` trigger attached

### Task 1.4: Create Source Images, Derived Images, and Image Variants Tables
**File:** `migrations/20260218100004_create_image_tables.sql`

Create the three image-related tables for character imagery.

```sql
-- Source images: original/ground-truth reference images
CREATE TABLE source_images (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    file_path TEXT NOT NULL,
    description TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_source_images_character_id ON source_images(character_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON source_images
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Derived images: generated variants of a source image (e.g., clothed from topless)
CREATE TABLE derived_images (
    id BIGSERIAL PRIMARY KEY,
    source_image_id BIGINT NOT NULL REFERENCES source_images(id) ON DELETE CASCADE ON UPDATE CASCADE,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    file_path TEXT NOT NULL,
    variant_type TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_derived_images_source_image_id ON derived_images(source_image_id);
CREATE INDEX idx_derived_images_character_id ON derived_images(character_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON derived_images
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Image variants: the set of available seed images with approval status
CREATE TABLE image_variants (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    source_image_id BIGINT REFERENCES source_images(id) ON DELETE SET NULL ON UPDATE CASCADE,
    derived_image_id BIGINT REFERENCES derived_images(id) ON DELETE SET NULL ON UPDATE CASCADE,
    variant_label TEXT NOT NULL,
    status_id BIGINT NOT NULL REFERENCES image_variant_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_image_variants_character_id ON image_variants(character_id);
CREATE INDEX idx_image_variants_source_image_id ON image_variants(source_image_id);
CREATE INDEX idx_image_variants_derived_image_id ON image_variants(derived_image_id);
CREATE INDEX idx_image_variants_status_id ON image_variants(status_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON image_variants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `source_images` table with `character_id` FK cascading on delete
- [ ] `derived_images` table with FKs to both `source_images` and `characters`
- [ ] `image_variants` table with `status_id` referencing `image_variant_statuses`
- [ ] All FK columns indexed
- [ ] All tables have `updated_at` triggers
- [ ] `is_primary BOOLEAN NOT NULL DEFAULT false` on source images

### Task 1.5: Create Scene Types Table
**File:** `migrations/20260218100005_create_scene_types_table.sql`

Create the scene types table for reusable generation recipes.

```sql
CREATE TABLE scene_types (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    status_id BIGINT NOT NULL REFERENCES scene_type_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    workflow_json JSONB,
    lora_config JSONB,
    prompt_template TEXT,
    target_duration_secs INTEGER,
    segment_duration_secs INTEGER,
    variant_applicability TEXT NOT NULL DEFAULT 'both',
    transition_segment_index INTEGER,
    is_studio_level BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scene_types_project_id ON scene_types(project_id);
CREATE INDEX idx_scene_types_status_id ON scene_types(status_id);
CREATE UNIQUE INDEX uq_scene_types_project_id_name ON scene_types(project_id, name) WHERE project_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON scene_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `scene_types` table with optional `project_id` (NULL = studio-level)
- [ ] `workflow_json JSONB` for ComfyUI workflow storage
- [ ] `lora_config JSONB` for model configuration
- [ ] `variant_applicability TEXT NOT NULL DEFAULT 'both'` — values: clothed, topless, both, clothes_off
- [ ] `transition_segment_index INTEGER` for clothes_off boundary
- [ ] Partial unique index on `(project_id, name)` where `project_id IS NOT NULL`
- [ ] All FK columns indexed

### Task 1.6: Create Scenes Table
**File:** `migrations/20260218100006_create_scenes_table.sql`

Create the scenes table — concrete instances of Character + Scene Type + Image Variant.

```sql
CREATE TABLE scenes (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    image_variant_id BIGINT NOT NULL REFERENCES image_variants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id BIGINT NOT NULL REFERENCES scene_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    transition_mode TEXT NOT NULL DEFAULT 'normal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenes_character_id ON scenes(character_id);
CREATE INDEX idx_scenes_scene_type_id ON scenes(scene_type_id);
CREATE INDEX idx_scenes_image_variant_id ON scenes(image_variant_id);
CREATE INDEX idx_scenes_status_id ON scenes(status_id);
CREATE UNIQUE INDEX uq_scenes_character_scene_type_variant ON scenes(character_id, scene_type_id, image_variant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON scenes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `scenes` table with composite unique constraint on `(character_id, scene_type_id, image_variant_id)`
- [ ] FKs: `character_id` CASCADE, `scene_type_id` RESTRICT, `image_variant_id` RESTRICT
- [ ] `status_id` references `scene_statuses` from PRD-000
- [ ] `transition_mode TEXT NOT NULL DEFAULT 'normal'` — values: normal, clothes_off
- [ ] All FK columns indexed

### Task 1.7: Create Segments Table
**File:** `migrations/20260218100007_create_segments_table.sql`

Create the segments table — individual video clips within a scene.

```sql
CREATE TABLE segments (
    id BIGSERIAL PRIMARY KEY,
    scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    sequence_index INTEGER NOT NULL,
    status_id BIGINT NOT NULL REFERENCES segment_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    seed_frame_path TEXT,
    output_video_path TEXT,
    last_frame_path TEXT,
    quality_scores JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segments_scene_id ON segments(scene_id);
CREATE INDEX idx_segments_status_id ON segments(status_id);
CREATE UNIQUE INDEX uq_segments_scene_id_sequence_index ON segments(scene_id, sequence_index);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON segments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `segments` table with `scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE`
- [ ] `sequence_index INTEGER NOT NULL` with unique constraint per scene
- [ ] `status_id` references `segment_statuses` from PRD-000
- [ ] File path columns: `seed_frame_path`, `output_video_path`, `last_frame_path` as `TEXT`
- [ ] `quality_scores JSONB` for auto-QA metadata
- [ ] All FK columns indexed

---

## Phase 2: Rust Model Structs

### Task 2.1: Define Entity Model Structs
**File:** `src/models/mod.rs`, `src/models/project.rs`, `src/models/character.rs`, `src/models/image.rs`, `src/models/scene_type.rs`, `src/models/scene.rs`, `src/models/segment.rs`

Create Rust structs that map to each database table using SQLx's `FromRow` derive macro.

```rust
// src/models/project.rs
use sqlx::FromRow;
use crate::types::DbId;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, FromRow)]
pub struct Project {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub status_id: DbId,
    pub retention_days: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CreateProject {
    pub name: String,
    pub description: Option<String>,
    pub status_id: DbId,
    pub retention_days: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status_id: Option<DbId>,
    pub retention_days: Option<i32>,
}
```

```rust
// src/models/scene.rs
use sqlx::FromRow;
use crate::types::DbId;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, FromRow)]
pub struct Scene {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub image_variant_id: DbId,
    pub status_id: DbId,
    pub transition_mode: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

```rust
// src/models/segment.rs
use sqlx::FromRow;
use crate::types::DbId;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, FromRow)]
pub struct Segment {
    pub id: DbId,
    pub scene_id: DbId,
    pub sequence_index: i32,
    pub status_id: DbId,
    pub seed_frame_path: Option<String>,
    pub output_video_path: Option<String>,
    pub last_frame_path: Option<String>,
    pub quality_scores: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model structs defined for: `Project`, `Character`, `SourceImage`, `DerivedImage`, `ImageVariant`, `SceneType`, `Scene`, `Segment`
- [ ] All `id` and FK fields use `DbId` type alias
- [ ] All timestamp fields use `DateTime<Utc>`
- [ ] Optional fields use `Option<T>`
- [ ] JSONB columns use `Option<serde_json::Value>`
- [ ] `Create*` and `Update*` DTOs defined for each entity
- [ ] `chrono` and `serde_json` added to `Cargo.toml` dependencies

### Task 2.2: Define Status Helper Enum Mappings
**File:** `src/models/status.rs`

Create helper enums that map to status lookup table IDs for type-safe status handling in Rust.

```rust
use crate::types::DbId;

/// Maps to project_statuses lookup table.
/// IDs must match the seed data from PRD-000.
pub enum ProjectStatus {
    Draft = 1,
    Active = 2,
    Paused = 3,
    Completed = 4,
    Archived = 5,
}

impl ProjectStatus {
    pub fn id(&self) -> DbId {
        *self as DbId
    }
}

pub enum SegmentStatus {
    Pending = 1,
    Generating = 2,
    Generated = 3,
    Failed = 4,
    Approved = 5,
    Rejected = 6,
}

impl SegmentStatus {
    pub fn id(&self) -> DbId {
        *self as DbId
    }
}
```

**Acceptance Criteria:**
- [ ] Status enums defined for: `ProjectStatus`, `CharacterStatus`, `ImageVariantStatus`, `SceneTypeStatus`, `SceneStatus`, `SegmentStatus`
- [ ] Each variant's discriminant matches the seed data ID from the migrations
- [ ] `id()` method returns `DbId` for use in queries
- [ ] Enums are `#[repr(i64)]` for safe casting

---

## Phase 3: Repository Layer

### Task 3.1: Project Repository
**File:** `src/repositories/project_repo.rs`

Implement CRUD operations for the `projects` table using SQLx.

```rust
use sqlx::PgPool;
use crate::models::project::{Project, CreateProject, UpdateProject};
use crate::types::DbId;

pub struct ProjectRepo;

impl ProjectRepo {
    pub async fn create(pool: &PgPool, input: &CreateProject) -> Result<Project, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "INSERT INTO projects (name, description, status_id, retention_days)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, description, status_id, retention_days, created_at, updated_at"
        )
        .bind(&input.name)
        .bind(&input.description)
        .bind(input.status_id)
        .bind(input.retention_days)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, description, status_id, retention_days, created_at, updated_at
             FROM projects WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    pub async fn list(pool: &PgPool) -> Result<Vec<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, description, status_id, retention_days, created_at, updated_at
             FROM projects ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM projects WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
```

**Acceptance Criteria:**
- [ ] `create`, `find_by_id`, `list`, `update`, `delete` operations implemented
- [ ] All queries specify columns explicitly (no `SELECT *`)
- [ ] All ID parameters use `DbId` type
- [ ] Returns `Result<T, sqlx::Error>` — no panics
- [ ] `find_by_id` returns `Option` for not-found case

### Task 3.2: Character Repository
**File:** `src/repositories/character_repo.rs`

Implement CRUD for characters with project-scoped queries.

```rust
pub async fn list_by_project(pool: &PgPool, project_id: DbId) -> Result<Vec<Character>, sqlx::Error> {
    sqlx::query_as::<_, Character>(
        "SELECT id, project_id, name, status_id, metadata, created_at, updated_at
         FROM characters WHERE project_id = $1 ORDER BY name"
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] CRUD operations scoped to `project_id` where appropriate
- [ ] `list_by_project` returns characters for a specific project
- [ ] All queries use explicit column lists
- [ ] JSONB metadata field properly handled with `serde_json::Value`

### Task 3.3: Scene and Segment Repositories
**File:** `src/repositories/scene_repo.rs`, `src/repositories/segment_repo.rs`

Implement CRUD for scenes (scoped to character) and segments (scoped to scene).

```rust
// scene_repo.rs
pub async fn list_by_character(
    pool: &PgPool,
    character_id: DbId,
) -> Result<Vec<Scene>, sqlx::Error> {
    sqlx::query_as::<_, Scene>(
        "SELECT id, character_id, scene_type_id, image_variant_id, status_id,
                transition_mode, created_at, updated_at
         FROM scenes WHERE character_id = $1 ORDER BY created_at"
    )
    .bind(character_id)
    .fetch_all(pool)
    .await
}

// segment_repo.rs
pub async fn list_by_scene(
    pool: &PgPool,
    scene_id: DbId,
) -> Result<Vec<Segment>, sqlx::Error> {
    sqlx::query_as::<_, Segment>(
        "SELECT id, scene_id, sequence_index, status_id, seed_frame_path,
                output_video_path, last_frame_path, quality_scores, created_at, updated_at
         FROM segments WHERE scene_id = $1 ORDER BY sequence_index"
    )
    .bind(scene_id)
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Scene CRUD: `create`, `find_by_id`, `list_by_character`, `update`, `delete`
- [ ] Segment CRUD: `create`, `find_by_id`, `list_by_scene`, `update`, `delete`
- [ ] Segments ordered by `sequence_index`
- [ ] Repositories for `SourceImage`, `DerivedImage`, `ImageVariant`, `SceneType` also implemented

### Task 3.4: Repository Module Organization
**File:** `src/repositories/mod.rs`

Create the repository module barrel file exposing all repositories.

**Acceptance Criteria:**
- [ ] `mod.rs` re-exports all repository modules
- [ ] Consistent naming: `{entity}_repo.rs`
- [ ] Module is declared in `src/main.rs`

---

## Phase 4: Axum API Endpoints

### Task 4.1: Axum Router Setup
**File:** `src/api/mod.rs`, `src/api/router.rs`

Set up the Axum router with hierarchical route structure and shared application state.

```rust
use axum::{Router, Extension};
use sqlx::PgPool;

pub fn create_router(pool: PgPool) -> Router {
    Router::new()
        .nest("/api/v1/projects", project_routes())
        .layer(Extension(pool))
}

fn project_routes() -> Router {
    Router::new()
        .route("/", axum::routing::get(handlers::project::list).post(handlers::project::create))
        .route("/:id", axum::routing::get(handlers::project::get_by_id)
            .put(handlers::project::update)
            .delete(handlers::project::delete))
        .route("/:id/characters", axum::routing::get(handlers::character::list_by_project)
            .post(handlers::character::create))
        .route("/:id/characters/:character_id", axum::routing::get(handlers::character::get_by_id))
        .route("/:id/characters/:character_id/scenes", axum::routing::get(handlers::scene::list_by_character))
}
```

**Acceptance Criteria:**
- [ ] Axum added to `Cargo.toml` dependencies
- [ ] Router binds `PgPool` as shared state via `Extension` or `State`
- [ ] Hierarchical routes: `/api/v1/projects/:id/characters/:id/scenes/:id/segments`
- [ ] All routes return JSON responses
- [ ] `main.rs` starts the Axum server on a configurable port

### Task 4.2: Project API Handlers
**File:** `src/api/handlers/project.rs`

Implement Axum handler functions for project CRUD.

```rust
use axum::{extract::{Path, State}, Json};
use sqlx::PgPool;
use crate::models::project::{Project, CreateProject};
use crate::repositories::project_repo::ProjectRepo;
use crate::types::DbId;

pub async fn create(
    State(pool): State<PgPool>,
    Json(input): Json<CreateProject>,
) -> Result<Json<Project>, (axum::http::StatusCode, String)> {
    ProjectRepo::create(&pool, &input)
        .await
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_by_id(
    State(pool): State<PgPool>,
    Path(id): Path<DbId>,
) -> Result<Json<Project>, (axum::http::StatusCode, String)> {
    match ProjectRepo::find_by_id(&pool, id).await {
        Ok(Some(project)) => Ok(Json(project)),
        Ok(None) => Err((axum::http::StatusCode::NOT_FOUND, "Project not found".to_string())),
        Err(e) => Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/projects` — create project, returns 201
- [ ] `GET /api/v1/projects` — list all projects
- [ ] `GET /api/v1/projects/:id` — get single project, 404 if not found
- [ ] `PUT /api/v1/projects/:id` — update project
- [ ] `DELETE /api/v1/projects/:id` — delete project with cascade
- [ ] All handlers return proper HTTP status codes
- [ ] Serialization via `serde::Serialize` on all response types

### Task 4.3: Character, Scene, and Segment API Handlers
**File:** `src/api/handlers/character.rs`, `src/api/handlers/scene.rs`, `src/api/handlers/segment.rs`

Implement handlers for all remaining entities following the same pattern as projects.

**Acceptance Criteria:**
- [ ] Character CRUD scoped under projects: `/api/v1/projects/:id/characters`
- [ ] Scene CRUD scoped under characters: `.../:character_id/scenes`
- [ ] Segment CRUD scoped under scenes: `.../:scene_id/segments`
- [ ] Scene Type CRUD: `/api/v1/scene-types` (studio-level) and `/api/v1/projects/:id/scene-types` (project-level)
- [ ] Image endpoints: source images, derived images, image variants under characters
- [ ] Consistent error handling across all handlers

### Task 4.4: API Serialization with Serde
**File:** `src/models/*.rs` (update existing)

Add `Serialize`/`Deserialize` derives and JSON response formatting.

```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Project {
    pub id: DbId,
    pub name: String,
    // ...
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProject {
    pub name: String,
    // ...
}
```

**Acceptance Criteria:**
- [ ] All entity structs derive `Serialize` for JSON responses
- [ ] All `Create*` and `Update*` DTOs derive `Deserialize` for JSON request bodies
- [ ] `serde` and `serde_json` added to `Cargo.toml`
- [ ] DateTime fields serialize to ISO 8601 format
- [ ] Optional fields serialize as `null` when `None`

---

## Phase 5: Naming Convention Engine

### Task 5.1: Implement Scene Video Naming Function
**File:** `src/naming.rs`

Implement the pure function that generates scene video filenames from entity properties.

```rust
/// Scene video naming convention:
/// {prefix_}{content}{_clothes_off}{_index}.mp4
///
/// - prefix_ = "topless_" for topless variant scenes, omitted for clothed
/// - content = lowercase snake_case scene type name
/// - _clothes_off = appended for transition scenes
/// - _index = "_1", "_2", etc. when multiple videos exist for same content
pub fn scene_video_filename(
    variant_label: &str,
    scene_type_name: &str,
    is_clothes_off: bool,
    index: Option<u32>,
) -> String {
    let mut name = String::new();

    // Prefix
    if variant_label == "topless" {
        name.push_str("topless_");
    }

    // Content: lowercase snake_case scene type name
    name.push_str(&scene_type_name.to_lowercase().replace(' ', "_"));

    // Transition suffix
    if is_clothes_off {
        name.push_str("_clothes_off");
    }

    // Index suffix
    if let Some(idx) = index {
        name.push_str(&format!("_{}", idx));
    }

    name.push_str(".mp4");
    name
}
```

**Acceptance Criteria:**
- [ ] `scene_video_filename` is a pure function — no database queries, no side effects
- [ ] Prefix: "topless_" for topless variant, empty for clothed
- [ ] Content: lowercase snake_case scene type name
- [ ] Suffix: "_clothes_off" when transition mode is clothes_off
- [ ] Index: "_1", "_2" etc. when multiple videos exist
- [ ] Returns complete filename with `.mp4` extension

### Task 5.2: Naming Convention Unit Tests
**File:** `src/naming.rs` (tests module) or `tests/naming_tests.rs`

Comprehensive tests covering all naming convention variants.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clothed_simple() {
        assert_eq!(
            scene_video_filename("clothed", "Dance", false, None),
            "dance.mp4"
        );
    }

    #[test]
    fn test_topless_simple() {
        assert_eq!(
            scene_video_filename("topless", "Dance", false, None),
            "topless_dance.mp4"
        );
    }

    #[test]
    fn test_clothes_off_transition() {
        assert_eq!(
            scene_video_filename("clothed", "Dance", true, None),
            "dance_clothes_off.mp4"
        );
    }

    #[test]
    fn test_indexed() {
        assert_eq!(
            scene_video_filename("clothed", "Idle", false, Some(2)),
            "idle_2.mp4"
        );
    }

    #[test]
    fn test_topless_clothes_off_indexed() {
        assert_eq!(
            scene_video_filename("topless", "Slow Walk", true, Some(1)),
            "topless_slow_walk_clothes_off_1.mp4"
        );
    }

    #[test]
    fn test_multi_word_scene_type() {
        assert_eq!(
            scene_video_filename("clothed", "Hair Flip Idle", false, None),
            "hair_flip_idle.mp4"
        );
    }
}
```

**Acceptance Criteria:**
- [ ] Tests cover: clothed simple, topless simple, clothes_off, indexed, topless+clothes_off+indexed, multi-word scene types
- [ ] All tests pass with `cargo test`
- [ ] Edge cases: empty scene type name, special characters in name

---

## Phase 6: Delivery ZIP Structure

### Task 6.1: Define Delivery Structure Types
**File:** `src/delivery.rs`

Define the delivery ZIP folder structure as Rust types and implement a validation function.

```rust
/// Represents the delivery ZIP structure for a project.
/// project_name/
///   character_name/
///     metadata.json
///     clothed.png
///     topless.png
///     dance.mp4
///     topless_dance.mp4
///     ...
pub struct DeliveryManifest {
    pub project_name: String,
    pub characters: Vec<CharacterDelivery>,
}

pub struct CharacterDelivery {
    pub character_name: String,
    pub metadata_json: String,
    pub clothed_image: String,
    pub topless_image: String,
    pub scene_videos: Vec<String>,
}

impl DeliveryManifest {
    /// Validate that all expected files are present.
    pub fn validate(&self) -> Vec<String> {
        let mut errors = Vec::new();
        for character in &self.characters {
            if character.scene_videos.is_empty() {
                errors.push(format!("{}: no scene videos", character.character_name));
            }
            // Additional validation...
        }
        errors
    }
}
```

**Acceptance Criteria:**
- [ ] `DeliveryManifest` and `CharacterDelivery` structs capture the full ZIP structure
- [ ] `validate()` method checks: metadata.json present, images present, at least one video
- [ ] Video filenames are generated using the naming convention function from Task 5.1
- [ ] Validation returns a list of human-readable error messages

### Task 6.2: Delivery Structure Tests
**File:** `tests/delivery_tests.rs`

Test that the delivery structure validation works correctly.

**Acceptance Criteria:**
- [ ] Test: valid manifest passes validation
- [ ] Test: missing metadata.json produces error
- [ ] Test: missing images produce error
- [ ] Test: empty scene videos produce error
- [ ] Test: video filenames match naming convention

---

## Phase 7: Integration Tests

### Task 7.1: Entity CRUD Integration Tests
**File:** `tests/entity_crud.rs`

End-to-end tests that exercise the full stack: create entities via repository, verify relationships, test cascading deletes.

```rust
#[tokio::test]
async fn test_project_character_cascade_delete() {
    let pool = test_pool().await;

    // Create project
    let project = ProjectRepo::create(&pool, &CreateProject {
        name: "Test Project".to_string(),
        description: None,
        status_id: ProjectStatus::Draft.id(),
        retention_days: None,
    }).await.unwrap();

    // Create character
    let character = CharacterRepo::create(&pool, &CreateCharacter {
        project_id: project.id,
        name: "Test Character".to_string(),
        status_id: CharacterStatus::Draft.id(),
        metadata: None,
    }).await.unwrap();

    // Delete project — should cascade
    ProjectRepo::delete(&pool, project.id).await.unwrap();

    // Character should be gone
    let result = CharacterRepo::find_by_id(&pool, character.id).await.unwrap();
    assert!(result.is_none(), "Character should be deleted via cascade");
}
```

**Acceptance Criteria:**
- [ ] Test: Create full hierarchy (project -> character -> scene -> segment)
- [ ] Test: Cascade delete project removes all children
- [ ] Test: Unique constraint violation on duplicate project name
- [ ] Test: Unique constraint on scene (character_id, scene_type_id, image_variant_id)
- [ ] Test: Foreign key violation when referencing non-existent entity
- [ ] Tests run against the real dev database with `cargo test`

### Task 7.2: API Endpoint Integration Tests
**File:** `tests/api_tests.rs`

HTTP-level tests using Axum's test utilities.

```rust
use axum::http::StatusCode;
use axum_test::TestServer;

#[tokio::test]
async fn test_create_and_get_project() {
    let app = create_test_app().await;
    let server = TestServer::new(app).unwrap();

    let response = server.post("/api/v1/projects")
        .json(&serde_json::json!({
            "name": "Test Project",
            "status_id": 1
        }))
        .await;

    assert_eq!(response.status_code(), StatusCode::CREATED);

    let project: serde_json::Value = response.json();
    let id = project["id"].as_i64().unwrap();

    let get_response = server.get(&format!("/api/v1/projects/{}", id)).await;
    assert_eq!(get_response.status_code(), StatusCode::OK);
}
```

**Acceptance Criteria:**
- [ ] Test: POST creates entity, returns 201 with body
- [ ] Test: GET retrieves created entity by ID
- [ ] Test: GET returns 404 for non-existent ID
- [ ] Test: DELETE removes entity, subsequent GET returns 404
- [ ] Test: Hierarchical endpoints work correctly
- [ ] `axum-test` or equivalent added to dev-dependencies

---

## Phase 8: Schema Convention Compliance

### Task 8.1: Convention Compliance Tests for PRD-001 Tables
**File:** `tests/schema_conventions.rs` (extend from PRD-000)

Add tests that verify all PRD-001 tables follow PRD-000 conventions.

**Acceptance Criteria:**
- [ ] All 8 entity tables have `id` as `bigint` type
- [ ] All tables have `created_at` and `updated_at` as `timestamp with time zone`
- [ ] All FK columns have corresponding indexes
- [ ] No `character varying` columns (all use `TEXT`)
- [ ] All FK columns have `ON DELETE` and `ON UPDATE` rules defined

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218100001_create_entity_status_tables.sql` | Additional status lookup tables for characters, image variants, scene types |
| `migrations/20260218100002_create_projects_table.sql` | Projects table DDL |
| `migrations/20260218100003_create_characters_table.sql` | Characters table DDL |
| `migrations/20260218100004_create_image_tables.sql` | Source images, derived images, image variants DDL |
| `migrations/20260218100005_create_scene_types_table.sql` | Scene types table DDL |
| `migrations/20260218100006_create_scenes_table.sql` | Scenes table DDL |
| `migrations/20260218100007_create_segments_table.sql` | Segments table DDL |
| `src/models/mod.rs` | Models module barrel file |
| `src/models/project.rs` | Project model struct and DTOs |
| `src/models/character.rs` | Character model struct and DTOs |
| `src/models/image.rs` | SourceImage, DerivedImage, ImageVariant models |
| `src/models/scene_type.rs` | SceneType model struct and DTOs |
| `src/models/scene.rs` | Scene model struct and DTOs |
| `src/models/segment.rs` | Segment model struct and DTOs |
| `src/models/status.rs` | Status enum helpers mapping to lookup table IDs |
| `src/repositories/mod.rs` | Repository module barrel file |
| `src/repositories/project_repo.rs` | Project CRUD operations |
| `src/repositories/character_repo.rs` | Character CRUD operations |
| `src/repositories/scene_repo.rs` | Scene CRUD operations |
| `src/repositories/segment_repo.rs` | Segment CRUD operations |
| `src/api/mod.rs` | API module barrel file |
| `src/api/router.rs` | Axum router with hierarchical routes |
| `src/api/handlers/project.rs` | Project API handlers |
| `src/api/handlers/character.rs` | Character API handlers |
| `src/api/handlers/scene.rs` | Scene API handlers |
| `src/api/handlers/segment.rs` | Segment API handlers |
| `src/naming.rs` | Scene video naming convention engine |
| `src/delivery.rs` | Delivery ZIP structure types and validation |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `trigger_set_updated_at()`, `project_statuses`, `scene_statuses`, `segment_statuses` lookup tables
- PRD-000: `DbId = i64` type alias in `src/types.rs`
- PRD-000: Database connection pool in `src/db.rs`
- PRD-000: `SCHEMA_CONVENTIONS.md` for all naming and design rules

### New Infrastructure Needed
- `chrono` crate for `DateTime<Utc>` in model structs
- `serde` / `serde_json` for JSON serialization
- `axum` crate for HTTP API
- `axum-test` (dev dependency) for API integration tests

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations — Tasks 1.1–1.7
2. Phase 2: Rust Model Structs — Tasks 2.1–2.2
3. Phase 3: Repository Layer — Tasks 3.1–3.4
4. Phase 5: Naming Convention Engine — Tasks 5.1–5.2

**MVP Success Criteria:**
- All 8 entity tables exist with correct constraints and indexes
- Rust model structs compile and map to database rows
- CRUD operations work for all entities
- Naming convention function passes all test cases

### Post-MVP Enhancements
1. Phase 4: Axum API Endpoints — Tasks 4.1–4.4
2. Phase 6: Delivery ZIP Structure — Tasks 6.1–6.2
3. Phase 7: Integration Tests — Tasks 7.1–7.2
4. Phase 8: Schema Convention Compliance — Task 8.1

---

## Notes

1. **Migration timestamp ordering:** All PRD-001 migrations use timestamps starting at `20260218100xxx` to order after PRD-000 migrations.
2. **Cascade strategy:** Project deletion cascades to characters, characters cascade to images/scenes, scenes cascade to segments. This is an intentional "hard delete" model — soft deletes are not in scope for MVP.
3. **Scene Type scope:** Scene types can be project-level (`project_id NOT NULL`) or studio-level (`project_id IS NULL`). The unique constraint is partial to handle this.
4. **Metadata as JSONB:** Character metadata is stored as JSONB to allow flexible schema evolution. PRD-13 will define the metadata content schema.
5. **Delivery ZIP implementation:** The actual ZIP file creation is deferred to PRD-39. This PRD only defines the structure and validation logic.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
