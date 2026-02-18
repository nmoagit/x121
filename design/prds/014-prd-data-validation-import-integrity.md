# PRD-014: Data Validation & Import Integrity

## 1. Introduction/Overview
PRD-00 mandates strict integrity at the database level, but data enters the system through multiple paths: bulk import, manual edit, API, and script output. A dedicated validation layer at the ingestion boundary catches problems before they reach the database, providing user-friendly feedback rather than cryptic constraint errors. This PRD defines schema validation, import preview, conflict detection, and validation reporting.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-00 (Database Normalization), PRD-01 (Data Model)
- **Depended on by:** PRD-13, PRD-16, PRD-66
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Define schema rules (required fields, type constraints, value ranges) per entity type.
- Provide dry-run import preview showing what will be created/updated/skipped.
- Detect and surface conflicts between imported data and existing records.
- Generate per-import validation reports with errors, warnings, and auto-corrections.

## 4. User Stories
- As a Creator, I want to preview what an import will do before committing so that I can catch mistakes before they affect production data.
- As a Creator, I want clear validation error messages so that I know exactly which fields have issues and how to fix them.
- As an Admin, I want conflict detection between imported JSON and existing records so that I can choose whether to keep the DB value, the file value, or merge them.
- As a Creator, I want a validation report after every import so that I have a complete record of what was accepted, rejected, and corrected.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Schema Rules
**Description:** Define validation rules per entity type.
**Acceptance Criteria:**
- [ ] Required fields, type constraints, and value ranges defined for characters, scenes, and segments
- [ ] String fields have max length constraints
- [ ] Enum fields validate against allowed values
- [ ] Custom validation rules can be added per project

#### Requirement 1.2: Import Preview (Dry-Run)
**Description:** Show the impact of an import before committing.
**Acceptance Criteria:**
- [ ] Dry-run mode shows: entities to be created, updated, and skipped
- [ ] Field-level diff for updates (current value vs. incoming value)
- [ ] Validation errors highlighted with explanations
- [ ] User can proceed or cancel after review

#### Requirement 1.3: Conflict Detection
**Description:** Flag mismatches between imported data and existing records.
**Acceptance Criteria:**
- [ ] Detect when imported field values differ from existing DB values
- [ ] Resolution options: keep DB value, keep file value, or merge
- [ ] Batch conflict resolution for repeated patterns
- [ ] Conflict log included in the validation report

#### Requirement 1.4: Validation Reports
**Description:** Per-import summary of validation results.
**Acceptance Criteria:**
- [ ] Report includes: total records processed, accepted, rejected, and auto-corrected
- [ ] Each rejection includes the specific rule violated and the offending value
- [ ] Reports are stored and accessible for later review
- [ ] Reports can be exported as JSON or CSV

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom Validation Hooks
**Description:** Studio-defined validation rules executed as scripts.
**Acceptance Criteria:**
- [ ] Custom validation scripts run alongside built-in rules
- [ ] Scripts receive the entity data and return pass/fail with message

## 6. Non-Goals (Out of Scope)
- Database constraint definitions (covered by PRD-00)
- Bulk import UI (covered by PRD-16)
- Metadata editing UI (covered by PRD-66)

## 7. Design Considerations
- Validation errors should be inline — shown next to the offending field, not in a separate error list.
- The import preview should use a familiar diff view (green for additions, red for removals, yellow for changes).
- Validation reports should be printable/exportable for audit purposes.

## 8. Technical Considerations
- **Stack:** Rust validation service, JSONSchema or custom validation engine
- **Existing Code to Reuse:** PRD-00 database constraints as the final validation layer
- **New Infrastructure Needed:** Validation rule engine, import preview service, conflict resolver
- **Database Changes:** `validation_rules` table (entity_type, field, rule_type, config), `import_reports` table
- **API Changes:** POST /validate (dry-run), GET /imports/:id/report

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Validation catches 100% of schema violations before database insertion
- Import preview accurately predicts the outcome of the import
- Validation processing adds <500ms per 100 records
- Zero database constraint violations from validated imports

## 11. Open Questions
- Should validation rules be configurable by Creators, or Admin-only?
- How should auto-correction be handled (e.g., trimming whitespace, normalizing case)?
- What is the maximum import size (number of records) the preview can handle?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
