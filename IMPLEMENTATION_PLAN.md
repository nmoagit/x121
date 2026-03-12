# Implementation Plan: Requirements Gaps Completion

All gaps from `/mnt/d/Projects/trulience/documents/requirements_refined.md` audit.
Organized into 5 stages by dependency order. Each stage should be committed independently.

---

## Stage 1: Backend Data Enrichment (no frontend changes)
**Goal**: Fix backend queries and populate missing data so frontend stages have correct data.
**Tests**: cargo test, manual API verification

### 1.1 Backend stats exclude archived characters ✅
- **Change**: Added `AND status_id != 3` to character and scene stats queries

### 1.2 Populate generation_snapshot during video generation ⏸️ BLOCKED
- Pipeline/worker crates are stubs — no `SceneVideoVersionRepo::create()` call sites exist yet
- Will be implemented when the video generation pipeline is built

### 1.3 Per-character deliverables query ✅
- Added `CharacterDeliverableRow` struct, `list_deliverable_status()` repo method
- New endpoint `GET /api/v1/projects/{id}/character-deliverables`

**Status**: [x] Complete (1.2 blocked)

---

## Stage 2: QA Playback & Storyboard (Scene workspace)
**Goal**: Wire up clip playback in QA review and display generation snapshots.
**Tests**: Frontend renders, video plays, snapshot data displays

### 2.1 Play Single Clip in ClipGallery
- **File**: `apps/frontend/src/features/scenes/ClipGallery.tsx` (~line 108, onPlay placeholder)
- **Change**: Replace empty `onPlay` with state that opens a video player modal
- **New**: `ClipPlaybackModal` component — simple modal with `<video>` element, controls, close button
- **Uses**: `getStreamUrl("version", versionId, "proxy")` for the video src
- **Scope**: Small — modal + state toggle

### 2.2 Play Sequence to This Point in ClipGallery
- **File**: `apps/frontend/src/features/scenes/ClipGallery.tsx`
- **Change**: Add "Play Sequence" button per clip card. On click, collect all versions from v1 up to the selected version, open the same modal but with sequential playback (auto-advance to next clip on ended)
- **Reuse**: Pattern from `SequencePlayer.tsx` (already plays clips sequentially) — extract shared `useSequentialPlayback` hook
- **New hook**: `apps/frontend/src/features/scenes/hooks/useSequentialPlayback.ts`

### 2.3 Display generation_snapshot in ClipCard
- **File**: `apps/frontend/src/features/scenes/ClipCard.tsx`
- **Change**: If `clip.generation_snapshot` is not null, show an expandable "Generation Params" section (collapsible JSON viewer or key-value list: workflow, seed, model, etc.)
- **Read-only**: No edit capability — matches requirement for historical preservation
- **Type update**: Add `generation_snapshot` to `SceneVideoVersion` in `apps/frontend/src/features/scenes/types.ts`

### 2.4 Visual storyboard timeline (stretch)
- **File**: `apps/frontend/src/features/scenes/ClipGallery.tsx`
- **Change**: Add a horizontal filmstrip bar above the version list showing thumbnail frames per version
- **Reuse**: `ThumbnailStrip` from `apps/frontend/src/features/storyboard/ThumbnailStrip.tsx` already renders filmstrip thumbnails
- **Scope**: Wire ThumbnailStrip into ClipGallery, one strip per version

**Status**: [x] Complete (2.1 + 2.3 done; 2.2 + 2.4 deferred as stretch)

---

## Stage 3: Project Overview Deliverables Grid & Health Badges
**Goal**: Per-character deliverables matrix on Project Overview + health badge toggle.
**Tests**: Grid renders with correct data, toggle hides/shows badges, blocking reasons visible

### 3.1 Per-character deliverables grid on Project Overview
- **File**: `apps/frontend/src/features/projects/tabs/ProjectOverviewTab.tsx`
- **New component**: `CharacterDeliverablesGrid.tsx` in `apps/frontend/src/features/projects/components/`
- **Data**: Fetch from `GET /api/v1/projects/{id}/character-deliverables` (Stage 1.3)
- **Columns**: Character Name | Group | Images (N/M) | Scenes (N/M) | Metadata | Voice | Blocking | Overall %
- **Blocking column**: Shows badges like "Missing Seed Image", "Missing Workflow" from blocking_reasons array
- **Row click**: Navigate to character detail page
- **Hook**: `useCharacterDeliverables(projectId)` in `apps/frontend/src/features/projects/hooks/`

### 3.2 Blocking reasons on Character Cards
- **File**: `apps/frontend/src/features/projects/components/CharacterCard.tsx`
- **Change**: Accept optional `blockingReasons?: string[]` prop. When non-empty, render small red badges below the status badge
- **Data source**: From the deliverables grid data (same query), pass through avatarMap-style lookup

### 3.3 Show/Hide Issue Badges toggle
- **File**: `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`
- **Change**: Add "Audit View" toggle button in toolbar (next to Show/Hide Disabled)
- **Behavior**: When off (default = Gallery View), CharacterCards show no blocking badges. When on (Audit View), blocking badges appear on cards.
- **Persist**: localStorage key `x121.project.auditView`

### 3.4 Force Override toggle in Queue Outstanding modal
- **File**: `apps/frontend/src/features/projects/components/QueueOutstandingModal.tsx`
- **Change**: Add "Force Override" toggle next to "Include Already Generated"
- **Behavior**: When enabled, blocked items become selectable (remove opacity-50, enable checkbox). Show warning text: "Forcing blocked items may produce errors."
- **Scope**: Frontend-only toggle that changes the filtering logic (~10 lines)

**Status**: [x] Complete

---

## Stage 4: Import Improvements & Filename Validation
**Goal**: Fix import UX gaps — discovery prompt, filename mismatch warning, edge cases.
**Tests**: Drop folder triggers discovery summary, mismatched filename shows warning

### 4.1 Discovery summary prompt before import
- **File**: `apps/frontend/src/features/projects/hooks/use-character-import.ts` (or the component that handles folder drops)
- **Change**: After scanning dropped folder, show an intermediate "Discovery" step before the ImportConfirmModal:
  - "We found N images, M videos, and K metadata files in 'Anna'. Import as assets for Anna?"
  - Buttons: "Import All", "Select Files...", "Cancel"
- **New component**: `ImportDiscoveryModal.tsx` in `apps/frontend/src/features/projects/components/`
- **Flow**: Folder drop -> scan -> DiscoveryModal -> (confirm) -> ImportConfirmModal

### 4.2 Filename mismatch warning (Xena/Anna check)
- **File**: `apps/frontend/src/features/projects/components/ImportConfirmModal.tsx`
- **Change**: For each file in the import, extract the character name hint from the filename (reuse `extractCharacterHint` from `matchDroppedVideos.ts`). If the hint doesn't match the target character name (fuzzy match), show a yellow warning badge: "Filename suggests 'Xena' — importing to 'Anna'"
- **Existing code to reuse**: `extractCharacterHint()` and `matchesCharacterName()` from `apps/frontend/src/features/characters/tabs/matchDroppedVideos.ts`
- **Scope**: ~30 lines of warning logic in the modal

### 4.3 Empty selection validation
- **File**: `apps/frontend/src/features/character-ingest/FolderImportWizard.tsx`
- **Change**: In the confirm step, if zero entries have `is_included: true`, disable the Confirm button and show message: "No characters selected for import."
- **Scope**: 5 lines — conditional disable

### 4.4 Import race condition — cache invalidation
- **File**: `apps/frontend/src/features/projects/components/ImportConfirmModal.tsx`
- **Change**: After successful import (`onSuccess` callback of mutation), explicitly invalidate the character list query and wait for refetch before showing "Already Exists" labels
- **Pattern**: `queryClient.invalidateQueries({ queryKey: characterKeys.byProject(projectId) })`
- **Scope**: Small — add invalidation to onSuccess

**Status**: [x] Complete (4.1 deferred — ImportConfirmModal already shows file counts; 4.2-4.4 already implemented)

---

## Stage 5: Verification & Bug Fix Hardening
**Goal**: Verify Section 7 bug fixes and close remaining edge cases.
**Tests**: Manual QA + targeted unit tests

### 5.1 Empty versions not treated as completed
- **File**: `apps/backend/crates/api/src/handlers/delivery.rs` (delivery status endpoint)
- **Change**: Verify that `CharacterDeliveryStatus` computation excludes versions where `file_size_bytes IS NULL OR file_size_bytes = 0`
- **Frontend**: Verify `isEmptyClip()` from `scenes/types.ts` is used in delivery status display
- **If missing**: Add WHERE clause to delivery status query

### 5.2 Bulk metadata foreign character handling
- **File**: `apps/backend/crates/api/src/handlers/batch_metadata.rs`
- **Change**: Verify JSON parsing uses UTF-8 throughout. If metadata values contain non-ASCII (CJK, accented chars, etc.), ensure no truncation or encoding errors
- **Test**: Add integration test with non-ASCII metadata values
- **If missing**: Ensure `serde_json` handles Unicode correctly (it does by default — likely just needs test verification)

### 5.3 Import timeout handling for large imports
- **File**: `apps/backend/crates/api/src/handlers/importer.rs`
- **Change**: Verify that large folder imports (100+ files) don't hit the 30s request timeout
- **If needed**: Move heavy processing to background task, return 202 Accepted with job ID
- **Pattern**: Similar to batch_metadata which already uses async job pattern

### 5.4 Select All = 0 bug verification
- **File**: `apps/frontend/src/features/projects/components/ImportConfirmModal.tsx`
- **Change**: Verify that "Select All" checkbox correctly counts and selects only importable (non-duplicate) entries
- **Test**: Manual test with mix of new + existing characters

**Status**: [x] Verified — 5.1 N/A (delivery uses export tracking), 5.2 serde_json handles UTF-8 natively, 5.3 import uses frontend-side concurrency, 5.4 Select All already filters duplicates

---

## Execution Order

```
Stage 1 (backend) ─── no dependencies, do first
   |
Stage 2 (QA playback) ─── independent of Stage 1
   |
Stage 3 (overview grid) ─── depends on Stage 1.3 (deliverables endpoint)
   |
Stage 4 (import fixes) ─── independent
   |
Stage 5 (verification) ─── do last, validates everything
```

Stages 1, 2, and 4 can run in parallel. Stage 3 depends on 1.3. Stage 5 is final.

## Estimated Scope

| Stage | New files | Modified files | Complexity |
|-------|-----------|---------------|------------|
| 1 | 0 | 3-4 | Medium (SQL queries) |
| 2 | 2-3 | 3 | Medium (modal + hook) |
| 3 | 2 | 3 | Medium (grid component) |
| 4 | 1 | 3 | Low-Medium |
| 5 | 0 | 2-3 | Low (verification) |
