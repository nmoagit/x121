# Task List: On-Frame Annotation & Markup

**PRD Reference:** `design/prds/070-prd-on-frame-annotation-markup.md`
**Scope:** Build drawing and annotation tools for marking up specific video frames with freehand pen, shapes, text labels, per-reviewer layers, annotation summary, and PNG export for external sharing.

## Overview

"The hand is wrong" is vague. A circle drawn on the exact frame where the artifact occurs is unambiguous. This PRD provides professional-grade annotation tools: freehand pen, circle, rectangle, arrow, and highlight overlays directly on paused video frames; text labels anchored to frame locations; per-reviewer annotation layers with toggleable visibility; an annotation summary list; and PNG export for sharing outside the platform. Annotations are stored as part of the PRD-038 review thread.

### What Already Exists
- PRD-038 Collaborative Review (note storage and thread system)
- PRD-083 Video playback engine (frame-accurate display)
- PRD-029 design system components
- PRD-000 database infrastructure

### What We're Building
1. Drawing engine (Canvas API or SVG overlay)
2. Drawing tools: pen, circle, rectangle, arrow, highlight
3. Text label system
4. Frame-pinning system (annotations appear/disappear at specific frames)
5. Per-reviewer annotation layers with toggle
6. Annotation summary list view
7. PNG export compositor
8. Database table and API for annotation storage

### Key Design Decisions
1. **Canvas API for drawing** — Canvas provides pixel-level control and performance for freehand drawing. SVG for vector shapes.
2. **Annotations pinned to frames** — Each annotation is stored with a frame number. During scrubbing, annotations appear/disappear at their frame.
3. **Per-reviewer layers** — Each user's annotations are a separate toggleable layer, like a drawing app.
4. **Integration with PRD-038** — Annotations are a type of review content, appearing in the review thread.

---

## Phase 1: Database & API

### Task 1.1: Create Frame Annotations Table
**File:** `migrations/YYYYMMDD_create_frame_annotations.sql`

```sql
CREATE TABLE frame_annotations (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    frame_number INTEGER NOT NULL,
    annotations_json JSONB NOT NULL,   -- Array of drawing objects (shapes, paths, text)
    review_note_id BIGINT NULL REFERENCES review_notes(id) ON DELETE SET NULL,  -- Link to PRD-038
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_frame_annotations_segment_id ON frame_annotations(segment_id);
CREATE INDEX idx_frame_annotations_user_id ON frame_annotations(user_id);
CREATE INDEX idx_frame_annotations_frame_number ON frame_annotations(segment_id, frame_number);
CREATE INDEX idx_frame_annotations_review_note_id ON frame_annotations(review_note_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON frame_annotations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `frame_annotations` stores per-user, per-frame annotation data as JSONB
- [ ] Link to PRD-038 review notes via `review_note_id`
- [ ] Indexes on segment, user, frame number, and review note
- [ ] `updated_at` trigger applied

### Task 1.2: Annotation Model & Repository
**File:** `src/models/annotation.rs`, `src/repositories/annotation_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct FrameAnnotation {
    pub id: DbId,
    pub segment_id: DbId,
    pub user_id: DbId,
    pub frame_number: i32,
    pub annotations_json: serde_json::Value,
    pub review_note_id: Option<DbId>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model and repository with CRUD operations
- [ ] Query by segment + frame number for frame-pinned display
- [ ] Query by segment + user for layer toggle
- [ ] Annotation summary query (all annotations for a segment, sorted by frame)
- [ ] Unit tests

### Task 1.3: Annotation API
**File:** `src/routes/annotation.rs`

```rust
pub fn annotation_routes() -> Router<AppState> {
    Router::new()
        .route("/segments/:id/annotations", get(list_annotations).post(create_annotation))
        .route("/segments/:id/annotations/:ann_id", put(update_annotation).delete(delete_annotation))
        .route("/segments/:id/annotations/export/:frame", get(export_frame))
        .route("/segments/:id/annotations/summary", get(annotation_summary))
}
```

**Acceptance Criteria:**
- [ ] CRUD for annotations
- [ ] `GET /segments/:id/annotations/export/:frame` returns composited PNG
- [ ] `GET /segments/:id/annotations/summary` returns all annotations sorted by frame
- [ ] Export composites video frame + all visible annotation layers

---

## Phase 2: Drawing Engine

### Task 2.1: Drawing Canvas
**File:** `frontend/src/features/annotations/DrawingCanvas.tsx`

```typescript
interface DrawingCanvasProps {
  width: number;
  height: number;
  tool: DrawingTool;
  color: string;
  strokeWidth: number;
  onAnnotationComplete: (annotation: DrawingObject) => void;
}

type DrawingTool = 'pen' | 'circle' | 'rectangle' | 'arrow' | 'highlight' | 'text';
```

**Acceptance Criteria:**
- [ ] Canvas overlay positioned over the video frame
- [ ] Drawing latency <10ms (real-time feel for pen tool)
- [ ] Supports: freehand pen, circle, rectangle, arrow, highlight
- [ ] Color picker for annotation color
- [ ] Adjustable stroke width
- [ ] Undo/redo within the annotation session

### Task 2.2: Text Label Tool
**File:** `frontend/src/features/annotations/TextLabel.tsx`

**Acceptance Criteria:**
- [ ] Add text labels anchored to specific frame locations
- [ ] Resizable and repositionable text boxes
- [ ] Font size and color configurable
- [ ] Examples: "Hand artifact here," "Face drift starting"

---

## Phase 3: Frame Pinning

### Task 3.1: Frame-Pinned Annotation Display
**File:** `frontend/src/features/annotations/useFramePinnedAnnotations.ts`

```typescript
export function useFramePinnedAnnotations(segmentId: number, currentFrame: number) {
  // Return annotations for the current frame
  // Show/hide annotations as user scrubs through video
}
```

**Acceptance Criteria:**
- [ ] Annotations pinned to specific frame number and timecode
- [ ] When scrubbing, annotations appear/disappear at their pinned frame
- [ ] Multiple annotations on different frames within the same segment
- [ ] Pin to correct frame 100% of the time

---

## Phase 4: Annotation Layers

### Task 4.1: Layer Manager
**File:** `frontend/src/features/annotations/AnnotationLayers.tsx`

**Acceptance Criteria:**
- [ ] Each reviewer's annotations appear as a separate layer
- [ ] Layers toggleable on/off individually
- [ ] Reviewer attribution (name/avatar) visible on their layer
- [ ] "Show All" / "Show Mine Only" quick toggles
- [ ] Layer list in sidebar panel

---

## Phase 5: Summary & Export

### Task 5.1: Annotation Summary List
**File:** `frontend/src/features/annotations/AnnotationSummary.tsx`

**Acceptance Criteria:**
- [ ] List view of all annotations on a segment, sortable by frame number
- [ ] Click entry to jump to that frame with markup visible
- [ ] Shows annotation count per reviewer
- [ ] Searchable and filterable

### Task 5.2: PNG Export
**File:** `frontend/src/features/annotations/exportAnnotation.ts`

```typescript
export async function exportAnnotatedFrame(
  videoFrame: ImageData,
  annotations: DrawingObject[],
  filename: string
): Promise<Blob> {
  // Composite video frame + visible annotation layers
  // Export as PNG
}
```

**Acceptance Criteria:**
- [ ] Export annotated frames as PNG images
- [ ] Export includes video frame + all visible annotation layers composited
- [ ] Full video frame resolution (not downscaled)
- [ ] Suitable for sharing via email, Slack, print

---

## Phase 6: PRD-038 Integration & Testing

### Task 6.1: Review Thread Integration
**File:** integration with PRD-038

**Acceptance Criteria:**
- [ ] Annotations appear in the review thread alongside text notes and voice memos
- [ ] When a reviewer flags a segment with a drawing, annotation appears in review notes
- [ ] Annotations are searchable and filterable as review content

### Task 6.2: Comprehensive Tests
**File:** `frontend/src/features/annotations/__tests__/`

**Acceptance Criteria:**
- [ ] Drawing latency <10ms for pen tool
- [ ] Annotations pin to correct frame 100% of the time
- [ ] Layer toggle shows/hides correct annotations
- [ ] PNG export renders at full frame resolution with clean compositing
- [ ] Frame-pinned display correctly shows/hides during scrubbing

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_frame_annotations.sql` | Annotations table |
| `src/models/annotation.rs` | Rust model struct |
| `src/repositories/annotation_repo.rs` | Annotation repository |
| `src/routes/annotation.rs` | Axum API endpoints |
| `frontend/src/features/annotations/DrawingCanvas.tsx` | Drawing engine |
| `frontend/src/features/annotations/TextLabel.tsx` | Text labels |
| `frontend/src/features/annotations/AnnotationLayers.tsx` | Layer manager |
| `frontend/src/features/annotations/AnnotationSummary.tsx` | Summary list |
| `frontend/src/features/annotations/exportAnnotation.ts` | PNG export |

## Dependencies
- PRD-038: Collaborative Review (note integration)
- PRD-083: Video playback engine (frame access)
- PRD-029: Design system

## Implementation Order
### MVP
1. Phase 1 (Database & API) — annotation storage and export
2. Phase 2 (Drawing) — canvas, tools, text labels
3. Phase 3 (Frame Pinning) — annotations tied to frames
4. Phase 4 (Layers) — per-reviewer layers with toggle
5. Phase 5 (Summary & Export) — list view and PNG export
6. Phase 6 (Integration) — PRD-038 review thread

### Post-MVP Enhancements
- Video range annotations: annotations spanning multiple frames with timeline range indicator

## Notes
- Drawing responsiveness is critical — <10ms latency or the tool feels broken.
- Annotations are stored as serialized JSON (array of drawing objects), not as images.
- The drawing toolbar should be compact and not obstruct the video.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
