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

## Phase 1: Database Schema [COMPLETE]

### Task 1.1: Checkpoints Table [COMPLETE]
**File:** `apps/db/migrations/20260221000031_create_checkpoints.sql`

**Acceptance Criteria:**
- [x] One checkpoint per pipeline stage per job
- [x] Filesystem path for actual data storage
- [x] Metadata JSONB for configuration state
- [x] Unique constraint: one checkpoint per stage per job

### Task 1.2: Failure Diagnostics Columns [COMPLETE]
**File:** `apps/db/migrations/20260221000032_add_job_failure_diagnostics.sql`

**Acceptance Criteria:**
- [x] Failed stage index and name recorded
- [x] Structured diagnostics JSONB (error message, GPU state, node info)
- [x] Link to last successful checkpoint
- [x] Link to original job when resumed

---

## Phase 2: Checkpoint Writer [COMPLETE]

### Task 2.1: Checkpoint Service [COMPLETE]
**File:** `apps/backend/crates/core/src/checkpointing.rs` (core types, constants, validation with unit tests)
**File:** `apps/backend/crates/db/src/models/checkpoint.rs` (Checkpoint entity, CreateCheckpoint DTO, FailureDiagnostics DTO)
**File:** `apps/backend/crates/db/src/repositories/checkpoint_repo.rs` (CheckpointRepo with create, find_by_id, list_by_job, find_latest_for_job, delete_by_job)

**Implementation Notes:**
- Core module implements `CheckpointData` and `FailureDiagnosticData` structs with serde roundtrip
- Validation functions for stage_index bounds and checkpoint size limits
- `checkpoint_data_dir()` utility for filesystem path construction
- 10 unit tests in core module covering all validation and serialization paths
- Repository uses `ON CONFLICT` upsert for checkpoint create (idempotent)

**Acceptance Criteria:**
- [x] Checkpoint created after each successful segment
- [x] Data persisted to filesystem (survives process restart)
- [x] Metadata stored in database
- [x] Creation overhead <2 seconds per stage

---

## Phase 3: Failure Diagnostics [COMPLETE]

### Task 3.1: Diagnostic Collector [COMPLETE]
**File:** `apps/backend/crates/core/src/checkpointing.rs` (FailureDiagnosticData struct)
**File:** `apps/backend/crates/db/src/models/checkpoint.rs` (FailureDiagnostics model)

**Implementation Notes:**
- FailureDiagnosticData in core captures: stage_index, stage_name, error_message, comfyui_error, node_id, gpu_memory_used_mb, gpu_memory_total_mb, input_state, timestamp
- Database model (FailureDiagnostics) mirrors the core struct for API serialization
- Job model extended with failure_diagnostics JSONB column

**Acceptance Criteria:**
- [x] Records which pipeline stage/node failed
- [x] Captures GPU memory status at failure
- [x] Parses and stores ComfyUI error messages
- [x] Input state at failure preserved for debugging

---

## Phase 4: Resume Orchestrator [COMPLETE]

### Task 4.1: Resume Service [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/checkpoints.rs` (resume_from_checkpoint handler)

**Implementation Notes:**
- Resume logic implemented directly in handler (follows project's thin-service pattern)
- Finds latest checkpoint, merges modified params with original, creates new job linked to original
- New job records: original_job_id, resumed_from_checkpoint_id
- Only failed jobs can be resumed; returns 400 otherwise

**Acceptance Criteria:**
- [x] Resumes from last checkpoint, not from beginning
- [x] Modified parameters applied before resuming
- [x] New job created linked to original
- [x] Already-completed stages skipped
- [x] Modified parameters recorded in provenance

---

## Phase 5: API Endpoints [COMPLETE]

### Task 5.1: Checkpoint & Recovery APIs [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/checkpoints.rs`
**File:** `apps/backend/crates/api/src/routes/checkpoints.rs`

**Implementation Notes:**
- GET /api/v1/jobs/{id}/checkpoints — list_checkpoints
- GET /api/v1/jobs/{id}/checkpoints/{checkpoint_id} — get_checkpoint
- POST /api/v1/jobs/{id}/resume-from-checkpoint — resume_from_checkpoint
- GET /api/v1/jobs/{id}/diagnostics — get_failure_diagnostics
- All endpoints require auth, use find_and_authorize pattern
- Routes merged into existing /jobs nest in api_routes()

**Acceptance Criteria:**
- [x] Resume endpoint accepts optional parameter modifications
- [x] Diagnostics return structured error context
- [x] Checkpoint list shows all stages with status

---

## Phase 6: Frontend Components [COMPLETE]

### Task 6.1: Pipeline Stage Diagram [COMPLETE]
**File:** `apps/frontend/src/features/checkpoints/PipelineStageDiagram.tsx`

**Implementation Notes:**
- Step diagram with connector lines between stages
- StageIcon: green check for completed, red X for failed, grey circle for pending
- FailedStageDetail: expandable error summary showing ComfyUI error, node ID, GPU memory
- Resume button shown when canResume=true
- 12 tests in __tests__/PipelineStageDiagram.test.tsx covering all states

**Acceptance Criteria:**
- [x] Visual pipeline stages as step diagram
- [x] Green for completed, red for failed, grey for pending
- [x] Failed step shows error summary (expandable for full diagnostics)
- [x] Prominent resume button on failed jobs

### Task 6.2: Resume Dialog [COMPLETE]
**File:** `apps/frontend/src/features/checkpoints/ResumeDialog.tsx`

**Implementation Notes:**
- Modal dialog showing checkpoint info (stage name, index, size, created_at)
- Optional JSON textarea for parameter modification
- JSON parse validation with error display
- Cancel/Resume buttons with loading state

**Acceptance Criteria:**
- [x] Shows which checkpoint will be used
- [x] Parameter modification form (optional)
- [x] Confirmation before resume

---

## Phase 7: Checkpoint Cleanup

### Task 7.1: Cleanup Service
**File:** `src/services/checkpoint_cleanup_service.rs`

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
| `apps/db/migrations/20260221000031_create_checkpoints.sql` | Checkpoints table |
| `apps/db/migrations/20260221000032_add_job_failure_diagnostics.sql` | Failure diagnostic columns on jobs |
| `apps/backend/crates/core/src/checkpointing.rs` | Core constants, data types, validation + unit tests |
| `apps/backend/crates/db/src/models/checkpoint.rs` | Checkpoint entity, CreateCheckpoint DTO, FailureDiagnostics |
| `apps/backend/crates/db/src/repositories/checkpoint_repo.rs` | CheckpointRepo CRUD operations |
| `apps/backend/crates/api/src/handlers/checkpoints.rs` | API handlers for checkpoints + diagnostics + resume |
| `apps/backend/crates/api/src/routes/checkpoints.rs` | Route definitions |
| `apps/frontend/src/features/checkpoints/types.ts` | TypeScript types + derivePipelineStages helper |
| `apps/frontend/src/features/checkpoints/hooks/use-checkpoints.ts` | TanStack Query hooks |
| `apps/frontend/src/features/checkpoints/PipelineStageDiagram.tsx` | Stage visualization |
| `apps/frontend/src/features/checkpoints/ResumeDialog.tsx` | Resume dialog |
| `apps/frontend/src/features/checkpoints/index.ts` | Barrel export |
| `apps/frontend/src/features/checkpoints/__tests__/PipelineStageDiagram.test.tsx` | Frontend tests (12 tests) |

## Modified Files

| File | Change |
|------|--------|
| `apps/backend/crates/db/src/models/mod.rs` | Added `pub mod checkpoint;` |
| `apps/backend/crates/db/src/models/job.rs` | Added 6 PRD-28 failure diagnostic fields to Job struct |
| `apps/backend/crates/db/src/repositories/mod.rs` | Added `pub mod checkpoint_repo;` + `pub use CheckpointRepo;` |
| `apps/backend/crates/db/src/repositories/job_repo.rs` | Updated COLUMNS to include 6 new PRD-28 columns |
| `apps/backend/crates/core/src/lib.rs` | Added `pub mod checkpointing;` |
| `apps/backend/crates/api/src/handlers/mod.rs` | Added `pub mod checkpoints;` |
| `apps/backend/crates/api/src/routes/mod.rs` | Added `pub mod checkpoints;` + merged checkpoint routes into /jobs nest |

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
- **v1.1** (2026-02-21): Phases 1-6 implemented. Phases 7-8 remain as post-MVP.
