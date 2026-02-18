# PRD-016: Folder-to-Entity Bulk Importer

## 1. Introduction/Overview
Studios with existing content organized in folder structures need a fast way to bring that content into the platform. This PRD provides drag-and-drop import using folder paths for entity naming (e.g., `Jane/Bio` maps to Character "Jane" with metadata category "Bio"), with path-uniqueness logic to prevent accidental merging. All imports feed through PRD-14 validation before persistence.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-14 (Data Validation)
- **Depended on by:** None directly
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Enable bulk import from folder structures with automatic entity name derivation from paths.
- Handle path-uniqueness to prevent accidental merging of distinct entities.
- Validate all imported data through PRD-14 before persistence.
- Provide a preview step so users can verify the import mapping before committing.

## 4. User Stories
- As a Creator, I want to drag a folder of character images into the platform and have characters created automatically so that I avoid tedious manual data entry.
- As a Creator, I want the importer to use folder names as character names so that my existing naming convention is preserved.
- As an Admin, I want path-uniqueness validation so that `Jane/Bio` and `Bob/Bio` create two separate entities instead of accidentally merging.
- As a Creator, I want to preview the import mapping before committing so that I can correct any misinterpretations.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Folder-to-Entity Mapping
**Description:** Map folder paths to platform entities automatically.
**Acceptance Criteria:**
- [ ] Top-level folders map to character names
- [ ] Subfolder structure maps to entity categories (images, metadata, etc.)
- [ ] File extensions determine entity type (images, JSON, video)
- [ ] Mapping rules are configurable per import

#### Requirement 1.2: Path Uniqueness
**Description:** Prevent accidental merging of distinct entities.
**Acceptance Criteria:**
- [ ] Entities are uniquely identified by their full path, not just the final folder name
- [ ] Duplicate detection warns when the same name appears in multiple paths
- [ ] User can resolve duplicates: merge, rename, or skip

#### Requirement 1.3: Import Preview
**Description:** Show the mapping before committing.
**Acceptance Criteria:**
- [ ] Preview shows: folder path -> entity to be created/updated
- [ ] File count and size per entity
- [ ] Validation results from PRD-14 (errors, warnings)
- [ ] User can proceed, modify mapping, or cancel

#### Requirement 1.4: Validated Import
**Description:** All imported data passes through PRD-14 validation.
**Acceptance Criteria:**
- [ ] Every imported record goes through schema validation
- [ ] Validation errors are shown in the preview with explanations
- [ ] Invalid records can be skipped while importing valid ones
- [ ] Import report generated with complete results

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom Path Mapping Rules
**Description:** Configurable rules for path-to-entity mapping.
**Acceptance Criteria:**
- [ ] Regex-based path matching rules
- [ ] Named capture groups for entity field extraction

## 6. Non-Goals (Out of Scope)
- Legacy system migration (covered by PRD-86)
- Data validation logic (covered by PRD-14)
- Metadata editing (covered by PRD-66)

## 7. Design Considerations
- Drag-and-drop zone should be prominent and support folder dropping.
- Preview should use a tree view matching the folder structure with entity mapping annotations.
- Progress indicator during import with per-file status.

## 8. Technical Considerations
- **Stack:** React for drag-and-drop UI, Rust for file processing and entity creation
- **Existing Code to Reuse:** PRD-14 validation layer
- **New Infrastructure Needed:** Folder parser, path-to-entity mapper, import orchestrator
- **Database Changes:** None (creates records in existing entity tables)
- **API Changes:** POST /import/folder (multipart upload), GET /import/:id/preview, POST /import/:id/commit

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Bulk import of 100 files completes in <30 seconds (excluding validation)
- Path-uniqueness correctly detects all potential merge conflicts
- 100% of imported data passes through validation before persistence
- Zero accidental entity merges from duplicate folder names

## 11. Open Questions
- Should the importer support nested folder structures deeper than 2 levels?
- How should the system handle special characters in folder names?
- What is the maximum import size (number of files/folders)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
