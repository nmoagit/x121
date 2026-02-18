# PRD-057: Batch Production Orchestrator

## 1. Introduction/Overview
This is the "mission control" for production runs. Individual PRDs handle each pipeline stage, but nothing coordinates the full end-to-end flow across many characters. Without this, a producer managing 10 characters x 8 scene types x 2 variants = 160 scenes has no single view of what's done, what's stuck, and what's next. The matrix view is the key UI innovation — it turns a complex parallel pipeline into a scannable grid.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01, PRD-08, PRD-10, PRD-21, PRD-23, PRD-24, PRD-35, PRD-39, PRD-42, PRD-46
- **Depended on by:** PRD-62, PRD-67, PRD-68
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Generate the full job matrix (N characters x M scene types x K variants) with status per cell.
- Understand pipeline dependencies (variants must be approved before scenes using them).
- Provide a single-screen overview of an entire production run.
- Enable one-click delivery when all cells are approved.

## 4. User Stories
- As a Creator, I want to see a matrix of characters x scene types with status per cell so that I have a single-screen overview of the entire production.
- As a Creator, I want to submit the entire matrix or a subset with one action so that I don't submit 160 scenes individually.
- As a Creator, I want the orchestrator to sequence variant approval before scene generation so that the pipeline respects dependencies.
- As a Creator, I want one-click delivery when everything is approved so that packaging is effortless.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Job Matrix Generation
**Description:** Generate the full production matrix for review.
**Acceptance Criteria:**
- [ ] Select characters and scene types to produce the NxMxK matrix
- [ ] Matrix presented for review before submission
- [ ] Estimated GPU time and disk space shown for the matrix
- [ ] Per-cell status: not started, generating, review, approved, failed

#### Requirement 1.2: Matrix Visualization
**Description:** Grid view with character rows and scene type columns.
**Acceptance Criteria:**
- [ ] Characters as rows, scene types as columns, variant sub-columns
- [ ] Color-coded status per cell
- [ ] Single-screen overview for the entire production run
- [ ] Click any cell to navigate to its detail view

#### Requirement 1.3: Selective Submission
**Description:** Submit all or a subset of the matrix.
**Acceptance Criteria:**
- [ ] Submit the entire matrix in one action
- [ ] Submit a subset of characters, scene types, or individual cells
- [ ] Re-submit only failed/rejected cells after fixes
- [ ] Submission respects budget limits (PRD-93)

#### Requirement 1.4: Dependency Awareness
**Description:** Sequence pipeline stages correctly.
**Acceptance Criteria:**
- [ ] Variant images must be approved before scenes using them generate
- [ ] Source image QA -> variant generation -> variant approval -> scene generation
- [ ] Blocked cells show which dependency is unmet
- [ ] Auto-advance: when a dependency is met, dependent cells auto-queue

#### Requirement 1.5: Progress Dashboard
**Description:** Aggregate progress across the batch.
**Acceptance Criteria:**
- [ ] Total scenes, segments generated, segments passed QA, scenes approved
- [ ] Estimated time remaining
- [ ] Feeds into PRD-42 (Studio Pulse) and PRD-54 (Job Tray)
- [ ] Real-time updates via WebSocket

#### Requirement 1.6: One-Click Delivery
**Description:** Package the project when all cells are approved.
**Acceptance Criteria:**
- [ ] Button enabled only when all cells are approved
- [ ] Triggers PRD-39 (Scene Assembler) for the entire project
- [ ] Delivery validation runs before packaging
- [ ] Progress shown during packaging

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Batch Review Queue
**Description:** Grouped review by character or scene type.
**Acceptance Criteria:**
- [ ] Review all dance scenes across characters, or all scenes for one character
- [ ] Quick-action buttons in grouped view

## 6. Non-Goals (Out of Scope)
- Individual scene generation logic (covered by PRD-24)
- Quality assessment (covered by PRD-49)
- Delivery packaging implementation (covered by PRD-39)

## 7. Design Considerations
- The matrix should be the primary workspace for producers during production runs.
- Cell colors should clearly distinguish statuses at a glance.
- The matrix should support zoom levels: full project, single character, single scene type.

## 8. Technical Considerations
- **Stack:** React for matrix UI, Rust for orchestration, WebSocket for real-time updates
- **Existing Code to Reuse:** Multiple PRD integrations (08, 21, 23, 24, 39, 46)
- **New Infrastructure Needed:** Matrix state manager, dependency resolver, batch submission coordinator
- **Database Changes:** `production_runs` table (id, project_id, matrix_config, status)
- **API Changes:** POST /production-runs, GET /production-runs/:id/matrix, POST /production-runs/:id/submit

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Matrix renders in <2 seconds for 20 characters x 10 scene types
- Dependency resolution correctly sequences all pipeline stages
- Real-time status updates appear within 5 seconds of state changes
- One-click delivery completes without manual intervention

## 11. Open Questions
- Should the matrix support saving and loading different production run configurations?
- How should the matrix handle partially completed production runs (resume vs. restart)?
- Should the matrix auto-refresh or use manual refresh?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
