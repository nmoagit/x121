# PRD-072: Project Lifecycle & Archival

## 1. Introduction/Overview
Without lifecycle management, old projects accumulate indefinitely — consuming disk, cluttering search results, and creating ambiguity about what's "done." This PRD provides formal lifecycle states (Setup, Active, Delivered, Archived, Closed) with transition rules, completion checklists, auto-generated summary reports, bulk archival, and edit locks — bringing the same discipline to project management that PRD-08 brings to job management.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for project structure), PRD-15 (Disk Reclamation for archival storage), PRD-39 (Scene Assembler for delivery validation), PRD-45 (Audit Logging for transition tracking), PRD-48 (Tiered Storage for archival)
- **Depended on by:** None
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Define formal lifecycle states with enforced transition rules.
- Provide completion checklists that gate state transitions.
- Auto-generate project summary reports on delivery.
- Support bulk archival with configurable scheduling.
- Enforce edit locks on completed projects.

## 4. User Stories
- As an Admin, I want formal lifecycle states so that everyone knows which projects are active, delivered, or archived.
- As an Admin, I want completion checklists before marking a project "Delivered" so that nothing is shipped incomplete.
- As an Admin, I want auto-generated project summary reports so that I have institutional memory of production metrics.
- As an Admin, I want bulk archival of old projects so that completed work doesn't clutter the active workspace.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Lifecycle States
**Description:** Formal project states with clear definitions.
**Acceptance Criteria:**
- [ ] Setup: project created, characters being onboarded, no generation started
- [ ] Active: generation, review, and approval in progress (default working state)
- [ ] Delivered: all scenes approved and delivery ZIP exported; locked from new generation
- [ ] Archived: moved to cold storage (PRD-48); metadata searchable, assets require retrieval
- [ ] Closed: permanently concluded; supporting files eligible for reclamation (PRD-15)

#### Requirement 1.2: Completion Checklist
**Description:** Gate conditions for state transitions.
**Acceptance Criteria:**
- [ ] Before Delivered: all scenes approved, metadata complete, delivery validation passed (PRD-39)
- [ ] Block transition if checks fail with clear list of remaining items
- [ ] Override available for Admin with audit log entry (PRD-45)

#### Requirement 1.3: Project Summary Report
**Description:** Auto-generated delivery report.
**Acceptance Criteria:**
- [ ] Generated automatically on transition to Delivered state
- [ ] Includes: total characters, scenes produced, GPU hours consumed, wall-clock time, QA pass rates, re-generation counts
- [ ] Exportable as PDF/JSON

#### Requirement 1.4: Bulk Archival
**Description:** Archive multiple completed projects.
**Acceptance Criteria:**
- [ ] Select multiple Delivered projects for archival
- [ ] Schedule archival (e.g., "Archive all Delivered projects older than 90 days")
- [ ] Archival moves binary assets to cold storage (PRD-48); metadata remains searchable

#### Requirement 1.5: Edit Lock
**Description:** Prevent accidental changes to completed projects.
**Acceptance Criteria:**
- [ ] Delivered and Archived projects prevent edits
- [ ] Explicit "Re-open" action required to return to Active state
- [ ] Re-open logged in audit trail (PRD-45)
- [ ] Review notes and metadata remain viewable (read-only)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Lifecycle Automation
**Description:** Auto-transition based on rules.
**Acceptance Criteria:**
- [ ] Auto-transition to Delivered when all completion checklist items are satisfied
- [ ] Auto-archive after configurable time in Delivered state

## 6. Non-Goals (Out of Scope)
- Disk reclamation mechanics (covered by PRD-15)
- Tiered storage implementation (covered by PRD-48)
- Scene assembly and export (covered by PRD-39)

## 7. Design Considerations
- Lifecycle state should be prominently displayed on the project header.
- State transition buttons should include confirmation dialogs for irreversible transitions.
- Archived projects should be visually distinct (greyed out, archive icon) in project lists.

## 8. Technical Considerations
- **Stack:** Rust state machine for lifecycle transitions, React for project header and transition UI
- **Existing Code to Reuse:** PRD-39 delivery validation, PRD-45 audit logging, PRD-48 storage tiering
- **New Infrastructure Needed:** Lifecycle state machine, completion checklist evaluator, summary report generator, archival scheduler
- **Database Changes:** `project_lifecycle` columns on projects table (state, transitioned_at, transitioned_by), `project_summaries` table (project_id, report_json, generated_at)
- **API Changes:** POST /projects/:id/transition/:state, GET /projects/:id/completion-checklist, GET /projects/:id/summary-report, POST /projects/bulk-archive

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Completion checklist correctly blocks incomplete projects from transitioning to Delivered
- Edit lock prevents 100% of accidental modifications to completed projects
- Summary reports generate in <30 seconds per project
- Bulk archival correctly moves assets to cold storage without data loss

## 11. Open Questions
- Should there be a "Paused" state for projects temporarily put on hold?
- How should lifecycle state changes propagate to external systems via webhooks (PRD-12)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
