# PRD-142: Pipeline-Scoped Avatars

## 1. Introduction/Overview

Avatars are currently scoped to projects, with pipeline association inferred indirectly through `avatar.project_id -> project.pipeline_id`. This PRD makes avatars explicitly pipeline-scoped by adding direct `pipeline_id` columns to avatars, avatar groups, image variants, and scenes. All avatar-related data — DB records, storage paths, and queries — must be fully siloed by pipeline. The same avatar uploaded into different pipelines is treated as a completely independent object with no cross-pipeline linking.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-138 (Multi-Pipeline Architecture) — pipelines table, pipeline_id on projects/tracks/workflows/scene_types
  - PRD-140 (Character to Avatar Rename) — table/column rename already applied
  - PRD-141 (Pipeline-Scoped Imports and Storage) — import rules, `pipeline_scoped_key()`, storage migration script

- **Extends:**
  - PRD-139 (Pipeline Workspace Completeness) — frontend pipeline context filtering

- **Conflicts with:** None

## 3. Goals

1. Every avatar record has an explicit `pipeline_id` FK — no reliance on project join for pipeline context
2. Avatar names are unique within a pipeline (not just within a project): same avatar across projects in one pipeline = same entity
3. Image variants and scenes have explicit `pipeline_id` for direct query filtering
4. Avatar groups have explicit `pipeline_id` for consistency
5. All avatar-related storage paths are prefixed with pipeline code
6. Same person uploaded to different pipelines = completely independent objects, no linking
7. All existing data backfilled to match the new schema

## 4. User Stories

- **As a pipeline operator**, I want to import an avatar into y122 without it conflicting with the same name in x121, so that each pipeline's content is independent.
- **As a content manager**, I want to browse avatars within a pipeline and only see that pipeline's content, without x121 data leaking into y122.
- **As a developer**, I want to query avatars directly by `pipeline_id` without joining through projects, so queries are simpler and faster.
- **As an admin**, I want storage organized by pipeline so I can manage disk usage per pipeline independently.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Add `pipeline_id` to `avatars` table
**Description:** Add a non-nullable `pipeline_id BIGINT` FK column to the `avatars` table, matching the pattern used by tracks, workflows, and scene_types.

**Acceptance Criteria:**
- [ ] Migration adds `pipeline_id BIGINT REFERENCES pipelines(id)` to `avatars`
- [ ] Backfill sets `pipeline_id` from `projects.pipeline_id` for all existing rows
- [ ] Column is `NOT NULL` after backfill
- [ ] Index `idx_avatars_pipeline_id` created

#### Requirement 1.2: Add `pipeline_id` to `avatar_groups` table
**Description:** Add explicit pipeline scoping to avatar groups.

**Acceptance Criteria:**
- [ ] Migration adds `pipeline_id BIGINT REFERENCES pipelines(id)` to `avatar_groups`
- [ ] Backfill from `projects.pipeline_id` via group's `project_id`
- [ ] Column is `NOT NULL` after backfill
- [ ] Index created

#### Requirement 1.3: Add `pipeline_id` to `image_variants` table
**Description:** Image variants must be directly filterable by pipeline.

**Acceptance Criteria:**
- [ ] Migration adds `pipeline_id BIGINT REFERENCES pipelines(id)` to `image_variants`
- [ ] Backfill from `avatars.pipeline_id` via `image_variants.avatar_id`
- [ ] Column is `NOT NULL` after backfill
- [ ] Index created

#### Requirement 1.4: Add `pipeline_id` to `scenes` table
**Description:** Scenes must be directly filterable by pipeline.

**Acceptance Criteria:**
- [ ] Migration adds `pipeline_id BIGINT REFERENCES pipelines(id)` to `scenes`
- [ ] Backfill from `avatars.pipeline_id` via `scenes.avatar_id`
- [ ] Column is `NOT NULL` after backfill
- [ ] Index created

#### Requirement 1.5: Update unique constraints
**Description:** Avatar name uniqueness should be scoped to pipeline, not just project.

**Acceptance Criteria:**
- [ ] Drop existing `uq_avatars_project_id_name` constraint
- [ ] Create new `uq_avatars_pipeline_name` on `(pipeline_id, name)` — same avatar name across projects in one pipeline is the same entity
- [ ] Avatar group uniqueness updated to `(pipeline_id, project_id, name)`

#### Requirement 1.6: Backend — Avatar model and repo updates
**Description:** Update Rust models, DTOs, and repository queries to include `pipeline_id`.

**Acceptance Criteria:**
- [ ] `Avatar` struct includes `pipeline_id: DbId`
- [ ] `CreateAvatar` struct includes `pipeline_id: DbId`
- [ ] `AvatarRepo::list_by_project` also accepts optional `pipeline_id` filter
- [ ] New `AvatarRepo::list_by_pipeline(pipeline_id)` query
- [ ] Avatar create handler sets `pipeline_id` from project's pipeline or pipeline context
- [ ] Avatar group model and repo updated similarly

#### Requirement 1.7: Backend — Image variant and scene repo updates
**Description:** Update image variant and scene repositories for direct pipeline filtering.

**Acceptance Criteria:**
- [ ] `ImageVariant` struct includes `pipeline_id: DbId`
- [ ] `Scene` struct includes `pipeline_id: DbId`
- [ ] Create operations for both auto-set `pipeline_id` from the parent avatar
- [ ] Browse/list endpoints accept `pipeline_id` filter parameter
- [ ] Existing pipeline-filtering queries (that JOIN through project→pipeline) simplified to use direct column

#### Requirement 1.8: Backend — Pipeline-scoped storage paths for avatars
**Description:** All avatar file operations must use pipeline-prefixed storage paths.

**Acceptance Criteria:**
- [ ] Avatar seed image uploads stored under `{pipeline_code}/avatars/{avatar_id}/seeds/`
- [ ] Image variant files stored under `{pipeline_code}/variants/{variant_id}/`
- [ ] Scene video files stored under `{pipeline_code}/scenes/{scene_id}/`
- [ ] Uses existing `pipeline_scoped_key()` helper from PRD-141
- [ ] Backward-compatible fallback via `resolve_storage_key()` for pre-migration files

#### Requirement 1.9: Backend — Avatar ingest pipeline awareness
**Description:** Avatar ingest/import must explicitly set `pipeline_id` and use pipeline-scoped storage.

**Acceptance Criteria:**
- [ ] Ingest session resolves `pipeline_id` from project
- [ ] Created avatars have `pipeline_id` set
- [ ] Seed image storage uses pipeline-scoped paths
- [ ] Duplicate detection during ingest is pipeline-scoped

#### Requirement 1.10: Frontend — Pass pipeline context in all avatar operations
**Description:** All frontend hooks and pages that create, list, or filter avatars must include pipeline context.

**Acceptance Criteria:**
- [ ] `useProjectAvatars` passes `pipelineId` to API calls
- [ ] Avatar creation forms include pipeline context
- [ ] Import wizard passes `pipeline_id`
- [ ] Avatar browse/search pages filter by pipeline
- [ ] Image variant browse pages filter by pipeline directly (no project join)
- [ ] Scene browse pages filter by pipeline directly

#### Requirement 1.11: Data migration — Backfill existing records
**Description:** All existing avatars, groups, image variants, and scenes must be backfilled with the correct `pipeline_id`.

**Acceptance Criteria:**
- [ ] Single migration backfills all four tables from their parent chain
- [ ] Storage paths for existing files migrated to pipeline-prefixed format (extend existing `migrate_storage_to_pipeline.py` script)
- [ ] DB `storage_key` / `file_path` columns updated to reflect new paths
- [ ] Migration is idempotent (safe to re-run)

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL - Post-MVP]** Pipeline-scoped avatar deduplication
**Description:** Detect duplicate avatars within a pipeline using face embeddings.

**Acceptance Criteria:**
- [ ] Face embedding comparison scoped to pipeline
- [ ] Duplicates page only shows within-pipeline matches

#### Requirement 2.2: **[OPTIONAL - Post-MVP]** Pipeline storage analytics
**Description:** Per-pipeline storage usage breakdown on admin dashboard.

**Acceptance Criteria:**
- [ ] Storage widget shows usage per pipeline
- [ ] Drill-down into avatar/variant/scene storage per pipeline

## 6. Non-Goals (Out of Scope)

- Cross-pipeline avatar linking or sharing — avatars in different pipelines are fully independent
- Automatic avatar migration between pipelines — manual re-import required
- Cross-pipeline face embedding comparison
- Changes to the `pipelines` table schema itself

## 7. Design Considerations

- **UI pattern:** Follows the same pipeline workspace pattern established in PRD-139. No new UI paradigms needed — avatar pages already render within pipeline context.
- **Consistency:** All entity tables in the system (projects, tracks, workflows, scene_types, and now avatars/groups/variants/scenes) will have explicit `pipeline_id` columns, making the data model uniform.

## 8. Technical Considerations

### Existing Code to Reuse
- `pipeline_scoped_key()` from `core::storage` — already handles path prefixing
- `resolve_storage_key()` — backward-compatible fallback for pre-migration files
- `migrate_storage_to_pipeline.py` script — extend for avatar/variant/scene paths
- Pipeline ID backfill migration pattern from `20260322000003-6` migrations
- `usePipelineContextSafe()` hook — already used throughout frontend

### New Infrastructure Needed
- 1 migration file with 4 ALTER TABLE + backfill operations
- Updated `COLUMNS` constants in avatar, avatar_group, image_variant, and scene repos
- Updated CREATE queries to include `pipeline_id`

### Database Changes
| Table | Change |
|-------|--------|
| `avatars` | Add `pipeline_id BIGINT NOT NULL`, drop `uq_avatars_project_id_name`, add `uq_avatars_pipeline_name` |
| `avatar_groups` | Add `pipeline_id BIGINT NOT NULL` |
| `image_variants` | Add `pipeline_id BIGINT NOT NULL` |
| `scenes` | Add `pipeline_id BIGINT NOT NULL` |

### API Changes
| Endpoint | Change |
|----------|--------|
| `GET /avatars` | Add `pipeline_id` query parameter |
| `POST /projects/{id}/avatars` | Auto-set `pipeline_id` from project |
| `GET /image-variants/browse` | Use direct `pipeline_id` filter instead of project join |
| `GET /scenes` | Use direct `pipeline_id` filter instead of project join |
| `POST /avatar-ingest/*` | Set `pipeline_id` on created avatars |

## 9. Success Metrics

- All avatar queries return only pipeline-scoped results (zero cross-pipeline leakage)
- Importing the same avatar into x121 and y122 creates two independent DB records
- Storage usage can be measured per pipeline
- No performance regression on avatar list/browse queries (direct `pipeline_id` WHERE clause should be faster than JOINs)

## 10. Open Questions

None — all clarified during PRD creation.

## 11. Version History

- **v1.0** (2026-03-23): Initial PRD creation
