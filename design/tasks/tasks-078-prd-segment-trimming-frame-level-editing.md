# Task List: Segment Trimming & Frame-Level Editing

**PRD Reference:** `design/prds/078-prd-segment-trimming-frame-level-editing.md`
**Scope:** Build non-destructive in/out point trimming for generated segments with quick trim presets, batch trim, seed frame update for pipeline continuity, and concatenation-aware integration with the scene assembler.

## Overview

Regenerating a 5-second segment because the last 0.3 seconds has an artifact wastes GPU time. Trimming costs zero GPU and takes 5 seconds. This PRD provides lightweight frame-accurate trimming: set in/out points on a timeline, preview the trimmed result, and commit. Originals are always preserved (non-destructive). Quick presets ("trim first 5 frames") handle common cases. Batch trim applies the same cut to multiple segments. Trimmed versions integrate seamlessly with PRD-039's concatenation pipeline, and the seed frame for the next segment is automatically updated.

### What Already Exists
- PRD-024 Recursive Video Generation (segment structure)
- PRD-035 Review Interface (trim point UI context)
- PRD-083 Video playback engine (frame-accurate seeking)
- PRD-039 Scene Assembler (uses trimmed versions)
- PRD-000 database infrastructure

### What We're Building
1. In/out point trimming interface on segment timeline
2. Non-destructive trim with original preservation
3. Seed frame update service for pipeline continuity
4. Quick trim presets (first/last N frames)
5. Batch trim processor
6. Server-side FFmpeg trim engine (lossless)
7. Database table and API for trim metadata

### Key Design Decisions
1. **Non-destructive** — Trimming creates a new version; the original segment file is never modified.
2. **Trim metadata stored separately** — In/out points stored in the database, not embedded in the video file.
3. **Lossless trim via FFmpeg** — FFmpeg stream copy (no re-encoding) for zero-quality-loss trims.
4. **Seed frame cascade** — When an end is trimmed, the new last frame becomes the seed for the next segment. System warns if this invalidates downstream segments.

---

## Phase 1: Database & API

### Task 1.1: Create Segment Trims Table
**File:** `migrations/YYYYMMDD_create_segment_trims.sql`

```sql
CREATE TABLE segment_trims (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    original_path TEXT NOT NULL,
    trimmed_path TEXT,
    in_frame INTEGER NOT NULL DEFAULT 0,
    out_frame INTEGER NOT NULL,
    total_original_frames INTEGER NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segment_trims_segment_id ON segment_trims(segment_id);
CREATE INDEX idx_segment_trims_created_by ON segment_trims(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_trims
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `segment_trims` stores in/out frame points and paths for original and trimmed versions
- [ ] FK indexes and `updated_at` trigger applied
- [ ] Supports multiple trims per segment (latest is active)

### Task 1.2: Trim Model & Repository
**File:** `src/models/segment_trim.rs`, `src/repositories/segment_trim_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SegmentTrim {
    pub id: DbId,
    pub segment_id: DbId,
    pub original_path: String,
    pub trimmed_path: Option<String>,
    pub in_frame: i32,
    pub out_frame: i32,
    pub total_original_frames: i32,
    pub created_by: DbId,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model and repository with CRUD operations
- [ ] `get_active_trim(segment_id)` returns the latest trim for a segment
- [ ] `revert_trim(segment_id)` deletes the trim, restoring the original
- [ ] Unit tests

### Task 1.3: Trim API Endpoints
**File:** `src/routes/segment_trim.rs`

```rust
pub fn segment_trim_routes() -> Router<AppState> {
    Router::new()
        .route("/segments/:id/trim", post(create_trim).delete(revert_trim))
        .route("/segments/:id/trim-preview", get(trim_preview))
        .route("/segments/batch-trim", post(batch_trim))
}
```

**Acceptance Criteria:**
- [ ] `POST /segments/:id/trim` creates a trim (in_frame, out_frame)
- [ ] `DELETE /segments/:id/trim` reverts to original
- [ ] `GET /segments/:id/trim-preview` returns preview of trimmed segment
- [ ] `POST /segments/batch-trim` applies uniform trim to multiple segments

---

## Phase 2: Trim Engine

### Task 2.1: FFmpeg Trim Service
**File:** `src/services/trim_engine.rs`

```rust
pub struct TrimEngine {
    // FFmpeg-based lossless trim operations
}

impl TrimEngine {
    pub async fn trim_segment(
        &self,
        source_path: &str,
        in_frame: i32,
        out_frame: i32,
        framerate: f64,
    ) -> Result<String> {
        // Use FFmpeg stream copy for lossless trim
        // Returns path to trimmed file
    }
}
```

**Acceptance Criteria:**
- [ ] Lossless trim via FFmpeg stream copy (no re-encoding)
- [ ] Trim completes in <2 seconds per segment
- [ ] No quality degradation from trim operation
- [ ] Output file is a valid, playable video

---

## Phase 3: Trim UI

### Task 3.1: Timeline Trim Component
**File:** `frontend/src/features/trimming/TrimTimeline.tsx`

```typescript
interface TrimTimelineProps {
  segmentId: number;
  totalFrames: number;
  framerate: number;
  onTrimChange: (inFrame: number, outFrame: number) => void;
}
```

**Acceptance Criteria:**
- [ ] Set in-point and out-point by dragging handles on the timeline
- [ ] Frame-accurate scrubbing with timecode display
- [ ] Preview the trimmed result before committing
- [ ] Trim points adjustable after initial setting
- [ ] Drag handles intuitive (similar to video editing tools)

### Task 3.2: Trim Preview
**File:** `frontend/src/features/trimming/TrimPreview.tsx`

**Acceptance Criteria:**
- [ ] Preview the exact trimmed output before committing
- [ ] Trim handles visually indicate the trimmed region (grayed out sections)
- [ ] Play trimmed region only for verification

---

## Phase 4: Quick Trim Presets

### Task 4.1: Preset Actions
**File:** `frontend/src/features/trimming/QuickTrimPresets.tsx`

**Acceptance Criteria:**
- [ ] "Trim first 5 frames" one-click action
- [ ] "Trim last 5 frames" one-click action
- [ ] Configurable preset values (3, 5, 10 frames)
- [ ] Presets shown as quick-action buttons in the trim UI

---

## Phase 5: Seed Frame Update

### Task 5.1: Seed Frame Cascade Service
**File:** `src/services/seed_frame_updater.rs`

```rust
pub struct SeedFrameUpdater {
    // When a trim changes the last frame, update the seed for the next segment
}

impl SeedFrameUpdater {
    pub async fn update_seed_after_trim(&self, segment_id: DbId) -> Result<SeedUpdateResult> {
        // Check if there's a next segment using this segment's last frame as seed
        // If so, warn user and optionally re-queue
    }
}
```

**Acceptance Criteria:**
- [ ] When end is trimmed, last frame of trimmed version becomes new seed for next segment
- [ ] System warns if this would invalidate an already-generated next segment
- [ ] Option to re-queue affected downstream segments automatically
- [ ] Clear warning before committing a trim that affects downstream segments

---

## Phase 6: Batch Trim

### Task 6.1: Batch Trim Processor
**File:** `src/services/batch_trim.rs`, `frontend/src/features/trimming/BatchTrim.tsx`

**Acceptance Criteria:**
- [ ] Select multiple segments and apply uniform trim (e.g., remove first 3 frames from all)
- [ ] Useful when a workflow consistently produces a bad first frame
- [ ] Preview showing affected segments before applying
- [ ] Batch trim of 20 segments completes in <30 seconds
- [ ] Progress indicator during batch processing

---

## Phase 7: Concatenation Integration & Testing

### Task 7.1: Scene Assembler Integration
**File:** integration with PRD-039

**Acceptance Criteria:**
- [ ] PRD-039 Scene Assembler uses trimmed versions when available
- [ ] Trim points respected during concatenation without re-export
- [ ] Concatenation preview reflects trim points

### Task 7.2: Comprehensive Tests
**File:** `tests/trim_test.rs`, `frontend/src/features/trimming/__tests__/`

**Acceptance Criteria:**
- [ ] Trim operation completes in <2 seconds per segment
- [ ] Lossless: no re-encoding artifacts from trim
- [ ] Revert correctly restores original segment
- [ ] Batch trim of 20 segments completes in <30 seconds
- [ ] Seed frame update correctly warns about downstream impact
- [ ] Trimmed versions integrate correctly with concatenation pipeline

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_segment_trims.sql` | Trim metadata table |
| `src/models/segment_trim.rs` | Rust model struct |
| `src/repositories/segment_trim_repo.rs` | Trim repository |
| `src/routes/segment_trim.rs` | Axum API endpoints |
| `src/services/trim_engine.rs` | FFmpeg trim service |
| `src/services/seed_frame_updater.rs` | Seed frame cascade |
| `src/services/batch_trim.rs` | Batch trim processor |
| `frontend/src/features/trimming/TrimTimeline.tsx` | Timeline trim UI |
| `frontend/src/features/trimming/QuickTrimPresets.tsx` | Quick presets |
| `frontend/src/features/trimming/BatchTrim.tsx` | Batch trim UI |

## Dependencies
- PRD-024: Recursive Video Generation (segment structure)
- PRD-035: Review Interface (trim UI context)
- PRD-083: Video playback engine (frame-accurate seeking)
- PRD-039: Scene Assembler (concatenation integration)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — trim table and endpoints
2. Phase 2 (Engine) — FFmpeg lossless trim service
3. Phase 3 (UI) — timeline trim handles and preview
4. Phase 4 (Presets) — quick trim actions
5. Phase 5 (Seed Frame) — cascade update for pipeline continuity
6. Phase 6 (Batch) — multi-segment trim
7. Phase 7 (Integration) — scene assembler integration

### Post-MVP Enhancements
- Split segment: split at a specific frame into two independent segments

## Notes
- Non-destructive is mandatory — originals must always be recoverable.
- FFmpeg stream copy is critical — re-encoding would introduce artifacts and waste time.
- Minimum segment length after trimming should be enforced (prevent trimming to 0 frames).

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
