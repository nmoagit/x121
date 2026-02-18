# PRD-007: Parallel Task Execution Engine

## 1. Introduction/Overview
Users should never be "locked" by a render in progress. The Parallel Task Execution Engine provides a background job queue that allows the UI to remain fully interactive while GPU-intensive generation tasks run asynchronously. It handles task dispatching, progress tracking, and ensures a strict "no silent retries" policy that maintains user trust in the system's behavior.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation), PRD-05 (ComfyUI WebSocket Bridge)
- **Depended on by:** PRD-08, PRD-24, PRD-28, PRD-46
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Enable background execution of GPU-intensive tasks without blocking the UI.
- Support parallel execution of multiple independent tasks across available workers.
- Maintain a strict "no silent retries" policy — failures are reported, never hidden.
- Provide real-time task progress and status updates to the UI.

## 4. User Stories
- As a Creator, I want to set up my next generation job while the current one is running so that I'm never idle waiting for GPU work to complete.
- As a Creator, I want to see all my running tasks with progress indicators so that I know what's happening without navigating to a separate page.
- As a Creator, I want failed tasks to be clearly reported with error details so that I can decide how to proceed (retry, modify parameters, or abandon).
- As an Admin, I want the execution engine to distribute work across available workers so that no single GPU is overloaded while others are idle.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Background Job Dispatch
**Description:** Submit tasks for background execution without blocking the UI thread.
**Acceptance Criteria:**
- [ ] Tasks are submitted via API and immediately return a job ID
- [ ] The UI remains fully interactive after submission
- [ ] Tasks are dispatched to available workers based on capability matching
- [ ] Job state transitions are tracked: Submitted, Queued, Dispatched, Running, Complete, Failed

#### Requirement 1.2: Progress Tracking
**Description:** Real-time progress updates for running tasks.
**Acceptance Criteria:**
- [ ] Each running task reports percentage progress
- [ ] Progress updates are delivered to the frontend via WebSocket
- [ ] Task duration (elapsed and estimated remaining) is tracked
- [ ] Progress is visible from any page via the Job Tray (PRD-54)

#### Requirement 1.3: No Silent Retries Policy
**Description:** Failed tasks are never automatically retried without explicit user configuration.
**Acceptance Criteria:**
- [ ] Default behavior on failure: mark as Failed, notify user, preserve partial output
- [ ] Failed tasks display the error message, stack trace context, and failed step
- [ ] Users can manually retry from the UI with one click
- [ ] Auto-retry is only available through explicit opt-in (PRD-71)

#### Requirement 1.4: Parallel Execution
**Description:** Multiple independent tasks can execute simultaneously across workers.
**Acceptance Criteria:**
- [ ] The engine supports running N tasks in parallel (limited by available workers)
- [ ] Independent tasks (different characters, different scene types) run concurrently
- [ ] Worker utilization is visible in the task management view
- [ ] Adding tasks to the queue while others run does not interrupt running tasks

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Task Dependencies
**Description:** Define task-to-task dependencies so that dependent tasks wait for prerequisites.
**Acceptance Criteria:**
- [ ] Tasks can declare dependencies on other tasks
- [ ] Dependent tasks remain in Queued state until prerequisites complete

## 6. Non-Goals (Out of Scope)
- Priority-based scheduling policies (covered by PRD-08)
- Worker pool management (covered by PRD-46)
- Pipeline error recovery and checkpointing (covered by PRD-28)
- Smart auto-retry with parameter variation (covered by PRD-71)

## 7. Design Considerations
- Task submission should feel instant — no perceptible delay between clicking "Generate" and the task appearing in the queue.
- Failed task notifications should be prominent but not blocking.
- The task list should show a clear visual distinction between running, queued, and completed tasks.

## 8. Technical Considerations
- **Stack:** Tokio async runtime for task management, PostgreSQL for job persistence, WebSocket for progress relay
- **Existing Code to Reuse:** PRD-02 async infrastructure, PRD-05 ComfyUI bridge for execution
- **New Infrastructure Needed:** Job queue table, task dispatcher service, progress aggregation
- **Database Changes:** `jobs` table (id, type, status, worker_id, submitted_at, started_at, completed_at, error, progress, parameters)
- **API Changes:** POST /jobs (submit), GET /jobs (list), GET /jobs/:id (detail), POST /jobs/:id/cancel, POST /jobs/:id/retry

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Task submission latency <200ms (time from click to job ID returned)
- Progress updates reach the UI within 500ms of the worker reporting them
- Zero silent retries detected in production logs
- System handles 50+ concurrent queued tasks without degradation

## 11. Open Questions
- Should the engine support task priorities at this level, or defer entirely to PRD-08?
- What is the maximum number of concurrent running tasks the system should support?
- How should the engine handle worker disconnection mid-task?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
