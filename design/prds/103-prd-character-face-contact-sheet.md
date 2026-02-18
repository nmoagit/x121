# PRD-103: Character Face Contact Sheet

## 1. Introduction/Overview
PRD-94 provides numerical consistency scores, but humans assess face consistency visually, not numerically. A creative director glancing at a tiled grid of 14 face crops immediately spots the one that looks different — this takes 2 seconds versus reading a report. This PRD provides automated face crop extraction and tiled display across all of a character's scenes, with comparison overlays and outlier highlighting.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-49 (Quality Gates for face confidence), PRD-76 (Identity Embedding), PRD-94 (Consistency Report), PRD-96 (Poster Frames)
- **Depended on by:** PRD-72 (Project Lifecycle)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Automatically extract face crops from representative frames across all scenes.
- Display as a tiled grid: columns per scene type, rows per variant.
- Highlight outlier cells using consistency scores from PRD-94.
- Support batch contact sheets and historical comparison.

## 4. User Stories
- As a Reviewer, I want a tiled grid of face crops from all scenes so that I can visually assess consistency in 2 seconds.
- As a Reviewer, I want outlier cells highlighted so that I immediately see which scenes look different.
- As a Reviewer, I want to overlay the source image face as a reference so that I can see deviations clearly.
- As an Admin, I want batch contact sheets for all characters as a multi-page PDF for stakeholder meetings.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Face Extraction
**Description:** Extract face crops from best frames across all scenes.
**Acceptance Criteria:**
- [ ] Extract from poster frame (PRD-96) or highest face confidence frame (PRD-49)
- [ ] Consistent padding ratio around face crop
- [ ] Stored as lightweight images for fast display

#### Requirement 1.2: Tiled Grid Display
**Description:** Grid of face crops organized by scene type and variant.
**Acceptance Criteria:**
- [ ] Columns: scene types; Rows: variants (clothed/topless)
- [ ] Scene type and variant labels for orientation
- [ ] Instant visual scan capability

#### Requirement 1.3: Comparison Overlay
**Description:** Source image face as semi-transparent reference.
**Acceptance Criteria:**
- [ ] Toggle overlay showing PRD-76 identity embedding source face
- [ ] Semi-transparent overlay on each cell
- [ ] Deviations immediately visible through the overlay

#### Requirement 1.4: Outlier Highlighting
**Description:** Visual marking of consistency outliers.
**Acceptance Criteria:**
- [ ] Cells below similarity threshold (from PRD-94) highlighted with colored border
- [ ] Clicking highlighted cell navigates to scene review

#### Requirement 1.5: Export
**Description:** Export contact sheet as image or PDF.
**Acceptance Criteria:**
- [ ] Single PNG or PDF per character
- [ ] Includes character name, project, and generation date
- [ ] Batch export: multi-page PDF, one page per character

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Historical Comparison
**Description:** Compare contact sheets before and after re-generation.
**Acceptance Criteria:**
- [ ] Side-by-side: "before" vs. "after" contact sheets

## 6. Non-Goals (Out of Scope)
- Numerical consistency analysis (covered by PRD-94)
- Face embedding extraction (covered by PRD-76)
- Poster frame selection (covered by PRD-96)

## 7. Design Considerations
- Grid cells should be large enough for face detail but compact enough to fit 14+ cells on screen.
- Outlier borders should use a high-contrast color (red or orange).

## 8. Technical Considerations
- **Stack:** Python (OpenCV) for face cropping, React for grid display, PDF generation library
- **Existing Code to Reuse:** PRD-76 face detection, PRD-49 quality scores, PRD-94 consistency data
- **New Infrastructure Needed:** Face cropper, grid renderer, PDF exporter
- **Database Changes:** `contact_sheet_images` table (character_id, scene_id, crop_path)
- **API Changes:** POST /characters/:id/contact-sheet, GET /characters/:id/contact-sheet/image, POST /projects/:id/batch-contact-sheets

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Contact sheet generates in <10 seconds per character
- Grid renders in <1 second in the browser
- Outlier highlighting correctly matches PRD-94 consistency scores
- Batch PDF export completes in <2 minutes for 20 characters

## 11. Open Questions
- What face crop size and padding ratio produces the best visual comparison?
- Should the contact sheet include non-face metadata (e.g., scene name, QA score)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
