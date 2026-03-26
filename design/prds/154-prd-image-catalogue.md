# PRD-154: Image Catalogue & Image Type Management

## 1. Introduction/Overview

The platform currently has a comprehensive **scene catalogue** that defines generatable video types — each with workflow assignments, prompt templates, track associations, and three-tier inheritance settings. However, there is no equivalent system for **images**.

Some images in the pipeline are not just user-provided inputs — they can be **generated** from other images. For example, in the x121 pipeline, the "clothed" reference image can be generated from the "topless" seed image via a ComfyUI workflow. This pattern will expand to other image generation types in the future.

This PRD introduces an **image catalogue** that mirrors the scene catalogue architecture, providing a structured way to define generatable image types with workflow assignments, prompt templates, per-track configuration, and three-tier inheritance for enable/disable at the project, group, and avatar levels.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-111** (Scene Catalog & Track Management) — tracks system used for source/output associations
- **PRD-123** (Scene Catalog & Scene Types Unification) — architectural pattern to mirror
- **PRD-138** (Multi-Pipeline Architecture) — pipeline scoping
- **PRD-147** (Media Variants & Seed Auto-Detection) — avatar_media_assignments for seed linking

### Extends
- **PRD-21** (Source Image Management & Variant Generation) — media variant storage for generated images
- **PRD-148** (Avatar Card Indicators) — indicator dots will include image generation status

### Related
- **PRD-22** (Source Image Quality Assurance) — QA workflow applies to generated images
- **PRD-57** (Batch Production Orchestrator) — batch image generation follows same pattern
- **PRD-115** (Generation Strategy & Workflow Prompt Management) — prompt template system reused

## 3. Goals

1. Define a catalogue of generatable image types per pipeline, analogous to scene types for video generation.
2. Allow each image type to specify: source track (input), output track (produced image), workflow, and prompt templates.
3. Support three-tier inheritance (project → group → avatar) for enabling/disabling image types.
4. Create per-avatar image instances that track generation status, similar to scene rows.
5. Allow both generation and manual upload for any image type — generation is primary, upload is override.
6. Integrate into the existing seed/seeds UI so admins can manage image generation alongside scene generation.

## 4. User Stories

- **As an admin**, I want to define image types in a pipeline's catalogue (e.g., "Clothed from Topless") so that the system knows which images can be generated and how.
- **As an admin**, I want to assign a ComfyUI workflow and prompt templates to each image type so that generation produces the correct output.
- **As an admin**, I want to enable/disable image types at the project, group, or avatar level so that different avatars can have different image generation requirements.
- **As a user**, I want to see which images are pending generation, in progress, or complete for each avatar so I can track progress.
- **As a user**, I want to manually upload an image for any image type if it was produced outside the app, overriding the generation path.
- **As an admin**, I want to configure per-track overrides for image types (different workflows or prompts per track) so that generation can be fine-tuned.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Image Types Table

**Description:** Create an `image_types` table that defines generatable image types per pipeline, analogous to `scene_types`.

**Acceptance Criteria:**
- [ ] `image_types` table with fields: id, name, slug, description, pipeline_id, workflow_id, source_track_id (input), output_track_id (produced image), is_active, sort_order, is_studio_level, prompt_template, negative_prompt_template, generation_params (JSONB), deleted_at, created_at, updated_at
- [ ] `source_track_id` FK to tracks — the track whose image is used as input seed
- [ ] `output_track_id` FK to tracks — the track this image type produces
- [ ] Unique constraint on (pipeline_id, slug) with soft-delete filter
- [ ] Pipeline-scoped: image types belong to a specific pipeline

#### Requirement 1.2: Image Type Track Associations

**Description:** Create a junction table linking image types to tracks they apply to, and a per-track config table for workflow/prompt overrides.

**Acceptance Criteria:**
- [ ] `image_type_tracks` junction table: (image_type_id, track_id) composite PK
- [ ] `image_type_track_configs` table with: id, image_type_id, track_id, workflow_id (override), prompt_template, negative_prompt_template, created_at, updated_at
- [ ] Unique constraint on (image_type_id, track_id) in configs table
- [ ] Cascade delete when image type or track is removed

#### Requirement 1.3: Avatar Image Instances

**Description:** Create per-avatar image rows that track generation status for each image type, analogous to `scenes`.

**Acceptance Criteria:**
- [ ] `avatar_images` table with: id, avatar_id, image_type_id, track_id, media_variant_id (nullable — linked when generated/uploaded), status_id (pending/generating/generated/approved/rejected/failed), generation_started_at, generation_completed_at, deleted_at, created_at, updated_at
- [ ] Unique constraint on (avatar_id, image_type_id, COALESCE(track_id, -1))
- [ ] Status lifecycle: pending → generating → generated → approved/rejected
- [ ] Manual upload sets media_variant_id directly, bypassing generation

#### Requirement 1.4: Three-Tier Inheritance Settings

**Description:** Enable/disable image types at project, group, and avatar levels, following the same pattern as scene settings.

**Acceptance Criteria:**
- [ ] `project_image_settings` table: (project_id, image_type_id, track_id nullable, is_enabled)
- [ ] `group_image_settings` table: (group_id, image_type_id, track_id nullable, is_enabled)
- [ ] `avatar_image_overrides` table: (avatar_id, image_type_id, track_id nullable, is_enabled)
- [ ] Resolution order: avatar override → group setting → project setting → image_type.is_active default
- [ ] Each table has unique constraint on (scope_id, image_type_id, COALESCE(track_id, -1))

#### Requirement 1.5: Backend CRUD API

**Description:** REST API endpoints for image type management, mirroring scene type endpoints.

**Acceptance Criteria:**
- [ ] `POST /api/v1/image-types` — create (pipeline-scoped)
- [ ] `GET /api/v1/image-types?pipeline_id=N` — list by pipeline
- [ ] `GET /api/v1/image-types/{id}` — get with track associations
- [ ] `PUT /api/v1/image-types/{id}` — update (including track_ids replacement)
- [ ] `DELETE /api/v1/image-types/{id}` — soft delete
- [ ] `GET /api/v1/scene-types/{scene_type_id}/tracks` pattern mirrored for image types
- [ ] Per-track config CRUD: upsert, get, delete for image_type_track_configs
- [ ] Three-tier settings CRUD for project/group/avatar levels

#### Requirement 1.6: Avatar Image Instance API

**Description:** API for managing per-avatar image instances.

**Acceptance Criteria:**
- [ ] `GET /api/v1/avatars/{avatar_id}/images` — list avatar's image instances with status
- [ ] `POST /api/v1/avatars/{avatar_id}/images` — create image instance (manual or trigger generation)
- [ ] `PUT /api/v1/avatars/{avatar_id}/images/{id}` — update (assign media_variant_id for upload)
- [ ] `DELETE /api/v1/avatars/{avatar_id}/images/{id}` — soft delete
- [ ] `POST /api/v1/avatars/{avatar_id}/images/{id}/approve` — approve generated image
- [ ] `POST /api/v1/avatars/{avatar_id}/images/{id}/reject` — reject generated image

#### Requirement 1.7: Image Catalogue Admin UI

**Description:** Frontend admin interface for managing image types, mirroring the scene catalogue UI.

**Acceptance Criteria:**
- [ ] Image catalogue list page showing all image types for the current pipeline
- [ ] Create/edit form with: name, slug, description, source track selector, output track selector, workflow selector, prompt templates, sort order, active toggle
- [ ] Track association checkboxes (which tracks this image type applies to)
- [ ] Per-track config editor for workflow/prompt overrides
- [ ] Accessible from the pipeline settings / admin area alongside scene catalogue

#### Requirement 1.8: Avatar Image Tab Integration

**Description:** Show image generation status in the avatar detail seeds tab alongside scene seed slots.

**Acceptance Criteria:**
- [ ] Seeds tab shows image type slots alongside scene type slots
- [ ] Each image type slot shows: image type name, source track, output track, workflow status, assignment status
- [ ] Slots support: generate action, manual upload, approve/reject
- [ ] Missing workflow or missing source seed shows warning icon (generation blocked)
- [ ] Consistent card styling with scene seed slot cards

#### Requirement 1.9: Seed Summary Integration

**Description:** The `GET /api/v1/avatars/{avatar_id}/seed-summary` endpoint includes image type slots.

**Acceptance Criteria:**
- [ ] Seed summary returns image type slots with `slot_kind: "image"` alongside scene slots (`slot_kind: "scene"`)
- [ ] Image type slots include: image_type_id, image_type_name, source_track_id, source_track_name, output_track_id, output_track_name, workflow_name, media_slot_id, assignment status
- [ ] Respects three-tier inheritance (only enabled image types appear)

#### Requirement 1.10: Avatar Card Indicator Integration

**Description:** Avatar card indicator dots on the avatars listing page reflect image generation status.

**Acceptance Criteria:**
- [ ] Image type deliverables appear as indicator dots alongside track seed dots
- [ ] Green dot when image is generated/approved or manually uploaded
- [ ] Grey dot when image is pending/missing
- [ ] Tooltip shows image type name and status

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Batch Image Generation
**[OPTIONAL — Post-MVP]** Support batch generation across multiple avatars, mirroring the batch production orchestrator for scenes.

#### Requirement 2.2: Image Type Inheritance
**[OPTIONAL — Post-MVP]** Parent/child image type hierarchy (mirroring PRD-100 scene type inheritance) for sharing base configurations.

#### Requirement 2.3: Auto-Retry for Image Generation
**[OPTIONAL — Post-MVP]** Auto-retry policy for failed image generations (mirroring PRD-71).

#### Requirement 2.4: Image Deliverable Ignores
**[OPTIONAL — Post-MVP]** Per-avatar ability to mark specific image types as intentionally skipped, excluding them from readiness calculations (mirroring avatar_deliverable_ignores for scenes).

## 6. Non-Goals (Out of Scope)

- **Image editing/manipulation tools** — this PRD covers generation via ComfyUI workflows, not in-app editing.
- **Replacing the existing media variant system** — image types produce media variants; they don't replace the storage layer.
- **Real-time image generation preview** — generation is async, results are stored as media variants.
- **Cross-pipeline image types** — image types are pipeline-scoped only.

## 7. Design Considerations

- **UI mirrors scene catalogue** — the image catalogue admin UI should follow the same terminal aesthetic and layout patterns as the scene catalogue (list + form modal + track config editor).
- **Seeds tab integration** — image type slots appear **at the top** of the seeds tab as a distinct row, since they are prerequisites for scene generation. Visually distinct from scene slots below.
- **Workflow selector** — reuse the existing workflow selector component from the scene catalogue form.
- **Track selectors** — source and output track selection use the same track dropdown as scene type forms, but with clear labelling ("Source Track: input seed", "Output Track: produced image").

## 8. Technical Considerations

### Existing Code to Reuse
- **Scene catalogue architecture** — mirror `scene_types`, `scene_type_tracks`, `scene_type_track_configs` table patterns exactly
- **Three-tier inheritance** — mirror `project_scene_settings` / `group_scene_settings` / `avatar_scene_overrides` pattern
- **Backend repository pattern** — same CRUD + track association methods as `SceneTypeRepo`
- **Frontend scene-catalogue components** — form, list, track config, inheritance UI components can be adapted
- **Workflow hooks** — `useWorkflows` from `@/features/workflow-import`
- **Track hooks** — `useTracks` from `@/features/scene-catalogue/hooks/use-tracks`
- **Media variant system** — generated images are stored as `media_variants` rows
- **Seed summary handler** — extend `get_seed_summary` in `media_management.rs`

### New Infrastructure Needed
- `image_types` model, repo, handler (Rust)
- `image_type_track_configs` model, repo, handler (Rust)
- `avatar_images` model, repo, handler (Rust)
- Three-tier settings models, repos, handlers (Rust)
- `image-catalogue/` frontend feature directory with types, hooks, components
- Integration into avatar seeds tab and seed summary API

### Database Changes
- 7 new tables: `image_types`, `image_type_tracks`, `image_type_track_configs`, `avatar_images`, `project_image_settings`, `group_image_settings`, `avatar_image_overrides`
- Status lookup table: `image_statuses` (or reuse existing status pattern)
- Indexes on all foreign keys and common query patterns

### API Changes
- New resource: `/api/v1/image-types` (CRUD + track management)
- New resource: `/api/v1/image-types/{id}/track-configs` (per-track config CRUD)
- New resource: `/api/v1/avatars/{avatar_id}/images` (instance CRUD + approve/reject)
- Extended: `/api/v1/avatars/{avatar_id}/seed-summary` (include image type slots)
- New: Three-tier settings endpoints for project/group/avatar image settings

## 9. Success Metrics

- Admin can define image types in the x121 pipeline catalogue (e.g., "Clothed from Topless").
- Image types appear as seed slots in the avatar seeds tab with correct source/output track labels.
- Images can be generated via assigned ComfyUI workflows and stored as media variants.
- Images can be manually uploaded as an alternative to generation.
- Three-tier inheritance correctly enables/disables image types per project/group/avatar.
- Avatar card indicator dots reflect image generation completeness.

## 10. Resolved Design Decisions

1. **Image generation triggering** — Both manual (from seeds tab per-avatar) and batch (from production orchestrator across multiple avatars). Same dual-path as scene generation.
2. **Generation order dependencies** — Enforced. System blocks generation if source seed image is missing, shows warning icon. User must provide the source image first. No auto-chaining.
3. **Seed summary grouping** — Image type slots appear at the top of the seeds tab as prerequisites, above scene seed slots. They are the first things the user sees since scenes depend on them.

## 11. Version History

- **v1.0** (2026-03-26): Initial PRD creation
