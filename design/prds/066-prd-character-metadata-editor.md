# PRD-066: Character Metadata Editor

## 1. Introduction/Overview
Character metadata is a parallel data track to video generation, but it's part of the delivery package (metadata.json in the ZIP). Without a dedicated editor, metadata entry happens through raw JSON editing or external scripts. This PRD provides a dedicated UI for viewing and editing character metadata with form view, spreadsheet view, and bulk editing modes, with real-time schema validation and completeness tracking.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-14 (Data Validation for schema rules)
- **Depended on by:** PRD-67 (Bulk Character Onboarding)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Provide form view for per-character detail editing with schema validation.
- Provide spreadsheet view for efficient cross-character bulk editing.
- Track metadata completeness with progress indicators.
- Support CSV/JSON import/export for external editing workflows.

## 4. User Stories
- As a Creator, I want a structured form for editing character metadata so that I see which fields are required and what values are valid.
- As a Creator, I want a spreadsheet view of all characters so that I can fill in the same field across many characters quickly.
- As a Creator, I want to see a completeness indicator per character so that I know which characters have missing required fields.
- As a Creator, I want to export metadata to CSV, edit in Excel, and re-import so that I can use familiar spreadsheet tools for bulk data entry.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Form View
**Description:** Per-character detail form with grouped, typed fields.
**Acceptance Criteria:**
- [ ] Fields grouped by category (biographical, physical, preferences)
- [ ] Field types enforce schema: text, number, date, single-select, multi-select
- [ ] Real-time validation against PRD-14 schema rules
- [ ] Required fields clearly marked; validation errors shown inline

#### Requirement 1.2: Spreadsheet View
**Description:** All characters as rows, metadata fields as columns.
**Acceptance Criteria:**
- [ ] Inline editing directly in cells
- [ ] Sorting by any column
- [ ] Filtering by field values
- [ ] Column resizing and reordering

#### Requirement 1.3: Bulk Edit
**Description:** Edit a field across multiple selected characters.
**Acceptance Criteria:**
- [ ] Select multiple characters (checkboxes or Shift+click)
- [ ] Edit a field, apply to all selected
- [ ] Confirmation dialog showing how many characters will be affected
- [ ] Integrated with PRD-51 undo system

#### Requirement 1.4: Import/Export
**Description:** CSV and JSON import/export for external editing.
**Acceptance Criteria:**
- [ ] Export all metadata for a project as CSV or JSON
- [ ] Import from CSV/JSON with PRD-14 validation
- [ ] Import shows diff view: current vs. incoming values
- [ ] Commit or cancel after review

#### Requirement 1.5: Completeness Indicator
**Description:** Per-character progress tracking for metadata fields.
**Acceptance Criteria:**
- [ ] Progress bar showing required fields filled vs. total required
- [ ] Visual flags for missing required fields
- [ ] Project-level summary: "7 of 10 characters have complete metadata"
- [ ] Completeness state blocks delivery if not 100% (configurable)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Diff View on Import
**Description:** Side-by-side comparison of current vs. incoming metadata on import.
**Acceptance Criteria:**
- [ ] Field-level diff highlighting for each character
- [ ] Batch accept/reject per field or per character

## 6. Non-Goals (Out of Scope)
- Metadata schema definition (covered by PRD-14)
- Metadata JSON generation (covered by PRD-13)
- Batch metadata operations across projects (covered by PRD-88)

## 7. Design Considerations
- Switching between form and spreadsheet view should preserve the current selection/scroll.
- Required fields with missing values should use a red border or background.
- The spreadsheet should support keyboard navigation (Tab to next cell, Enter to edit).

## 8. Technical Considerations
- **Stack:** React with a data grid library (AG Grid or similar) for spreadsheet view
- **Existing Code to Reuse:** PRD-14 validation rules, PRD-29 form components
- **New Infrastructure Needed:** Metadata editor component, CSV parser, diff view
- **Database Changes:** None (reads/writes existing character metadata)
- **API Changes:** GET /characters/:id/metadata, PUT /characters/:id/metadata, POST /characters/metadata/export, POST /characters/metadata/import

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Form validation provides feedback within 200ms of field change
- Spreadsheet view handles 200+ characters without performance degradation
- CSV round-trip (export -> edit -> re-import) preserves all data types correctly
- Completeness tracking accurately reflects required field status

## 11. Open Questions
- Should the spreadsheet support formula calculations (e.g., derived fields)?
- How should the editor handle concurrent editing by multiple users?
- Should metadata field order be customizable per user or per project?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
