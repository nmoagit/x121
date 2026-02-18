# PRD-015: Intelligent & Deferred Disk Reclamation

## 1. Introduction/Overview
Video generation produces large volumes of supporting files (failed renders, intermediate frames, old versions) that accumulate and consume disk space. This PRD provides manual and policy-driven "Deferred Cleanup" that protects permanent assets (Seed A/B, approved outputs) while preventing the server from filling with failed re-rolls and abandoned experiments. It provides the middle ground between "keep everything forever" and "delete immediately."

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for entity relationships)
- **Depended on by:** PRD-48, PRD-50, PRD-72
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Protect permanent assets (source images, approved variants, final deliverables) from accidental deletion.
- Implement configurable reclamation policies based on file age, approval status, and entity state.
- Provide deferred cleanup with a grace period before actual deletion.
- Give admins visibility into reclaimable space and control over cleanup actions.

## 4. User Stories
- As an Admin, I want automatic cleanup of failed generation outputs after 30 days so that disk space is recovered without manual intervention.
- As a Creator, I want my approved outputs to be permanently protected so that no cleanup policy can accidentally delete final deliverables.
- As an Admin, I want to preview what will be deleted before a cleanup runs so that I can verify nothing important will be lost.
- As an Admin, I want to see how much space can be reclaimed per project so that I can prioritize cleanup actions.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Protected Assets
**Description:** Define which assets are never eligible for reclamation.
**Acceptance Criteria:**
- [ ] Source images (Seed A) are permanently protected
- [ ] Approved variant images are permanently protected
- [ ] Final delivery outputs (assembled videos, metadata) are permanently protected
- [ ] Protection status is visible in the file browser

#### Requirement 1.2: Reclamation Policies
**Description:** Configurable rules for when files become eligible for cleanup.
**Acceptance Criteria:**
- [ ] Policy rules based on: file age, approval status, job status (failed/cancelled)
- [ ] Default policies: "Delete failed outputs after 30 days", "Delete cancelled job artifacts after 7 days"
- [ ] Policies configurable at studio and project level
- [ ] Multiple policies can apply; most permissive wins

#### Requirement 1.3: Deferred Deletion
**Description:** Grace period between marking for deletion and actual file removal.
**Acceptance Criteria:**
- [ ] Files marked for deletion enter a "Trash" state with a grace period (default: 7 days)
- [ ] Files in Trash can be restored before the grace period expires
- [ ] After grace period, files are permanently deleted
- [ ] Admin can force immediate deletion (with confirmation)

#### Requirement 1.4: Reclamation Dashboard
**Description:** Visibility into reclaimable space and cleanup status.
**Acceptance Criteria:**
- [ ] Shows total reclaimable space per project and per policy
- [ ] Preview: list of files that will be affected by a cleanup action
- [ ] History of past cleanup runs with space recovered
- [ ] Integration with PRD-19 (Disk Space Visualizer)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scheduled Cleanup Runs
**Description:** Automated periodic cleanup based on policies.
**Acceptance Criteria:**
- [ ] Cleanup runs on a configurable schedule (daily, weekly)
- [ ] Admin receives a summary report after each run

## 6. Non-Goals (Out of Scope)
- Disk space visualization (covered by PRD-19)
- External/tiered storage (covered by PRD-48)
- Project archival (covered by PRD-72)

## 7. Design Considerations
- Protected assets should have a visual "lock" icon indicating they are immune to cleanup.
- The Trash state should be clearly distinct from "Deleted" — users need to know files can be recovered.
- Cleanup previews should sort by file size (largest first) for impact visibility.

## 8. Technical Considerations
- **Stack:** Rust cleanup service, scheduled task runner, filesystem operations
- **Existing Code to Reuse:** PRD-01 entity relationships for protection rules
- **New Infrastructure Needed:** Reclamation policy engine, trash queue, scheduled cleanup runner
- **Database Changes:** `reclamation_policies` table, `trash_queue` table (file_path, marked_at, delete_after)
- **API Changes:** GET /admin/reclamation/preview, POST /admin/reclamation/run, POST /admin/trash/:id/restore

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Zero accidental deletions of protected assets
- Reclamation policies correctly identify eligible files with 100% accuracy
- Deferred deletion grace period correctly prevents premature file removal
- Disk space recovery matches the preview estimate within 5%

## 11. Open Questions
- Should reclamation run automatically on a schedule, or only on manual trigger?
- What is the default grace period, and should it be configurable per file type?
- How should the system handle files referenced by multiple entities?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
