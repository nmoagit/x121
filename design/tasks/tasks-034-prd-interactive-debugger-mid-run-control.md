# Task List: Interactive Debugger (Mid-Run Control)

**PRD Reference:** `design/prds/034-prd-interactive-debugger-mid-run-control.md`
**Scope:** Implement pause/resume capabilities for running generation jobs, parameter tweaking mid-run, intermediate latent preview, and early abort with partial result preservation.

## Overview

Waiting for a generation job to fail completely before correcting wastes GPU time. This PRD provides mid-run control: pause running jobs to inspect intermediate results, tweak parameters on paused jobs (changes apply from the next step), view decoded intermediate latents for early quality assessment, and abort with partial results preserved. This reduces GPU waste from jobs that would otherwise fail and enables "surgical" fixes during generation.

### What Already Exists
- PRD-005 ComfyUI WebSocket Bridge (real-time communication)
- PRD-033 Node-Based Workflow Canvas (visualization context for previews)
- PRD-028 Error Recovery & Checkpointing (state preservation)
- PRD-000 database infrastructure

### What We're Building
1. Job pause/resume state machine
2. Parameter hot-swap engine for mid-run edits
3. Intermediate latent decoder and preview component
4. Early abort with partial result preservation
5. Database table for debug state
6. Backend API for pause/resume/param-edit/preview

### Key Design Decisions
1. **ComfyUI interrupt API** — Pause/resume uses ComfyUI's interrupt mechanism via PRD-005 WebSocket bridge.
2. **Parameters apply from next step** — Mid-run parameter changes don't retroactively affect already-completed steps.
3. **Partial results preserved** — Aborted jobs keep their intermediate outputs for inspection, not deleted.
4. **GPU release on pause** — Paused jobs release GPU resources for other work.

---

## Phase 1: Database & API

### Task 1.1: Create Job Debug State Table
**File:** `migrations/YYYYMMDD_create_job_debug_state.sql`

```sql
CREATE TABLE job_debug_state (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL,
    paused_at_step INTEGER,
    modified_params_json JSONB NOT NULL DEFAULT '{}',
    intermediate_previews_json JSONB NOT NULL DEFAULT '[]',
    abort_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_job_debug_state_job_id ON job_debug_state(job_id);
CREATE INDEX idx_job_debug_state_job_id ON job_debug_state(job_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON job_debug_state
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `job_debug_state` tracks pause point, modified parameters, and intermediate previews
- [ ] One row per job (unique constraint on job_id)
- [ ] `updated_at` trigger applied

### Task 1.2: Debug State Model & Repository
**File:** `src/models/job_debug.rs`, `src/repositories/job_debug_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct JobDebugState {
    pub id: DbId,
    pub job_id: DbId,
    pub paused_at_step: Option<i32>,
    pub modified_params_json: serde_json::Value,
    pub intermediate_previews_json: serde_json::Value,
    pub abort_reason: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model and repository with get/upsert operations
- [ ] Unit tests for repository

### Task 1.3: Debugger API Endpoints
**File:** `src/routes/job_debug.rs`

```rust
pub fn job_debug_routes() -> Router<AppState> {
    Router::new()
        .route("/jobs/:id/pause", post(pause_job))
        .route("/jobs/:id/resume", post(resume_job))
        .route("/jobs/:id/params", put(update_params_mid_run))
        .route("/jobs/:id/preview", get(get_preview))
        .route("/jobs/:id/abort", post(abort_job))
}
```

**Acceptance Criteria:**
- [ ] `POST /jobs/:id/pause` pauses a running job via ComfyUI interrupt
- [ ] `POST /jobs/:id/resume` resumes from the paused step
- [ ] `PUT /jobs/:id/params` updates generation parameters on a paused job
- [ ] `GET /jobs/:id/preview` returns intermediate latent previews
- [ ] `POST /jobs/:id/abort` cancels with optional abort reason

---

## Phase 2: Pause/Resume State Machine

### Task 2.1: Job Control Service
**File:** `src/services/job_control.rs`

```rust
pub enum JobControlAction {
    Pause,
    Resume,
    Abort { reason: Option<String> },
}

pub struct JobControlService {
    comfyui_bridge: ComfyUIBridge,  // PRD-005
    job_debug_repo: JobDebugRepo,
}

impl JobControlService {
    pub async fn pause_job(&self, job_id: DbId) -> Result<()> {
        // Send interrupt to ComfyUI via WebSocket
        // Save current step to debug state
        // Mark GPU resources as released
    }

    pub async fn resume_job(&self, job_id: DbId) -> Result<()> {
        // Apply any modified parameters
        // Send resume command to ComfyUI
        // Continue from paused step
    }
}
```

**Acceptance Criteria:**
- [ ] Pause sends interrupt to ComfyUI via PRD-005 bridge
- [ ] Paused jobs retain state (intermediate results, current step)
- [ ] Resume continues from paused point, not from beginning
- [ ] Paused jobs release GPU resources for other work
- [ ] Pause completes within 2 seconds of request

### Task 2.2: Pause/Resume UI Controls
**File:** `frontend/src/features/debugger/JobControls.tsx`

**Acceptance Criteria:**
- [ ] Pause button on active jobs in the workflow canvas and job tray
- [ ] Resume button appears on paused jobs
- [ ] Visual state indicator: running (green), paused (yellow), aborted (red)
- [ ] Controls immediately accessible (not buried in menus)

---

## Phase 3: Parameter Tweaking

### Task 3.1: Mid-Run Parameter Editor
**File:** `frontend/src/features/debugger/MidRunParamEditor.tsx`

```typescript
interface MidRunParamEditorProps {
  jobId: number;
  currentParams: Record<string, unknown>;
  onSave: (modified: Record<string, unknown>) => void;
}
```

**Acceptance Criteria:**
- [ ] Edit parameters while job is paused (denoise strength, LoRA weight, prompt modifiers)
- [ ] Clear indication of which parameters were modified mid-run (highlighted/badged)
- [ ] Undo mid-run parameter changes before resuming
- [ ] Modified parameters apply from the next step onwards

### Task 3.2: Parameter Hot-Swap Service
**File:** `src/services/param_hot_swap.rs`

**Acceptance Criteria:**
- [ ] Accept parameter updates for paused jobs
- [ ] Validate parameter changes are safe for mid-run application
- [ ] Store modified parameters in debug state for audit trail
- [ ] Apply changes to ComfyUI workflow on resume

---

## Phase 4: Intermediate Latent Preview

### Task 4.1: Latent Decoder Service
**File:** `src/services/latent_decoder.rs`

```rust
pub struct LatentDecoder {
    // Decodes intermediate latent tensors into preview images
}

impl LatentDecoder {
    pub async fn decode_preview(&self, job_id: DbId) -> Result<Vec<u8>> {
        // Get intermediate latent from ComfyUI
        // Decode to preview image (JPEG/WebP)
    }
}
```

**Acceptance Criteria:**
- [ ] Display decoded intermediate latents as preview images/frames
- [ ] Update preview periodically during generation (configurable interval)
- [ ] Preview appears in the workflow canvas next to the active generation node
- [ ] Side-by-side with source/seed image for comparison
- [ ] Preview update within 5 seconds of generation progress

### Task 4.2: Preview Display Component
**File:** `frontend/src/features/debugger/LatentPreview.tsx`

**Acceptance Criteria:**
- [ ] Shows intermediate output as an image thumbnail
- [ ] Updates in real-time during generation
- [ ] Positioned near the active node in the workflow canvas
- [ ] Expandable to full-size view on click
- [ ] Labeled as "Intermediate Preview" to avoid confusion with final output

---

## Phase 5: Early Abort

### Task 5.1: Abort with Preservation
**File:** `frontend/src/features/debugger/AbortDialog.tsx`

**Acceptance Criteria:**
- [ ] "Abort" action available at any point during generation
- [ ] Aborted job's partial results preserved (not deleted) for inspection
- [ ] Abort reason input (optional, feeds PRD-064 failure tracking)
- [ ] Confirmation dialog before abort

---

## Phase 6: Integration & Testing

### Task 6.1: Workflow Canvas Integration
**File:** integration with PRD-033 canvas

**Acceptance Criteria:**
- [ ] Pause/resume controls visible on nodes in the workflow canvas
- [ ] Intermediate previews rendered alongside active nodes
- [ ] Timing telemetry pauses when job is paused

### Task 6.2: Comprehensive Tests
**File:** `tests/job_debug_test.rs`, `frontend/src/features/debugger/__tests__/`

**Acceptance Criteria:**
- [ ] Pause correctly suspends job and releases GPU
- [ ] Resume continues from exact paused step (no lost progress)
- [ ] Parameter hot-swap applies changes from next step onwards
- [ ] Intermediate previews update within 5 seconds
- [ ] Abort preserves partial results
- [ ] State machine handles concurrent pause/resume/abort requests correctly

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_job_debug_state.sql` | Debug state table |
| `src/models/job_debug.rs` | Rust model struct |
| `src/repositories/job_debug_repo.rs` | Debug state repository |
| `src/routes/job_debug.rs` | Debugger API endpoints |
| `src/services/job_control.rs` | Pause/resume/abort service |
| `src/services/param_hot_swap.rs` | Parameter hot-swap |
| `src/services/latent_decoder.rs` | Intermediate latent decoder |
| `frontend/src/features/debugger/JobControls.tsx` | Pause/resume UI |
| `frontend/src/features/debugger/MidRunParamEditor.tsx` | Parameter editor |
| `frontend/src/features/debugger/LatentPreview.tsx` | Intermediate preview |

## Dependencies
- PRD-005: ComfyUI WebSocket Bridge (interrupt/resume API)
- PRD-033: Node-Based Workflow Canvas (preview placement)
- PRD-028: Error Recovery & Checkpointing (state preservation)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — debug state table and endpoints
2. Phase 2 (Pause/Resume) — state machine and UI controls
3. Phase 3 (Parameter Tweaking) — mid-run editor and hot-swap
4. Phase 4 (Latent Preview) — decoder and display
5. Phase 5 (Abort) — abort with preservation

### Post-MVP Enhancements
- Breakpoint system: set breakpoints on workflow nodes, auto-pause when reached

## Notes
- GPU resource management on pause is critical for multi-job studios.
- Not all parameters are safe to modify mid-run — validation is needed.
- Intermediate previews should be clearly labeled to avoid confusion with final output.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
