# PRD-123: Scene Catalog & Scene Types Unification

**Document ID:** 123-prd-scene-catalog-scene-types-unification
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-01
**Last Updated:** 2026-03-01

---

## 1. Introduction/Overview

The platform currently has two separate tables representing the same concept at different abstraction levels: `scene_types` (PRD-023) and `scene_catalog` (PRD-111). The `scene_types` table is the heavyweight "engine" table with 35 columns covering workflow JSON, LoRA config, prompt templates, duration, generation strategy, auto-retry, and inheritance (PRD-100). The `scene_catalog` table is a lightweight 9-column content inventory with name, slug, description, clothes-off flag, track associations, and active/inactive status.

These two tables are not connected -- there is no foreign key between them. PRD-111 explicitly states it "Modifies PRD-23" and notes that `scene_types` should gain a FK to `scene_catalog`, but that linkage was never implemented. The frontend has two separate pages: "Scene Types" at `/content/scene-types` showing raw `scene_types` records, and "Scene Catalog" at `/content/scene-catalog` showing `scene_catalog` entries. Users must navigate between two different pages to manage what is conceptually a single entity, creating confusion and making the three-level inheritance chain (catalog defaults -> project settings -> character overrides) disconnected from the actual generation engine.

This PRD unifies the two tables by absorbing `scene_catalog` into `scene_types`. The `scene_types` table is canonical -- it drives video generation. The columns unique to `scene_catalog` (`slug`, `has_clothes_off_transition`) will be added to `scene_types`, the junction table will be remapped, the inheritance chain will point to `scene_type_id` instead of `scene_catalog_id`, and the `scene_catalog` table will be dropped. The frontend will present a single "Scene Catalog" page backed by `scene_types`, with click-through to scene type configuration detail.

## 2. Related PRDs & Dependencies

### Depends On (all done)
- **PRD-023:** Scene Type Configuration -- defines the `scene_types` table and its configuration fields
- **PRD-111:** Scene Catalog & Track Management -- defines the `scene_catalog` table, tracks, and three-level inheritance
- **PRD-100:** Scene Type Inheritance & Composition -- adds parent/child hierarchy and mixins to `scene_types`
- **PRD-071:** Smart Auto-Retry -- adds retry policy columns to `scene_types`

### Supersedes
- **PRD-111 (partially):** The `scene_catalog` table and its CRUD are removed; tracks and three-level inheritance move to `scene_types`

### Affected By
- **PRD-057:** Batch Production Orchestrator -- references scene types for matrix generation
- **PRD-115:** Generation Strategy & Workflow Prompt Management -- prompt defaults linked to scene types
- **PRD-120:** Scene & Workflow Naming Hierarchy -- uses scene type names in generation scripts

## 3. Goals

### Primary Goals
1. Eliminate the disconnected dual-table architecture by absorbing `scene_catalog` columns into `scene_types`.
2. Establish `scene_types` as the single source of truth for both content concepts and generation configuration.
3. Migrate the three-level inheritance chain (`project_scene_settings`, `character_scene_overrides`) to reference `scene_type_id` instead of `scene_catalog_id`.
4. Replace `scene_catalog_tracks` with `scene_type_tracks`, linking tracks directly to `scene_types`.
5. Present a single unified "Scene Catalog" page in the frontend that shows scene types with catalog metadata (slug, tracks, clothes-off flag) and links through to full configuration.

### Secondary Goals
1. Reduce cognitive load for users who currently must navigate two separate pages for related data.
2. Simplify backend code by removing the `scene_catalog` model, repo, handlers, and routes.
3. Preserve all existing seed data (the ~26 initial scene concepts from `scene_catalog`) by ensuring corresponding `scene_types` rows exist.

## 4. User Stories

- As an Admin, I want a single "Scene Catalog" page that shows all scene definitions with their tracks, slug, and configuration status so that I do not have to cross-reference two separate pages.
- As an Admin, I want to click on a scene catalog entry to see and edit its full configuration (workflow, prompts, duration, LoRA, auto-retry) so that catalog browsing and engine configuration are in one flow.
- As a Creator, I want the project scene settings to reference scene types directly so that when I enable/disable a scene for my project, it maps to the exact scene type used for generation.
- As a Creator, I want per-character scene overrides to reference scene types directly so that there is no ambiguity between a "catalog concept" and the "generation recipe" it maps to.
- As a Developer, I want a single model and repo for scene definitions so that I do not maintain parallel code paths that represent the same concept.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Add Catalog Columns to scene_types
**Description:** Extend the `scene_types` table with the two columns from `scene_catalog` that it does not already have: `slug` and `has_clothes_off_transition`. The columns `name`, `description`, `is_active`, `sort_order` already exist on `scene_types`.

**Acceptance Criteria:**
- [ ] Migration adds `slug TEXT UNIQUE` to `scene_types` (nullable initially for backfill, then set NOT NULL after backfill)
- [ ] Migration adds `has_clothes_off_transition BOOLEAN NOT NULL DEFAULT false` to `scene_types`
- [ ] Backfill: for each `scene_catalog` row, if a matching `scene_types` row exists by name, set its `slug` and `has_clothes_off_transition` from the catalog entry
- [ ] Backfill: for each `scene_catalog` row without a matching `scene_types` row, insert a new studio-level `scene_types` row with the catalog data (name, slug, description, has_clothes_off_transition, sort_order, is_active)
- [ ] After backfill, `slug` column is made NOT NULL with a UNIQUE constraint
- [ ] Existing `scene_types` rows without a slug get an auto-generated slug derived from their name (lowercase, spaces to underscores, non-alphanumeric stripped)

**Technical Notes:**
- The backfill must handle name collisions gracefully (scene_types may have project-scoped rows with the same name as studio-level rows)
- Only studio-level scene_types (where `project_id IS NULL`) should receive slugs from scene_catalog; project-scoped scene_types get auto-generated slugs
- The slug uniqueness constraint should be partial: `CREATE UNIQUE INDEX uq_scene_types_slug ON scene_types(slug) WHERE deleted_at IS NULL`

#### Requirement 1.2: Create scene_type_tracks Junction Table
**Description:** Replace `scene_catalog_tracks` with a new `scene_type_tracks` junction table linking `scene_types` to `tracks`.

**Acceptance Criteria:**
- [ ] New table `scene_type_tracks` with columns: `scene_type_id BIGINT NOT NULL`, `track_id BIGINT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- [ ] Composite primary key on `(scene_type_id, track_id)`
- [ ] Foreign keys to `scene_types(id) ON DELETE CASCADE` and `tracks(id) ON DELETE CASCADE`
- [ ] Index on `track_id` for reverse lookups
- [ ] Migration copies data from `scene_catalog_tracks` to `scene_type_tracks`, mapping `scene_catalog_id` to the corresponding `scene_type_id` (matched by name/slug from the backfill in Req 1.1)

**Technical Notes:**
- The mapping relies on the backfill in Req 1.1 having already created/matched scene_types rows for each scene_catalog entry
- Scene types that were not in the catalog (e.g., project-scoped custom types) will have no track associations initially

#### Requirement 1.3: Migrate project_scene_settings FK
**Description:** Change `project_scene_settings.scene_catalog_id` to `project_scene_settings.scene_type_id`, pointing to `scene_types` instead of `scene_catalog`.

**Acceptance Criteria:**
- [ ] Migration adds `scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE` column to `project_scene_settings`
- [ ] Migration backfills `scene_type_id` from the catalog-to-scene_type mapping established in Req 1.1
- [ ] Migration drops the `scene_catalog_id` column after backfill
- [ ] Unique constraint updated: `(project_id, scene_type_id)` replaces `(project_id, scene_catalog_id)`
- [ ] Index on `scene_type_id` replaces index on `scene_catalog_id`

**Technical Notes:**
- The migration must handle any rows where the `scene_catalog_id` does not map to a `scene_type_id` (log warning, delete orphaned settings)

#### Requirement 1.4: Migrate character_scene_overrides FK
**Description:** Change `character_scene_overrides.scene_catalog_id` to `character_scene_overrides.scene_type_id`, pointing to `scene_types` instead of `scene_catalog`.

**Acceptance Criteria:**
- [ ] Migration adds `scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE` column to `character_scene_overrides`
- [ ] Migration backfills `scene_type_id` from the catalog-to-scene_type mapping
- [ ] Migration drops the `scene_catalog_id` column after backfill
- [ ] Unique constraint updated: `(character_id, scene_type_id)` replaces `(character_id, scene_catalog_id)`
- [ ] Index on `scene_type_id` replaces index on `scene_catalog_id`

#### Requirement 1.5: Drop scene_catalog Tables
**Description:** Remove the `scene_catalog_tracks` and `scene_catalog` tables after all FKs have been migrated.

**Acceptance Criteria:**
- [ ] `scene_catalog_tracks` table is dropped
- [ ] `scene_catalog` table is dropped
- [ ] All associated indexes, triggers, and constraints are removed with CASCADE

**Technical Notes:**
- This migration must run AFTER Requirements 1.1-1.4 have completed (all FKs migrated away)

#### Requirement 1.6: Update SceneType Backend Model
**Description:** Update the Rust `SceneType` struct and DTOs to include the new catalog-origin fields.

**Acceptance Criteria:**
- [ ] `SceneType` struct in `crates/db/src/models/scene_type.rs` gains: `slug: String`, `has_clothes_off_transition: bool`
- [ ] `CreateSceneType` DTO gains: `slug: String`, `has_clothes_off_transition: Option<bool>`
- [ ] `UpdateSceneType` DTO gains: `slug: Option<String>` (mutable for admin, unlike scene_catalog where it was immutable), `has_clothes_off_transition: Option<bool>`
- [ ] Column list constant (`COLUMNS`) in `SceneTypeRepo` updated to include new columns
- [ ] All CREATE, UPDATE, and SELECT queries in `SceneTypeRepo` updated to include new columns

**Technical Notes:**
- File: `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/models/scene_type.rs`
- File: `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/repositories/scene_type_repo.rs`

#### Requirement 1.7: Add Track Association Methods to SceneTypeRepo
**Description:** Move track association methods from `SceneCatalogRepo` to `SceneTypeRepo`, adapted for `scene_type_tracks`.

**Acceptance Criteria:**
- [ ] `SceneTypeRepo::get_tracks_for_scene_type(pool, scene_type_id) -> Vec<Track>` -- join via `scene_type_tracks`
- [ ] `SceneTypeRepo::set_tracks(pool, scene_type_id, track_ids)` -- replace all associations in a transaction
- [ ] `SceneTypeRepo::add_track(pool, scene_type_id, track_id)` -- idempotent add (ON CONFLICT DO NOTHING)
- [ ] `SceneTypeRepo::remove_track(pool, scene_type_id, track_id) -> bool`
- [ ] New response DTO: `SceneTypeWithTracks` (flattens `SceneType` + `tracks: Vec<Track>`)
- [ ] `SceneTypeRepo::find_by_id_with_tracks(pool, id) -> Option<SceneTypeWithTracks>`
- [ ] `SceneTypeRepo::list_studio_level_with_tracks(pool) -> Vec<SceneTypeWithTracks>`

**Technical Notes:**
- Reuse the exact query patterns from `SceneCatalogRepo` -- the join structure is identical, just referencing `scene_type_tracks` instead of `scene_catalog_tracks`

#### Requirement 1.8: Update Effective Scene Settings (Three-Level Inheritance)
**Description:** Update `EffectiveSceneSetting` and the repos/handlers for `project_scene_settings` and `character_scene_overrides` to use `scene_type_id`.

**Acceptance Criteria:**
- [ ] `EffectiveSceneSetting` struct: `scene_catalog_id` field renamed to `scene_type_id`
- [ ] `SceneSettingUpdate` struct: `scene_catalog_id` field renamed to `scene_type_id`
- [ ] `ProjectSceneSetting` model: `scene_catalog_id` field renamed to `scene_type_id`
- [ ] `CharacterSceneOverride` model: `scene_catalog_id` field renamed to `scene_type_id`
- [ ] `ProjectSceneSettingRepo::list_effective` query updated: joins `scene_types` instead of `scene_catalog`, filters `WHERE st.deleted_at IS NULL AND st.is_active = true`
- [ ] `ProjectSceneSettingRepo::upsert` and `bulk_upsert` queries updated: column `scene_catalog_id` -> `scene_type_id`
- [ ] `CharacterSceneOverrideRepo::list_effective` query updated: joins `scene_types` instead of `scene_catalog`
- [ ] `CharacterSceneOverrideRepo::upsert` and `bulk_upsert` queries updated: column `scene_catalog_id` -> `scene_type_id`
- [ ] All handler parameter names updated (`scene_catalog_id` -> `scene_type_id` in path params)
- [ ] Route paths updated: `/scene-settings/{scene_catalog_id}` -> `/scene-settings/{scene_type_id}`

**Technical Notes:**
- Files affected:
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/models/scene_catalog.rs` (EffectiveSceneSetting moves to scene_type.rs)
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/models/project_scene_setting.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/models/character_scene_override.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/repositories/project_scene_setting_repo.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/repositories/character_scene_override_repo.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/api/src/handlers/project_scene_settings.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/api/src/handlers/character_scene_overrides.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/api/src/routes/project_scene_settings.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/api/src/routes/character_scene_overrides.rs`

#### Requirement 1.9: Merge Scene Catalog API Into Scene Type API
**Description:** The scene catalog CRUD endpoints should become scene type endpoints. Remove the separate `/scene-catalog` routes.

**Acceptance Criteria:**
- [ ] Scene catalog list endpoint moves to scene type: `GET /api/v1/scene-types` returns `SceneTypeWithTracks[]` (list with tracks and catalog metadata)
- [ ] Track management endpoints added to scene types: `POST /api/v1/scene-types/{id}/tracks`, `DELETE /api/v1/scene-types/{id}/tracks/{track_id}`
- [ ] Scene catalog create/update/deactivate functionality is handled by existing scene type CRUD (no separate endpoints needed)
- [ ] Remove `scene_catalog` handler module, route module, model module, and repo module
- [ ] Remove `scene_catalog` references from `mod.rs` files in handlers, routes, models, and repositories
- [ ] Delete test files: `crates/db/tests/scene_catalog.rs`, `crates/api/tests/scene_catalog_api.rs`

**Technical Notes:**
- Files to delete:
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/models/scene_catalog.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/src/repositories/scene_catalog_repo.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/api/src/handlers/scene_catalog.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/api/src/routes/scene_catalog.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/db/tests/scene_catalog.rs`
  - `/home/matthias/dev_projects/trulience/apps/backend/crates/api/tests/scene_catalog_api.rs`

#### Requirement 1.10: Unify Frontend Types
**Description:** Merge the `SceneCatalogEntry` and `SceneType` TypeScript interfaces into a single unified type.

**Acceptance Criteria:**
- [ ] `SceneType` interface in `features/scene-types/types.ts` gains: `slug: string`, `has_clothes_off_transition: boolean`, `tracks: Track[]` (optional, present when loaded with tracks)
- [ ] `CreateSceneType` gains: `slug: string`, `has_clothes_off_transition?: boolean`, `track_ids?: number[]`
- [ ] `UpdateSceneType` gains: `slug?: string`, `has_clothes_off_transition?: boolean`, `track_ids?: number[]`
- [ ] `EffectiveSceneSetting` interface: `scene_catalog_id` renamed to `scene_type_id`
- [ ] `SceneSettingUpdate` interface: `scene_catalog_id` renamed to `scene_type_id`
- [ ] Remove `features/scene-catalog/types.ts` (all types consolidated into `features/scene-types/types.ts` or the catalog feature uses scene-types types)
- [ ] Update all imports across the frontend to use the unified types

**Technical Notes:**
- The `Track` interface can remain in `features/scene-catalog/types.ts` or move to a shared location since it is its own entity

#### Requirement 1.11: Unify Frontend Scene Catalog Page
**Description:** The "Scene Catalog" page becomes the unified view, backed by `scene_types` with tracks. The "Scene Types" page is removed.

**Acceptance Criteria:**
- [ ] "Scene Catalog" page at `/content/scene-catalog` now fetches from `GET /api/v1/scene-types` (studio-level, with tracks)
- [ ] Catalog list displays: name, slug, description, tracks (as badges), clothes-off flag, active status, sort order
- [ ] Clicking a catalog entry navigates to a scene type detail/configuration view showing workflow, prompts, duration, LoRA, generation strategy, auto-retry, and inheritance tree
- [ ] Scene type detail view is the existing `SceneTypeEditor` component (from `features/scene-types/`)
- [ ] Track management (add/remove tracks) is available inline on the catalog list or in the detail view
- [ ] "Scene Types" page at `/content/scene-types` route is removed from `router.tsx`
- [ ] `SceneTypesPage` page component is deleted from `apps/frontend/src/app/pages/`
- [ ] Scene types feature folder (`features/scene-types/`) components are refactored or moved into the catalog feature as needed

**Technical Notes:**
- The `SceneTypeEditor`, `PromptTemplateEditor`, `InheritanceTree`, and `OverrideIndicator` components from `features/scene-types/` should be preserved -- they are reused in the detail view
- The `SceneMatrixView` component should also be preserved for the production matrix feature

#### Requirement 1.12: Update Navigation
**Description:** Remove "Scene Types" from the Content nav section and keep "Scene Catalog" as the single entry point.

**Acceptance Criteria:**
- [ ] Remove `{ label: "Scene Types", path: "/content/scene-types", icon: Settings }` from `navigation.ts` Content section
- [ ] "Scene Catalog" nav entry remains: `{ label: "Scene Catalog", path: "/content/scene-catalog", icon: List }`
- [ ] No dead links or broken routes after removal

**Technical Notes:**
- File: `/home/matthias/dev_projects/trulience/apps/frontend/src/app/navigation.ts` (line 85)

#### Requirement 1.13: Update Frontend Hooks
**Description:** Update all scene catalog hooks to use the unified scene type API.

**Acceptance Criteria:**
- [ ] `use-scene-catalog.ts` hooks updated to call scene type API endpoints (`/api/v1/scene-types`)
- [ ] `use-project-scene-settings.ts` hooks updated: `scene_catalog_id` -> `scene_type_id` in all types and API calls
- [ ] `use-character-scene-settings.ts` hooks updated: `scene_catalog_id` -> `scene_type_id` in all types and API calls
- [ ] `use-scene-types.ts` hooks updated to include tracks in responses
- [ ] Query keys updated to reflect unified model
- [ ] `ProjectSceneSettings` component updated to use `scene_type_id`
- [ ] `CharacterSceneOverrides` component updated to use `scene_type_id`

**Technical Notes:**
- Files:
  - `/home/matthias/dev_projects/trulience/apps/frontend/src/features/scene-catalog/hooks/use-scene-catalog.ts`
  - `/home/matthias/dev_projects/trulience/apps/frontend/src/features/scene-catalog/hooks/use-project-scene-settings.ts`
  - `/home/matthias/dev_projects/trulience/apps/frontend/src/features/scene-catalog/hooks/use-character-scene-settings.ts`
  - `/home/matthias/dev_projects/trulience/apps/frontend/src/features/scene-types/hooks/use-scene-types.ts`

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Slug Auto-Generation
**Description:** When creating a new scene type without specifying a slug, auto-generate one from the name.

#### Requirement 2.2: Scene Catalog Search & Filtering
**Description:** Add search/filter to the unified catalog page (by name, track, active status).

#### Requirement 2.3: Drag-and-Drop Reordering
**Description:** Allow drag-and-drop reordering of scene types in the catalog view, persisting `sort_order` changes.

## 6. Non-Functional Requirements

### Performance
- The `list_studio_level_with_tracks` query must complete in under 100ms for up to 100 scene types with track joins.
- The migration itself may be slow on large datasets due to backfill; it should use batched updates if needed.

### Security
- No new auth requirements. Scene type management is admin-only (existing RBAC).
- The slug field must not contain path traversal characters (validated on input).

### Data Integrity
- The migration must be idempotent where possible (re-runnable without data loss).
- No data loss during migration: all `scene_catalog` entries must have corresponding `scene_types` rows after migration.
- The three-level inheritance chain must produce identical `is_enabled` results before and after migration.

## 7. Non-Goals (Out of Scope)

- **Renaming the `scene_types` table to `scene_catalog`** -- the table keeps its canonical name since downstream code (scenes table FK, generation pipeline) already references it.
- **Changing the scene types inheritance model (PRD-100)** -- parent/child hierarchy, mixins, and overrides are unchanged.
- **Modifying the tracks system** -- the `tracks` table itself is untouched; only the junction table changes.
- **Changing the generation pipeline** -- no changes to how scene types are used in video generation.
- **Adding new columns to scene_types beyond slug and has_clothes_off_transition** -- other catalog-like features are post-MVP.

## 8. Design Considerations

- The "Scene Catalog" page serves as the primary entry point for content managers. It presents the lightweight catalog view (name, slug, tracks, flags) by default. Clicking through reveals the full scene type configuration (workflow, prompts, duration, LoRA). This progressive disclosure matches how users think about the content hierarchy.
- The catalog list view should render using the existing `SceneCatalogList` component, adapted to work with `SceneType` data. The `TrackBadge` and `SourceBadge` components are preserved.
- The detail view should render using the existing `SceneTypeEditor` component, with the catalog fields (slug, tracks, clothes-off) displayed at the top.

## 9. Technical Considerations

### Existing Code to Reuse
- `SceneTypeRepo` methods (CRUD, soft delete, restore, inheritance queries) -- extend rather than replace
- `SceneCatalogRepo` track association patterns (get_tracks, set_tracks, add_track, remove_track) -- port to SceneTypeRepo with minimal changes
- `SceneCatalogList`, `TrackBadge`, `SourceBadge`, `SceneCatalogForm` frontend components -- adapt to use `SceneType` data
- `SceneTypeEditor`, `PromptTemplateEditor`, `InheritanceTree`, `OverrideIndicator` frontend components -- used in detail view
- `ProjectSceneSettings` and `CharacterSceneOverrides` components -- field rename only

### Database Changes
- **Migration 1:** Add `slug` and `has_clothes_off_transition` to `scene_types`. Create mapping table `_scene_catalog_to_scene_type_map` (temporary). Backfill scene_types from scene_catalog. Set NOT NULL on slug.
- **Migration 2:** Create `scene_type_tracks` junction table. Copy data from `scene_catalog_tracks` using the mapping.
- **Migration 3:** Add `scene_type_id` to `project_scene_settings`. Backfill. Drop `scene_catalog_id`. Update constraints.
- **Migration 4:** Add `scene_type_id` to `character_scene_overrides`. Backfill. Drop `scene_catalog_id`. Update constraints.
- **Migration 5:** Drop `scene_catalog_tracks` and `scene_catalog` tables. Drop temporary mapping table.

All tables follow the existing ID strategy (BIGSERIAL id, no UUID needed for junction tables).

### API Changes
- **Modified:** `GET /api/v1/scene-types` -- gains optional `?include_tracks=true` query param, returns `SceneTypeWithTracks[]` when set
- **Added:** `POST /api/v1/scene-types/{id}/tracks` -- add tracks to a scene type
- **Added:** `DELETE /api/v1/scene-types/{id}/tracks/{track_id}` -- remove track from a scene type
- **Modified:** `PUT /api/v1/projects/{project_id}/scene-settings/{scene_type_id}` -- path param renamed
- **Modified:** `PUT /api/v1/characters/{character_id}/scene-settings/{scene_type_id}` -- path param renamed
- **Modified:** `DELETE /api/v1/characters/{character_id}/scene-settings/{scene_type_id}` -- path param renamed
- **Removed:** All `/api/v1/scene-catalog` endpoints

## 10. Edge Cases & Error Handling

1. **Name collision during backfill:** A `scene_catalog` entry might share a name with a project-scoped `scene_types` row. The backfill must only match studio-level scene types (`project_id IS NULL`). If no studio-level match exists, create a new studio-level scene type.

2. **Orphaned project_scene_settings/character_scene_overrides:** If a `scene_catalog_id` in these tables does not map to any `scene_types` row after backfill, the orphaned row should be logged and deleted (it references a catalog entry that was never linked to a scene type).

3. **Duplicate slugs during backfill:** Scene types that already exist may have names that produce duplicate auto-generated slugs. The slug generation function must append a numeric suffix (`_2`, `_3`, etc.) to ensure uniqueness.

4. **Soft-deleted scene types:** The slug uniqueness constraint must be partial (only among non-deleted rows). Track associations should still reference soft-deleted scene types (CASCADE delete handles hard delete).

5. **Frontend race conditions during migration:** If the frontend is deployed before the backend migration, `/scene-catalog` API calls will fail. Deploy backend first, then frontend.

6. **Empty tracks for project-scoped scene types:** Project-scoped scene types will have no track associations after migration (only catalog entries had tracks). This is expected -- project-scoped types inherit tracks from their parent studio-level type.

## 11. Success Metrics

- Zero data loss: every `scene_catalog` entry has a corresponding `scene_types` row after migration.
- Three-level inheritance produces identical `is_enabled` results before and after migration (verified by integration test).
- Single page for scene management: "Scene Types" nav item removed, "Scene Catalog" is the sole entry point.
- No references to `scene_catalog_id` remain in source code (backend or frontend).
- No broken routes or dead links in the frontend navigation.

## 12. Testing Requirements

### Backend Integration Tests
- [ ] Migration test: verify all `scene_catalog` entries produce matching `scene_types` rows with correct slug and has_clothes_off_transition
- [ ] Migration test: verify `scene_type_tracks` contains all data from `scene_catalog_tracks`
- [ ] Migration test: verify `project_scene_settings.scene_type_id` is correctly populated
- [ ] Migration test: verify `character_scene_overrides.scene_type_id` is correctly populated
- [ ] Repo test: `SceneTypeRepo::find_by_id_with_tracks` returns tracks
- [ ] Repo test: `SceneTypeRepo::set_tracks` replaces associations correctly
- [ ] Repo test: `ProjectSceneSettingRepo::list_effective` joins `scene_types` and returns correct results
- [ ] Repo test: `CharacterSceneOverrideRepo::list_effective` returns correct three-level merge
- [ ] API test: `GET /api/v1/scene-types` returns list with tracks
- [ ] API test: `POST /api/v1/scene-types/{id}/tracks` adds track association
- [ ] API test: `DELETE /api/v1/scene-types/{id}/tracks/{track_id}` removes track association
- [ ] API test: `GET /api/v1/scene-catalog` returns 404 (removed)

### Frontend Tests
- [ ] Scene catalog list renders scene type data with tracks
- [ ] Scene catalog entry click navigates to scene type detail
- [ ] Project scene settings uses `scene_type_id` in API calls
- [ ] Character scene overrides uses `scene_type_id` in API calls
- [ ] "Scene Types" nav item is absent
- [ ] "Scene Catalog" nav item is present and navigates correctly

## 13. Open Questions

1. **Should the `/content/scene-catalog` route be renamed to `/content/scene-types` or kept as-is?** Recommendation: keep as `/content/scene-catalog` since users think in terms of "catalog" when browsing content. The internal table name (`scene_types`) is a backend concern.

2. **Should project-scoped scene types also appear in the catalog view, or only studio-level?** Recommendation: the catalog shows only studio-level scene types by default, with an optional filter to show project-scoped types (matching current `list_studio_level` behavior).

3. **Should the slug be mutable on scene_types?** On `scene_catalog`, the slug was immutable after creation (used in file naming). The same constraint should likely apply to `scene_types` to avoid breaking file paths. Recommendation: slug is immutable after creation (enforced in the update handler, not the database).

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-01 | AI Product Manager | Initial draft |
