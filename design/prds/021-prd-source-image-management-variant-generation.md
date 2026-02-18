# PRD-021: Source Image Management & Variant Generation

## 1. Introduction/Overview
The source image is the single point of truth for a character's likeness. This PRD manages the source image upload, automated variant generation (e.g., clothed from topless via ComfyUI), variant selection and approval, and an iterative external edit loop for manual refinement. Approved variants become the seed images that drive all downstream scene generation, so quality control at this stage prevents errors from propagating.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-22 (Source Image QA)
- **Depended on by:** PRD-23, PRD-24, PRD-57, PRD-58, PRD-60, PRD-67, PRD-69
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Manage source image upload with automatic face embedding extraction (PRD-76).
- Generate derived image variants via ComfyUI workflows.
- Support an iterative edit loop: generate, export for external editing, re-import, re-QA.
- Track variant provenance (generated vs. manually edited).

## 4. User Stories
- As a Creator, I want to upload a source image and have the platform generate clothed variants automatically so that I have seed images for scene generation.
- As a Creator, I want to review multiple generated variants and pick the best one so that only the highest quality variant is used for scenes.
- As a Creator, I want to export a variant for Photoshop editing and re-import the fixed version so that small artifacts can be corrected without repeated regeneration.
- As a Creator, I want the system to track whether a variant was AI-generated or manually edited so that provenance is clear.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Source Image Upload
**Description:** Upload the character's original reference image.
**Acceptance Criteria:**
- [ ] Upload with drag-and-drop or file browser
- [ ] Automatic face embedding extraction via PRD-76
- [ ] Duplicate detection via PRD-79
- [ ] Image preview with metadata display (dimensions, format, file size)

#### Requirement 1.2: Variant Generation
**Description:** Generate derived variants using ComfyUI workflows.
**Acceptance Criteria:**
- [ ] Select a variant type (e.g., clothed) and workflow
- [ ] Generate multiple variations for selection
- [ ] Generation uses PRD-07 background execution
- [ ] Progress tracking via PRD-54 job tray

#### Requirement 1.3: Variant Selection
**Description:** Review and approve generated variants.
**Acceptance Criteria:**
- [ ] Gallery view of all generated variants alongside source
- [ ] Click to select the "Hero" variant per type
- [ ] Only approved variants are available as scene seeds
- [ ] Rejected variants can be regenerated or deleted

#### Requirement 1.4: External Edit Loop
**Description:** Export, externally edit, and re-import variants.
**Acceptance Criteria:**
- [ ] Export variant at full resolution for external editing
- [ ] Re-import edited version as a replacement
- [ ] Re-imported image goes through PRD-22 quality checks
- [ ] Version history preserved: original generated + edited versions

#### Requirement 1.5: Manual Variant Upload
**Description:** Upload a manually prepared variant.
**Acceptance Criteria:**
- [ ] Upload a variant image prepared entirely outside the platform
- [ ] Variant goes through PRD-22 quality checks
- [ ] Provenance tracked as "manual upload"

#### Requirement 1.6: Variant Registry
**Description:** Track all variants per character with status and provenance.
**Acceptance Criteria:**
- [ ] Status per variant: pending, generated, editing, approved, rejected
- [ ] Workflow used for generation recorded
- [ ] Whether externally edited is tracked
- [ ] Variant history viewable per character

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Batch Variant Generation
**Description:** Generate variants for multiple characters simultaneously.
**Acceptance Criteria:**
- [ ] Select characters and trigger variant generation for all
- [ ] Parallel generation across available workers

## 6. Non-Goals (Out of Scope)
- Source image quality assessment logic (covered by PRD-22)
- Scene generation from variants (covered by PRD-24)
- Character library management (covered by PRD-60)

## 7. Design Considerations
- Variant gallery should show source and all variants side by side with large preview capability.
- The "Hero" selection should be prominent with a star or checkmark indicator.
- Export/re-import should be a clear round-trip flow in the UI.

## 8. Technical Considerations
- **Stack:** React for gallery UI, Rust for upload handling and workflow dispatch
- **Existing Code to Reuse:** PRD-05 ComfyUI bridge for generation, PRD-07 execution engine
- **New Infrastructure Needed:** Variant generation orchestrator, export/import handler, version storage
- **Database Changes:** `image_variants` table (character_id, type, status, workflow_id, provenance, file_path, version)
- **API Changes:** POST /characters/:id/source-image, POST /characters/:id/variants/generate, POST /characters/:id/variants/:id/approve

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Source image upload and embedding extraction completes in <10 seconds
- Variant generation dispatches within 2 seconds of request
- External edit round-trip preserves image quality (no degradation from re-import)
- 100% of variants have correct provenance tracking

## 11. Open Questions
- Should the platform support more than two variant types (clothed/topless)?
- How many variant candidates should be generated per request?
- Should variant approval trigger automatic scene generation, or require a separate step?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
