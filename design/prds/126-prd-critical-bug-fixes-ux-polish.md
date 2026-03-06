# PRD-126: Critical Bug Fixes & UX Polish

**Document ID:** 126-prd-critical-bug-fixes-ux-polish
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-06
**Last Updated:** 2026-03-06

---

## 1. Introduction/Overview

The X121 platform has reached feature-complete status across 124 PRDs, covering the full pipeline from character ingest through video generation to delivery packaging. However, real-world usage has surfaced a set of bugs and UX friction points that block efficient daily workflows. These issues span three categories:

**Bug Fixes** — The import pipeline experiences timeouts on large batches (20+ characters with assets), the "Select All" checkbox reports 0 items, bulk metadata upload fails on foreign-language characters (UTF-8 encoding), "Empty" scene video versions are incorrectly counted as completed deliverables, and drag-and-drop between character groups fails to activate reliably.

**UX Polish** — Project managers need to mark missing deliverables as intentionally ignored rather than having them perpetually flag a character as incomplete. The character list needs a show/hide toggle for disabled characters. Breadcrumb navigation should auto-scroll to the target group. The Character Detail page header contains redundant information in both the top header and the first card below it. Pipeline Settings input fields are too narrow for the values they contain.

**Import Validation** — Dropping a file onto a character card does not warn when the filename suggests a different character ("Xena/Anna" check). Triggering an import with no toggles selected still runs background processes instead of skipping. A race condition causes the character list to flash "Already Exists" before the upload progress bar completes.

This PRD bundles these fixes into a single release to stabilize the platform for production use.

## 2. Related PRDs & Dependencies

### Depends On
- PRD-112: Project Hub & Management (character groups, character cards, project characters tab, breadcrumbs)
- PRD-113: Character Ingest Pipeline (import flow, folder scanner, metadata generation)
- PRD-108: Character Settings Dashboard (pipeline settings editor)
- PRD-109: Scene Video Versioning, External Import & Soft Delete (version status, "Empty" versions)

### Extends
- PRD-016: Folder-to-Entity Bulk Importer (import preview, validation)
- PRD-014: Data Validation & Import Integrity (schema validation, conflict detection)
- PRD-088: Batch Metadata Operations (bulk metadata upload, UTF-8 handling)

### Integrates With
- PRD-107: Character Readiness & State View (readiness criteria affected by "ignore" toggle)
- PRD-111: Scene Catalog & Track Management (scene enablement, deliverable tracking)
- PRD-029: Design System & Shared Component Library (breadcrumb component, input widths)

## 3. Goals

### Primary Goals
- Eliminate import pipeline timeouts and data corruption on large batches.
- Fix the "Select All = 0" bug so bulk selection works correctly.
- Prevent "Empty" versions from counting toward deliverable completion.
- Fix bulk metadata upload failures and ensure full UTF-8/Unicode support.
- Fix drag-and-drop activation for moving characters between groups.
- Add "Ignore Item" toggle for missing deliverables.
- Add show/hide disabled characters toggle.
- Implement breadcrumb auto-scroll to group sections.
- Consolidate the Character Detail page header to remove redundancy.
- Widen Pipeline Settings input fields.
- Add filename-to-character mismatch validation on file drop.
- Fix "skip" behavior when no import toggles are selected.
- Fix the import UI race condition between "Already Exists" and upload progress.

### Secondary Goals
- Improve import error reporting with actionable messages.
- Ensure all fixes are covered by automated tests.

## 4. User Stories

- As a PM, I want to import 50+ character folders without the import timing out so that I can onboard large batches in one operation.
- As a PM, I want "Select All" to correctly select all non-duplicate characters so that I can bulk-confirm imports.
- As a PM, I want "Empty" scene versions to not count as completed deliverables so that my delivery readiness numbers are accurate.
- As a PM, I want to upload metadata JSON files containing foreign-language characters (Japanese, Korean, accented Latin, etc.) without the upload failing.
- As a PM, I want to drag characters between groups reliably so that I can organize my character batches.
- As a PM, I want to mark a missing deliverable as "intentionally ignored" so that the character is no longer flagged as incomplete for that item.
- As a PM, I want to toggle visibility of disabled characters in the project character list so that I can focus on active characters.
- As a PM, I want clicking a group name in the breadcrumb to scroll to that group's section on the page so that I can navigate quickly in large projects.
- As a PM, I want the Character Detail page header to show all essential info (avatar, status, readiness) without a redundant card below it.
- As a PM, I want Pipeline Settings inputs to be wide enough to see the full values I type.
- As a PM, I want a warning when I drop a file onto a character card and the filename suggests a different character so that I catch misassignments.
- As a PM, I want the import to do nothing when no import toggles are selected so that no unnecessary background work runs.
- As a PM, I want the character list to show upload progress consistently without flashing "Already Exists" prematurely.

## 5. Functional Requirements

### Phase 1: Bug Fixes

#### Requirement 1.1: Import Pipeline Timeout Fix
**Description:** Resolve timeouts during large imports (20+ characters with images, metadata, and videos). The current sequential upload loop in `useCharacterImport` times out on large batches because each asset is uploaded one-at-a-time with no concurrency and no keepalive.

**Acceptance Criteria:**
- [ ] Imports of 50+ character folders with images, metadata, and videos complete without timeout
- [ ] Progress indicator updates continuously during long imports (no stalled UI)
- [ ] If a single asset fails, the import continues with remaining assets and reports the failure
- [ ] Backend upload endpoints return within 30 seconds per file; if processing takes longer, the upload is accepted and processing continues asynchronously
- [ ] Add a configurable concurrency limit (default: 3 parallel uploads) to the import loop

**Technical Notes:**
- File: `apps/frontend/src/features/projects/hooks/use-character-import.ts`
- The sequential `for` loops in phases 3, 3.5, and 4 should use a bounded-concurrency utility (e.g., `Promise.allSettled` with a semaphore/pool pattern)
- Backend: check Axum request timeout configuration in `apps/backend/crates/api/`; increase or remove per-request timeout for multipart upload endpoints

#### Requirement 1.2: Select All = 0 Fix
**Description:** The "Select All" checkbox in the `ImportConfirmModal` reports selecting 0 items under certain conditions. When all characters are detected as duplicates, the `importableCount` is 0, but the UI still shows "Select all (0)" which is confusing. Additionally, when normalize is toggled, the duplicate detection may incorrectly classify non-duplicates as duplicates due to case-sensitivity mismatches.

**Acceptance Criteria:**
- [ ] "Select All" correctly counts and selects all non-duplicate characters
- [ ] When all characters are duplicates, the "Select All" row is hidden or displays "All characters already exist"
- [ ] Toggling "Normalize names" recalculates duplicate detection correctly
- [ ] The footer count always matches the actual number of checked items

**Technical Notes:**
- File: `apps/frontend/src/features/projects/components/ImportConfirmModal.tsx`
- The `duplicateIndices` memo depends on `displayNames` which changes with normalize toggle — verify the `useEffect` that resets `checked` fires correctly after normalization changes
- The `existingSet` comparison must be case-insensitive and use the display name (post-normalization), not the raw name

#### Requirement 1.3: Empty Versions Not Counted as Deliverables
**Description:** Scene video versions with status "Empty" (placeholder versions created by the system) are incorrectly counted as completed deliverables in readiness checks, delivery validation, and production matrix cells.

**Acceptance Criteria:**
- [ ] "Empty" versions are excluded from deliverable completion counts
- [ ] Character readiness criteria that check "scenes generated" do not count "Empty" versions
- [ ] The production matrix shows "Empty" versions as "not generated" (gray), not "generated" (yellow/green)
- [ ] Delivery validation flags scenes with only "Empty" versions as missing
- [ ] The `sceneHasVideo` utility function returns `false` for scenes whose only version is "Empty"

**Technical Notes:**
- Backend: `apps/backend/crates/db/src/models/scene_video_version.rs` — check the status enum and ensure "Empty" is filtered in aggregate queries
- Frontend: `apps/frontend/src/features/scenes/types.ts` — the `sceneHasVideo` function may need to check version status
- Backend queries in `scene_video_version_repo.rs` that count completed scenes should add `WHERE status != 'empty'`

#### Requirement 1.4: Bulk Metadata UTF-8/Unicode Fix
**Description:** Bulk metadata upload fails when JSON files contain foreign-language characters (CJK, accented Latin, Cyrillic, etc.). The failure occurs during JSON parsing or during the API request body serialization.

**Acceptance Criteria:**
- [ ] Metadata JSON files containing UTF-8 characters (Japanese, Korean, Chinese, Russian, accented Latin, emoji) upload successfully
- [ ] The `readFileAsJson` utility correctly handles BOM (byte-order mark) in UTF-8 files
- [ ] Backend metadata endpoints accept and store full Unicode in JSONB columns without data loss
- [ ] Round-trip test: upload metadata with Unicode -> fetch -> verify identical content
- [ ] Error messages for invalid JSON clearly distinguish encoding errors from syntax errors

**Technical Notes:**
- Frontend: `apps/frontend/src/lib/file-types.ts` — the `readFileAsJson` function should use `TextDecoder` with `'utf-8'` encoding and strip BOM if present
- Backend: PostgreSQL JSONB natively supports Unicode; the issue is likely in the Rust deserialization layer (check `serde_json` handling of raw bytes vs. string)
- The `api.put('/characters/{id}/metadata', draft)` call must set `Content-Type: application/json; charset=utf-8`

#### Requirement 1.5: Drag-and-Drop Group Activation Fix
**Description:** Drag-and-drop to move characters between groups fails to activate reliably. The drop target does not highlight, and dropping a character does not trigger the move. This is particularly problematic when moving multiple characters in bulk.

**Acceptance Criteria:**
- [ ] Dragging a character card over a group section highlights the group as a valid drop target
- [ ] Dropping a character onto a different group moves the character to that group
- [ ] Bulk selection + drag moves all selected characters to the target group
- [ ] Visual feedback: drop target border/background changes on dragover, reverts on dragleave
- [ ] Drag works on both the character card and a dedicated drag handle
- [ ] The operation completes within 500ms for single characters, 2s for bulk (10+ characters)

**Technical Notes:**
- File: `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`
- Check the `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` handlers on group sections
- The drag activation issue may be caused by missing `e.preventDefault()` in `onDragOver` (required for drop to work in HTML5 drag-and-drop)
- For bulk moves, use `useMoveCharacterToGroup` mutation with optimistic updates

### Phase 2: UX Polish

#### Requirement 2.1: "Ignore Item" Toggle for Missing Deliverables
**Description:** Allow PMs to mark a missing deliverable (scene video, asset clip) as "intentionally ignored" so that it no longer flags the character as incomplete. This is needed when certain deliverables are not required for specific characters (e.g., a character that does not need a "topless" scene).

**Acceptance Criteria:**
- [ ] Each missing deliverable row shows an "Ignore" toggle/button
- [ ] When toggled on, the deliverable is marked as "ignored" — visually distinct (strikethrough or muted with "Ignored" badge)
- [ ] Ignored deliverables are excluded from readiness calculations
- [ ] Ignored deliverables are excluded from delivery validation "missing items" lists
- [ ] The ignore state is persisted per character per deliverable (survives page refresh)
- [ ] Bulk ignore: select multiple missing deliverables and ignore them all at once
- [ ] "Show ignored" toggle to reveal/hide ignored items (hidden by default)
- [ ] Undo: toggling ignore off restores the deliverable to the "missing" state

**Technical Notes:**
- Database: new `character_deliverable_ignores` table or a JSONB column on the character's settings storing ignored deliverable identifiers
- Consider using the existing `character_scene_overrides` table with an `ignored` boolean column
- API: `PATCH /api/v1/characters/{id}/deliverable-ignore` with `{ scene_type_id, track_id, ignored: bool }`
- Frontend: update readiness criteria hooks and delivery validation hooks to filter out ignored items

#### Requirement 2.2: Show/Hide Disabled Characters Toggle
**Description:** Add a toggle to the project character list to show or hide disabled (inactive/archived) characters. By default, disabled characters should be hidden to reduce clutter.

**Acceptance Criteria:**
- [ ] Toggle switch labeled "Show disabled" in the filter bar of the Characters tab
- [ ] Default state: off (disabled characters hidden)
- [ ] When toggled on, disabled characters appear with a visual distinction (opacity, badge, or strikethrough)
- [ ] Toggle state persisted in URL search params or localStorage
- [ ] Character count in the header updates to reflect visible characters
- [ ] Disabled characters are excluded from group character counts when hidden

**Technical Notes:**
- File: `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`
- Filter logic: add a `showDisabled` state, filter the characters list before rendering
- Character status is stored in the `characters.status` column — filter on status values that represent disabled/archived states

#### Requirement 2.3: Breadcrumb Auto-Scroll to Group
**Description:** When clicking a group name in the breadcrumb navigation on the project page, the page should auto-scroll to that group's section. Currently, breadcrumbs only navigate between pages but do not scroll within the page.

**Acceptance Criteria:**
- [ ] Each group section has a stable DOM id (e.g., `group-{groupId}`)
- [ ] Clicking a group name in the breadcrumb (or any group quick-nav) scrolls the page smoothly to that group's section
- [ ] The scroll uses `scrollIntoView({ behavior: 'smooth', block: 'start' })` or equivalent
- [ ] If the group section is already visible, no scroll occurs
- [ ] URL hash is updated to `#group-{groupId}` so the scroll position is bookmarkable
- [ ] On initial page load with a hash, the page scrolls to the target group

**Technical Notes:**
- Files: `apps/frontend/src/features/characters/CharacterDetailPage.tsx`, `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`
- Add `id` attributes to group section wrappers
- Use `useEffect` on mount to check for URL hash and scroll if present

#### Requirement 2.4: Character Detail Header Consolidation
**Description:** The Character Detail page currently shows character info in both the top header area and a redundant "overview card" immediately below it. Consolidate all status info (avatar thumbnail, character name, status badge, readiness indicator, face embedding status, group membership) into the top header and remove the duplicate card.

**Acceptance Criteria:**
- [ ] The top header shows: avatar thumbnail (if available), character name, status badge, readiness badge, face embedding status indicator, group name
- [ ] The redundant first card below the header is removed
- [ ] The header layout is responsive — stacks vertically on narrow viewports
- [ ] Avatar thumbnail is clickable to view full-size image or navigate to Images tab
- [ ] All previously accessible information is still available (nothing is lost, just consolidated)
- [ ] Header height does not exceed 120px on desktop

**Technical Notes:**
- File: `apps/frontend/src/features/characters/CharacterDetailPage.tsx`
- The `CharacterOverviewTab` may contain the redundant card — identify which elements duplicate the header and remove them
- Reuse the `useCharacterAvatars` hook (from `apps/frontend/src/features/projects/hooks/use-character-avatars.ts`) for the avatar thumbnail

#### Requirement 2.5: Wider Pipeline Settings Inputs
**Description:** Input fields in the Pipeline Settings editor are too narrow, making it difficult to see and edit long values (e.g., model paths, workflow names, LoRA identifiers).

**Acceptance Criteria:**
- [ ] Pipeline Settings input fields are at least double their current width
- [ ] The label column width (`w-40` = 160px) remains the same; the input takes the remaining space
- [ ] On narrow viewports, inputs stack below labels instead of truncating
- [ ] Long values are fully visible without horizontal scrolling within the input

**Technical Notes:**
- File: `apps/frontend/src/features/character-dashboard/PipelineSettingsEditor.tsx`
- Current layout: `<div className="flex items-center gap-2">` with `<label className="w-40 ...">` and `<Input className="flex-1 text-sm">`
- The `flex-1` should already fill available space — the issue is likely the parent container width. Check if the parent has a `max-width` constraint
- Solution: ensure the parent container uses full available width, or set a `min-width` on the inputs (e.g., `min-w-[320px]`)

### Phase 3: Import Validation Fixes

#### Requirement 3.1: Filename-to-Character Mismatch Warning ("Xena/Anna" Check)
**Description:** When dropping a file onto a specific character card, parse the filename to extract a character name hint and warn if it does not match the target character. For example, dropping `anna_clothed.png` onto the "Xena" character card should trigger a warning: "This file appears to belong to 'Anna', not 'Xena'. Continue anyway?"

**Acceptance Criteria:**
- [ ] When a file is dropped onto a character card, the filename is parsed for a character name hint
- [ ] Parsing extracts the character name portion from filenames like `{character}_{scene}_{track}.mp4`, `{character}_clothed.png`, etc.
- [ ] If the extracted name does not match the target character (case-insensitive, ignoring underscores/hyphens), a confirmation dialog appears
- [ ] The dialog shows: "This file appears to belong to '{extractedName}', not '{targetCharacter}'. Continue anyway?" with "Continue" and "Cancel" buttons
- [ ] If the user confirms, the file is imported normally
- [ ] If the user cancels, the drop is aborted
- [ ] Filenames that do not contain a recognizable character name portion are imported without warning
- [ ] The check applies to both image and video file drops

**Technical Notes:**
- The `parseFilename` function in `apps/frontend/src/features/characters/tabs/matchDroppedVideos.ts` already extracts scene/track info from filenames — extend it to also extract a character name prefix
- Common filename patterns: `{char}_{scene}_{track}.ext`, `{char}_clothed.ext`, `{char}_topless.ext`
- The character name in the filename uses underscores for spaces — normalize both the filename name and the target character name before comparison

#### Requirement 3.2: Import "Skip" When No Toggles Selected
**Description:** When the import confirmation modal is submitted but no import toggles are active (no "Import missing", no "Overwrite existing", no characters selected for creation, no existing characters selected for asset upload), the system should skip entirely — no API calls, no background processing.

**Acceptance Criteria:**
- [ ] When `totalActionCount === 0`, the "Import" button is disabled (this already works)
- [ ] If somehow triggered with nothing selected, `handleImportConfirmWithAssets` returns immediately without calling any API endpoints
- [ ] No character creation, image upload, metadata upload, or video import calls are made
- [ ] No cache invalidation queries are triggered
- [ ] No toast notification is shown (or a simple "Nothing to import" info toast)
- [ ] The modal closes cleanly

**Technical Notes:**
- File: `apps/frontend/src/features/projects/hooks/use-character-import.ts`
- Add an early return at the top of `handleImportConfirmWithAssets` when both `newPayloads` and `existingPayloads` are empty
- The button is already disabled when `totalActionCount === 0`, but a defensive guard is needed in the handler

#### Requirement 3.3: Import UI Race Condition Fix
**Description:** During an asset-aware import, the character list in the background updates to show "Already Exists" badges for newly created characters before the upload progress bar finishes. This happens because the bulk-create mutation triggers a cache invalidation that re-renders the character list mid-import.

**Acceptance Criteria:**
- [ ] The character list does not update with "Already Exists" indicators until the entire import (creation + asset uploads) is complete
- [ ] The progress modal remains the primary UI during the import — the background list is stable
- [ ] Cache invalidation for the characters query happens only once, after all phases are complete
- [ ] If the user navigates away during import, the import continues in the background and shows a summary toast on completion
- [ ] The progress indicator shows the current phase and item count accurately throughout

**Technical Notes:**
- File: `apps/frontend/src/features/projects/hooks/use-character-import.ts`
- The `bulkCreate.mutateAsync` call at line ~127 triggers automatic TanStack Query cache invalidation for the characters list. Use `mutateAsync` with `{ onSuccess: undefined }` or temporarily disable automatic invalidation during the import flow
- Alternative: wrap the entire import in a "batch mode" that defers all query invalidation until the final phase
- The `queryClient.invalidateQueries` calls at lines ~354-359 are correct (end of import) — the issue is the intermediate invalidation from the create mutation

## 6. Non-Functional Requirements

### Performance
- Import of 50 character folders (each with 2 images, 1 metadata JSON, 3 videos) completes within 5 minutes
- Drag-and-drop group move completes within 500ms for single characters
- Breadcrumb scroll animation completes within 300ms
- Pipeline Settings inputs render at full width without layout shift

### Security
- The "Ignore deliverable" permission should respect the user's RBAC role (creator or above)
- File drop validation (Req 3.1) runs client-side only — no sensitive data is exposed

## 7. Non-Goals (Out of Scope)

- Rewriting the entire import pipeline architecture (this PRD fixes specific bugs in the existing flow)
- Adding new import methods (e.g., ZIP upload, watch folder) — covered by PRD-113 Phase 2
- Redesigning the entire Character Detail page layout — only the header consolidation is in scope
- Adding new deliverable types — the "Ignore" toggle works with existing deliverable types
- Backend performance optimization for video transcoding — only the upload/import path is in scope
- Internationalization (i18n) of the UI — only UTF-8 data handling in metadata is in scope

## 8. Design Considerations

- The "Ignore" toggle should use a subtle visual treatment (muted text, strikethrough) rather than hiding the item entirely — PMs need to know what was intentionally skipped.
- The filename mismatch warning should be a confirmation dialog, not a blocking error — PMs may intentionally assign files across characters.
- The "Show disabled" toggle should be in the existing filter bar, not a separate UI element.
- Header consolidation should maintain the current visual hierarchy — the character name is the most prominent element, followed by status badges.
- Wider inputs should not break the existing layout on standard screen widths (1280px+).

## 9. Technical Considerations

### Existing Code to Reuse
- `useCharacterImport` hook (`apps/frontend/src/features/projects/hooks/use-character-import.ts`) — fix in place
- `ImportConfirmModal` component (`apps/frontend/src/features/projects/components/ImportConfirmModal.tsx`) — fix in place
- `PipelineSettingsEditor` component (`apps/frontend/src/features/character-dashboard/PipelineSettingsEditor.tsx`) — modify CSS
- `parseFilename` utility (`apps/frontend/src/features/characters/tabs/matchDroppedVideos.ts`) — extend
- `sceneHasVideo` utility (`apps/frontend/src/features/scenes/types.ts`) — fix filter logic
- `readFileAsJson` utility (`apps/frontend/src/lib/file-types.ts`) — fix UTF-8 handling
- `CharacterDetailPage` (`apps/frontend/src/features/characters/CharacterDetailPage.tsx`) — header consolidation
- `ProjectCharactersTab` (`apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`) — DnD fix, disabled toggle, breadcrumb scroll
- `useCharacterAvatars` hook (`apps/frontend/src/features/projects/hooks/use-character-avatars.ts`) — reuse for header avatar
- Breadcrumb component from design system (`@/components/composite`)

### Database Changes
- **New table or column for deliverable ignores:**
  ```sql
  -- Option A: Dedicated table
  CREATE TABLE character_deliverable_ignores (
      id BIGSERIAL PRIMARY KEY,
      uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE CASCADE,
      track_id BIGINT REFERENCES scene_type_tracks(id) ON DELETE CASCADE,
      ignored_by BIGINT REFERENCES users(id),
      ignored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reason TEXT,
      UNIQUE (character_id, scene_type_id, track_id)
  );
  ```
- No other schema changes required — the remaining fixes are frontend-only or configuration changes

### API Changes
- **New endpoint:** `POST /api/v1/characters/{id}/deliverable-ignores` — add/remove ignore for a deliverable
- **New endpoint:** `GET /api/v1/characters/{id}/deliverable-ignores` — list ignored deliverables for a character
- **New endpoint:** `DELETE /api/v1/characters/{id}/deliverable-ignores/{ignoreId}` — remove an ignore
- No changes to existing endpoints — the bug fixes are client-side or involve fixing existing backend behavior

## 10. Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Import with 100+ characters and slow network | Progress bar updates per-character; no timeout; partial success reported |
| All characters in import are duplicates | "Select All" row shows "All characters already exist"; Import button shows asset-upload options only |
| Metadata JSON with BOM + mixed encodings | BOM stripped; UTF-8 enforced; non-UTF-8 files rejected with clear error |
| Drag character to same group it's already in | No-op; no API call; no error |
| Ignore the last remaining deliverable | Character becomes "complete" (all required deliverables satisfied or ignored) |
| Un-ignore a deliverable after character was marked complete | Character reverts to "incomplete" |
| Filename with no character name prefix (e.g., `clothed.png`) | No warning shown; file imported normally |
| Filename matches target character | No warning shown; file imported normally |
| Drop multiple files at once with mixed character names | Warning shown per mismatched file, not per batch |
| Import triggered during an already-running import | Second import is queued or blocked with "Import in progress" message |

## 11. Success Metrics

- Zero import timeouts for batches of up to 100 characters
- "Select All" correctly reports the count in 100% of scenarios
- Zero "Empty" versions counted in delivery readiness across all projects
- Bulk metadata upload succeeds with Unicode content in 100% of test cases
- Drag-and-drop group move succeeds on first attempt in 95%+ of interactions
- PM workflow time to mark ignored deliverables: <5 seconds per item
- Filename mismatch warning correctly identifies mismatches in 90%+ of cases

## 12. Testing Requirements

### Unit Tests
- `readFileAsJson`: test with UTF-8 BOM, UTF-8 no BOM, Latin-1 (should fail gracefully), CJK characters, emoji
- `parseFilename` extension: test character name extraction from various filename patterns
- `sceneHasVideo`: test with empty versions, non-empty versions, mixed
- `normalizeCharacterName` + duplicate detection: test case sensitivity after normalize toggle
- Import skip guard: test early return when no payloads provided
- Deliverable ignore CRUD: test add, remove, list

### Integration Tests
- Full import flow with 20+ characters, images, metadata (UTF-8), and videos — no timeouts
- Drag-and-drop move character between groups — verify DB state
- Ignore deliverable -> check readiness calculation excludes it
- Import with all duplicates -> verify UI shows correct state

### Manual Testing Checklist
- [ ] Import 50 character folders — no timeout, progress updates smoothly
- [ ] Click "Select All" with mix of new + duplicate characters — count is correct
- [ ] Upload metadata.json with Japanese/Korean characters — content preserved
- [ ] Drag character from Group A to Group B — character moves on first try
- [ ] Mark 3 deliverables as ignored — character readiness updates
- [ ] Toggle "Show disabled" — disabled characters appear/disappear
- [ ] Click group name in breadcrumb — page scrolls to group
- [ ] Drop `anna_clothed.png` onto "Xena" card — warning appears
- [ ] Submit import with nothing selected — no API calls fired

## 13. Open Questions

- Should the "Ignore deliverable" state be per-project or global (cross-project)? Recommendation: per-project, since deliverable requirements may differ.
- Should the filename mismatch check also run during bulk folder import, or only on single-file drops to character cards?
- What is the maximum import batch size the system should support? Current recommendation: 200 characters per import.
- Should the "Show disabled" toggle default be configurable per user or per project?

## 14. Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-03-06 | Initial PRD creation — 5 bug fixes, 5 UX polish items, 3 import validation fixes |
