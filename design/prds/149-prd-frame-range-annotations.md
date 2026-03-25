# PRD-149: Frame Range Annotations & Text Presets

**Document ID:** 149-prd-frame-range-annotations
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-25
**Last Updated:** 2026-03-25

---

## 1. Introduction/Overview

Frame annotations currently attach to a single frame number with only visual drawings (no text). This PRD makes two related enhancements:

**Frame Ranges:** Annotations can span from `frame_number` (start) to `frame_end` (end), indicating an issue that persists across multiple frames. The drawing is attached to the start frame only; the range communicates "this note applies across these frames." Single-frame annotations remain the default.

**Annotation Text Presets:** Reviewers can attach a text note to any annotation and select from pipeline-scoped preset labels (e.g., "Bad Eyes", "Flickering", "Wrong Pose") with one click. Presets speed up the QA workflow by eliminating repetitive typing. Custom text can also be entered. Presets are managed per-pipeline and can be configured by admins.

## 2. Related PRDs & Dependencies

### Depends On
- PRD-70: On-Frame Annotation & Markup (base annotation system)
- PRD-109: Video Player Controls (A-B loop, timeline scrubber, transport controls)

### Extends
- PRD-70: Adds `frame_end` column and range-aware UI to the existing annotation infrastructure

## 3. Goals

### Primary Goals
- Allow reviewers to annotate frame ranges, not just single frames
- Visualize range annotations on the timeline scrubber
- Display range annotations clearly in the annotation list and annotated-frames indicator
- Allow text notes on annotations with one-click preset labels for common QA issues

### Secondary Goals
- Reuse the A-B loop "mark in / mark out" UX pattern for familiarity
- Keep the annotation workflow simple: range marking is optional, single-frame remains default
- Pipeline-scoped presets so each pipeline has its own relevant QA vocabulary

## 4. User Stories

- As a reviewer, I want to mark a start and end frame for my annotation so the development team knows the issue spans multiple frames.
- As a reviewer, I want to see colored range segments on the timeline so I can quickly identify which portions of the video have range annotations.
- As a reviewer, I want to click a range annotation in the list and navigate to its start frame so I can see the drawing in context.
- As a reviewer, I want to click a preset like "Bad Eyes" to quickly label my annotation without typing.
- As a reviewer, I want to add custom text notes to annotations for issues not covered by presets.
- As an admin, I want to configure the preset labels per pipeline so each pipeline has relevant QA terminology.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Database — Add `frame_end` Column

**Description:** Add a nullable `frame_end INTEGER` column to the `frame_annotations` table. When NULL, the annotation is single-frame (existing behavior). When set, the annotation spans from `frame_number` to `frame_end`.

**Acceptance Criteria:**
- [ ] New migration adds `frame_end INTEGER NULL` to `frame_annotations`
- [ ] CHECK constraint enforces `frame_end IS NULL OR frame_end > frame_number`
- [ ] Existing rows remain unaffected (frame_end defaults to NULL)
- [ ] Index on `(version_id, frame_end)` WHERE both are NOT NULL for range overlap queries

**Technical Notes:**
- Migration file: `migrations/YYYYMMDD_add_frame_end_to_annotations.sql`
- No changes to the parent FK constraint (`chk_frame_annotations_parent`)

#### Requirement 1.2: Backend Model & DTOs

**Description:** Update the Rust `FrameAnnotation` model and creation DTOs to include `frame_end`.

**Acceptance Criteria:**
- [ ] `FrameAnnotation` struct gains `pub frame_end: Option<i32>`
- [ ] `CreateVersionAnnotation` gains `pub frame_end: Option<i32>`
- [ ] `CreateMediaVariantAnnotation` gains `pub frame_end: Option<i32>`
- [ ] `CreateFrameAnnotation` gains `pub frame_end: Option<i32>`
- [ ] `AnnotatedItem` gains `pub frame_end: Option<i32>`
- [ ] Validation: if `frame_end` is provided, it must be greater than `frame_number`

**Technical Notes:**
- File: `crates/db/src/models/frame_annotation.rs`
- Add validation in `x121_core::annotation` module alongside `validate_frame_number`

#### Requirement 1.3: Backend API — Accept and Return `frame_end`

**Description:** Update annotation handlers to pass `frame_end` through to the database and return it in responses.

**Acceptance Criteria:**
- [ ] `upsert_version_annotation` handler passes `frame_end` from input DTO to the repository
- [ ] `upsert_media_variant_annotation` handler passes `frame_end` similarly
- [ ] `create_annotation` (segment-scoped) passes `frame_end`
- [ ] All list/get endpoints return `frame_end` in the response
- [ ] `browse_annotations` response includes `frame_end`

**Technical Notes:**
- File: `crates/api/src/handlers/annotation.rs`
- Repository SQL queries need `frame_end` in INSERT/UPDATE and SELECT

#### Requirement 1.4: Frontend Types — Add `frame_end`

**Description:** Update TypeScript annotation types and the Zustand store entry to include `frame_end`.

**Acceptance Criteria:**
- [ ] `FrameAnnotation` interface gains `frame_end: number | null`
- [ ] `CreateFrameAnnotation` interface gains `frame_end?: number`
- [ ] `AnnotatedItem` interface gains `frame_end: number | null`
- [ ] `FrameAnnotationEntry` in the Zustand store gains `frameEnd: number | null`

**Technical Notes:**
- Files: `features/annotations/types.ts`, `features/scenes/stores/useClipAnnotationsStore.ts`

#### Requirement 1.5: Annotation Mode — Mark Start / Mark End Controls

**Description:** In annotation mode within `ClipPlaybackModal`, add optional "Mark Start" and "Mark End" buttons that let the user define a frame range for the current annotation session. This mirrors the A-B loop UX pattern.

**Acceptance Criteria:**
- [ ] When annotation mode is entered, the current frame is the start frame (same as today)
- [ ] A "Mark Start" button sets the start frame to the current playback frame
- [ ] A "Mark End" button sets the end frame to the current playback frame
- [ ] Start/End frame indicators display next to the buttons (e.g., "F120 - F185")
- [ ] If no end frame is set, the annotation saves as single-frame (existing behavior)
- [ ] If end frame is set, the annotation saves with `frame_end` populated
- [ ] A "Clear Range" action resets to single-frame mode
- [ ] Validation: end frame must be greater than start frame; show inline error if not

**Technical Notes:**
- File: `features/scenes/ClipPlaybackModal.tsx`
- The Mark Start/End buttons appear in the annotation controls bar alongside "Exit Annotation"
- Video must be paused to mark start/end (call `pauseVideo()` before setting)

#### Requirement 1.6: Upsert Hook — Pass `frame_end`

**Description:** Update `useUpsertVersionAnnotation` to accept and send `frame_end` in the API request.

**Acceptance Criteria:**
- [ ] Mutation input type gains `frameEnd?: number | null`
- [ ] API PUT body includes `frame_end` field when provided
- [ ] Null/undefined `frameEnd` omits the field (backward compatible)

**Technical Notes:**
- File: `features/scenes/hooks/useVersionAnnotations.ts`

#### Requirement 1.7: Timeline Visualization — Range Segments

**Description:** Render frame range annotations as colored segments on the `TimelineScrubber`, visually distinct from the A-B loop highlight.

**Acceptance Criteria:**
- [ ] `TimelineScrubber` accepts an optional `annotationRanges` prop: `Array<{ frameStart: number; frameEnd: number }>`
- [ ] Each range renders as a semi-transparent amber/orange bar on the timeline track
- [ ] Ranges use a different color than the A-B loop (A-B loop = warning/yellow, annotation ranges = amber/orange)
- [ ] Multiple overlapping ranges render correctly (overlapping bars stack visually via opacity)
- [ ] Single-frame annotations (no range) do not render range segments (existing dot behavior is sufficient)

**Technical Notes:**
- File: `features/video-player/components/TimelineScrubber.tsx`
- Use `frameToSeconds` utility for position calculations, same as A-B loop markers
- Color: `var(--color-status-warning)` is used by A-B loop; use a distinct amber like `#F59E0B` with `/20` opacity

#### Requirement 1.8: Annotated Frames Indicator — Range Display

**Description:** Update the annotated frames indicator row and the annotation summary list in `ClipPlaybackModal` to display ranges as "F120-F185" instead of just "F120".

**Acceptance Criteria:**
- [ ] Annotated frames indicator buttons show `F120-F185` for range annotations
- [ ] Annotation summary list items show `Frame 120-185` for range annotations
- [ ] Clicking a range annotation navigates to the start frame
- [ ] Single-frame annotations continue to display as `F120` / `Frame 120`

**Technical Notes:**
- File: `features/scenes/ClipPlaybackModal.tsx`
- The `FrameAnnotationEntry` in the store now carries `frameEnd`

#### Requirement 1.9: Backward Compatibility

**Description:** Existing single-frame annotations must continue to work without any migration of data or user-facing changes.

**Acceptance Criteria:**
- [ ] Existing annotations with `frame_end IS NULL` render identically to current behavior
- [ ] The default annotation workflow (enter annotation mode, draw, exit) creates single-frame annotations
- [ ] No data migration required for existing rows
- [ ] API responses for existing annotations return `frame_end: null`

#### Requirement 1.10: Database — Annotation Text & Presets

**Description:** Add a `note` text column to `frame_annotations` for free-text notes. Create an `annotation_presets` table for pipeline-scoped preset labels.

**Database Schema:**

```sql
-- Add note to existing annotations
ALTER TABLE frame_annotations ADD COLUMN note TEXT;

-- Preset labels for quick annotation
CREATE TABLE annotation_presets (
    id          BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    color       TEXT,           -- Optional color for visual grouping
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (COALESCE(pipeline_id, -1), label)
);
CREATE INDEX idx_annotation_presets_pipeline ON annotation_presets(pipeline_id);
```

**Acceptance Criteria:**
- [ ] `frame_annotations.note` TEXT nullable column added
- [ ] `annotation_presets` table created with pipeline scoping
- [ ] Unique constraint prevents duplicate presets per pipeline

#### Requirement 1.11: Backend — Preset CRUD & Note Passthrough

**Description:** API endpoints for managing annotation presets and passing notes through annotation creation.

**Endpoints:**
- `GET /api/v1/annotation-presets?pipeline_id={id}` — list presets for a pipeline
- `POST /api/v1/annotation-presets` — create preset `{ pipeline_id, label, color? }`
- `PUT /api/v1/annotation-presets/{id}` — update label/color
- `DELETE /api/v1/annotation-presets/{id}` — delete preset

**Acceptance Criteria:**
- [ ] CRUD endpoints for annotation presets
- [ ] `FrameAnnotation` model gains `note: Option<String>`
- [ ] Annotation upsert handlers accept `note` field
- [ ] Preset list returns sorted by `sort_order` then `label`

#### Requirement 1.12: Frontend — Annotation Text & Preset Chips

**Description:** In annotation mode, show a text input for notes and a row of preset chips above it. Clicking a preset fills the note field. The note is saved with the annotation.

**UI Layout (in annotation controls):**
```
[Preset chips: Bad Eyes | Flickering | Wrong Pose | Extra Limb | ...]
[Note: __________________ ] [Save]
```

**Acceptance Criteria:**
- [ ] Preset chips shown in annotation mode, fetched via `useAnnotationPresets(pipelineId)` hook
- [ ] Clicking a preset chip fills the note field with the preset label
- [ ] Note is saved via the upsert mutation alongside the drawing and frame range
- [ ] Annotations with notes show the note text in the annotation list/summary
- [ ] Annotation list items show note text below the frame number (e.g., "Frame 120-185 — Bad Eyes")
- [ ] Empty note is allowed (backward compatible with existing annotations)

#### Requirement 1.13: Frontend — Preset Management

**Description:** A small management UI for admins to add/edit/delete presets. Can be a modal accessible from the annotation controls or pipeline settings.

**Acceptance Criteria:**
- [ ] "Manage Presets" button in annotation mode opens a modal
- [ ] Modal shows list of presets with edit/delete actions
- [ ] Add new preset with label + optional color
- [ ] Presets scoped to current pipeline

### Phase 2: Enhancements (Post-MVP)

- Timeline hover tooltip showing annotation range details and note text
- Range-aware annotation filtering in the browse page (find annotations spanning a specific frame)
- Bulk range operations (extend/shrink range via drag handles on timeline)
- Preset usage statistics (most used presets shown first)

## 6. Non-Functional Requirements

### Performance
- Timeline rendering with up to 50 annotation ranges must not cause visible jank (use CSS positioning, avoid per-frame iteration)

### Security
- No new security considerations beyond existing annotation auth (user must be authenticated)

## 7. Non-Goals (Out of Scope)

- Per-frame drawing duplication across the range (the drawing lives on the start frame only)
- Range drag handles for resizing ranges on the timeline
- Annotation range overlap conflict resolution
- Changes to the segment-scoped annotation workflow (this PRD focuses on version-scoped and media-variant-scoped annotations)

## 8. Design Considerations

- The Mark Start / Mark End buttons follow the same visual pattern as the A-B loop "A" / "B" buttons in `TransportControls`: small labeled buttons that highlight when a point is set
- Range segments on the timeline use amber/orange to distinguish from the yellow A-B loop highlight
- The annotation controls bar already shows the current frame number in cyan; the range indicator can sit next to it

## 9. Technical Considerations

### Existing Code to Reuse
- `TimelineScrubber` A-B loop range rendering pattern (CSS absolute positioning with percentage-based left/width)
- `frameToSeconds` utility for frame-to-time conversion
- `useABLoop` hook pattern for in-point/out-point state management (can inform range state design)
- `useUpsertVersionAnnotation` mutation structure
- `useClipAnnotationsStore` Zustand store pattern

### Database Changes
- Add `frame_end INTEGER NULL` to `frame_annotations` table
- Add `note TEXT` to `frame_annotations` table
- Add CHECK constraint: `frame_end IS NULL OR frame_end > frame_number`
- New `annotation_presets` table for pipeline-scoped preset labels

### API Changes
- All existing annotation endpoints gain `frame_end` and `note` in request/response bodies
- New CRUD endpoints for `annotation_presets`
- No breaking changes (fields are optional/nullable)

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| User sets end frame before start frame | Validation error; show inline message "End frame must be after start frame" |
| User sets end frame equal to start frame | Treat as single-frame annotation (clear `frame_end`) |
| User exits annotation mode without setting end frame | Save as single-frame annotation (existing behavior) |
| Range annotation is edited on a different frame than start | Drawing always edits on the start frame; navigating to a frame within the range but not the start frame should navigate to the start frame for editing |
| Video has fewer frames than the range end | Allow it; the range is metadata, not a playback constraint |
| Overlapping ranges from different annotation sessions | Both render independently on the timeline; no conflict resolution needed |

## 11. Success Metrics

- Reviewers can create range annotations without confusion (no support requests about the feature)
- Range annotations are visible on the timeline at a glance
- Zero regressions in single-frame annotation workflow

## 12. Testing Requirements

- **Backend unit test:** Validate `frame_end > frame_number` constraint rejects invalid values
- **Backend unit test:** Upsert with `frame_end` persists and returns correctly
- **Backend unit test:** Existing annotations with NULL `frame_end` continue to work
- **Frontend unit test:** `FrameAnnotationEntry` with `frameEnd` renders range label correctly
- **Integration test:** Full round-trip: create range annotation via API, fetch, verify `frame_end` in response
- **Manual test:** Enter annotation mode, mark start, scrub, mark end, draw, exit; verify annotation saved with range
- **Manual test:** Timeline shows amber range segment for range annotation
- **Manual test:** Annotated frames indicator shows "F120-F185" format

## 13. Open Questions

None — requirements are well-defined and the feature is a focused extension of existing infrastructure.

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | AI Product Manager | Initial draft |
| 1.1 | 2026-03-25 | AI Product Manager | Added annotation text presets (Reqs 1.10-1.13) |
