# PRD-013: Dual-Metadata System (JSON)

## 1. Introduction/Overview
The platform must generate structured JSON metadata files (`character_metadata` and `video_metadata`) that accompany every character in the delivery package. These files are required for downstream registration and consumption by future VFX/3D pipelines. This PRD defines the automated generation, schema, and lifecycle of these metadata JSON files.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-14 (Data Validation for schema enforcement), PRD-00 (Database integrity), PRD-01 (Data model)
- **Depended on by:** None directly (consumed by delivery packaging PRD-39)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Automatically generate `character_metadata.json` and `video_metadata.json` for each character.
- Define the schema for both metadata types with required and optional fields.
- Keep metadata files synchronized with database records.
- Ensure metadata files are included in every delivery package.

## 4. User Stories
- As a Creator, I want character metadata to be automatically generated from the database so that I don't need to manually create JSON files.
- As an Admin, I want a defined schema for metadata files so that downstream consumers can rely on a consistent structure.
- As a Creator, I want metadata files to update when I edit character data so that the delivery package always reflects the latest information.
- As a Reviewer, I want to preview the metadata JSON before delivery so that I can verify its accuracy.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Character Metadata Generation
**Description:** Automated generation of character_metadata.json from database records.
**Acceptance Criteria:**
- [ ] Character metadata JSON is generated from the character's database record
- [ ] Includes: name, biographical data, physical attributes, and custom metadata fields
- [ ] Schema validation (PRD-14) ensures all required fields are present
- [ ] Regenerated when character metadata is edited

#### Requirement 1.2: Video Metadata Generation
**Description:** Automated generation of video_metadata.json with technical video information.
**Acceptance Criteria:**
- [ ] Video metadata includes: scene type, duration, resolution, codec, segment count, generation parameters
- [ ] Metadata is generated after scene assembly (PRD-39)
- [ ] Includes quality scores from auto-QA (PRD-49) when available
- [ ] Tracks provenance (which workflow, model, LoRA versions were used)

#### Requirement 1.3: Metadata Synchronization
**Description:** Keep metadata files in sync with database records.
**Acceptance Criteria:**
- [ ] Metadata files are regenerated when source data changes
- [ ] Stale metadata detection: flag files that are out of sync with the database
- [ ] Batch regeneration available for all characters in a project

#### Requirement 1.4: Delivery Integration
**Description:** Metadata files are included in every delivery package.
**Acceptance Criteria:**
- [ ] `metadata.json` is included in each character's delivery folder
- [ ] Delivery validation (PRD-39) checks metadata file presence and schema compliance
- [ ] Missing metadata blocks delivery with a clear error

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom Metadata Extensions
**Description:** Support studio-defined custom fields in the metadata schema.
**Acceptance Criteria:**
- [ ] Admin can add custom fields to the metadata schema
- [ ] Custom fields are included in generated JSON files

## 6. Non-Goals (Out of Scope)
- Metadata editing UI (covered by PRD-66)
- Schema validation logic (covered by PRD-14)
- Delivery packaging (covered by PRD-39)

## 7. Design Considerations
- Metadata JSON should be human-readable (pretty-printed with indentation).
- A preview panel should show the current metadata JSON for a character.

## 8. Technical Considerations
- **Stack:** Rust for JSON generation, serde for serialization, JSONSchema for validation
- **Existing Code to Reuse:** PRD-14 validation layer
- **New Infrastructure Needed:** Metadata generation service, schema definition files
- **Database Changes:** None (reads from existing character and scene tables)
- **API Changes:** GET /characters/:id/metadata/preview, POST /characters/:id/metadata/regenerate

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- 100% of delivered characters include valid metadata.json files
- Metadata regeneration completes in <1 second per character
- Zero schema violations in generated metadata files
- Metadata sync detects all out-of-date files within 1 minute of source data change

## 11. Open Questions
- Should metadata files be versioned alongside the character data?
- What is the canonical schema for video_metadata.json?
- Should metadata include references to related characters (e.g., for multi-character scenes)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
