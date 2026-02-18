# PRD-088: Batch Metadata Operations

## 1. Introduction/Overview
PRD-66 handles single-character metadata editing, but studios with 100+ characters routinely need to update fields across dozens of records. This PRD extends PRD-66 with multi-character operations: multi-select edit, search-and-replace, CSV round-trip, field operations, and atomic undo. It makes metadata maintenance O(1) instead of O(N) for common bulk operations.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-45 (Audit Logging), PRD-51 (Undo/Redo), PRD-60 (Character Library), PRD-66 (Metadata Editor)
- **Depended on by:** None
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Enable simultaneous metadata editing across multiple characters.
- Provide search-and-replace with regex support and preview.
- Support CSV export/re-import round-trip for spreadsheet-based workflows.
- Make all batch operations atomic and reversible.

## 4. User Stories
- As a Creator, I want to set `agency = 'XYZ Studios'` for 50 selected characters in one operation so that I don't edit each one individually.
- As an Admin, I want to find and replace all instances of `blonde` with `light_blonde` in the `hair_color` field so that our terminology is consistent.
- As a Creator, I want to export metadata to CSV, edit in Excel, and re-import so that our data team can contribute using their preferred tools.
- As a Creator, I want batch operations to be undoable in one action so that a mistake doesn't require 50 individual corrections.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Multi-Select Edit
**Description:** Edit a field across multiple selected characters simultaneously.
**Acceptance Criteria:**
- [ ] Select characters in the library or spreadsheet view
- [ ] Edit a metadata field; apply to all selected
- [ ] Preview shows which characters will be affected
- [ ] Confirmation before applying

#### Requirement 1.2: Search & Replace
**Description:** Find and replace values across metadata fields.
**Acceptance Criteria:**
- [ ] Search across a specific field or all fields in a project
- [ ] Support exact match and regex patterns
- [ ] Preview all matches before applying
- [ ] Show count of matches and affected characters

#### Requirement 1.3: CSV Export/Re-Import
**Description:** Round-trip metadata through CSV for external editing.
**Acceptance Criteria:**
- [ ] Export: one row per character, one column per metadata field, includes character ID
- [ ] Re-import: match rows to characters by ID
- [ ] Diff preview: "42 characters updated, 3 new fields added, 0 conflicts"
- [ ] Apply or cancel after review

#### Requirement 1.4: Field Operations
**Description:** Bulk operations on a single field.
**Acceptance Criteria:**
- [ ] Clear: remove field value for all selected characters
- [ ] Set default: set a field to a specific value where it's empty
- [ ] Copy from field: copy value from one field to another
- [ ] Concatenate: combine values from multiple fields

#### Requirement 1.5: Atomic Undo
**Description:** Batch operations are reversible as a single action.
**Acceptance Criteria:**
- [ ] A single undo reverts the entire batch operation
- [ ] Integrated with PRD-51 undo/redo architecture
- [ ] Undo shows: "Undo batch edit: 42 characters affected"

#### Requirement 1.6: Audit Trail
**Description:** Every batch operation is logged.
**Acceptance Criteria:**
- [ ] Log records: who, when, which characters, what changed (old -> new)
- [ ] Queryable via PRD-45 audit system
- [ ] Exportable for compliance purposes

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scheduled Batch Operations
**Description:** Schedule batch operations for off-peak execution.
**Acceptance Criteria:**
- [ ] Queue batch operations for future execution
- [ ] Admin receives notification on completion

## 6. Non-Goals (Out of Scope)
- Single-character metadata editing UI (covered by PRD-66)
- Data validation rules (covered by PRD-14)
- Global find/replace for file paths (covered by PRD-18)

## 7. Design Considerations
- Multi-select should follow familiar patterns (Shift+click for range, Ctrl+click for individual).
- Search & replace preview should use highlighted diff format.
- CSV import diff should be a table showing current vs. incoming values.

## 8. Technical Considerations
- **Stack:** React for UI, Rust for batch processing, PostgreSQL transactions for atomicity
- **Existing Code to Reuse:** PRD-66 metadata editor components, PRD-51 undo infrastructure
- **New Infrastructure Needed:** Batch operation processor, diff generator, CSV parser
- **Database Changes:** `batch_operations` table for audit and undo tracking
- **API Changes:** POST /characters/batch-edit, POST /characters/search-replace, POST /characters/metadata/csv-import

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Batch operations on 100 characters complete in <5 seconds
- CSV round-trip preserves all data types and values correctly
- Undo correctly restores all affected records to their pre-operation state
- 100% of batch operations appear in the audit log

## 11. Open Questions
- Should batch operations support conditional logic (e.g., "set X only where Y = Z")?
- What is the maximum batch size before performance concerns?
- Should CSV import support adding new metadata fields not in the current schema?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
