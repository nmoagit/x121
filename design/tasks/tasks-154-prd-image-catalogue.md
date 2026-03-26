# Task List: Image Catalogue & Image Type Management

**PRD Reference:** `design/prds/154-prd-image-catalogue.md`
**Scope:** Parallel image catalogue system mirroring the scene catalogue, with generatable image types, workflow/prompt configuration, three-tier inheritance, and per-avatar instances.

## Overview

This implements a complete image catalogue system that mirrors the scene catalogue architecture. Image types define generatable images (e.g., "Clothed from Topless") with source/output track associations, ComfyUI workflow assignments, and prompt templates. The implementation follows the exact patterns established by `scene_types`, `scene_type_tracks`, `scene_type_track_configs`, and the three-tier inheritance system.

### What Already Exists
- **Scene catalogue** (`scene_types`, `scene_type_tracks`, `scene_type_track_configs`) — architecture to mirror exactly
- **Three-tier inheritance** (`project_scene_settings`, `group_scene_settings`, `avatar_scene_overrides`) — pattern to replicate
- **Tracks** (`tracks` table, `useTracks` hook) — reused as source/output associations
- **Workflows** (`workflows` table, `useWorkflows` hook) — reused for generation workflow assignment
- **Media variants** (`media_variants` table) — storage for generated images
- **Seed summary** (`get_seed_summary` in `media_management.rs`) — extended with image slots
- **Avatar card indicators** (`build-indicator-dots.ts`) — extended with image status

### What We're Building
1. `image_types` table + model + repo + handler + routes
2. `image_type_track_configs` table + model + repo + handler
3. `avatar_images` table + model + repo + handler + routes
4. Three-tier inheritance tables + models + repos + handlers + routes
5. Frontend `image-catalogue/` feature directory (types, hooks, components)
6. Seeds tab integration (image slots at top as prerequisites)
7. Seed summary and card indicator integration

### Key Design Decisions
1. Image type slots appear **at the top** of the seeds tab as prerequisites for scene generation
2. Generation is **blocked** if source seed image is missing (enforced, not soft warning)
3. Both manual generation (seeds tab) and batch generation (production orchestrator) supported
4. Image types are pipeline-scoped, following the same pattern as scene types

---

## Phase 1: Database — Core Tables & Migrations

### Task 1.1: Create image_types table
**File:** `apps/db/migrations/20260327000001_create_image_types.sql`

Create the core image types catalogue table, mirroring `scene_types` but focused on image generation.

```sql
CREATE TABLE image_types (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT,
    pipeline_id     BIGINT NOT NULL REFERENCES pipelines(id),
    workflow_id     BIGINT REFERENCES workflows(id) ON DELETE SET NULL,
    source_track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    output_track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    prompt_template TEXT,
    negative_prompt_template TEXT,
    generation_params JSONB,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_image_types_pipeline_slug
    ON image_types (pipeline_id, slug) WHERE deleted_at IS NULL;

CREATE INDEX idx_image_types_pipeline_id ON image_types (pipeline_id);
CREATE INDEX idx_image_types_workflow_id ON image_types (workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX idx_image_types_source_track_id ON image_types (source_track_id) WHERE source_track_id IS NOT NULL;
CREATE INDEX idx_image_types_output_track_id ON image_types (output_track_id) WHERE output_track_id IS NOT NULL;

CREATE TRIGGER trg_image_types_updated_at
    BEFORE UPDATE ON image_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table created with all columns matching PRD spec
- [ ] `source_track_id` and `output_track_id` FK to tracks
- [ ] Unique constraint on (pipeline_id, slug) with soft-delete filter
- [ ] Indexes on all foreign keys
- [ ] `updated_at` trigger installed

### Task 1.2: Create image_type_tracks junction table
**File:** `apps/db/migrations/20260327000002_create_image_type_tracks.sql`

Junction table linking image types to tracks they apply to, mirroring `scene_type_tracks`.

```sql
CREATE TABLE image_type_tracks (
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (image_type_id, track_id)
);

CREATE INDEX idx_image_type_tracks_track_id ON image_type_tracks (track_id);
```

**Acceptance Criteria:**
- [ ] Composite PK on (image_type_id, track_id)
- [ ] Cascade delete on both FKs
- [ ] Index on track_id for reverse lookups

### Task 1.3: Create image_type_track_configs table
**File:** `apps/db/migrations/20260327000003_create_image_type_track_configs.sql`

Per-track workflow/prompt overrides for image types, mirroring `scene_type_track_configs`.

```sql
CREATE TABLE image_type_track_configs (
    id                       BIGSERIAL PRIMARY KEY,
    image_type_id            BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id                 BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    workflow_id              BIGINT REFERENCES workflows(id) ON DELETE SET NULL,
    prompt_template          TEXT,
    negative_prompt_template TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (image_type_id, track_id)
);

CREATE INDEX idx_ittc_image_type_id ON image_type_track_configs (image_type_id);
CREATE INDEX idx_ittc_track_id ON image_type_track_configs (track_id);
CREATE INDEX idx_ittc_workflow_id ON image_type_track_configs (workflow_id) WHERE workflow_id IS NOT NULL;

CREATE TRIGGER trg_image_type_track_configs_updated_at
    BEFORE UPDATE ON image_type_track_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Unique constraint on (image_type_id, track_id)
- [ ] Workflow override is nullable (inherits from image type default)
- [ ] Prompt overrides are nullable (inherits from image type default)
- [ ] Cascade delete from both image_types and tracks

### Task 1.4: Create avatar_images table
**File:** `apps/db/migrations/20260327000004_create_avatar_images.sql`

Per-avatar image instances tracking generation status, mirroring `scenes`.

```sql
CREATE TABLE avatar_images (
    id                      BIGSERIAL PRIMARY KEY,
    avatar_id               BIGINT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    image_type_id           BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id                BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    media_variant_id        BIGINT REFERENCES media_variants(id) ON DELETE SET NULL,
    status_id               SMALLINT NOT NULL DEFAULT 1,
    generation_started_at   TIMESTAMPTZ,
    generation_completed_at TIMESTAMPTZ,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One image per avatar + image_type + track combo
CREATE UNIQUE INDEX uq_avatar_images_combo
    ON avatar_images (avatar_id, image_type_id, COALESCE(track_id, -1))
    WHERE deleted_at IS NULL;

CREATE INDEX idx_avatar_images_avatar_id ON avatar_images (avatar_id);
CREATE INDEX idx_avatar_images_image_type_id ON avatar_images (image_type_id);
CREATE INDEX idx_avatar_images_status_id ON avatar_images (status_id);

CREATE TRIGGER trg_avatar_images_updated_at
    BEFORE UPDATE ON avatar_images
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Unique constraint on (avatar_id, image_type_id, COALESCE(track_id, -1)) with soft-delete filter
- [ ] `status_id` supports lifecycle: 1=pending, 2=generating, 3=generated, 4=approved, 5=rejected, 6=failed
- [ ] `media_variant_id` nullable — set when generated or uploaded
- [ ] Cascade delete from avatars and image_types

### Task 1.5: Create three-tier inheritance settings tables
**File:** `apps/db/migrations/20260327000005_create_image_settings_inheritance.sql`

Project, group, and avatar level enable/disable for image types, mirroring the scene settings tables.

```sql
-- Level 1: Project image settings
CREATE TABLE project_image_settings (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT REFERENCES tracks(id) ON DELETE CASCADE,
    is_enabled    BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_project_image_settings
    ON project_image_settings (project_id, image_type_id, COALESCE(track_id, -1));

-- Level 2: Group image settings
CREATE TABLE group_image_settings (
    id            BIGSERIAL PRIMARY KEY,
    group_id      BIGINT NOT NULL REFERENCES character_groups(id) ON DELETE CASCADE,
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT REFERENCES tracks(id) ON DELETE CASCADE,
    is_enabled    BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_group_image_settings
    ON group_image_settings (group_id, image_type_id, COALESCE(track_id, -1));

-- Level 3: Avatar image overrides
CREATE TABLE avatar_image_overrides (
    id            BIGSERIAL PRIMARY KEY,
    avatar_id     BIGINT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT REFERENCES tracks(id) ON DELETE CASCADE,
    is_enabled    BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_avatar_image_overrides
    ON avatar_image_overrides (avatar_id, image_type_id, COALESCE(track_id, -1));

-- Triggers
CREATE TRIGGER trg_project_image_settings_updated_at
    BEFORE UPDATE ON project_image_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_group_image_settings_updated_at
    BEFORE UPDATE ON group_image_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_avatar_image_overrides_updated_at
    BEFORE UPDATE ON avatar_image_overrides FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] All three tables created with correct FK references
- [ ] Unique constraints include COALESCE(track_id, -1) for nullable track
- [ ] Resolution order documented: avatar → group → project → image_type.is_active
- [ ] Cascade delete from parent entities

---

## Phase 2: Backend Models & Repositories

### Task 2.1: Create ImageType model and DTOs
**File:** `apps/backend/crates/db/src/models/image_type.rs`

Create the Rust model structs mirroring `scene_type.rs` pattern but scoped to image type fields.

**Acceptance Criteria:**
- [ ] `ImageType` struct with `FromRow + Serialize` matching all `image_types` columns
- [ ] `ImageTypeWithTracks` struct with embedded `tracks: Vec<Track>`
- [ ] `CreateImageType` DTO with required fields (name, slug, pipeline_id) and optionals
- [ ] `UpdateImageType` DTO with all-optional fields including `track_ids: Option<Vec<DbId>>`
- [ ] Module declared in `models/mod.rs`

### Task 2.2: Create ImageTypeTrackConfig model and DTOs
**File:** `apps/backend/crates/db/src/models/image_type_track_config.rs`

Mirror `scene_type_track_config.rs` for image type per-track overrides.

**Acceptance Criteria:**
- [ ] `ImageTypeTrackConfig` struct with `FromRow + Serialize`
- [ ] `ImageTypeTrackConfigWithTrack` enriched struct with track name/slug
- [ ] `CreateImageTypeTrackConfig` (upsert DTO)
- [ ] `UpdateImageTypeTrackConfig` (partial update DTO)
- [ ] Module declared in `models/mod.rs`

### Task 2.3: Create AvatarImage model and DTOs
**File:** `apps/backend/crates/db/src/models/avatar_image.rs`

Per-avatar image instance model, mirroring `scene.rs`.

**Acceptance Criteria:**
- [ ] `AvatarImage` struct with `FromRow + Serialize` matching all `avatar_images` columns
- [ ] `AvatarImageDetail` enriched struct with image_type name, track name, media variant info
- [ ] `CreateAvatarImage` DTO (avatar_id, image_type_id, track_id)
- [ ] `UpdateAvatarImage` DTO (status_id, media_variant_id)
- [ ] Status constants: PENDING=1, GENERATING=2, GENERATED=3, APPROVED=4, REJECTED=5, FAILED=6
- [ ] Module declared in `models/mod.rs`

### Task 2.4: Create ImageTypeRepo
**File:** `apps/backend/crates/db/src/repositories/image_type_repo.rs`

CRUD + track association methods mirroring `SceneTypeRepo`.

**Acceptance Criteria:**
- [ ] `create(pool, input) -> ImageType`
- [ ] `find_by_id(pool, id) -> Option<ImageType>` (soft-delete filtered)
- [ ] `find_by_id_with_tracks(pool, id) -> Option<ImageTypeWithTracks>`
- [ ] `list_by_pipeline(pool, pipeline_id) -> Vec<ImageType>`
- [ ] `list_by_pipeline_with_tracks(pool, pipeline_id) -> Vec<ImageTypeWithTracks>`
- [ ] `update(pool, id, input) -> Option<ImageType>`
- [ ] `soft_delete(pool, id) -> bool`
- [ ] `set_tracks(pool, image_type_id, track_ids)` — atomic replacement
- [ ] `get_tracks(pool, image_type_id) -> Vec<Track>`
- [ ] Module declared and re-exported in `repositories/mod.rs`

### Task 2.5: Create ImageTypeTrackConfigRepo
**File:** `apps/backend/crates/db/src/repositories/image_type_track_config_repo.rs`

Per-track config CRUD mirroring `SceneTypeTrackConfigRepo`.

**Acceptance Criteria:**
- [ ] `upsert(pool, input) -> ImageTypeTrackConfig` (ON CONFLICT DO UPDATE)
- [ ] `find_by_image_type_and_track(pool, image_type_id, track_id) -> Option<...>`
- [ ] `list_by_image_type(pool, image_type_id) -> Vec<ImageTypeTrackConfigWithTrack>`
- [ ] `delete(pool, id) -> bool`
- [ ] Module declared and re-exported in `repositories/mod.rs`

### Task 2.6: Create AvatarImageRepo
**File:** `apps/backend/crates/db/src/repositories/avatar_image_repo.rs`

Avatar image instance CRUD mirroring `SceneRepo`.

**Acceptance Criteria:**
- [ ] `create(pool, input) -> AvatarImage`
- [ ] `find_by_id(pool, id) -> Option<AvatarImage>` (soft-delete filtered)
- [ ] `list_by_avatar(pool, avatar_id) -> Vec<AvatarImage>`
- [ ] `list_by_avatar_detailed(pool, avatar_id) -> Vec<AvatarImageDetail>` (with joins)
- [ ] `update(pool, id, input) -> Option<AvatarImage>`
- [ ] `soft_delete(pool, id) -> bool`
- [ ] `approve(pool, id) -> Option<AvatarImage>` (set status_id=4)
- [ ] `reject(pool, id) -> Option<AvatarImage>` (set status_id=5)
- [ ] Module declared and re-exported in `repositories/mod.rs`

### Task 2.7: Create three-tier settings repos
**Files:**
- `apps/backend/crates/db/src/repositories/project_image_setting_repo.rs`
- `apps/backend/crates/db/src/repositories/group_image_setting_repo.rs`
- `apps/backend/crates/db/src/repositories/avatar_image_override_repo.rs`

Mirror the scene settings repos pattern.

**Acceptance Criteria:**
- [ ] Each repo has: `upsert`, `list_by_scope`, `delete` methods
- [ ] `upsert` uses ON CONFLICT DO UPDATE for idempotent enable/disable
- [ ] `list_by_scope` returns all settings for a project/group/avatar
- [ ] All three modules declared and re-exported in `repositories/mod.rs`

---

## Phase 3: Backend API Handlers & Routes

### Task 3.1: Create image_type handler
**File:** `apps/backend/crates/api/src/handlers/image_type.rs`

REST handlers for image type CRUD + track management, mirroring `scene_type.rs`.

**Acceptance Criteria:**
- [ ] `POST /api/v1/image-types` — create (requires pipeline_id)
- [ ] `GET /api/v1/image-types?pipeline_id=N` — list by pipeline with tracks
- [ ] `GET /api/v1/image-types/{id}` — get single with tracks
- [ ] `PUT /api/v1/image-types/{id}` — update (including track_ids)
- [ ] `DELETE /api/v1/image-types/{id}` — soft delete
- [ ] Module declared in `handlers/mod.rs`

### Task 3.2: Create image_type_track_config handler
**File:** `apps/backend/crates/api/src/handlers/image_type_track_config.rs`

Per-track config CRUD endpoints.

**Acceptance Criteria:**
- [ ] `GET /api/v1/image-types/{id}/track-configs` — list configs for image type
- [ ] `PUT /api/v1/image-types/{image_type_id}/track-configs/{track_id}` — upsert config
- [ ] `DELETE /api/v1/image-types/{image_type_id}/track-configs/{track_id}` — delete config
- [ ] Module declared in `handlers/mod.rs`

### Task 3.3: Create avatar_image handler
**File:** `apps/backend/crates/api/src/handlers/avatar_image.rs`

Per-avatar image instance CRUD with approve/reject actions.

**Acceptance Criteria:**
- [ ] `GET /api/v1/avatars/{avatar_id}/images` — list with details
- [ ] `POST /api/v1/avatars/{avatar_id}/images` — create instance
- [ ] `PUT /api/v1/avatars/{avatar_id}/images/{id}` — update (assign media_variant_id)
- [ ] `DELETE /api/v1/avatars/{avatar_id}/images/{id}` — soft delete
- [ ] `POST /api/v1/avatars/{avatar_id}/images/{id}/approve` — approve
- [ ] `POST /api/v1/avatars/{avatar_id}/images/{id}/reject` — reject
- [ ] Module declared in `handlers/mod.rs`

### Task 3.4: Create three-tier settings handlers
**Files:**
- `apps/backend/crates/api/src/handlers/project_image_settings.rs`
- `apps/backend/crates/api/src/handlers/group_image_settings.rs`
- `apps/backend/crates/api/src/handlers/avatar_image_overrides.rs`

Mirror the scene settings handlers pattern.

**Acceptance Criteria:**
- [ ] Each handler has: list, upsert, delete endpoints
- [ ] Project: `GET/PUT/DELETE /api/v1/projects/{id}/image-settings`
- [ ] Group: `GET/PUT/DELETE /api/v1/groups/{id}/image-settings`
- [ ] Avatar: `GET/PUT/DELETE /api/v1/avatars/{id}/image-overrides`
- [ ] All modules declared in `handlers/mod.rs`

### Task 3.5: Create route files and wire into router
**Files:**
- `apps/backend/crates/api/src/routes/image_type.rs`
- `apps/backend/crates/api/src/routes/avatar_image.rs`
- `apps/backend/crates/api/src/routes/image_settings.rs`

Register all new routes, mirroring scene route patterns.

**Acceptance Criteria:**
- [ ] All image type endpoints wired
- [ ] All avatar image endpoints wired
- [ ] All three-tier settings endpoints wired
- [ ] Modules declared in `routes/mod.rs`
- [ ] Routes registered in the main router

---

## Phase 4: Seed Summary & Card Indicator Integration

### Task 4.1: Extend seed summary with image type slots
**File:** `apps/backend/crates/api/src/handlers/media_management.rs`

Add image type slots to the existing `get_seed_summary` endpoint.

**Acceptance Criteria:**
- [ ] `SeedSlotWithAssignment` has `slot_kind` field ("scene" or "image")
- [ ] Image type slots queried from `image_types` table for avatar's pipeline
- [ ] Respects three-tier inheritance (only enabled image types appear)
- [ ] Image slots include: image_type_id, image_type_name, source_track_id/name, output_track_id/name, workflow_name, assignment status
- [ ] Image slots appear before scene slots in the response

### Task 4.2: Update frontend SeedSlotWithAssignment type
**File:** `apps/frontend/src/features/avatars/hooks/use-media-assignments.ts`

Add `slot_kind` to the frontend type.

**Acceptance Criteria:**
- [ ] `SeedSlotWithAssignment` includes `slot_kind: "scene" | "image"`
- [ ] Optional fields for image-specific data: `image_type_id`, `source_track_name`, `output_track_name`

### Task 4.3: Update avatar card indicator dots for image types
**File:** `apps/frontend/src/features/projects/utils/build-indicator-dots.ts`

Add image type generation status to avatar card indicator dots.

**Acceptance Criteria:**
- [ ] Image type deliverables appear as indicator dots
- [ ] Green dot when image is generated/approved or manually uploaded
- [ ] Grey dot when image is pending/missing
- [ ] Tooltip shows image type name and status

---

## Phase 5: Frontend — Image Catalogue Admin UI

### Task 5.1: Create image-catalogue TypeScript types
**File:** `apps/frontend/src/features/image-catalogue/types.ts`

Define all interfaces mirroring scene-catalogue types.

**Acceptance Criteria:**
- [ ] `ImageType` interface with all fields (id, name, slug, description, pipeline_id, workflow_id, source_track_id, output_track_id, prompt_template, negative_prompt_template, generation_params, is_active, sort_order, tracks)
- [ ] `ImageTypeWithTracks` with embedded `tracks: Track[]`
- [ ] `CreateImageType` and `UpdateImageType` DTOs
- [ ] `ImageTypeTrackConfig` and `UpsertTrackConfig` interfaces
- [ ] `AvatarImage` and `AvatarImageDetail` interfaces
- [ ] `EffectiveImageSetting` interface with `source` tier tracking

### Task 5.2: Create image-catalogue hooks
**Files:**
- `apps/frontend/src/features/image-catalogue/hooks/use-image-catalogue.ts`
- `apps/frontend/src/features/image-catalogue/hooks/use-image-track-configs.ts`
- `apps/frontend/src/features/image-catalogue/hooks/use-avatar-images.ts`
- `apps/frontend/src/features/image-catalogue/hooks/use-project-image-settings.ts`
- `apps/frontend/src/features/image-catalogue/hooks/use-group-image-settings.ts`
- `apps/frontend/src/features/image-catalogue/hooks/use-avatar-image-settings.ts`

TanStack Query hooks for all API endpoints.

**Acceptance Criteria:**
- [ ] `useImageTypes(pipelineId)` — list query
- [ ] `useCreateImageType()`, `useUpdateImageType(id)`, `useDeleteImageType()` — mutations
- [ ] `useImageTrackConfigs(imageTypeId)` — per-track config query
- [ ] `useUpsertImageTrackConfig(imageTypeId, trackId)` — config mutation
- [ ] `useAvatarImages(avatarId)` — avatar instance list
- [ ] `useApproveAvatarImage(avatarId)`, `useRejectAvatarImage(avatarId)` — status mutations
- [ ] Three-tier settings hooks following scene settings pattern

### Task 5.3: Create ImageCatalogueList component
**File:** `apps/frontend/src/features/image-catalogue/ImageCatalogueList.tsx`

Admin list view for image types, mirroring `SceneCatalogueList.tsx`.

**Acceptance Criteria:**
- [ ] Terminal-styled table listing image types for current pipeline
- [ ] Columns: name, slug, source track, output track, workflow, active toggle, sort order
- [ ] Add/edit/delete actions
- [ ] Pipeline-scoped via `usePipelineContextSafe()`

### Task 5.4: Create ImageCatalogueForm component
**File:** `apps/frontend/src/features/image-catalogue/ImageCatalogueForm.tsx`

Create/edit modal form, mirroring `SceneCatalogueForm.tsx`.

**Acceptance Criteria:**
- [ ] Fields: name, slug (auto-generated from name, readonly on edit), description, source track selector, output track selector, workflow selector, prompt_template, negative_prompt_template, sort order, active toggle
- [ ] Track association checkboxes
- [ ] Source/output track dropdowns populated from pipeline tracks
- [ ] Workflow dropdown populated from pipeline workflows
- [ ] Validates required fields (name, slug, pipeline_id)

### Task 5.5: Create ImageTrackConfigEditor component
**File:** `apps/frontend/src/features/image-catalogue/ImageTrackConfigEditor.tsx`

Per-track workflow/prompt override editor, mirroring `TrackConfigRow.tsx`.

**Acceptance Criteria:**
- [ ] Lists tracks associated with the image type
- [ ] Each row shows: track name, workflow override selector, prompt override fields
- [ ] Upsert on save, delete to revert to image type defaults
- [ ] Clear visual indicator when override is active vs inheriting

### Task 5.6: Create three-tier settings UI components
**Files:**
- `apps/frontend/src/features/image-catalogue/ProjectImageSettings.tsx`
- `apps/frontend/src/features/image-catalogue/GroupImageOverrides.tsx`
- `apps/frontend/src/features/image-catalogue/AvatarImageOverrides.tsx`

Mirror the scene settings inheritance UI.

**Acceptance Criteria:**
- [ ] Each component shows image types with enable/disable toggles
- [ ] Visual indicator of setting source (inherited vs overridden)
- [ ] Project settings accessible from project detail page
- [ ] Group/avatar settings accessible from respective detail pages

### Task 5.7: Create index and wire into navigation
**Files:**
- `apps/frontend/src/features/image-catalogue/index.ts`
- Wire into pipeline settings page / admin navigation

**Acceptance Criteria:**
- [ ] All components and hooks exported from `index.ts`
- [ ] Image catalogue accessible from pipeline settings alongside scene catalogue
- [ ] Route added to router if needed (or tab within existing admin page)

---

## Phase 6: Frontend — Avatar Seeds Tab Integration

### Task 6.1: Update AvatarSeedsTab for image type slots
**File:** `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx`

Show image type slots at the top of the seeds tab as prerequisites.

**Acceptance Criteria:**
- [ ] Image type slots appear in a distinct "Image Generation" section at the top
- [ ] Section header: "Image Generation" with count (e.g., "1 of 1 assigned")
- [ ] Scene seed slots appear below in existing "Scene Generation" section
- [ ] Image slots use same `SeedSlotCard` layout with visual distinction (e.g., different border color or icon)

### Task 6.2: Image slot card with generate/upload/approve/reject
**File:** `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx` (or extract to component)

Image type slot cards with full action support.

**Acceptance Criteria:**
- [ ] Card shows: image type name, source track → output track, workflow name, status
- [ ] Generate button (disabled if source seed missing or no workflow assigned)
- [ ] Upload button for manual override
- [ ] Approve/reject buttons when image is generated
- [ ] Warning icon + tooltip when generation is blocked (missing source seed or workflow)
- [ ] Thumbnail preview when image is assigned

### Task 6.3: Update auto-assign to include image slots
**File:** `apps/backend/crates/api/src/handlers/media_management.rs`

Extend the auto-assign endpoint to handle image type slots.

**Acceptance Criteria:**
- [ ] Auto-assign considers image type slots alongside scene slots
- [ ] Image slots matched by output track variant type
- [ ] Preview includes image slot assignments

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260327000001_create_image_types.sql` | Core image types table |
| `apps/db/migrations/20260327000002_create_image_type_tracks.sql` | Track junction table |
| `apps/db/migrations/20260327000003_create_image_type_track_configs.sql` | Per-track config table |
| `apps/db/migrations/20260327000004_create_avatar_images.sql` | Avatar image instances |
| `apps/db/migrations/20260327000005_create_image_settings_inheritance.sql` | Three-tier settings tables |
| `apps/backend/crates/db/src/models/image_type.rs` | ImageType model + DTOs |
| `apps/backend/crates/db/src/models/image_type_track_config.rs` | Track config model |
| `apps/backend/crates/db/src/models/avatar_image.rs` | Avatar image instance model |
| `apps/backend/crates/db/src/repositories/image_type_repo.rs` | ImageType CRUD |
| `apps/backend/crates/db/src/repositories/image_type_track_config_repo.rs` | Track config CRUD |
| `apps/backend/crates/db/src/repositories/avatar_image_repo.rs` | Avatar image CRUD |
| `apps/backend/crates/db/src/repositories/project_image_setting_repo.rs` | Level 1 settings |
| `apps/backend/crates/db/src/repositories/group_image_setting_repo.rs` | Level 2 settings |
| `apps/backend/crates/db/src/repositories/avatar_image_override_repo.rs` | Level 3 settings |
| `apps/backend/crates/api/src/handlers/image_type.rs` | Image type API handlers |
| `apps/backend/crates/api/src/handlers/image_type_track_config.rs` | Track config handlers |
| `apps/backend/crates/api/src/handlers/avatar_image.rs` | Avatar image handlers |
| `apps/backend/crates/api/src/handlers/project_image_settings.rs` | Project settings handlers |
| `apps/backend/crates/api/src/handlers/group_image_settings.rs` | Group settings handlers |
| `apps/backend/crates/api/src/handlers/avatar_image_overrides.rs` | Avatar settings handlers |
| `apps/backend/crates/api/src/routes/image_type.rs` | Image type routes |
| `apps/backend/crates/api/src/routes/avatar_image.rs` | Avatar image routes |
| `apps/backend/crates/api/src/routes/image_settings.rs` | Settings routes |
| `apps/backend/crates/api/src/handlers/media_management.rs` | Seed summary (extend) |
| `apps/frontend/src/features/image-catalogue/types.ts` | Frontend types |
| `apps/frontend/src/features/image-catalogue/hooks/*.ts` | Query/mutation hooks |
| `apps/frontend/src/features/image-catalogue/ImageCatalogueList.tsx` | Admin list |
| `apps/frontend/src/features/image-catalogue/ImageCatalogueForm.tsx` | Create/edit form |
| `apps/frontend/src/features/image-catalogue/ImageTrackConfigEditor.tsx` | Track config UI |
| `apps/frontend/src/features/image-catalogue/ProjectImageSettings.tsx` | Level 1 UI |
| `apps/frontend/src/features/image-catalogue/GroupImageOverrides.tsx` | Level 2 UI |
| `apps/frontend/src/features/image-catalogue/AvatarImageOverrides.tsx` | Level 3 UI |
| `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx` | Seeds tab (extend) |
| `apps/frontend/src/features/avatars/hooks/use-media-assignments.ts` | Seed types (extend) |
| `apps/frontend/src/features/projects/utils/build-indicator-dots.ts` | Card indicators (extend) |

---

## Dependencies

### Existing Components to Reuse
- `SceneTypeRepo` pattern from `apps/backend/crates/db/src/repositories/scene_type_repo.rs`
- `SceneTypeTrackConfigRepo` pattern from `apps/backend/crates/db/src/repositories/scene_type_track_config_repo.rs`
- `SceneCatalogueForm.tsx` layout from `apps/frontend/src/features/scene-catalogue/`
- `useWorkflows` hook from `apps/frontend/src/features/workflow-import/`
- `useTracks` hook from `apps/frontend/src/features/scene-catalogue/hooks/use-tracks.ts`
- Three-tier settings handlers from `apps/backend/crates/api/src/handlers/project_scene_settings.rs` etc.
- `SeedSlotCard` component from `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx`

### New Infrastructure Needed
- 7 database tables (5 migrations)
- 7 Rust model files
- 7 Rust repository files
- 6 Rust handler files
- 3 Rust route files
- 1 frontend feature directory with ~15 files

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database — Tasks 1.1–1.5
2. Phase 2: Backend Models & Repos — Tasks 2.1–2.7
3. Phase 3: Backend API & Routes — Tasks 3.1–3.5
4. Phase 4: Seed Summary & Indicators — Tasks 4.1–4.3
5. Phase 5: Frontend Admin UI — Tasks 5.1–5.7
6. Phase 6: Seeds Tab Integration — Tasks 6.1–6.3

**MVP Success Criteria:**
- Admin can create image types in pipeline catalogue with workflow + prompt templates
- Image types appear as seed slots at top of avatar seeds tab
- Generation blocked when source seed is missing (warning icon shown)
- Three-tier enable/disable works at project, group, avatar levels
- Manual upload works as alternative to generation
- Avatar card indicators reflect image generation status

### Post-MVP Enhancements
- Batch image generation via production orchestrator (PRD-57 integration)
- Image type inheritance (parent/child hierarchy, PRD-100 pattern)
- Auto-retry for failed generation (PRD-71 pattern)
- Image deliverable ignores (PRD avatar_deliverable_ignores pattern)

---

## Notes

1. **Migration ordering**: Run Phase 1 migrations in sequence — `image_types` must exist before junction/config tables, which must exist before `avatar_images` and settings tables.
2. **Status reuse**: Consider reusing the existing `scene_statuses` lookup table pattern or creating a parallel `image_statuses` table. The status IDs (1-6) should be consistent with scene status conventions.
3. **Seed summary backward compatibility**: The `slot_kind` field addition to `SeedSlotWithAssignment` must default to `"scene"` for existing consumers. Frontend must handle both kinds gracefully.
4. **Pipeline context**: All queries and UI must be scoped to the active pipeline via `usePipelineContextSafe()`.

---

## Version History

- **v1.0** (2026-03-26): Initial task list creation from PRD-154
