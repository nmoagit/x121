# PRD-028: Pipeline Error Recovery & Checkpointing

## 1. Introduction/Overview
Long pipelines (10+ segments) failing at segment 8 and requiring a full restart waste significant GPU time. The "no silent retries" policy (PRD-07) is correct for user trust, but the recovery path after a failure needs definition. This PRD provides automatic checkpointing after each pipeline stage, partial failure handling that preserves completed work, structured failure diagnostics, and retry-with-modifications from the last checkpoint.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-07 (Task Execution Engine)
- **Depended on by:** PRD-24, PRD-25, PRD-46, PRD-49
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Automatically checkpoint after each successful pipeline stage.
- Preserve completed segments when a later stage fails.
- Provide structured failure diagnostics for debugging.
- Enable resume from last checkpoint with optional parameter modifications.

## 4. User Stories
- As a Creator, I want my first 7 completed segments preserved when segment 8 fails so that I only need to re-run the failed segment.
- As a Creator, I want structured error context (which node failed, what was the GPU state) so that I can diagnose the issue.
- As a Creator, I want to resume from the last checkpoint with adjusted parameters so that I can try a different approach without re-running completed work.
- As an Admin, I want checkpoint data to persist across server restarts so that recovery is possible even after infrastructure issues.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Automatic Checkpoints
**Description:** Persist state after each successful pipeline stage.
**Acceptance Criteria:**
- [ ] After each segment completes, checkpoint intermediate state
- [ ] Checkpoints include: completed segments, metadata, latents, configuration
- [ ] Checkpoints persist to disk (survive process restart)
- [ ] Checkpoint creation adds <2 seconds overhead per stage

#### Requirement 1.2: Partial Failure Handling
**Description:** Preserve completed work when a later stage fails.
**Acceptance Criteria:**
- [ ] If step N fails, steps 1 through N-1 outputs are preserved
- [ ] Failed pipeline shows completed steps with green, failed step with red
- [ ] User can access completed segments before the failure point
- [ ] Completed segments are usable even if the scene is incomplete

#### Requirement 1.3: Failure Diagnostics
**Description:** Structured error context attached to failed jobs.
**Acceptance Criteria:**
- [ ] Error includes: which pipeline stage/node failed, input state at failure
- [ ] GPU memory status at failure recorded
- [ ] ComfyUI error messages captured and parsed
- [ ] Diagnostics viewable in the job detail view

#### Requirement 1.4: Retry with Modifications
**Description:** Resume from last checkpoint with adjusted parameters.
**Acceptance Criteria:**
- [ ] Resume button available on failed jobs
- [ ] Option to modify parameters before resuming (e.g., lower resolution, different seed)
- [ ] Resume starts from the last checkpoint, not from the beginning
- [ ] Modified parameters are recorded in the job's provenance

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Checkpoint Cleanup
**Description:** Automatic cleanup of checkpoints after successful completion.
**Acceptance Criteria:**
- [ ] Checkpoints are cleaned up when the full pipeline completes successfully
- [ ] Failed pipeline checkpoints are retained for configurable period

## 6. Non-Goals (Out of Scope)
- Automatic retry (covered by PRD-71)
- Job scheduling (covered by PRD-08)
- Worker failover (covered by PRD-46)

## 7. Design Considerations
- Failed pipeline view should clearly show the pipeline stages as a step diagram.
- Resume action should be prominent and easy to find on failed jobs.
- Diagnostic information should be expandable (summary visible, full details on demand).

## 8. Technical Considerations
- **Stack:** Rust for checkpoint management, filesystem for checkpoint storage, PostgreSQL for metadata
- **Existing Code to Reuse:** PRD-07 job infrastructure
- **New Infrastructure Needed:** Checkpoint writer/reader, failure diagnostic collector, resume orchestrator
- **Database Changes:** `checkpoints` table (job_id, stage, data_path, created_at), add failure diagnostics to jobs table
- **API Changes:** POST /jobs/:id/resume, GET /jobs/:id/diagnostics, GET /jobs/:id/checkpoints

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Checkpoint creation adds <2 seconds overhead per pipeline stage
- 100% of completed segments are preserved after mid-pipeline failures
- Resume from checkpoint correctly skips already-completed stages
- Failure diagnostics capture sufficient context for debugging in >90% of failures

## 11. Open Questions
- Where should checkpoints be stored (local disk, shared storage)?
- What is the maximum checkpoint size for a single stage?
- How long should checkpoints be retained after pipeline completion?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
