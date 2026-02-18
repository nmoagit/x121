# PRD-058: Scene Preview & Quick Test

## 1. Introduction/Overview
Full scene generation is expensive — 10+ segments, potentially 20+ minutes of GPU time. Discovering that a LoRA doesn't work with a particular face after 8 segments is wasteful. This PRD provides rapid single-segment preview generation to validate workflow/LoRA/prompt combinations at ~5% of the cost, with the option to promote successful test shots as the first segment of a full scene.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-21 (Source Images), PRD-23 (Scene Types), PRD-24 (Generation Loop), PRD-36 (Sync-Play for comparison)
- **Depended on by:** PRD-63 (Prompt Editor)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Generate single short segments (2-3s) for quick validation of configurations.
- Enable side-by-side comparison of test shots from different configurations.
- Persist test shots with parameters for experimentation history.
- Allow promotion of good test shots to become the first segment of a full scene.

## 4. User Stories
- As a Creator, I want a "Test Shot" button that generates a single segment so that I can validate a workflow cheaply.
- As a Creator, I want to compare test shots from different LoRA configurations side-by-side so that I pick the best one.
- As a Creator, I want to batch test a scene type across multiple characters so that I identify problematic characters early.
- As a Creator, I want to promote a good test shot as the first segment so that I don't re-generate what already looks great.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Test Shot Generation
**Description:** Generate a single short segment for preview.
**Acceptance Criteria:**
- [ ] "Test Shot" button on scene type configuration and scene views
- [ ] Generates one segment (2-3 seconds) using the scene's seed and workflow
- [ ] Result available in ~30 seconds (GPU-dependent)
- [ ] Uses the same pipeline as full generation (just stops after one segment)

#### Requirement 1.2: Side-by-Side Preview
**Description:** Compare test shots from different configurations.
**Acceptance Criteria:**
- [ ] Compare tests from different workflows/LoRAs using PRD-36 Sync-Play
- [ ] Parameters displayed alongside each test shot for reference
- [ ] Quick toggle between configurations

#### Requirement 1.3: Batch Test Shots
**Description:** Test a scene type across multiple characters.
**Acceptance Criteria:**
- [ ] Generate test shots for a scene type across selected characters in one action
- [ ] Gallery view of all test shots with character name and quality score
- [ ] Quickly identify characters with issues before full generation

#### Requirement 1.4: Preview Gallery
**Description:** Persist and browse test shots.
**Acceptance Criteria:**
- [ ] Test shots saved with their parameters (workflow, LoRA, prompt, seed)
- [ ] Gallery linked to scene type and character for context
- [ ] Searchable and sortable by date, character, or quality

#### Requirement 1.5: Promote to Scene
**Description:** Use a good test shot as the first segment.
**Acceptance Criteria:**
- [ ] "Promote" action on a test shot that has passed manual review
- [ ] Test shot becomes segment 001 of the actual scene
- [ ] Full generation continues from segment 002 using the test shot's last frame
- [ ] Saves the GPU time of re-generating the first segment

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Quick A/B Testing
**Description:** Generate two test shots with different seeds simultaneously.
**Acceptance Criteria:**
- [ ] Submit two test shots at once with different parameters
- [ ] Auto-compare results side by side

## 6. Non-Goals (Out of Scope)
- Full scene generation (covered by PRD-24)
- Multi-resolution pipeline (covered by PRD-59)
- Prompt editing (covered by PRD-63)

## 7. Design Considerations
- The "Test Shot" button should be prominent and always accessible in scene configuration.
- Test shot gallery should look like a visual experiment log.
- Promote action should confirm that this test shot will become part of the real scene.

## 8. Technical Considerations
- **Stack:** Same as PRD-24 but with early termination, React for gallery UI
- **Existing Code to Reuse:** PRD-24 generation pipeline (stop after one segment)
- **New Infrastructure Needed:** Test shot manager, promotion service, gallery storage
- **Database Changes:** `test_shots` table (id, scene_type_id, character_id, parameters, segment_path, quality_score)
- **API Changes:** POST /scenes/:id/test-shot, GET /test-shots/gallery, POST /test-shots/:id/promote

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Test shot generates in <60 seconds on available hardware
- Promotion correctly integrates the test shot as segment 001
- Preview gallery loads in <1 second with 50+ test shots
- Batch test shots parallelize across available workers

## 11. Open Questions
- Should test shots run at a lower resolution by default for speed?
- How long should test shots be retained before cleanup?
- Should test shots count against project budget (PRD-93)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
