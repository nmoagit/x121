# Tasks: PRD-126 — Critical Bug Fixes & UX Polish

Source PRD: `design/prds/126-prd-critical-bug-fixes-ux-polish.md`

---

## Phase 1: Bug Fixes

### Task 1.1: Import Pipeline Timeout Fix
**PRD Requirement:** 1.1
**Priority:** Critical
**Estimated Effort:** M

#### Subtasks

- [ ] **1.1.1** Create a bounded-concurrency utility (`limitConcurrency` or similar) in `apps/frontend/src/lib/async-utils.ts` that accepts an array of async tasks and a concurrency limit, returning results via `Promise.allSettled`
- [ ] **1.1.2** Refactor the image upload loop (Phase 3) in `use-character-import.ts` to use the concurrency utility with limit=3
- [ ] **1.1.3** Refactor the metadata upload loop (Phase 3.5) in `use-character-import.ts` to use the concurrency utility with limit=3
- [ ] **1.1.4** Refactor the video import loop (Phase 4) in `use-character-import.ts` to use the concurrency utility with limit=2 (videos are larger)
- [ ] **1.1.5** Update the progress indicator to track completed items from concurrent results rather than sequential index
- [ ] **1.1.6** Check Axum request timeout configuration in `apps/backend/crates/api/` — ensure multipart upload endpoints have generous timeout (5 min) or no timeout
- [ ] **1.1.7** Add error aggregation: when a concurrent batch has mixed success/failure, collect all errors and continue
- [ ] **1.1.8** Write unit tests for the `limitConcurrency` utility
- [ ] **1.1.9** Manual test: import 50+ character folders and verify no timeout

**Files to modify:**
- `apps/frontend/src/features/projects/hooks/use-character-import.ts`
- `apps/frontend/src/lib/async-utils.ts` (new)
- `apps/backend/crates/api/src/` (timeout config)

---

### Task 1.2: Select All = 0 Fix
**PRD Requirement:** 1.2
**Priority:** High
**Estimated Effort:** S

#### Subtasks

- [ ] **1.2.1** In `ImportConfirmModal.tsx`, verify the `duplicateIndices` computation uses post-normalization display names (not raw names) for the `existingSet` comparison
- [ ] **1.2.2** Fix the `useEffect` dependency that resets `checked` state — ensure it runs after both `displayNames` and `existingSet` are recomputed
- [ ] **1.2.3** When `importableCount === 0` (all duplicates), hide the "Select All" row or change label to "All characters already exist"
- [ ] **1.2.4** Add a test case: create modal with 5 names, 3 are duplicates — verify "Select all (2)" and clicking it selects exactly 2
- [ ] **1.2.5** Add a test case: toggle normalize on/off — verify duplicate detection updates correctly

**Files to modify:**
- `apps/frontend/src/features/projects/components/ImportConfirmModal.tsx`

---

### Task 1.3: Empty Versions Excluded from Deliverables
**PRD Requirement:** 1.3
**Priority:** High
**Estimated Effort:** M

#### Subtasks

- [ ] **1.3.1** In `apps/frontend/src/features/scenes/types.ts`, update `sceneHasVideo` to return `false` when the only version has status `"empty"` or equivalent
- [ ] **1.3.2** In `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`, add `WHERE status != 'empty'` filter to aggregate count queries used for deliverable completion
- [ ] **1.3.3** Update the character readiness evaluation in the backend to exclude "empty" versions from "scenes generated" criteria
- [ ] **1.3.4** Update the production matrix frontend to show scenes with only "empty" versions as "not generated" (gray cell)
- [ ] **1.3.5** Update delivery validation to flag scenes with only "empty" versions as missing
- [ ] **1.3.6** Add backend integration test: create character with "empty" version — verify readiness reports as not ready
- [ ] **1.3.7** Add frontend test: `sceneHasVideo` returns false for empty-only scenes

**Files to modify:**
- `apps/frontend/src/features/scenes/types.ts`
- `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`
- `apps/backend/crates/db/src/models/scene_video_version.rs`
- `apps/backend/crates/core/` (readiness evaluation if applicable)

---

### Task 1.4: Bulk Metadata UTF-8/Unicode Fix
**PRD Requirement:** 1.4
**Priority:** High
**Estimated Effort:** S

#### Subtasks

- [ ] **1.4.1** In `apps/frontend/src/lib/file-types.ts`, update `readFileAsJson` to use `TextDecoder('utf-8')` explicitly and strip BOM (`\uFEFF`) from the start of the decoded string
- [ ] **1.4.2** Ensure the `api.put('/characters/{id}/metadata', draft)` call includes `Content-Type: application/json; charset=utf-8` header
- [ ] **1.4.3** In the backend metadata handler, verify that `serde_json::from_slice` or `serde_json::from_str` correctly handles Unicode characters in the request body
- [ ] **1.4.4** Add unit test: `readFileAsJson` with a JSON string containing CJK characters — verify parsed correctly
- [ ] **1.4.5** Add unit test: `readFileAsJson` with UTF-8 BOM — verify BOM is stripped and JSON parses correctly
- [ ] **1.4.6** Add unit test: `readFileAsJson` with invalid encoding — verify error message indicates encoding issue
- [ ] **1.4.7** Manual test: upload a metadata.json with Japanese, Korean, and emoji characters — verify round-trip preservation

**Files to modify:**
- `apps/frontend/src/lib/file-types.ts`
- `apps/frontend/src/lib/api.ts` (if Content-Type header needs adjustment)
- `apps/backend/crates/api/src/handlers/character_metadata.rs` (if deserialization fix needed)

---

### Task 1.5: Drag-and-Drop Group Activation Fix
**PRD Requirement:** 1.5
**Priority:** High
**Estimated Effort:** M

#### Subtasks

- [ ] **1.5.1** Audit the group section wrappers in `ProjectCharactersTab.tsx` for correct HTML5 DnD event handlers: `onDragOver` must call `e.preventDefault()`, `onDragEnter` must set visual state, `onDragLeave` must clear visual state, `onDrop` must handle the move
- [ ] **1.5.2** Fix missing `e.preventDefault()` in `onDragOver` handler (this is the most common cause of DnD not activating)
- [ ] **1.5.3** Add visual feedback: when dragging over a group, apply a highlight class (e.g., `ring-2 ring-[var(--color-action-primary)]`)
- [ ] **1.5.4** Handle `onDragLeave` correctly — use a counter or check `e.relatedTarget` to avoid premature deactivation when dragging over child elements
- [ ] **1.5.5** On drop, call `useMoveCharacterToGroup` mutation with optimistic cache update
- [ ] **1.5.6** For bulk drag, pass all selected character IDs in the drag data (via `dataTransfer.setData`)
- [ ] **1.5.7** Add integration test: drag character card to different group — verify character's `group_id` updates

**Files to modify:**
- `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`
- `apps/frontend/src/features/projects/components/CharacterCard.tsx` (drag handle)

---

## Phase 2: UX Polish

### Task 2.1: "Ignore Item" Toggle for Missing Deliverables
**PRD Requirement:** 2.1
**Priority:** Medium
**Estimated Effort:** L

#### Subtasks

- [ ] **2.1.1** Create migration: `character_deliverable_ignores` table with `id BIGSERIAL`, `uuid UUID`, `character_id`, `scene_type_id`, `track_id`, `ignored_by`, `ignored_at`, `reason`, unique constraint on `(character_id, scene_type_id, track_id)`
- [ ] **2.1.2** Create model `CharacterDeliverableIgnore` in `apps/backend/crates/db/src/models/`
- [ ] **2.1.3** Create `character_deliverable_ignore_repo.rs` with CRUD methods: `list_for_character`, `add_ignore`, `remove_ignore`, `is_ignored`
- [ ] **2.1.4** Create API handlers: `GET /characters/{id}/deliverable-ignores`, `POST /characters/{id}/deliverable-ignores`, `DELETE /characters/{id}/deliverable-ignores/{uuid}`
- [ ] **2.1.5** Wire routes in `apps/backend/crates/api/src/routes/`
- [ ] **2.1.6** Create frontend hook: `useDeliverableIgnores(characterId)` — query + mutations
- [ ] **2.1.7** Add "Ignore" toggle button to missing deliverable rows in the Scenes tab and Deliverables tab
- [ ] **2.1.8** Style ignored items: muted opacity + "Ignored" badge + strikethrough text
- [ ] **2.1.9** Update readiness calculation hooks to exclude ignored deliverables
- [ ] **2.1.10** Update delivery validation hooks to exclude ignored deliverables
- [ ] **2.1.11** Add "Show ignored" toggle to filter bar (default: hidden)
- [ ] **2.1.12** Add tests: ignore/un-ignore flow, readiness recalculation, delivery validation exclusion

**Files to create:**
- `apps/db/migrations/YYYYMMDD000001_character_deliverable_ignores.sql`
- `apps/backend/crates/db/src/models/character_deliverable_ignore.rs`
- `apps/backend/crates/db/src/repositories/character_deliverable_ignore_repo.rs`
- `apps/frontend/src/features/characters/hooks/use-deliverable-ignores.ts`

**Files to modify:**
- `apps/backend/crates/api/src/handlers/` (new handler file)
- `apps/backend/crates/api/src/routes/` (wire new routes)
- `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx`
- `apps/frontend/src/features/characters/tabs/CharacterDeliverablesTab.tsx`

---

### Task 2.2: Show/Hide Disabled Characters Toggle
**PRD Requirement:** 2.2
**Priority:** Medium
**Estimated Effort:** S

#### Subtasks

- [ ] **2.2.1** Add `showDisabled` state to `ProjectCharactersTab` (default: `false`), persisted in `localStorage` with key `x121.project.showDisabled`
- [ ] **2.2.2** Add a `Toggle` component to the filter bar labeled "Show disabled"
- [ ] **2.2.3** Filter the characters list: when `showDisabled` is false, exclude characters where `status` indicates disabled/archived
- [ ] **2.2.4** When disabled characters are visible, render them with reduced opacity (e.g., `opacity-50`) and a "Disabled" badge
- [ ] **2.2.5** Update the character count display in group headers and tab header to reflect visible (filtered) count
- [ ] **2.2.6** Add test: toggle show disabled — verify correct characters shown/hidden

**Files to modify:**
- `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`

---

### Task 2.3: Breadcrumb Auto-Scroll to Group
**PRD Requirement:** 2.3
**Priority:** Low
**Estimated Effort:** S

#### Subtasks

- [ ] **2.3.1** Add `id={`group-${group.id}`}` to each group section wrapper in `ProjectCharactersTab.tsx`
- [ ] **2.3.2** Create a group quick-nav component (or extend breadcrumbs) that lists group names as clickable links
- [ ] **2.3.3** On group name click, call `document.getElementById(`group-${groupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`
- [ ] **2.3.4** Update the URL hash on scroll (optional: use `IntersectionObserver` to detect which group is in view)
- [ ] **2.3.5** On page load, check for `#group-{id}` hash and scroll to target group
- [ ] **2.3.6** Manual test: click group in breadcrumb — page scrolls smoothly

**Files to modify:**
- `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`
- `apps/frontend/src/features/characters/CharacterDetailPage.tsx` (if breadcrumbs reference groups)

---

### Task 2.4: Character Detail Header Consolidation
**PRD Requirement:** 2.4
**Priority:** Medium
**Estimated Effort:** M

#### Subtasks

- [ ] **2.4.1** Audit `CharacterDetailPage.tsx` to identify which info appears in both the header and the overview tab's first card
- [ ] **2.4.2** Add avatar thumbnail to the header (use `useCharacterAvatars` hook) — 48x48px rounded, positioned left of character name
- [ ] **2.4.3** Move readiness badge, face embedding status, and group name into the header bar
- [ ] **2.4.4** Remove the redundant summary card from `CharacterOverviewTab.tsx`
- [ ] **2.4.5** Ensure the header is responsive: on viewports < 768px, stack avatar + name above badges
- [ ] **2.4.6** Make avatar clickable — navigate to Images tab (`?tab=images`)
- [ ] **2.4.7** Verify no information is lost after consolidation
- [ ] **2.4.8** Manual test: compare before/after screenshots to verify all info is present

**Files to modify:**
- `apps/frontend/src/features/characters/CharacterDetailPage.tsx`
- `apps/frontend/src/features/characters/tabs/CharacterOverviewTab.tsx`

---

### Task 2.5: Wider Pipeline Settings Inputs
**PRD Requirement:** 2.5
**Priority:** Low
**Estimated Effort:** S

#### Subtasks

- [ ] **2.5.1** In `PipelineSettingsEditor.tsx`, check the parent container's width constraints — ensure it uses full available width
- [ ] **2.5.2** Add `min-w-[320px]` to the `<Input>` elements, or ensure the parent `<div>` has no constraining `max-width`
- [ ] **2.5.3** On viewports < 640px, change layout from `flex items-center` to `flex flex-col` so labels stack above inputs
- [ ] **2.5.4** Manual test: verify long values (50+ characters) are fully visible without scrolling

**Files to modify:**
- `apps/frontend/src/features/character-dashboard/PipelineSettingsEditor.tsx`

---

## Phase 3: Import Validation Fixes

### Task 3.1: Filename-to-Character Mismatch Warning
**PRD Requirement:** 3.1
**Priority:** Medium
**Estimated Effort:** M

#### Subtasks

- [x] **3.1.1** Added `extractCharacterHint` utility in `matchDroppedVideos.ts` that extracts the first underscore-delimited part of a filename as a character name hint (instead of modifying `parseFilename` to avoid breaking existing callers)
- [x] **3.1.2** Created `matchesCharacterName(filenameHint: string, characterName: string): boolean` utility that normalizes both names (remove underscores/hyphens/spaces, lowercase) and checks for a match
- [x] **3.1.3** Added filename-to-character mismatch check in the batch import flow (`use-character-import.ts`) — warnings are non-blocking and added to the errors array
- [ ] **3.1.4** If mismatch detected, show a confirmation dialog: "This file appears to belong to '{hint}', not '{target}'. Continue anyway?"
- [ ] **3.1.5** If user confirms, proceed with import; if user cancels, abort
- [ ] **3.1.6** Add unit tests for `matchesCharacterName` with various filename patterns
- [ ] **3.1.7** Add unit test for `parseFilename` character hint extraction

**Files to modify:**
- `apps/frontend/src/features/characters/tabs/matchDroppedVideos.ts`
- `apps/frontend/src/features/characters/tabs/CharacterImagesTab.tsx` (or equivalent drop handler)
- `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx` (video drop handler)

---

### Task 3.2: Import Skip When No Toggles Selected
**PRD Requirement:** 3.2
**Priority:** Low
**Estimated Effort:** S

#### Subtasks

- [ ] **3.2.1** Add an early return guard at the top of `handleImportConfirmWithAssets` in `use-character-import.ts`: if `newPayloads.length === 0 && existingPayloads.length === 0`, close modal and return immediately
- [ ] **3.2.2** Optionally show an info toast: "Nothing to import"
- [ ] **3.2.3** Ensure no `queryClient.invalidateQueries` calls are made in this path
- [ ] **3.2.4** Add unit test: call `handleImportConfirmWithAssets` with empty arrays — verify no API calls

**Files to modify:**
- `apps/frontend/src/features/projects/hooks/use-character-import.ts`

---

### Task 3.3: Import UI Race Condition Fix
**PRD Requirement:** 3.3
**Priority:** High
**Estimated Effort:** M

#### Subtasks

- [ ] **3.3.1** Identify where `bulkCreate.mutateAsync` triggers automatic cache invalidation — check TanStack Query's `onSuccess`/`onSettled` callbacks in `useBulkCreateCharacters`
- [ ] **3.3.2** Modify `useBulkCreateCharacters` to NOT automatically invalidate the characters query on success (remove or disable the `onSuccess` invalidation)
- [ ] **3.3.3** Ensure the manual `queryClient.invalidateQueries` call at the end of `handleImportConfirmWithAssets` (lines ~354-359) is the only invalidation point
- [ ] **3.3.4** Alternatively: add a `isImporting` ref that, when true, prevents the characters query from re-rendering (e.g., set `enabled: !isImporting` on the characters query, or use `queryClient.cancelQueries` during import)
- [ ] **3.3.5** Verify the progress modal stays visible and stable throughout the entire import flow
- [ ] **3.3.6** Add manual test: import 10 characters with assets — verify character list does not flash "Already Exists" during upload phase

**Files to modify:**
- `apps/frontend/src/features/projects/hooks/use-character-import.ts`
- `apps/frontend/src/features/projects/hooks/use-project-characters.ts` (mutation config)

---

## Task Dependency Order

```
Phase 1 (Bug Fixes) — can be done in parallel:
  1.1 Import Timeout Fix
  1.2 Select All Fix
  1.3 Empty Versions Fix
  1.4 UTF-8 Fix
  1.5 DnD Fix

Phase 2 (UX Polish) — can start after Phase 1:
  2.1 Ignore Toggle (depends on backend migration)
  2.2 Show/Hide Disabled (independent)
  2.3 Breadcrumb Scroll (independent)
  2.4 Header Consolidation (independent)
  2.5 Wider Inputs (independent)

Phase 3 (Import Validation) — can start after Phase 1:
  3.1 Filename Mismatch (independent)
  3.2 Import Skip (independent)
  3.3 Race Condition Fix (depends on 1.1 for import flow understanding)
```

## Summary

| Task | Priority | Effort | Phase |
|------|----------|--------|-------|
| 1.1 Import Timeout | Critical | M | Bug Fix |
| 1.2 Select All | High | S | Bug Fix |
| 1.3 Empty Versions | High | M | Bug Fix |
| 1.4 UTF-8 Fix | High | S | Bug Fix |
| 1.5 DnD Fix | High | M | Bug Fix |
| 2.1 Ignore Toggle | Medium | L | UX Polish |
| 2.2 Show Disabled | Medium | S | UX Polish |
| 2.3 Breadcrumb Scroll | Low | S | UX Polish |
| 2.4 Header Consolidation | Medium | M | UX Polish |
| 2.5 Wider Inputs | Low | S | UX Polish |
| 3.1 Filename Mismatch | Medium | M | Import Validation |
| 3.2 Import Skip | Low | S | Import Validation |
| 3.3 Race Condition | High | M | Import Validation |
