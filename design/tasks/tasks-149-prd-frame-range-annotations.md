# Task List: Frame Range Annotations & Text Presets

**PRD Reference:** `design/prds/149-prd-frame-range-annotations.md`
**Scope:** Frame ranges on annotations, annotation text notes with preset labels, timeline visualization.

## Overview

Two enhancements to the annotation system: (1) annotations can span a frame range instead of a single frame, and (2) annotations can have text notes with one-click preset labels for common QA issues. Both are additive — existing single-frame, drawing-only annotations continue to work unchanged.

### What Already Exists
- `frame_annotations` table with `frame_number`, `annotations_json` — **extend with `frame_end` + `note`**
- `DrawingCanvas` component — drawing lives on start frame, unchanged
- `ClipPlaybackModal` — annotation mode with enter/exit, frame indicator, upsert hook
- `TimelineScrubber` — A-B loop range rendering pattern to reuse for annotation ranges
- `useClipAnnotationsStore` Zustand store — **extend entries with `frameEnd` + `note`**
- A-B loop "A"/"B" buttons in TransportControls — **UX pattern to mirror for Mark Start/End**

### What We're Building
1. DB: `frame_end` + `note` columns on `frame_annotations`, `annotation_presets` table
2. Backend: pass `frame_end` + `note` through all annotation handlers
3. Frontend: Mark Start/End controls, timeline range segments, note input with preset chips
4. Preset management modal

### Key Design Decisions
1. Drawing stays on start frame — range is metadata only
2. Single-frame is default — range is opt-in via Mark End button
3. Presets are pipeline-scoped (like labels)
4. Note is free-text with one-click preset fill

---

## Phase 1: Database

### Task 1.1: Add frame_end, note columns and annotation_presets table
**File:** `apps/db/migrations/YYYYMMDD_frame_range_annotations_and_presets.sql`

```sql
BEGIN;

-- Frame range support
ALTER TABLE frame_annotations ADD COLUMN frame_end INTEGER;
ALTER TABLE frame_annotations ADD COLUMN note TEXT;

ALTER TABLE frame_annotations ADD CONSTRAINT ck_frame_annotations_frame_end
    CHECK (frame_end IS NULL OR frame_end > frame_number);

-- Annotation presets (pipeline-scoped)
CREATE TABLE annotation_presets (
    id          BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    color       TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (COALESCE(pipeline_id, -1), label)
);

CREATE INDEX idx_annotation_presets_pipeline ON annotation_presets(pipeline_id);

COMMIT;
```

**Acceptance Criteria:**
- [ ] `frame_end` nullable integer column added
- [ ] `note` nullable text column added
- [ ] CHECK constraint: `frame_end > frame_number` when not null
- [ ] `annotation_presets` table created with pipeline scoping
- [ ] Migration runs successfully

---

## Phase 2: Backend Models & Handlers

### Task 2.1: Update FrameAnnotation model
**File:** `apps/backend/crates/db/src/models/frame_annotation.rs`

Add `frame_end: Option<i32>` and `note: Option<String>` to:
- `FrameAnnotation` struct
- All Create DTOs
- `AnnotatedItem` (browse view)

**Acceptance Criteria:**
- [ ] `FrameAnnotation` has `frame_end` and `note` fields
- [ ] Create DTOs accept `frame_end` and `note`
- [ ] COLUMNS constant updated in repo

### Task 2.2: Update annotation handlers
**File:** `apps/backend/crates/api/src/handlers/annotation.rs`

Pass `frame_end` and `note` through all upsert/create handlers. Update SELECT queries in repos.

**Acceptance Criteria:**
- [ ] `upsert_version_annotation` accepts and persists `frame_end` + `note`
- [ ] `upsert_media_variant_annotation` same
- [ ] All list/get/browse endpoints return `frame_end` + `note`
- [ ] `cargo check` passes

### Task 2.3: Annotation presets CRUD
**Files:** `apps/backend/crates/db/src/models/annotation_preset.rs` (NEW), `apps/backend/crates/db/src/repositories/annotation_preset_repo.rs` (NEW), `apps/backend/crates/api/src/handlers/annotation_preset.rs` (NEW)

Simple CRUD for `annotation_presets`:
- `GET /api/v1/annotation-presets?pipeline_id={id}` — list sorted by sort_order, label
- `POST /api/v1/annotation-presets` — create `{ pipeline_id, label, color? }`
- `PUT /api/v1/annotation-presets/{id}` — update label/color
- `DELETE /api/v1/annotation-presets/{id}` — delete

**Acceptance Criteria:**
- [ ] Model + repo + handler + routes created
- [ ] Registered in mod.rs files
- [ ] Pipeline-scoped listing
- [ ] `cargo check` passes

---

## Phase 3: Frontend Types & Store

### Task 3.1: Update TypeScript types
**File:** `apps/frontend/src/features/annotations/types.ts`

- Add `frame_end: number | null` to `FrameAnnotation`
- Add `note: string | null` to `FrameAnnotation`
- Add `frame_end?: number` to creation types
- Add `note?: string` to creation types

**File:** `apps/frontend/src/features/scenes/stores/useClipAnnotationsStore.ts`

- Add `frameEnd: number | null` and `note: string | null` to `FrameAnnotationEntry`

**Acceptance Criteria:**
- [ ] All annotation types include `frame_end` and `note`
- [ ] Zustand store entry type updated
- [ ] `npx tsc --noEmit` passes

---

## Phase 4: Annotation Mode — Mark Start/End

### Task 4.1: Mark Start/End controls in ClipPlaybackModal
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Add state for `rangeEnd: number | null`. In annotation controls bar, add:
- "Mark Start" button — sets start frame to current playback frame (re-uses existing `annotatingFrameRef`)
- "Mark End" button — sets `rangeEnd` to current playback frame
- Range indicator: "F120 — F185" shown when both are set
- "Clear Range" — resets to single-frame

Pass `frame_end` to the upsert mutation when saving.

**Acceptance Criteria:**
- [ ] Mark Start button sets annotation start frame
- [ ] Mark End button sets range end
- [ ] Range indicator shows "F{start} — F{end}"
- [ ] Clear Range resets to single-frame
- [ ] Validation: end > start
- [ ] Saved annotation includes `frame_end` when range is set
- [ ] Single-frame default when no end marked

### Task 4.2: Update upsert hook to pass frame_end and note
**File:** `apps/frontend/src/features/scenes/hooks/useVersionAnnotations.ts`

- Mutation input accepts `frameEnd?: number | null` and `note?: string`
- API body includes `frame_end` and `note`

**Acceptance Criteria:**
- [ ] Hook passes `frame_end` in PUT body
- [ ] Hook passes `note` in PUT body

---

## Phase 5: Timeline Visualization

### Task 5.1: Annotation range segments on TimelineScrubber
**File:** `apps/frontend/src/features/video-player/components/TimelineScrubber.tsx`

Add `annotationRanges?: Array<{ frameStart: number; frameEnd: number }>` prop. Render amber/orange bars on the timeline (distinct from yellow A-B loop).

**Acceptance Criteria:**
- [ ] Prop accepted for annotation ranges
- [ ] Amber segments rendered for each range
- [ ] Visually distinct from A-B loop (different color)
- [ ] Multiple ranges render correctly
- [ ] Single-frame annotations don't render segments

### Task 5.2: Pass annotation ranges from ClipPlaybackModal to TimelineScrubber
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Compute ranges from the annotation store entries that have `frameEnd` and pass to VideoPlayer → TimelineScrubber.

**Acceptance Criteria:**
- [ ] Ranges derived from store entries with `frameEnd`
- [ ] Passed through VideoPlayer to TimelineScrubber

---

## Phase 6: Annotation List — Range + Note Display

### Task 6.1: Update annotated frames indicator and summary list
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

- Frame indicator buttons: show `F120-F185` for range annotations
- Summary list items: show `Frame 120-185` and note text below

**Acceptance Criteria:**
- [ ] Range annotations display as "F{start}-F{end}"
- [ ] Note text shown below frame number in summary
- [ ] Single-frame annotations unchanged

---

## Phase 7: Text Presets

### Task 7.1: Annotation presets hook
**File:** `apps/frontend/src/features/annotations/hooks/use-annotation-presets.ts` (NEW)

- `useAnnotationPresets(pipelineId)` — list presets
- `useCreateAnnotationPreset()` — create mutation
- `useUpdateAnnotationPreset()` — update mutation
- `useDeleteAnnotationPreset()` — delete mutation

**Acceptance Criteria:**
- [ ] All CRUD hooks implemented
- [ ] Query key factory for cache invalidation

### Task 7.2: Preset chips in annotation mode
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Show preset chips above a note text input in annotation mode. Clicking a preset fills the note. Note saved with the annotation.

**Acceptance Criteria:**
- [ ] Preset chips shown in annotation mode
- [ ] Clicking preset fills note field
- [ ] Note input (small textarea or text input)
- [ ] Note saved via upsert mutation
- [ ] Annotations with notes show note in list

### Task 7.3: Preset management modal
**File:** `apps/frontend/src/features/annotations/AnnotationPresetManager.tsx` (NEW)

Small modal for CRUD on presets. Accessible from annotation mode controls.

**Acceptance Criteria:**
- [ ] List presets with edit/delete
- [ ] Add new preset with label + optional color
- [ ] Pipeline-scoped
- [ ] "Manage Presets" button in annotation controls

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/..._frame_range_annotations_and_presets.sql` | Migration |
| `apps/backend/crates/db/src/models/frame_annotation.rs` | Add frame_end, note |
| `apps/backend/crates/db/src/models/annotation_preset.rs` | NEW preset model |
| `apps/backend/crates/db/src/repositories/annotation_preset_repo.rs` | NEW preset CRUD |
| `apps/backend/crates/api/src/handlers/annotation.rs` | Pass frame_end + note |
| `apps/backend/crates/api/src/handlers/annotation_preset.rs` | NEW preset handlers |
| `apps/frontend/src/features/annotations/types.ts` | Add frame_end, note to types |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | Mark Start/End, note input, presets |
| `apps/frontend/src/features/video-player/components/TimelineScrubber.tsx` | Range segments |
| `apps/frontend/src/features/annotations/hooks/use-annotation-presets.ts` | NEW preset hooks |
| `apps/frontend/src/features/annotations/AnnotationPresetManager.tsx` | NEW preset modal |

---

## Implementation Order

### MVP
1. Phase 1: Database — Task 1.1
2. Phase 2: Backend — Tasks 2.1-2.3
3. Phase 3: Frontend types — Task 3.1
4. Phase 4: Mark Start/End — Tasks 4.1-4.2
5. Phase 5: Timeline — Tasks 5.1-5.2
6. Phase 6: Range display — Task 6.1
7. Phase 7: Presets — Tasks 7.1-7.3

**MVP Success Criteria:**
- Frame range annotations save and display correctly
- Timeline shows amber range segments
- Preset chips speed up annotation with common QA labels
- Existing single-frame annotations unaffected

---

## Version History

- **v1.0** (2026-03-25): Initial task list from PRD-149
