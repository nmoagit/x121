# PRD-034: Interactive Debugger (Mid-Run Control)

## 1. Introduction/Overview
Waiting for a generation job to fail completely before making corrections wastes GPU time and extends iteration cycles. This PRD provides pause/resume capabilities for running jobs, parameter tweaking mid-run, and viewing intermediate latents — enabling "surgical" fixes during generation rather than post-failure re-queuing.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-05 (ComfyUI WebSocket Bridge for real-time communication), PRD-33 (Node-Based Workflow Canvas for visualization)
- **Depended on by:** None
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Enable pause/resume of running generation jobs.
- Allow parameter adjustment on paused jobs without restarting from scratch.
- Display intermediate latent outputs for early quality assessment.
- Reduce GPU waste from jobs that would otherwise fail completely.

## 4. User Stories
- As a Creator, I want to pause a running job so that I can inspect intermediate results before the job completes.
- As a Creator, I want to tweak parameters mid-run so that I can correct course without restarting from the beginning.
- As a Creator, I want to view intermediate latents so that I can see early signs of quality issues (face drift, artifacts) and abort before wasting more GPU time.
- As an Admin, I want to pause expensive jobs for resource management without losing their progress.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Pause/Resume
**Description:** Suspend and resume running generation jobs.
**Acceptance Criteria:**
- [ ] Pause button on active jobs in the workflow canvas and job tray
- [ ] Paused jobs retain their state (intermediate results, current step)
- [ ] Resume continues from the paused point, not from the beginning
- [ ] Paused jobs release GPU resources for other work

#### Requirement 1.2: Parameter Tweaking
**Description:** Adjust parameters on paused jobs.
**Acceptance Criteria:**
- [ ] Edit generation parameters while job is paused (e.g., denoise strength, LoRA weight, prompt modifiers)
- [ ] Modified parameters apply from the next step onwards
- [ ] Clear indication of which parameters were modified mid-run
- [ ] Undo mid-run parameter changes before resuming

#### Requirement 1.3: Intermediate Latent Preview
**Description:** View in-progress generation output.
**Acceptance Criteria:**
- [ ] Display decoded intermediate latents as preview images/frames
- [ ] Update preview periodically during generation (configurable interval)
- [ ] Preview appears in the workflow canvas next to the active generation node
- [ ] Side-by-side with the source/seed image for comparison

#### Requirement 1.4: Early Abort
**Description:** Cancel jobs based on intermediate quality assessment.
**Acceptance Criteria:**
- [ ] "Abort" action available at any point during generation
- [ ] Aborted job's partial results are preserved (not deleted) for inspection
- [ ] Abort reason can be noted for the PRD-64 failure tracking system

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Breakpoint System
**Description:** Set breakpoints on specific workflow nodes.
**Acceptance Criteria:**
- [ ] Set breakpoints on nodes in the workflow canvas
- [ ] Job automatically pauses when reaching a breakpoint node
- [ ] Inspect inputs and outputs at the breakpoint before continuing

## 6. Non-Goals (Out of Scope)
- Workflow canvas visualization and node building (covered by PRD-33)
- Error recovery and checkpointing (covered by PRD-28)
- Job scheduling and queue management (covered by PRD-08)

## 7. Design Considerations
- Pause/resume controls should be immediately accessible (not buried in menus).
- Parameter editing UI for paused jobs should clearly indicate the "mid-run" state.
- Latent previews should be clearly labeled as "intermediate" to avoid confusion with final output.

## 8. Technical Considerations
- **Stack:** PRD-05 WebSocket bridge for real-time job control, ComfyUI interrupt/resume API, React for preview display
- **Existing Code to Reuse:** PRD-05 ComfyUI communication, PRD-33 workflow canvas for preview placement, PRD-28 checkpointing for state preservation
- **New Infrastructure Needed:** Job pause/resume state machine, parameter hot-swap engine, latent decoder for preview
- **Database Changes:** `job_debug_state` table (job_id, paused_at_step, modified_params_json, intermediate_previews_json)
- **API Changes:** POST /jobs/:id/pause, POST /jobs/:id/resume, PUT /jobs/:id/params (mid-run), GET /jobs/:id/preview

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Pause operation completes within 2 seconds of request
- Resume operation continues from exact paused step (no lost progress)
- Parameter hot-swap correctly applies changes from the next step onwards
- Intermediate latent previews update within 5 seconds of generation progress

## 11. Open Questions
- Which parameters are safe to modify mid-run without destabilizing the generation?
- Should intermediate previews be stored permanently or purged after job completion?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
