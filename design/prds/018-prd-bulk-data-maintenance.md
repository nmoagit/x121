# PRD-018: Bulk Data Maintenance (Search/Replace/Re-path)

## 1. Introduction/Overview
Library reorganizations and drive migrations are inevitable in production studios. This PRD provides global find/replace for metadata fields and "Bulk Re-Pathing" for moved asset libraries, minimizing manual admin work during these operations. It ensures that file references in the database stay synchronized with actual file locations on disk.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-00 (Database integrity)
- **Depended on by:** None directly
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Enable global find/replace across metadata fields with preview and undo.
- Provide bulk re-pathing to update file references when assets are moved.
- Ensure data consistency between database records and filesystem.
- Minimize downtime during library reorganizations.

## 4. User Stories
- As an Admin, I want to find and replace a metadata value across all characters so that I can fix a studio name change in one operation instead of editing each character individually.
- As an Admin, I want to re-path all asset references when I move the asset library to a new drive so that the platform continues to find all files.
- As an Admin, I want to preview all changes before applying them so that I can verify the operation is correct.
- As an Admin, I want bulk operations to be reversible so that I can undo mistakes.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Global Find/Replace
**Description:** Search for and replace values across metadata fields.
**Acceptance Criteria:**
- [ ] Search across all metadata fields in a project or studio-wide
- [ ] Support exact match and regex-based search
- [ ] Preview all matches before applying
- [ ] Replace operation is atomic and reversible

#### Requirement 1.2: Bulk Re-Pathing
**Description:** Update file path references when assets are relocated.
**Acceptance Criteria:**
- [ ] Specify old path prefix and new path prefix
- [ ] Preview all affected file references
- [ ] Validate new paths exist before applying
- [ ] Report broken references after re-pathing

#### Requirement 1.3: Operation Preview
**Description:** Show all changes before committing.
**Acceptance Criteria:**
- [ ] Preview shows: count of affected records, sample of changes (old -> new)
- [ ] Filterable by entity type and field
- [ ] Cancel available at any point before commit

#### Requirement 1.4: Undo Support
**Description:** Bulk operations are reversible.
**Acceptance Criteria:**
- [ ] Each bulk operation stores the previous values
- [ ] Undo restores all affected records to their pre-operation state
- [ ] Undo is available until the next bulk operation (one-level undo)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scheduled Maintenance
**Description:** Schedule bulk operations to run during off-peak hours.
**Acceptance Criteria:**
- [ ] Bulk operations can be queued for a future time
- [ ] Admin receives a report after execution

## 6. Non-Goals (Out of Scope)
- Individual metadata editing (covered by PRD-66)
- Batch metadata operations across characters (covered by PRD-88)
- Data validation (covered by PRD-14)

## 7. Design Considerations
- The find/replace UI should be familiar (similar to text editor find/replace).
- Re-pathing should support both absolute and relative path changes.
- Preview should highlight changes clearly with color-coded diff.

## 8. Technical Considerations
- **Stack:** Rust for batch operations, PostgreSQL transactions for atomicity
- **Existing Code to Reuse:** PRD-14 validation for post-operation integrity checks
- **New Infrastructure Needed:** Batch operation service, undo storage, preview generator
- **Database Changes:** `bulk_operations` table (id, type, parameters, affected_count, undo_data, created_at)
- **API Changes:** POST /admin/maintenance/find-replace, POST /admin/maintenance/repath, POST /admin/maintenance/:id/undo

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Bulk operations process 10,000 records in <30 seconds
- Preview accurately shows 100% of records that will be affected
- Undo restores all records to their exact previous state
- Zero data corruption from bulk operations (validated by integrity check)

## 11. Open Questions
- Should find/replace support cross-field replacement (value from field A to field B)?
- What is the maximum operation size before performance concerns?
- How should concurrent bulk operations be handled?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
