# PRD-059: Multi-Resolution Pipeline

## 1. Introduction/Overview
This PRD changes the economics of experimentation. Iterating on creative direction at Draft resolution (512px), then upscaling only approved work to Production (1080p), can reduce total GPU time by 60-80% across a project lifecycle. Most creative decisions (motion quality, face stability, style match) are visible at 512px. This PRD defines resolution tiers, tier selection per job, upscale triggering, quality comparison, and tier tracking.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-24 (Generation Loop), PRD-36 (Sync-Play), PRD-39 (Delivery)
- **Depended on by:** PRD-65 (Regression Testing)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Define named resolution tiers (Draft, Preview, Production) with custom tier support.
- Enable tier selection per job submission, defaulting to Draft for new/experimental work.
- Provide one-click upscale from Draft/Preview to Production after review approval.
- Enforce that only Production-tier scenes are included in final delivery exports.

## 4. User Stories
- As a Creator, I want to generate at Draft resolution first so that creative iteration is 5x faster and cheaper.
- As a Creator, I want to upscale approved scenes to Production with one click so that the final output meets delivery requirements.
- As a Creator, I want side-by-side comparison of Draft vs. Production so that I verify the upscale didn't introduce issues.
- As an Admin, I want the delivery pipeline to reject non-Production scenes so that we never ship low-resolution content.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Resolution Tiers
**Description:** Named resolution presets.
**Acceptance Criteria:**
- [ ] Built-in tiers: Draft (512px), Preview (768px), Production (1080p)
- [ ] Custom tiers configurable by Admin
- [ ] Each tier defines resolution, quality settings, and estimated speed factor

#### Requirement 1.2: Tier Selection per Job
**Description:** Choose resolution when submitting scenes.
**Acceptance Criteria:**
- [ ] Tier selectable individually or via PRD-57 batch submission
- [ ] Default: Draft for new/experimental work
- [ ] Cost display shows estimated time and disk space per tier
- [ ] Tier selection stored with the job for tracking

#### Requirement 1.3: Upscale Trigger
**Description:** One-click re-generation at full resolution.
**Acceptance Criteria:**
- [ ] After Draft/Preview review passes, trigger Production re-generation
- [ ] Re-runs same workflow with identical seeds and parameters at higher resolution
- [ ] Links the Production output to the Draft that was approved
- [ ] Progress tracking during upscale

#### Requirement 1.4: Quality Comparison
**Description:** Side-by-side playback of different tiers.
**Acceptance Criteria:**
- [ ] Compare Draft vs. Production using PRD-36 Sync-Play
- [ ] Verify upscale didn't introduce resolution-dependent issues
- [ ] Quality scores shown for both versions

#### Requirement 1.5: Tier Tracking & Delivery Enforcement
**Description:** Every segment records its tier; delivery enforces Production.
**Acceptance Criteria:**
- [ ] Resolution tier recorded per scene and segment
- [ ] PRD-39 delivery pipeline enforces Production-tier only in final exports
- [ ] Clear warning if attempting to deliver non-Production content

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Progressive Upscaling
**Description:** Automatically upscale approved Draft scenes without manual trigger.
**Acceptance Criteria:**
- [ ] Auto-queue Production generation when Draft is approved

## 6. Non-Goals (Out of Scope)
- Super-resolution / AI upscaling of existing content
- Resolution changes within a single scene (all segments same tier)

## 7. Design Considerations
- Tier indicator should be visible on every scene/segment card (badge: "Draft", "Production").
- Upscale button should be prominent on approved Draft scenes.

## 8. Technical Considerations
- **Stack:** Same generation pipeline with resolution parameter override
- **Existing Code to Reuse:** PRD-24 pipeline, PRD-36 comparison
- **New Infrastructure Needed:** Tier management, upscale orchestrator
- **Database Changes:** `resolution_tier` column on scenes and segments
- **API Changes:** POST /scenes/:id/upscale, GET /resolution-tiers

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Draft generation is 3-5x faster than Production for the same workflow
- Upscale produces consistent results with the Draft version
- Delivery pipeline correctly rejects non-Production content

## 11. Open Questions
- Do all ComfyUI workflows behave identically at different resolutions?
- Should Draft-tier quality scores be adjusted for the lower resolution?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
