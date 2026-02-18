# Task List: Recursive Video Generation Loop

**PRD Reference:** `design/prds/024-prd-recursive-video-generation-loop.md`
**Scope:** Core generation engine that chains segment-by-segment video generation using last-frame extraction to produce temporally coherent long-form video, with boundary frame selection, elastic duration, clothes-off transitions, parallel scene generation, and progress tracking.

## Overview

This is the heart of the platform's generation pipeline. Segment 001 uses the character's approved variant as seed; each subsequent segment uses the last frame of the previous segment. The loop continues until the target duration is met. This feature implements the seed-to-segment pipeline, intelligent boundary frame selection (automatic motion analysis or manual scrubber), duration accumulation with elastic stopping, clothes-off transitions that switch seed images at configured boundaries, parallel generation across workers, and real-time progress tracking.

### What Already Exists
- PRD-005: ComfyUI WebSocket bridge for dispatching generation jobs
- PRD-007: Parallel task execution engine for background work
- PRD-021: Source images and approved variants (scene seeds)
- PRD-023: Scene type configuration (duration, workflow, transition config)
- PRD-028: Pipeline checkpointing (save state after each segment)

### What We're Building
1. Generation loop orchestrator (seed -> segment -> extract frame -> repeat)
2. Frame extraction service (FFmpeg last-frame and boundary selection)
3. Duration accumulation tracker with elastic stopping
4. Clothes-off transition handler (variant switching at segment boundary)
5. Parallel scene dispatcher across workers
6. Real-time progress tracking via event bus

### Key Design Decisions
1. **One segment at a time per scene** — Segments chain sequentially within a scene (each depends on the previous). Parallelism is across scenes, not within.
2. **FFmpeg for frame extraction** — Reliable, fast, and already available. No additional dependencies.
3. **Elastic duration tolerance** — Final segment can extend or trim by configurable tolerance to find a stable stopping frame.
4. **Checkpoint after every segment** — PRD-028 ensures that a failure at segment 8 preserves segments 1-7.

---

## Phase 1: Database Schema

### Task 1.1: Generation State Columns on Segments
**File:** `migrations/YYYYMMDD_add_segment_generation_state.sql`

```sql
ALTER TABLE segments
    ADD COLUMN seed_frame_path TEXT,
    ADD COLUMN last_frame_path TEXT,
    ADD COLUMN output_video_path TEXT,
    ADD COLUMN duration_secs DOUBLE PRECISION,
    ADD COLUMN cumulative_duration_secs DOUBLE PRECISION,
    ADD COLUMN boundary_frame_index INTEGER,
    ADD COLUMN boundary_selection_mode TEXT DEFAULT 'auto',  -- 'auto', 'manual', 'last'
    ADD COLUMN generation_started_at TIMESTAMPTZ,
    ADD COLUMN generation_completed_at TIMESTAMPTZ,
    ADD COLUMN worker_id BIGINT REFERENCES workers(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_segments_worker_id ON segments(worker_id);
```

**Acceptance Criteria:**
- [ ] Seed frame path tracks the input image for each segment
- [ ] Last frame path stores the extracted frame for the next segment
- [ ] Duration and cumulative duration tracked per segment
- [ ] Boundary selection mode recorded
- [ ] Worker assignment tracked

### Task 1.2: Scene Generation State
**File:** `migrations/YYYYMMDD_add_scene_generation_state.sql`

```sql
ALTER TABLE scenes
    ADD COLUMN total_segments_estimated INTEGER,
    ADD COLUMN total_segments_completed INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN actual_duration_secs DOUBLE PRECISION,
    ADD COLUMN transition_segment_index INTEGER,  -- Segment where clothes_off happens
    ADD COLUMN generation_started_at TIMESTAMPTZ,
    ADD COLUMN generation_completed_at TIMESTAMPTZ;
```

**Acceptance Criteria:**
- [ ] Estimated and completed segment counts tracked
- [ ] Actual duration recorded upon completion
- [ ] Transition segment index for clothes_off scenes

---

## Phase 2: Frame Extraction Service

### Task 2.1: FFmpeg Frame Extractor
**File:** `src/services/frame_extraction_service.rs`

```rust
use std::process::Command;

pub struct ExtractedFrame {
    pub path: String,
    pub frame_index: u32,
    pub timestamp_secs: f64,
}

pub async fn extract_last_frame(
    video_path: &str,
    output_dir: &str,
) -> Result<ExtractedFrame, anyhow::Error> {
    // Use FFmpeg to extract the last frame of a video segment
    // ffmpeg -sseof -1 -i input.mp4 -frames:v 1 -q:v 2 output.jpg
    let output_path = format!("{}/last_frame.png", output_dir);
    let status = Command::new("ffmpeg")
        .args(&["-sseof", "-0.1", "-i", video_path, "-frames:v", "1", "-q:v", "2", &output_path])
        .status()?;
    // ...
    todo!()
}

pub async fn extract_boundary_frames(
    video_path: &str,
    output_dir: &str,
    last_n_frames: u32,
) -> Result<Vec<ExtractedFrame>, anyhow::Error> {
    // Extract the final N frames for boundary selection
    todo!()
}

pub async fn select_low_motion_frame(
    frames: &[ExtractedFrame],
) -> Result<ExtractedFrame, anyhow::Error> {
    // Analyze motion between consecutive frames
    // Select the frame with lowest inter-frame difference
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Extracts last frame from video segment in <2 seconds
- [ ] Extracts final N frames for boundary selection
- [ ] Motion analysis selects lowest-motion frame
- [ ] Output stored as PNG for lossless quality

### Task 2.2: Boundary Frame Selection Service
**File:** `src/services/boundary_frame_service.rs`

```rust
pub enum BoundaryMode {
    Auto,   // Pick lowest-motion frame in final N frames
    Manual, // User selects via scrubber
    Last,   // Literal last frame (default)
}

pub async fn select_boundary_frame(
    pool: &sqlx::PgPool,
    segment_id: DbId,
    mode: BoundaryMode,
    manual_frame_index: Option<u32>,
) -> Result<String, anyhow::Error> {
    // 1. Based on mode, select the appropriate frame
    // 2. Update segment's last_frame_path and boundary_frame_index
    // 3. Return the selected frame path
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Auto mode: picks lowest-motion frame from final second
- [ ] Manual mode: uses user-specified frame index
- [ ] Last mode: literal last frame (fastest, default)
- [ ] Selected frame stored as seed for next segment

---

## Phase 3: Generation Loop Orchestrator

### Task 3.1: Generation Loop Service
**File:** `src/services/generation_loop_service.rs`

```rust
pub async fn start_scene_generation(
    pool: &sqlx::PgPool,
    scene_id: DbId,
) -> Result<(), anyhow::Error> {
    // 1. Load scene configuration (scene type, character, variant)
    // 2. Calculate estimated segments: ceil(target_duration / segment_duration)
    // 3. Update scene: total_segments_estimated, generation_started_at
    // 4. Start segment 001 with approved variant as seed
    // 5. Loop: generate segment -> extract frame -> next segment
    // 6. After each segment: checkpoint (PRD-028), publish progress (PRD-10)
    // 7. Check duration accumulation, apply elastic stopping
    todo!()
}

async fn generate_segment(
    pool: &sqlx::PgPool,
    scene_id: DbId,
    segment_index: u32,
    seed_frame_path: &str,
    scene_config: &SceneConfig,
) -> Result<GeneratedSegment, anyhow::Error> {
    // 1. Create segment record (status: generating)
    // 2. Resolve prompt template for the character
    // 3. Dispatch to ComfyUI via PRD-05 bridge
    // 4. Wait for completion
    // 5. Extract last frame
    // 6. Update segment record
    // 7. Checkpoint via PRD-028
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Segment 001 uses approved variant from PRD-021 as seed
- [ ] Each subsequent segment uses extracted last frame of previous
- [ ] Seed frame extraction is automatic after each segment completes
- [ ] Extracted frames stored as reference images
- [ ] Checkpoint created after each successful segment

### Task 3.2: Duration Accumulation & Elastic Stopping
**File:** `src/services/generation_loop_service.rs`

```rust
fn should_stop_generation(
    cumulative_duration: f64,
    target_duration: f64,
    tolerance: f64,
    current_segment_duration: f64,
) -> StopDecision {
    if cumulative_duration >= target_duration {
        StopDecision::Stop
    } else if cumulative_duration + current_segment_duration > target_duration + tolerance {
        StopDecision::ElasticStop  // Stop and trim to stable frame
    } else {
        StopDecision::Continue
    }
}
```

**Acceptance Criteria:**
- [ ] Generation stops when cumulative duration meets target
- [ ] Elastic duration: final segment seeks stable stopping point within tolerance
- [ ] Final segment prefers ending on low-motion frame
- [ ] Actual final duration recorded per scene

### Task 3.3: Clothes-Off Transition Handler
**File:** `src/services/transition_service.rs`

```rust
pub async fn handle_transition(
    pool: &sqlx::PgPool,
    scene_id: DbId,
    segment_index: u32,
    scene_config: &SceneConfig,
) -> Result<TransitionResult, anyhow::Error> {
    // Check if current segment_index matches transition boundary
    // If yes: switch seed image to topless variant
    // Optionally use different workflow for transition segment
    // Record transition point in scene metadata
    todo!()
}
```

**Acceptance Criteria:**
- [ ] At configured segment boundary, switches to topless variant seed
- [ ] Optionally uses different workflow for transition segment
- [ ] Transition point recorded in scene metadata
- [ ] Smooth visual transition between variants

---

## Phase 4: Parallel Scene Dispatch

### Task 4.1: Parallel Scene Dispatcher
**File:** `src/services/parallel_scene_service.rs`

```rust
pub async fn dispatch_parallel_scenes(
    pool: &sqlx::PgPool,
    scene_ids: &[DbId],
) -> Result<Vec<DbId>, anyhow::Error> {
    // 1. Verify no cross-scene dependencies
    // 2. For each scene, create a generation job
    // 3. Submit jobs to PRD-08 queue
    // 4. Worker assignment via PRD-46 load balancing
    // 5. Return job IDs for tracking
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Scenes for different characters run concurrently
- [ ] Scenes for same character with different scene types run concurrently
- [ ] No cross-scene dependencies
- [ ] Worker assignment via PRD-46 load balancing

---

## Phase 5: Progress Tracking

### Task 5.1: Progress Tracker
**File:** `src/services/generation_progress_service.rs`

```rust
pub struct GenerationProgress {
    pub scene_id: DbId,
    pub segments_completed: u32,
    pub segments_estimated: u32,
    pub cumulative_duration: f64,
    pub target_duration: f64,
    pub elapsed_secs: f64,
    pub estimated_remaining_secs: f64,
}

pub async fn get_progress(
    pool: &sqlx::PgPool,
    scene_id: DbId,
) -> Result<GenerationProgress, anyhow::Error> {
    // Calculate progress from segment records
    // Estimate remaining based on average segment time
    todo!()
}

pub async fn publish_progress(
    event_bus: &EventBus,
    progress: &GenerationProgress,
) -> Result<(), anyhow::Error> {
    // Publish to PRD-10 event bus for real-time UI updates
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Progress: segments completed / estimated, cumulative / target duration
- [ ] Published via PRD-10 event bus after each segment
- [ ] Visible in PRD-54 job tray
- [ ] Elapsed time and estimated remaining time

---

## Phase 6: API Endpoints

### Task 6.1: Generation Control Endpoints
**File:** `src/routes/generation_routes.rs`

```rust
/// POST /api/scenes/:id/generate — Start generation for a scene
/// GET /api/scenes/:id/progress — Get generation progress
/// POST /api/segments/:id/select-boundary-frame — Manual boundary frame selection
/// POST /api/scenes/batch-generate — Start parallel generation for multiple scenes
```

**Acceptance Criteria:**
- [ ] Start generation validates scene has approved variant seed
- [ ] Progress returns real-time data
- [ ] Boundary frame selection for manual mode
- [ ] Batch generation dispatches parallel scenes

---

## Phase 7: Frontend Components

### Task 7.1: Generation Progress Bar
**File:** `frontend/src/components/generation/GenerationProgressBar.tsx`

```typescript
export function GenerationProgressBar({ progress }: { progress: GenerationProgress }) {
  // Visual segment strip that fills in as segments complete
  // Segments as colored blocks: grey (pending), blue (generating), green (done)
  // Duration progress: "18s / 30s target"
  // Estimated time remaining
}
```

**Acceptance Criteria:**
- [ ] Visual segment strip filling in as segments complete
- [ ] Color-coded blocks per segment status
- [ ] Duration counter showing cumulative vs. target
- [ ] Estimated remaining time display

### Task 7.2: Boundary Frame Scrubber
**File:** `frontend/src/components/generation/BoundaryFrameScrubber.tsx`

```typescript
export function BoundaryFrameScrubber({ segmentId, frames }: BoundaryFrameScrubberProps) {
  // Compact scrubber showing final second of segment
  // Thumbnails of candidate frames
  // Click to select boundary frame
}
```

**Acceptance Criteria:**
- [ ] Shows final N frames as thumbnails
- [ ] Click to select the seed frame for next segment
- [ ] Compact design (not a full video player)
- [ ] Selected frame highlighted

---

## Phase 8: Testing

### Task 8.1: Generation Loop Tests
**File:** `tests/generation_loop_test.rs`

**Acceptance Criteria:**
- [ ] Single-segment scene generates correctly
- [ ] Multi-segment chaining works (frame extracted, used as seed)
- [ ] Duration accumulation stops at target
- [ ] Elastic duration finds stable stopping frame

### Task 8.2: Transition Tests
**File:** `tests/transition_test.rs`

**Acceptance Criteria:**
- [ ] Clothes-off transition switches seed at correct segment
- [ ] Transition segment uses alternate workflow when configured
- [ ] No transition for non-clothes_off scenes

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_add_segment_generation_state.sql` | Segment generation state columns |
| `migrations/YYYYMMDD_add_scene_generation_state.sql` | Scene generation state columns |
| `src/services/frame_extraction_service.rs` | FFmpeg frame extraction |
| `src/services/boundary_frame_service.rs` | Boundary frame selection |
| `src/services/generation_loop_service.rs` | Core generation loop |
| `src/services/transition_service.rs` | Clothes-off transition handler |
| `src/services/parallel_scene_service.rs` | Parallel scene dispatcher |
| `src/services/generation_progress_service.rs` | Progress tracking |
| `src/routes/generation_routes.rs` | Generation API endpoints |
| `frontend/src/components/generation/GenerationProgressBar.tsx` | Progress bar |
| `frontend/src/components/generation/BoundaryFrameScrubber.tsx` | Frame scrubber |

## Dependencies

### Existing Components to Reuse
- PRD-005: ComfyUI bridge for segment generation dispatch
- PRD-007: Task execution engine for background generation
- PRD-008: Queue management for job scheduling
- PRD-010: Event bus for progress notifications
- PRD-021: Approved variants as seed images
- PRD-023: Scene type configuration (duration, workflow)
- PRD-028: Checkpointing after each segment
- PRD-046: Worker pool for parallel dispatch

### New Infrastructure Needed
- FFmpeg for frame extraction

## Implementation Order

### MVP
1. Phase 1: Database Schema — Tasks 1.1-1.2
2. Phase 2: Frame Extraction — Task 2.1
3. Phase 3: Generation Loop — Tasks 3.1-3.2
4. Phase 5: Progress Tracking — Task 5.1
5. Phase 6: API Endpoints — Task 6.1
6. Phase 7: Frontend — Task 7.1

**MVP Success Criteria:**
- Scene generates segment-by-segment with automatic last-frame chaining
- Duration accumulation stops at target
- Progress visible in real-time
- Generated segments stored with full metadata

### Post-MVP Enhancements
1. Phase 2: Task 2.2 (Boundary frame selection modes)
2. Phase 3: Task 3.3 (Clothes-off transitions)
3. Phase 4: Parallel Scene Dispatch — Task 4.1
4. Phase 7: Task 7.2 (Boundary frame scrubber)
5. Phase 8: Testing
6. Adaptive segment duration based on content complexity

## Notes

1. **FFmpeg dependency:** Frame extraction uses FFmpeg via `std::process::Command`. FFmpeg must be installed on all worker machines.
2. **Segment ordering:** Segments within a scene are strictly sequential. Parallelism is only across independent scenes.
3. **Checkpoint integration:** After each segment completes, PRD-028 saves the state. If the process crashes, it resumes from the last checkpoint rather than restarting from segment 001.
4. **Error handling:** If a segment generation fails, the loop stops and the scene is marked with partial progress. The user can retry from the failed segment (PRD-028 resume).

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-024 v1.0
