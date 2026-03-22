# Task List: Character to Avatar Rename

**PRD Reference:** `design/prds/140-prd-character-to-avatar-rename.md`
**Scope:** Rename "character" → "avatar" everywhere. Rename "model" (meaning character) → "avatar" in frontend.

## Overview

Massive cross-stack rename. Strategy: database first (single migration), then backend (compile-driven), then frontend (TypeScript-driven). Each phase commits separately.

---

## Phase 1: Database Migration

### Task 1.1: [COMPLETE] Create comprehensive rename migration
**File:** `apps/db/migrations/{timestamp}_rename_character_to_avatar.sql`

Single migration that renames ALL character tables, columns, indexes, and constraints.

**Tables to rename (19):**
- `characters` → `avatars`
- `character_statuses` → `avatar_statuses`
- `character_groups` → `avatar_groups`
- `character_readiness_cache` → `avatar_readiness_cache`
- `character_scene_overrides` → `avatar_scene_overrides`
- `character_scene_prompt_overrides` → `avatar_scene_prompt_overrides`
- `character_ingest_statuses` → `avatar_ingest_statuses`
- `character_ingest_sessions` → `avatar_ingest_sessions`
- `character_ingest_entries` → `avatar_ingest_entries`
- `character_metadata_versions` → `avatar_metadata_versions`
- `character_deliverable_ignores` → `avatar_deliverable_ignores`
- `character_speeches` → `avatar_speeches`
- `character_review_statuses` → `avatar_review_statuses`
- `character_review_assignments` → `avatar_review_assignments`
- `character_review_decisions` → `avatar_review_decisions`
- `character_review_audit_log` → `avatar_review_audit_log`
- `character_video_settings` → `avatar_video_settings`
- `library_characters` → `library_avatars`
- `project_character_links` → `project_avatar_links`

**FK columns to rename:**
- `character_id` → `avatar_id` on: source_images, derived_images, image_variants, scenes, image_quality_scores, performance_metrics, detected_faces, embedding_history, and all avatar_* tables
- `source_character_id` → `source_avatar_id` on library_avatars
- `project_character_id` → `project_avatar_id` on project_avatar_links
- `source_character_id`/`matched_character_id` → `source_avatar_id`/`matched_avatar_id` on duplicate_checks
- `created_character_id` → `created_avatar_id` on avatar_ingest_entries

**Acceptance Criteria:**
- [x] All 19 tables renamed
- [x] All FK columns renamed
- [x] All indexes follow naming convention after rename
- [x] Migration runs without errors on existing data

---

## Phase 2: Backend Rename

### Task 2.1: [COMPLETE] Rename backend model files and types
**Directory:** `apps/backend/crates/db/src/models/`

Rename files and update all type names:
- `character.rs` → `avatar.rs` (Character → Avatar, CreateCharacter → CreateAvatar, etc.)
- `character_group.rs` → `avatar_group.rs`
- `character_ingest.rs` → `avatar_ingest.rs`
- `character_metadata_version.rs` → `avatar_metadata_version.rs`
- `character_review.rs` → `avatar_review.rs`
- `character_scene_override.rs` → `avatar_scene_override.rs`
- `character_scene_prompt_override.rs` → `avatar_scene_prompt_override.rs`
- `character_speech.rs` → `avatar_speech.rs`
- `library_character.rs` → `library_avatar.rs`
- Update `mod.rs` registrations
- Update ALL SQL table/column names in `#[sqlx(rename_all)]` or query strings

**Acceptance Criteria:**
- [x] All model files renamed
- [x] All struct/enum/type names updated
- [x] All SQL references updated to new table/column names
- [x] `mod.rs` updated

### Task 2.2: [COMPLETE] Rename backend repository files
**Directory:** `apps/backend/crates/db/src/repositories/`

Same pattern — rename files and all function names, SQL queries.

**Acceptance Criteria:**
- [x] All 10 repo files renamed (character_repo → avatar_repo, etc.)
- [x] All function names updated (find_character → find_avatar, etc.)
- [x] All SQL queries reference new table/column names
- [x] `mod.rs` updated

### Task 2.3: [COMPLETE] Rename backend handler files
**Directory:** `apps/backend/crates/api/src/handlers/`

Rename 11 handler files and update all function names, imports.

**Acceptance Criteria:**
- [x] All handler files renamed
- [x] All handler function names updated
- [x] All imports updated to use Avatar types/repos
- [x] `mod.rs` updated

### Task 2.4: [COMPLETE] Rename backend route files and API paths
**Directory:** `apps/backend/crates/api/src/routes/`

Rename 9 route files and change ALL endpoint paths from `/characters` to `/avatars`.

**Acceptance Criteria:**
- [x] All route files renamed
- [x] All endpoint paths: `/characters` → `/avatars`
- [x] Path parameters: `character_id` → `avatar_id`
- [x] `mod.rs` route tree updated

### Task 2.5: [COMPLETE] Update core crate references
**Directory:** `apps/backend/crates/core/src/`

Update all character references in core types, functions, modules.

**Acceptance Criteria:**
- [x] `character_dashboard.rs` → `avatar_dashboard.rs`
- [x] `character_ingest.rs` → `avatar_ingest.rs`
- [x] `character_library.rs` → `avatar_library.rs`
- [x] All other files with character references updated
- [x] `lib.rs` module registrations updated

### Task 2.6: [COMPLETE] Update pipeline and worker crates
**Directories:** `apps/backend/crates/pipeline/src/`, `apps/backend/crates/worker/src/`

**Acceptance Criteria:**
- [x] `context_loader.rs` character references updated
- [x] Any other pipeline/worker references updated

### Task 2.7: [COMPLETE] Verify backend compilation
**Acceptance Criteria:**
- [x] `cargo check` passes with zero errors
- [x] `cargo test` passes (update test assertions for new names)
- [x] `cargo clippy` clean

---

## Phase 3: Frontend Rename

### Task 3.1: [COMPLETE] Rename frontend feature directory and files
**Directory:** `apps/frontend/src/features/characters/` → `apps/frontend/src/features/avatars/`

Rename the entire directory and all files within:
- `CharacterDetailPage.tsx` → `AvatarDetailPage.tsx`
- `CharacterFilterBar.tsx` → `AvatarFilterBar.tsx`
- `CharacterGroupSection.tsx` → `AvatarGroupSection.tsx`
- `CharacterSeedDataModal.tsx` → `AvatarSeedDataModal.tsx`
- All hooks: `use-character-detail.ts` → `use-avatar-detail.ts`, etc.
- All tabs: `CharacterOverviewTab.tsx` → `AvatarOverviewTab.tsx`, etc.
- All types updated

**Acceptance Criteria:**
- [x] Directory renamed to `avatars/`
- [x] All files renamed
- [x] All component/type/function names updated
- [x] All imports updated across the entire frontend

### Task 3.2: [COMPLETE] Rename related frontend features
**Files across:** `character-review/`, `character-dashboard/`, `character-ingest/`, `projects/`

- `character-review/` → `avatar-review/`
- `character-dashboard/` → `avatar-dashboard/`
- `character-ingest/` → `avatar-ingest/`
- Update hooks in `projects/hooks/use-project-characters.ts` → `use-project-avatars.ts`
- Update `ProjectCharactersTab.tsx` → `ProjectAvatarsTab.tsx`
- Update `CharacterCard.tsx` → `AvatarCard.tsx`

**Acceptance Criteria:**
- [x] All feature directories renamed
- [x] All component names updated
- [x] All hook names updated
- [x] All imports fixed

### Task 3.3: [COMPLETE] Update frontend routes and URL parameters
**File:** `apps/frontend/src/app/router.tsx`

- Route paths: `/models` → `/avatars`, `/characters` → `/avatars`
- URL params: `$characterId` → `$avatarId`
- Route variable names: `characterDetailRoute` → `avatarDetailRoute`

**Acceptance Criteria:**
- [x] All route paths updated
- [x] All URL parameters renamed
- [x] All route variable names updated
- [x] Page wrapper files in `pages/` updated

### Task 3.4: [COMPLETE] Update frontend labels, tooltips, descriptions
**All frontend files**

- "Model" (meaning character) → "Avatar" in all labels, button text, tooltips, descriptions, page titles
- "Character" → "Avatar" in any user-facing text
- Navigation items: "Characters" → "Avatars", "Models" → "Avatars", "Model Dashboard" → "Avatar Dashboard"

**Acceptance Criteria:**
- [x] Navigation items updated (navigation.ts, pipeline-navigation.ts)
- [x] All page titles updated
- [x] All button labels updated
- [x] All tooltip text updated
- [x] All empty state descriptions updated

### Task 3.5: [COMPLETE] Update API calls and types
**All frontend API/hook files**

- API paths: `/characters/` → `/avatars/`
- Type names: `Character` → `Avatar`
- Query keys: `["characters"]` → `["avatars"]`
- Variable names in hooks

**Acceptance Criteria:**
- [x] All API endpoint paths updated
- [x] All TypeScript type names updated
- [x] All query key factories updated
- [x] All variable names updated

### Task 3.6: [COMPLETE] Verify frontend compilation
**Acceptance Criteria:**
- [x] `npx tsc --noEmit` passes with zero errors
- [x] All imports resolve correctly
- [x] No runtime errors on page load

---

## Relevant Files

~200+ files across the entire codebase. Key directories:
- `apps/db/migrations/`
- `apps/backend/crates/db/src/models/`
- `apps/backend/crates/db/src/repositories/`
- `apps/backend/crates/api/src/handlers/`
- `apps/backend/crates/api/src/routes/`
- `apps/backend/crates/core/src/`
- `apps/frontend/src/features/characters/`
- `apps/frontend/src/features/character-*/`
- `apps/frontend/src/features/projects/`
- `apps/frontend/src/app/router.tsx`
- `apps/frontend/src/app/navigation.ts`
- `apps/frontend/src/app/pipeline-navigation.ts`

---

## Implementation Order

1. Phase 1: Database (Task 1.1) — Single migration
2. Phase 2: Backend (Tasks 2.1-2.7) — File renames + compilation fix loop
3. Phase 3: Frontend (Tasks 3.1-3.6) — Directory renames + TypeScript fix loop

Each phase committed separately for easy rollback.

---

## Notes

1. **Use `git mv` for file renames** to preserve git history
2. **Backend strategy**: Rename files first, then use `cargo check` errors to find all broken references. Fix iteratively until it compiles.
3. **Frontend strategy**: Rename directories first, then use `tsc --noEmit` errors to find all broken imports. Fix iteratively.
4. **SQL queries**: Every `FROM characters`, `JOIN characters`, `INSERT INTO characters` must become `avatars`. Search for the old table names in all `.rs` files.
5. **Don't forget**: Error messages, log strings, comments, doc strings.

---

## Version History

- **v1.0** (2026-03-22): Initial task list creation
