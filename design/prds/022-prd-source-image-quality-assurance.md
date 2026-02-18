# PRD-022: Source Image Quality Assurance

## 1. Introduction/Overview
High-quality seed images lead to more stable video generation. A blurry or off-center source image produces consistently bad results across dozens of scene videos. This PRD provides automated and manual quality checks on source and variant images before they enter the generation pipeline, catching quality issues at the image stage (seconds of GPU time) to prevent wasting hours of video generation time.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model)
- **Depended on by:** PRD-21, PRD-67
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Validate resolution, format, and aspect ratio requirements.
- Confirm face detection, centering, and minimum size.
- Provide automated quality scoring (sharpness, lighting, artifacts).
- Enable likeness comparison between source and derived variants.

## 4. User Stories
- As a Creator, I want automatic resolution and format validation so that I know immediately if my source image meets the pipeline requirements.
- As a Creator, I want face detection confirmation so that I know the face is properly detectable before proceeding.
- As a Creator, I want a quality score for sharpness and lighting so that I can identify images that might cause generation problems.
- As a Reviewer, I want likeness comparison between source and variant so that I can verify the variant preserves the character's identity.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Resolution & Format Validation
**Description:** Verify minimum requirements for the generation workflow.
**Acceptance Criteria:**
- [ ] Minimum resolution requirement configurable per workflow
- [ ] Aspect ratio validation against expected range
- [ ] Format validation (PNG, JPEG, WebP supported)
- [ ] Clear error messages for validation failures

#### Requirement 1.2: Face Detection & Centering
**Description:** Confirm face presence and positioning.
**Acceptance Criteria:**
- [ ] Face detection confirms at least one face is present
- [ ] Face centering check (face is within the center zone)
- [ ] Minimum face size check (face occupies sufficient percentage of image)
- [ ] Auto-crop suggestion if face is off-center

#### Requirement 1.3: Quality Scoring
**Description:** Automated assessment of image quality.
**Acceptance Criteria:**
- [ ] Sharpness score (blur detection)
- [ ] Lighting consistency assessment
- [ ] Artifact presence detection
- [ ] Overall quality score: pass/warn/fail with numeric values

#### Requirement 1.4: Likeness Comparison
**Description:** Compare derived variant against source image.
**Acceptance Criteria:**
- [ ] Side-by-side overlay/comparison view
- [ ] Similarity score using face embeddings (PRD-76)
- [ ] Flag variants that deviate significantly from source
- [ ] Approval gates based on likeness threshold

#### Requirement 1.5: Batch Validation
**Description:** Run quality checks across all characters in a project.
**Acceptance Criteria:**
- [ ] One-click validation of all source/variant images in a project
- [ ] Report: pass/warn/fail per image per check
- [ ] Sort results by quality score (worst first)
- [ ] Export report as CSV

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom Quality Rules
**Description:** Studio-defined quality check rules.
**Acceptance Criteria:**
- [ ] Configurable thresholds per check type
- [ ] Custom checks via hook scripts (PRD-77)

## 6. Non-Goals (Out of Scope)
- Image editing or correction (covered by PRD-21 external edit loop)
- Face embedding extraction (covered by PRD-76)
- Video quality assessment (covered by PRD-49)

## 7. Design Considerations
- Quality results should appear on the image upload flow immediately.
- Pass/warn/fail should use traffic-light colors (green/yellow/red).
- Likeness comparison should support overlay, side-by-side, and slider modes.

## 8. Technical Considerations
- **Stack:** Python (OpenCV, PIL) via PRD-09 runtime for image analysis, Rust for orchestration
- **Existing Code to Reuse:** PRD-76 face detection, PRD-09 Python runtime
- **New Infrastructure Needed:** Image QA service, quality scoring algorithms, batch runner
- **Database Changes:** `image_quality_scores` table (image_id, check_type, score, status, details)
- **API Changes:** POST /images/:id/qa, GET /images/:id/qa-results, POST /projects/:id/batch-qa

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Quality checks complete in <3 seconds per image
- Resolution/format validation catches 100% of non-compliant images
- Face detection catches >95% of images with missing or poorly positioned faces
- Batch validation processes 100 images in <5 minutes

## 11. Open Questions
- What minimum resolution should be the default?
- Should quality scoring use ML-based assessment or traditional metrics?
- How should the system handle images that pass all checks but look subjectively poor?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
