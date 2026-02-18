# Task List: Storyboard View & Scene Thumbnails

**PRD Reference:** `design/prds/062-prd-storyboard-view-scene-thumbnails.md`
**Scope:** Keyframe-based scene overviews with thumbnail strips, hover scrub, matrix thumbnails, and comparison strips for rapid visual scanning of generated content.

## Overview

Reviewing 160 scenes by watching each in real-time takes hours. Storyboard strips give 80% of the visual information in seconds of scanning. This feature extracts keyframes at configurable intervals from generated segments, displays them as filmstrip thumbnails per scene, enables hover-scrub for quick preview, integrates thumbnails into the batch matrix view, and supports comparison strips.

### What Already Exists
- PRD-024: Generation loop (segments to extract from)
- PRD-036: Sync-play, PRD-057: Batch orchestrator

### What We're Building
1. `keyframes` table for extracted thumbnails
2. FFmpeg keyframe extraction service
3. Scene thumbnail strip component
4. Hover scrub interaction
5. Matrix thumbnail integration

### Key Design Decisions
1. **Lightweight thumbnails** — Stored as small JPEGs (200px height) for fast loading. Full-resolution frames available on demand.
2. **Post-generation extraction** — Keyframes extracted as an automatic post-processing step after each segment completes.
3. **Configurable interval** — Default every 2 seconds. Adjustable per scene type.

---

## Phase 1: Database Schema

### Task 1.1: Keyframes Table
**File:** `migrations/YYYYMMDD_create_keyframes.sql`

```sql
CREATE TABLE keyframes (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    frame_number INTEGER NOT NULL,
    timestamp_secs DOUBLE PRECISION NOT NULL,
    thumbnail_path TEXT NOT NULL,
    full_res_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_keyframes_segment_id ON keyframes(segment_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON keyframes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Keyframe Extraction

### Task 2.1: Extraction Service
**File:** `src/services/keyframe_extraction_service.rs`

```rust
pub async fn extract_keyframes(segment_id: DbId, video_path: &str, interval_secs: f64, output_dir: &str) -> Result<Vec<DbId>, anyhow::Error> {
    // ffmpeg -i input.mp4 -vf "fps=1/{interval},scale=-1:200" output_%04d.jpg
    // Store each keyframe in database
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Extracts keyframes at configurable interval (default: every 2 seconds)
- [ ] Stored as lightweight thumbnails (200px height)
- [ ] Extraction runs post-generation per segment
- [ ] Completes within 5 seconds per segment

---

## Phase 3: API & Frontend

### Task 3.1: Storyboard API
**File:** `src/routes/storyboard_routes.rs`

```rust
/// GET /api/scenes/:id/storyboard — Keyframe strip for a scene
/// GET /api/segments/:id/keyframes — Keyframes for a segment
```

### Task 3.2: Thumbnail Strip Component
**File:** `frontend/src/components/storyboard/ThumbnailStrip.tsx`

**Acceptance Criteria:**
- [ ] Filmstrip showing seed, keyframes at intervals, final frame
- [ ] Lightweight loading (<1 second for 10+ segments)

### Task 3.3: Hover Scrub
**File:** `frontend/src/components/storyboard/HoverScrub.tsx`

**Acceptance Criteria:**
- [ ] Mouse hover over scene card scrubs through keyframes
- [ ] Smooth transitions, <100ms latency
- [ ] Works in list and grid views

### Task 3.4: Matrix Thumbnails
**File:** `frontend/src/components/storyboard/MatrixThumbnail.tsx`

**Acceptance Criteria:**
- [ ] PRD-057 matrix cells show poster frame thumbnails
- [ ] Toggle between thumbnail mode and status-only mode

---

## Phase 4: Testing

### Task 4.1: Keyframe Tests
**File:** `tests/keyframe_test.rs`

**Acceptance Criteria:**
- [ ] Extraction produces correct number of keyframes
- [ ] Thumbnails load quickly
- [ ] Missing segments handled gracefully

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_keyframes.sql` | Keyframes table |
| `src/services/keyframe_extraction_service.rs` | FFmpeg extraction |
| `src/routes/storyboard_routes.rs` | Storyboard API |
| `frontend/src/components/storyboard/ThumbnailStrip.tsx` | Filmstrip |
| `frontend/src/components/storyboard/HoverScrub.tsx` | Hover scrub |
| `frontend/src/components/storyboard/MatrixThumbnail.tsx` | Matrix integration |

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 3 — Tasks 3.3-3.4
2. Print-ready storyboard export (PDF)

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-062 v1.0
