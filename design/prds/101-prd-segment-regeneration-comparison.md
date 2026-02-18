# PRD-101: Segment Regeneration Comparison

## 1. Introduction/Overview
Regeneration is the most common response to a rejected segment, and "Is the new version better?" is the immediate next question. PRD-50 provides a full git-like branching system, but it's heavyweight for the simple case of "I regenerated this one segment — is it better?" This PRD provides automatic side-by-side comparison of old vs. new versions with synchronized playback, difference highlighting, QA score comparison, and quick accept/revert actions — answering the comparison question in 5 seconds with zero navigation overhead.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-35 (Review Interface), PRD-49 (Automated Quality Gates for QA scores), PRD-50 (Content Branching for "Keep Both" action), PRD-83 (Video Playback Engine)
- **Depended on by:** PRD-92 (Batch Review for batch comparison workflows)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Auto-present comparison view when a rejected segment is regenerated.
- Enable synchronized playback with optional difference highlighting.
- Show QA score comparison for objective quality assessment.
- Support quick accept/revert decisions and version history browsing.

## 4. User Stories
- As a Creator, I want automatic side-by-side comparison when I regenerate a segment so that I can immediately see if the new version is better.
- As a Reviewer, I want synchronized playback of old and new versions so that I can spot differences in real time.
- As a Reviewer, I want QA score comparison so that I can objectively quantify whether regeneration improved quality.
- As a Creator, I want version history browsing so that if the third attempt is worse than the second, I can recover the second.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Auto-Trigger Comparison
**Description:** Automatic comparison view on regeneration.
**Acceptance Criteria:**
- [ ] When a rejected segment is regenerated, system presents comparison view
- [ ] Old version on the left, new version on the right
- [ ] No manual navigation required — comparison appears automatically

#### Requirement 1.2: Synchronized Playback
**Description:** Both versions play in sync.
**Acceptance Criteria:**
- [ ] Play, pause, scrub, and frame-step controls affect both simultaneously
- [ ] Uses PRD-83 engine for frame-accurate synchronization
- [ ] Individual volume controls per side

#### Requirement 1.3: Difference Highlighting
**Description:** Visual difference overlay.
**Acceptance Criteria:**
- [ ] Optional SSIM-based difference overlay showing regions of maximum divergence
- [ ] Heat map mode: blue = identical, red = maximum difference
- [ ] Toggleable on/off to avoid visual clutter

#### Requirement 1.4: Quick Actions
**Description:** One-click comparison decisions.
**Acceptance Criteria:**
- [ ] "Keep New" — approve the regeneration
- [ ] "Revert to Old" — restore the previous version
- [ ] "Keep Both" — create a branch via PRD-50 for later comparison
- [ ] Single keyboard shortcut for each action

#### Requirement 1.5: Version History
**Description:** Browse all previous versions.
**Acceptance Criteria:**
- [ ] Filmstrip showing all previous versions of a segment
- [ ] Select any two versions for side-by-side comparison
- [ ] Version metadata: generation date, parameters used, QA scores

#### Requirement 1.6: QA Score Comparison
**Description:** Objective quality metrics side by side.
**Acceptance Criteria:**
- [ ] Show PRD-49 auto-QA scores for both versions
- [ ] Format: "Old: face 0.82, motion 0.71. New: face 0.89, motion 0.68"
- [ ] Color-coded: green for improved metrics, red for degraded

#### Requirement 1.7: Batch Comparison
**Description:** Sequential comparison when multiple segments regenerated.
**Acceptance Criteria:**
- [ ] When multiple segments are regenerated at once (e.g., after a LoRA update), present sequential comparison workflow
- [ ] Review each regenerated segment one by one
- [ ] Accept/revert each with progress tracking
- [ ] Summary at the end: "Kept new: 8, Reverted: 2"

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: A/B Blind Test
**Description:** Randomized blind comparison.
**Acceptance Criteria:**
- [ ] Display both versions without labeling which is old/new
- [ ] User picks the "better" version blindly
- [ ] Results reveal which version was preferred

## 6. Non-Goals (Out of Scope)
- Content branching system (covered by PRD-50)
- Automated quality gates (covered by PRD-49)
- Regeneration decision logic (covered by PRD-71)

## 7. Design Considerations
- Comparison view should be the default view after regeneration — not an opt-in.
- Difference overlay should be visually distinct from the video content.
- Quick action buttons should be prominently placed and keyboard-accessible.

## 8. Technical Considerations
- **Stack:** React comparison layout, PRD-83 dual video player instances, SSIM computation (server-side or WebAssembly)
- **Existing Code to Reuse:** PRD-83 video playback engine, PRD-36 sync-play coordinator, PRD-49 QA scores
- **New Infrastructure Needed:** Comparison view component, SSIM difference calculator, version filmstrip browser
- **Database Changes:** `segment_versions` table (segment_id, version_number, video_path, qa_scores_json, params_json, created_at, selected)
- **API Changes:** GET /segments/:id/versions, GET /segments/:id/compare?v1=1&v2=2, GET /segments/:id/versions/:v/diff-overlay, POST /segments/:id/versions/:v/select

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Comparison view renders within 2 seconds of regeneration completion
- Synchronized playback maintains frame-level accuracy between both versions
- SSIM difference overlay renders in <5 seconds per comparison
- Users make accept/revert decisions in <10 seconds on average

## 11. Open Questions
- How many versions should be retained before the oldest is purged?
- Should the comparison view support audio comparison for segments with audio tracks?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
