# Task List: Pipeline-Scoped Avatars

**PRD Reference:** `design/prds/142-prd-pipeline-scoped-avatars.md`
**Scope:** Add explicit `pipeline_id` to avatars, avatar_groups, image_variants, and scenes. Silo all avatar-related data and storage by pipeline.

## Overview

This implementation adds direct `pipeline_id` FK columns to four tables (avatars, avatar_groups, image_variants, scenes), backfills from the existing parent chain, updates unique constraints, modifies all backend models/repos/handlers, wires storage paths through the pipeline-scoped helper, and ensures the frontend passes pipeline context everywhere. The pattern follows the exact approach used for projects, tracks, workflows, and scene_types in PRD-138.

### What Already Exists
- `pipeline_scoped_key()` and `resolve_storage_key()` in `core::storage` — path prefixing infrastructure
- `migrate_storage_to_pipeline.py` — storage migration script to extend
- Pipeline ID backfill pattern from migrations `20260322000003-6`
- `usePipelineContextSafe()` hook — used throughout frontend
- Avatar ingest already loads pipeline seed slots for validation

### What We're Building
1. Single migration adding `pipeline_id` to 4 tables + constraint update
2. Backend model/repo/handler updates for all 4 entities
3. Ingest pipeline awareness
4. Pipeline-scoped storage path wiring
5. Frontend pipeline context propagation

### Key Design Decisions
1. Explicit `pipeline_id` on all 4 tables (not just derived via JOINs) — matches codebase pattern and enables direct WHERE clauses
2. Avatar uniqueness scoped to pipeline `(pipeline_id, name)` — same name across projects within one pipeline is treated as one entity
3. No cross-pipeline avatar linking — completely independent objects
4. Backfill in a single migration for atomicity

---

## Phase 1: Database Migrations

### Task 1.1: Add `pipeline_id` to `avatars` table
**File:** `apps/db/migrations/20260324000001_add_pipeline_id_to_avatar_entities.sql`

Create a single migration that adds `pipeline_id` to all four tables with backfill.

```sql
-- 1. Avatars
ALTER TABLE avatars ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE avatars SET pipeline_id = p.pipeline_id
FROM projects p WHERE avatars.project_id = p.id;
ALTER TABLE avatars ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_avatars_pipeline_id ON avatars(pipeline_id);

-- 2. Avatar groups
ALTER TABLE avatar_groups ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE avatar_groups SET pipeline_id = p.pipeline_id
FROM projects p WHERE avatar_groups.project_id = p.id;
ALTER TABLE avatar_groups ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_avatar_groups_pipeline_id ON avatar_groups(pipeline_id);

-- 3. Image variants
ALTER TABLE image_variants ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE image_variants SET pipeline_id = a.pipeline_id
FROM avatars a WHERE image_variants.avatar_id = a.id;
ALTER TABLE image_variants ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_image_variants_pipeline_id ON image_variants(pipeline_id);

-- 4. Scenes
ALTER TABLE scenes ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE scenes SET pipeline_id = a.pipeline_id
FROM avatars a WHERE scenes.avatar_id = a.id;
ALTER TABLE scenes ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_scenes_pipeline_id ON scenes(pipeline_id);
```

**Acceptance Criteria:**
- [ ] All four tables have `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id)`
- [ ] Backfill correctly resolves pipeline from parent chain
- [ ] Indexes created on all four columns
- [ ] Migration applies cleanly with `sqlx migrate run`

### Task 1.2: Update unique constraints on `avatars`
**File:** `apps/db/migrations/20260324000002_update_avatar_unique_constraints.sql`

```sql
-- Drop project-scoped uniqueness
DROP INDEX IF EXISTS uq_avatars_project_id_name;

-- Add pipeline-scoped uniqueness
CREATE UNIQUE INDEX uq_avatars_pipeline_name
ON avatars(pipeline_id, name) WHERE deleted_at IS NULL;

-- Update avatar_groups uniqueness
DROP INDEX IF EXISTS uq_avatar_groups_project_name;
CREATE UNIQUE INDEX uq_avatar_groups_pipeline_project_name
ON avatar_groups(pipeline_id, project_id, name) WHERE deleted_at IS NULL;
```

**Acceptance Criteria:**
- [ ] Old `uq_avatars_project_id_name` dropped
- [ ] New `uq_avatars_pipeline_name` enforces pipeline-scoped avatar names (excludes soft-deleted)
- [ ] Avatar group uniqueness updated to include pipeline_id
- [ ] Migration applies cleanly

---

## Phase 2: Backend Models & Repositories

### Task 2.1: Update `Avatar` model and `AvatarRepo`
**Files:**
- `apps/backend/crates/db/src/models/avatar.rs`
- `apps/backend/crates/db/src/repositories/avatar_repo.rs`

Add `pipeline_id: DbId` to `Avatar` struct. Add `pipeline_id: DbId` to `CreateAvatar`. Update `COLUMNS` constant. Update all queries.

**Acceptance Criteria:**
- [ ] `Avatar` struct has `pub pipeline_id: DbId`
- [ ] `CreateAvatar` struct has `pub pipeline_id: DbId`
- [ ] `COLUMNS` constant includes `pipeline_id`
- [ ] `create()` query binds `pipeline_id`
- [ ] `list_by_project()` still works (pipeline_id is additional, not replacing project_id)
- [ ] New `list_by_pipeline(pool, pipeline_id)` method added
- [ ] `cargo check` passes

### Task 2.2: Update `AvatarGroup` model and repo
**Files:**
- `apps/backend/crates/db/src/models/avatar_group.rs` (or equivalent)
- `apps/backend/crates/db/src/repositories/avatar_group_repo.rs` (or within avatar repo)

**Acceptance Criteria:**
- [ ] `AvatarGroup` struct has `pub pipeline_id: DbId`
- [ ] Create/update operations include `pipeline_id`
- [ ] COLUMNS constant updated
- [ ] `cargo check` passes

### Task 2.3: Update `ImageVariant` model and repo
**Files:**
- `apps/backend/crates/db/src/models/image_variant.rs`
- `apps/backend/crates/db/src/repositories/image_variant_repo.rs`

**Acceptance Criteria:**
- [ ] `ImageVariant` struct has `pub pipeline_id: DbId`
- [ ] `CreateImageVariant` includes `pipeline_id`
- [ ] COLUMNS constant updated
- [ ] Browse/list queries accept optional `pipeline_id` filter
- [ ] Existing queries that JOIN through project→pipeline simplified to use direct column
- [ ] `cargo check` passes

### Task 2.4: Update `Scene` model and repo
**Files:**
- `apps/backend/crates/db/src/models/scene.rs`
- `apps/backend/crates/db/src/repositories/scene_repo.rs`

**Acceptance Criteria:**
- [ ] `Scene` struct has `pub pipeline_id: DbId`
- [ ] `CreateScene` includes `pipeline_id`
- [ ] COLUMNS constant updated
- [ ] Browse/list queries accept optional `pipeline_id` filter
- [ ] `cargo check` passes

---

## Phase 3: Backend Handlers & API

### Task 3.1: Update avatar handlers
**File:** `apps/backend/crates/api/src/handlers/avatar.rs` (or equivalent avatar CRUD handlers)

Auto-set `pipeline_id` when creating avatars from the project's pipeline.

**Acceptance Criteria:**
- [ ] `POST /projects/{id}/avatars` resolves `pipeline_id` from project and sets on created avatar
- [ ] `GET` endpoints accept optional `pipeline_id` query param for filtering
- [ ] Avatar group create handler also sets `pipeline_id`
- [ ] `cargo check` passes

### Task 3.2: Update image variant handlers
**File:** `apps/backend/crates/api/src/handlers/image_variant.rs`

**Acceptance Criteria:**
- [ ] Image variant create auto-sets `pipeline_id` from parent avatar
- [ ] Browse endpoint uses direct `pipeline_id` filter (remove/simplify project→pipeline JOIN)
- [ ] `cargo check` passes

### Task 3.3: Update scene handlers
**File:** `apps/backend/crates/api/src/handlers/scene.rs` (or equivalent)

**Acceptance Criteria:**
- [ ] Scene create auto-sets `pipeline_id` from parent avatar
- [ ] List/browse endpoints use direct `pipeline_id` filter
- [ ] `cargo check` passes

### Task 3.4: Update dashboard and other cross-cutting handlers
**Files:**
- `apps/backend/crates/api/src/handlers/dashboard.rs`
- Any other handlers that query avatars/variants/scenes with pipeline filtering

**Acceptance Criteria:**
- [ ] Dashboard widgets use direct `pipeline_id` column where available
- [ ] No remaining queries filter pipeline via JOIN when direct column exists
- [ ] `cargo check` passes

---

## Phase 4: Avatar Ingest Pipeline Awareness

### Task 4.1: Update avatar ingest to set `pipeline_id`
**Files:**
- `apps/backend/crates/api/src/handlers/avatar_ingest.rs`
- `apps/backend/crates/core/src/avatar_ingest.rs`

**Acceptance Criteria:**
- [ ] Ingest session resolves `pipeline_id` from project record
- [ ] All avatars created during ingest have `pipeline_id` set
- [ ] Duplicate detection during ingest checks `(pipeline_id, name)` not just `(project_id, name)`
- [ ] `cargo check` passes

### Task 4.2: Pipeline-scoped storage paths in ingest
**Files:**
- `apps/backend/crates/api/src/handlers/avatar_ingest.rs`
- Any file upload/storage handlers for seed images

**Acceptance Criteria:**
- [ ] Seed image uploads use `pipeline_scoped_key(pipeline_code, key)` for storage path
- [ ] Storage key saved in DB includes pipeline prefix
- [ ] Backward-compatible: existing files without prefix still readable via `resolve_storage_key()`
- [ ] `cargo check` passes

---

## Phase 5: Storage Path Migration

### Task 5.1: Wire pipeline-scoped paths into variant/scene storage
**Files:**
- `apps/backend/crates/api/src/handlers/image_variant.rs` (upload paths)
- `apps/backend/crates/api/src/handlers/scene_video_version.rs` (video paths)
- `apps/backend/crates/core/src/storage/mod.rs` (if new helpers needed)

**Acceptance Criteria:**
- [ ] New image variant uploads stored under `{pipeline_code}/variants/...`
- [ ] New scene video files stored under `{pipeline_code}/scenes/...`
- [ ] Uses `pipeline_scoped_key()` from core::storage
- [ ] Read paths use `resolve_storage_key()` for backward compatibility
- [ ] `cargo check` passes

### Task 5.2: Extend storage migration script
**File:** `scripts/python/migrate_storage_to_pipeline.py`

Extend the existing script to also migrate avatar seed images, image variant files, and scene video files to pipeline-prefixed paths.

**Acceptance Criteria:**
- [ ] Script migrates avatar seed images: `avatars/{id}/...` → `{pipeline_code}/avatars/{id}/...`
- [ ] Script migrates variant files: `variants/{id}/...` → `{pipeline_code}/variants/{id}/...`
- [ ] Script migrates scene files: `scenes/{id}/...` → `{pipeline_code}/scenes/{id}/...`
- [ ] Updates `storage_key`/`file_path` DB columns to reflect new paths
- [ ] Dry-run mode works correctly
- [ ] Idempotent (safe to re-run)

---

## Phase 6: Frontend Pipeline Context

### Task 6.1: Update avatar hooks to pass `pipeline_id`
**Files:**
- `apps/frontend/src/features/projects/hooks/use-project-avatars.ts`
- `apps/frontend/src/features/avatars/hooks/use-avatar-detail.ts`
- `apps/frontend/src/features/projects/hooks/use-avatar-import.ts`

**Acceptance Criteria:**
- [ ] `useProjectAvatars` passes `pipelineId` to API call
- [ ] Avatar creation hooks include `pipeline_id` in request body
- [ ] Import hook passes `pipeline_id` from pipeline context
- [ ] TypeScript types updated to include `pipeline_id` on Avatar interface

### Task 6.2: Update image variant hooks
**Files:**
- `apps/frontend/src/features/images/hooks/use-image-variants.ts`

**Acceptance Criteria:**
- [ ] Browse/list hooks pass `pipeline_id` query param
- [ ] Remove any project→pipeline JOIN workarounds in favor of direct filter
- [ ] `npx tsc --noEmit` passes

### Task 6.3: Update scene hooks
**Files:**
- `apps/frontend/src/features/scenes/hooks/useAvatarScenes.ts`
- Any other scene listing hooks

**Acceptance Criteria:**
- [ ] Scene list hooks pass `pipeline_id` query param
- [ ] `npx tsc --noEmit` passes

### Task 6.4: Update avatar pages and forms
**Files:**
- `apps/frontend/src/app/pages/AvatarsPage.tsx`
- `apps/frontend/src/app/pages/ImagesPage.tsx`
- `apps/frontend/src/app/pages/ScenesPage.tsx`
- `apps/frontend/src/features/avatars/components/AvatarFilterBar.tsx`

**Acceptance Criteria:**
- [ ] All avatar/image/scene pages use `usePipelineContextSafe()` to get pipeline_id
- [ ] Pipeline_id passed to all list/browse hooks
- [ ] Zero cross-pipeline data leakage in UI
- [ ] `npx tsc --noEmit` passes

### Task 6.5: Update avatar ingest frontend
**Files:**
- `apps/frontend/src/features/avatar-ingest/hooks/use-avatar-ingest.ts`
- `apps/frontend/src/features/projects/hooks/use-avatar-import.ts`

**Acceptance Criteria:**
- [ ] Ingest hooks pass `pipeline_id` from context
- [ ] Import modal/wizard includes pipeline context in requests
- [ ] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260324000001_add_pipeline_id_to_avatar_entities.sql` | Add pipeline_id to 4 tables |
| `apps/db/migrations/20260324000002_update_avatar_unique_constraints.sql` | Update unique constraints |
| `apps/backend/crates/db/src/models/avatar.rs` | Avatar model + CreateAvatar DTO |
| `apps/backend/crates/db/src/models/image_variant.rs` | ImageVariant model |
| `apps/backend/crates/db/src/models/scene.rs` | Scene model |
| `apps/backend/crates/db/src/repositories/avatar_repo.rs` | Avatar CRUD queries |
| `apps/backend/crates/db/src/repositories/image_variant_repo.rs` | ImageVariant queries |
| `apps/backend/crates/db/src/repositories/scene_repo.rs` | Scene queries |
| `apps/backend/crates/api/src/handlers/avatar_ingest.rs` | Ingest handler |
| `apps/backend/crates/api/src/handlers/image_variant.rs` | Image variant handler |
| `apps/backend/crates/api/src/handlers/dashboard.rs` | Dashboard widgets |
| `apps/backend/crates/core/src/storage/mod.rs` | Pipeline-scoped storage helpers |
| `scripts/python/migrate_storage_to_pipeline.py` | Storage migration script |
| `apps/frontend/src/features/projects/hooks/use-project-avatars.ts` | Avatar hooks |
| `apps/frontend/src/features/images/hooks/use-image-variants.ts` | Image variant hooks |
| `apps/frontend/src/features/scenes/hooks/useAvatarScenes.ts` | Scene hooks |
| `apps/frontend/src/app/pages/AvatarsPage.tsx` | Avatars browse page |
| `apps/frontend/src/app/pages/ImagesPage.tsx` | Images browse page |
| `apps/frontend/src/app/pages/ScenesPage.tsx` | Scenes browse page |

---

## Dependencies

### Existing Components to Reuse
- `pipeline_scoped_key()` from `crates/core/src/storage/mod.rs`
- `resolve_storage_key()` from `crates/core/src/storage/mod.rs`
- `migrate_storage_to_pipeline.py` — extend, don't rewrite
- `usePipelineContextSafe()` from `features/pipelines/PipelineProvider.tsx`
- Migration pattern from `20260322000003_add_pipeline_id_to_projects.sql`

### New Infrastructure Needed
- 2 migration files
- `AvatarRepo::list_by_pipeline()` method
- Updated TypeScript `Avatar` interface with `pipeline_id`

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations — Tasks 1.1-1.2
2. Phase 2: Backend Models & Repositories — Tasks 2.1-2.4
3. Phase 3: Backend Handlers & API — Tasks 3.1-3.4
4. Phase 4: Avatar Ingest — Tasks 4.1-4.2
5. Phase 5: Storage Path Migration — Tasks 5.1-5.2
6. Phase 6: Frontend — Tasks 6.1-6.5

**MVP Success Criteria:**
- All four tables have `pipeline_id NOT NULL` with correct backfill
- Avatar names unique per pipeline
- All CRUD operations set `pipeline_id`
- Storage paths pipeline-prefixed for new uploads
- Frontend shows only pipeline-scoped data
- Existing data fully migrated

### Post-MVP Enhancements
- Pipeline-scoped face embedding deduplication
- Per-pipeline storage analytics dashboard widget

---

## Notes

1. **Migration ordering matters:** Phase 1 must complete before Phase 2 (models won't compile without the column existing). Run `sqlx migrate run` before `cargo check`.
2. **Backfill depends on projects having pipeline_id:** This is guaranteed by PRD-138 (already applied).
3. **Storage migration is optional for MVP:** New files will use pipeline-scoped paths immediately. The migration script handles existing files and can be run separately.
4. **The unique constraint change `(pipeline_id, name)` means:** If project A and project B (both in x121) each have "Alexis Texas", this is a conflict. The import should detect and handle this — either reuse the existing avatar or prompt the user.

---

## Version History

- **v1.0** (2026-03-23): Initial task list creation from PRD-142
