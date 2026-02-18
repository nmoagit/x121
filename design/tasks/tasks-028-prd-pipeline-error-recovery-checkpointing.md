# Task List: Pipeline Error Recovery & Checkpointing

**PRD Reference:** `design/prds/028-prd-pipeline-error-recovery-checkpointing.md`
**Scope:** Automatic checkpointing after each pipeline stage, partial failure handling that preserves completed work, structured failure diagnostics, and retry-with-modifications from the last checkpoint.

## Overview

Long generation pipelines (10+ segments) failing at segment 8 should not require restarting from scratch. This feature provides automatic checkpointing after each successful segment, preserves all completed work when a later stage fails, collects structured failure diagnostics (which node failed, GPU state, ComfyUI errors), and enables resume from the last checkpoint with optional parameter modifications. Checkpoints persist to disk to survive process restarts.

### What Already Exists
- PRD-007: Task execution engine (job infrastructure)
- PRD-010: Event bus for notifications

### What We're Building
1. `checkpoints` table tracking checkpoint metadata
2. Checkpoint writer that saves state after each segment
3. Failure diagnostic collector with structured error context
4. Resume orchestrator that resumes from last checkpoint
5. Checkpoint cleanup after successful completion
6. Pipeline stage visualization UI

### Key Design Decisions
1. **Filesystem-based checkpoint data** — Checkpoint metadata in PostgreSQL, actual data (intermediate frames, latents) on local disk. Keeps the database lean.
2. **No silent retries** — Aligned with PRD-07 policy. Failures are reported; resume is user-initiated.
3. **Resume with modifications** — Users can change parameters (lower resolution, different seed) before resuming.
4. **Checkpoint overhead budget: <2 seconds** — Checkpoint creation must not significantly slow the pipeline.

---

## Phase 1: Database Schema

### Task 1.1: Checkpoints Table
**File:** `migrations/YYYYMMDD_create_checkpoints.sql`

```sql
CREATE TABLE checkpoints (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    stage_index INTEGER NOT NULL,
    stage_name TEXT NOT NULL,
    data_path TEXT NOT NULL,  -- Filesystem path to checkpoint data
    metadata JSONB,           -- Configuration state at checkpoint
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkpoints_job_id ON checkpoints(job_id);
CREATE UNIQUE INDEX uq_checkpoints_job_stage ON checkpoints(job_id, stage_index);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON checkpoints
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One checkpoint per pipeline stage per job
- [ ] Filesystem path for actual data storage
- [ ] Metadata JSONB for configuration state
- [ ] Unique constraint: one checkpoint per stage per job

### Task 1.2: Failure Diagnostics Columns
**File:** `migrations/YYYYMMDD_add_job_failure_diagnostics.sql`

```sql
ALTER TABLE jobs
    ADD COLUMN failure_stage_index INTEGER,
    ADD COLUMN failure_stage_name TEXT,
    ADD COLUMN failure_diagnostics JSONB,
    ADD COLUMN last_checkpoint_id BIGINT REFERENCES checkpoints(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN resumed_from_checkpoint_id BIGINT REFERENCES checkpoints(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN original_job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_jobs_last_checkpoint_id ON jobs(last_checkpoint_id);
CREATE INDEX idx_jobs_resumed_from_checkpoint_id ON jobs(resumed_from_checkpoint_id);
CREATE INDEX idx_jobs_original_job_id ON jobs(original_job_id);
```

**Acceptance Criteria:**
- [ ] Failed stage index and name recorded
- [ ] Structured diagnostics JSONB (error message, GPU state, node info)
- [ ] Link to last successful checkpoint
- [ ] Link to original job when resumed

---

## Phase 2: Checkpoint Writer

### Task 2.1: Checkpoint Service
**File:** `src/services/checkpoint_service.rs`

```rust
pub struct CheckpointData {
    pub stage_index: u32,
    pub stage_name: String,
    pub completed_segments: Vec<DbId>,
    pub last_frame_path: String,
    pub cumulative_duration: f64,
    pub configuration: serde_json::Value,
}

pub async fn create_checkpoint(
    pool: &sqlx::PgPool,
    job_id: DbId,
    data: &CheckpointData,
    checkpoint_dir: &str,
) -> Result<DbId, anyhow::Error> {
    // 1. Serialize checkpoint data to filesystem
    // 2. Record metadata in checkpoints table
    // 3. Update job's last_checkpoint_id
    // 4. Must complete in <2 seconds
    todo!()
}

pub async fn load_checkpoint(
    pool: &sqlx::PgPool,
    checkpoint_id: DbId,
) -> Result<CheckpointData, anyhow::Error> {
    // Load checkpoint data from filesystem path
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Checkpoint created after each successful segment
- [ ] Data persisted to filesystem (survives process restart)
- [ ] Metadata stored in database
- [ ] Creation overhead <2 seconds per stage

---

## Phase 3: Failure Diagnostics

### Task 3.1: Diagnostic Collector
**File:** `src/services/failure_diagnostic_service.rs`

```rust
pub struct FailureDiagnostics {
    pub stage_index: u32,
    pub stage_name: String,
    pub error_message: String,
    pub comfyui_error: Option<String>,
    pub node_id: Option<String>,
    pub gpu_memory_used_mb: Option<u64>,
    pub gpu_memory_total_mb: Option<u64>,
    pub input_state: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub async fn collect_diagnostics(
    pool: &sqlx::PgPool,
    job_id: DbId,
    error: &anyhow::Error,
    context: &PipelineContext,
) -> Result<(), anyhow::Error> {
    // 1. Parse ComfyUI error messages
    // 2. Capture GPU memory state
    // 3. Record input state at failure
    // 4. Store as JSONB on the job record
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Records which pipeline stage/node failed
- [ ] Captures GPU memory status at failure
- [ ] Parses and stores ComfyUI error messages
- [ ] Input state at failure preserved for debugging

---

## Phase 4: Resume Orchestrator

### Task 4.1: Resume Service
**File:** `src/services/resume_service.rs`

```rust
pub struct ResumeRequest {
    pub job_id: DbId,
    pub modified_params: Option<serde_json::Value>,
}

pub async fn resume_from_checkpoint(
    pool: &sqlx::PgPool,
    request: ResumeRequest,
) -> Result<DbId, anyhow::Error> {
    // 1. Load last checkpoint for the job
    // 2. Create new job linked to original (original_job_id)
    // 3. Apply modified parameters if provided
    // 4. Start generation from checkpoint stage + 1
    // 5. Skip already-completed stages
    // 6. Record that this is a resumed job
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Resumes from last checkpoint, not from beginning
- [ ] Modified parameters applied before resuming
- [ ] New job created linked to original
- [ ] Already-completed stages skipped
- [ ] Modified parameters recorded in provenance

---

## Phase 5: API Endpoints

### Task 5.1: Checkpoint & Recovery APIs
**File:** `src/routes/checkpoint_routes.rs`

```rust
/// POST /api/jobs/:id/resume — Resume from last checkpoint
/// GET /api/jobs/:id/diagnostics — Get failure diagnostics
/// GET /api/jobs/:id/checkpoints — List all checkpoints for a job
```

**Acceptance Criteria:**
- [ ] Resume endpoint accepts optional parameter modifications
- [ ] Diagnostics return structured error context
- [ ] Checkpoint list shows all stages with status

---

## Phase 6: Frontend Components

### Task 6.1: Pipeline Stage Diagram
**File:** `frontend/src/components/jobs/PipelineStageDiagram.tsx`

```typescript
export function PipelineStageDiagram({ job, checkpoints }: PipelineDiagramProps) {
  // Step-by-step pipeline diagram
  // Completed steps: green checkmark
  // Failed step: red X with error summary
  // Pending steps: grey
  // Resume button on failed jobs
}
```

**Acceptance Criteria:**
- [ ] Visual pipeline stages as step diagram
- [ ] Green for completed, red for failed, grey for pending
- [ ] Failed step shows error summary (expandable for full diagnostics)
- [ ] Prominent resume button on failed jobs

### Task 6.2: Resume Dialog
**File:** `frontend/src/components/jobs/ResumeDialog.tsx`

**Acceptance Criteria:**
- [ ] Shows which checkpoint will be used
- [ ] Parameter modification form (optional)
- [ ] Confirmation before resume

---

## Phase 7: Checkpoint Cleanup

### Task 7.1: Cleanup Service
**File:** `src/services/checkpoint_cleanup_service.rs`

```rust
pub async fn cleanup_completed_checkpoints(
    pool: &sqlx::PgPool,
    job_id: DbId,
) -> Result<u32, anyhow::Error> {
    // After successful pipeline completion:
    // Delete checkpoint files from disk
    // Remove checkpoint records from database
    todo!()
}

pub async fn cleanup_expired_checkpoints(
    pool: &sqlx::PgPool,
    max_age_days: u32,
) -> Result<u32, anyhow::Error> {
    // Periodic cleanup of old checkpoints from failed pipelines
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Checkpoints cleaned up on successful completion
- [ ] Failed pipeline checkpoints retained for configurable period
- [ ] Periodic cleanup of expired checkpoints

---

## Phase 8: Testing

### Task 8.1: Checkpoint Tests
**File:** `tests/checkpoint_test.rs`

**Acceptance Criteria:**
- [ ] Checkpoint creation <2 seconds
- [ ] Checkpoint data survives process restart (filesystem persistence)
- [ ] Resume from checkpoint skips completed stages
- [ ] Modified parameters applied on resume

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_checkpoints.sql` | Checkpoints table |
| `migrations/YYYYMMDD_add_job_failure_diagnostics.sql` | Failure diagnostic columns on jobs |
| `src/services/checkpoint_service.rs` | Checkpoint writer/reader |
| `src/services/failure_diagnostic_service.rs` | Diagnostic collector |
| `src/services/resume_service.rs` | Resume orchestrator |
| `src/services/checkpoint_cleanup_service.rs` | Checkpoint cleanup |
| `src/routes/checkpoint_routes.rs` | API endpoints |
| `frontend/src/components/jobs/PipelineStageDiagram.tsx` | Stage visualization |
| `frontend/src/components/jobs/ResumeDialog.tsx` | Resume dialog |

## Dependencies

### Existing Components to Reuse
- PRD-007: Job infrastructure
- PRD-010: Event bus for failure notifications

## Implementation Order

### MVP
1. Phase 1: Database Schema — Tasks 1.1-1.2
2. Phase 2: Checkpoint Writer — Task 2.1
3. Phase 3: Failure Diagnostics — Task 3.1
4. Phase 4: Resume Orchestrator — Task 4.1
5. Phase 5: API Endpoints — Task 5.1

### Post-MVP Enhancements
1. Phase 6: Frontend — Tasks 6.1-6.2
2. Phase 7: Checkpoint Cleanup — Task 7.1
3. Phase 8: Testing

## Notes

1. **Checkpoint storage location:** Local disk by default. Shared storage (NFS, S3) recommended for multi-worker setups where a different worker may handle the resume.
2. **Checkpoint size:** Primarily consists of intermediate frame images (~1-5MB each). For a 10-segment pipeline, total checkpoint size is ~10-50MB.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-028 v1.0
