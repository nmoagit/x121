# PRD-086: Legacy Data Import & Migration Toolkit

## 1. Introduction/Overview
Any new platform faces the cold-start problem: studios have months or years of existing work in folder structures. If the only adoption path is "re-do everything through the platform," adoption is blocked. This PRD provides tools for importing existing completed work (videos, images, metadata) into the platform's data model through folder-structure inference, CSV metadata import, video/image registration, and incremental import support.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-60 (Character Library), PRD-66 (Metadata Editor), PRD-76 (Identity Embedding), PRD-79 (Duplicate Detection)
- **Depended on by:** None
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Enable import of existing output folder trees with automatic entity inference from path structure.
- Support CSV/spreadsheet metadata import with column mapping.
- Register existing videos as pre-approved scenes without re-generation.
- Provide gap analysis after import to identify missing data.

## 4. User Stories
- As an Admin, I want to point at our existing output folder and have the platform infer characters and scene types from the path structure so that migration doesn't require manual data entry.
- As an Admin, I want to import our character metadata from a CSV spreadsheet so that existing data is preserved.
- As an Admin, I want existing final videos to be registered as completed scenes so that we don't need to re-generate already-approved work.
- As an Admin, I want a gap analysis after import so that I know exactly what's missing and can prioritize completion.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Folder-Structure Import
**Description:** Infer entities from existing folder trees.
**Acceptance Criteria:**
- [ ] Configurable path-to-entity mapping rules (e.g., `{character_name}/{scene_type}.mp4`)
- [ ] Preview inferred structure before committing
- [ ] Support common folder patterns out of the box
- [ ] Handle ambiguous mappings with user resolution

#### Requirement 1.2: Metadata CSV Import
**Description:** Import character metadata from spreadsheets.
**Acceptance Criteria:**
- [ ] Upload CSV with character metadata
- [ ] Column mapping UI: user's CSV headers -> platform metadata fields
- [ ] Match against existing characters by name or create new records
- [ ] Validation through PRD-14 before committing

#### Requirement 1.3: Video Registration
**Description:** Import existing videos as pre-approved scenes.
**Acceptance Criteria:**
- [ ] Import creates character, scene, and segment records pointing to existing files
- [ ] Imported scenes are marked as pre-approved (no re-generation needed)
- [ ] Technical metadata extracted automatically (duration, resolution, codec)
- [ ] Files are not moved or copied — platform references in-place

#### Requirement 1.4: Image Registration
**Description:** Import existing source and variant images.
**Acceptance Criteria:**
- [ ] Source images trigger face embedding extraction (PRD-76) automatically
- [ ] Duplicate detection (PRD-79) runs against existing and other imported characters
- [ ] Variant images are registered with their type (clothed, topless)
- [ ] Image quality checks from PRD-22 run on imported images

#### Requirement 1.5: Validation Report
**Description:** Gap analysis after import.
**Acceptance Criteria:**
- [ ] Report shows: characters missing metadata, scenes lacking source images, expected scene types with no video
- [ ] Checklist format for completing the migration
- [ ] Export as PDF/JSON for tracking
- [ ] Re-runnable to verify progress

#### Requirement 1.6: Incremental Import
**Description:** Support repeated imports as more data is discovered.
**Acceptance Criteria:**
- [ ] Previously imported entities matched and updated (not duplicated)
- [ ] New entities created alongside existing ones
- [ ] Matching uses entity IDs or configurable keys (name, path)
- [ ] Import log tracks all incremental runs

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Dry-Run Mode
**Description:** Preview everything without committing changes.
**Acceptance Criteria:**
- [ ] Full simulation of the import with detailed report
- [ ] No data written until explicitly committed

## 6. Non-Goals (Out of Scope)
- Folder-to-entity bulk import for new content (covered by PRD-16)
- Data validation logic (covered by PRD-14)
- Ongoing metadata management (covered by PRD-66)

## 7. Design Considerations
- Migration wizard should guide admins step by step: select source, configure mapping, preview, import.
- Gap analysis should be actionable: clicking a gap item should navigate to the entity that needs attention.
- Progress should be clearly tracked during long import operations.

## 8. Technical Considerations
- **Stack:** Rust for file system scanning and entity creation, React for wizard UI
- **Existing Code to Reuse:** PRD-14 validation, PRD-76 embedding extraction, PRD-79 duplicate detection
- **New Infrastructure Needed:** Folder scanner, path mapping engine, import orchestrator, gap analyzer
- **Database Changes:** `import_runs` table (id, source_path, config, status, report_json, created_at)
- **API Changes:** POST /admin/import/scan, POST /admin/import/preview, POST /admin/import/commit, GET /admin/import/:id/report

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Folder-structure inference correctly maps >90% of common folder patterns
- CSV import correctly maps and validates all rows
- Zero data loss during legacy import (all files referenced, all metadata preserved)
- Gap analysis identifies 100% of missing data points

## 11. Open Questions
- Should legacy videos be re-encoded to match platform standards, or kept in their original format?
- How should the system handle legacy data that doesn't fit the platform's entity model?
- What is the maximum import size (number of files) the system should support?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
