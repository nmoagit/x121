# PRD-026: Temporal Continuity (Normalization & Sync)

## 1. Introduction/Overview
Long-form AI-generated video suffers from "subject drift" — the character's appearance gradually changes over many chained segments — and grain/texture flickering between segments. This PRD provides subject re-centering, latent texture synchronization, and likeness anchoring (using Seed A / the character's source image embedding) to maintain visual consistency across the entire scene duration.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-24 (Generation Loop), PRD-76 (Identity Embedding for likeness anchoring)
- **Depended on by:** None directly
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Prevent subject drift over long video durations through likeness anchoring.
- Normalize grain and texture between chained segments.
- Re-center subjects that drift spatially across segments.
- Maintain temporal coherence without sacrificing generation quality.

## 4. User Stories
- As a Creator, I want likeness anchoring so that the character's face remains consistent across all segments in a scene.
- As a Creator, I want grain normalization so that there are no visible texture changes between segments.
- As a Creator, I want subject re-centering so that the character stays centered throughout the video.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Likeness Anchoring
**Description:** Compare each segment against the source image embedding to detect drift.
**Acceptance Criteria:**
- [ ] Each segment's representative frame compared against PRD-76 identity embedding
- [ ] Drift score calculated and recorded per segment
- [ ] Warning when drift exceeds configurable threshold
- [ ] Anchoring parameters adjustable per scene type

#### Requirement 1.2: Latent Texture Sync
**Description:** Normalize texture/grain between segments.
**Acceptance Criteria:**
- [ ] Grain pattern analysis at segment boundaries
- [ ] Normalization applied to reduce visible texture differences
- [ ] Before/after comparison available for quality verification

#### Requirement 1.3: Subject Re-centering
**Description:** Correct spatial drift of the subject.
**Acceptance Criteria:**
- [ ] Subject position tracked across segments
- [ ] Re-centering applied when drift exceeds threshold
- [ ] Re-centering is subtle (no jarring jumps)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Adaptive Anchoring Strength
**Description:** Adjust anchoring strength based on scene type.
**Acceptance Criteria:**
- [ ] High-motion scenes use weaker anchoring to allow natural movement
- [ ] Static scenes use stronger anchoring for maximum consistency

## 6. Non-Goals (Out of Scope)
- Video generation itself (covered by PRD-24)
- Quality gate scoring (covered by PRD-49)
- Identity embedding extraction (covered by PRD-76)

## 7. Design Considerations
- Drift scores should be visualized as a trend line across segments in a scene.
- Normalization effects should be toggleable for A/B comparison.

## 8. Technical Considerations
- **Stack:** Python (OpenCV, NumPy) for image processing via PRD-09, face embedding comparison
- **Existing Code to Reuse:** PRD-76 identity embeddings, PRD-24 generation pipeline
- **New Infrastructure Needed:** Drift detector, texture normalizer, re-centering module
- **Database Changes:** `temporal_metrics` per segment (drift_score, centering_offset)
- **API Changes:** GET /scenes/:id/temporal-metrics

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Likeness drift reduced by >50% compared to unanchored generation
- Grain flickering at segment boundaries reduced to imperceptible levels
- Subject position variance reduced by >60% across long scenes

## 11. Open Questions
- What anchoring mechanism works best (latent space guidance vs. post-processing)?
- Should temporal continuity be applied during generation or as a post-processing step?
- How much computational overhead does likeness anchoring add per segment?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
