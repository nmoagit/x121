# PRD-024: Recursive Video Generation Loop

## 1. Introduction/Overview
This is the core generation engine. The recursive last-frame chaining produces temporally coherent long-form video from a model that generates short clips. Segment 001 uses the scene's seed image; each subsequent segment uses the last frame of the previous segment. This PRD defines the seed-to-segment pipeline, boundary frame selection, duration accumulation, elastic duration, clothes-off transitions, parallel scene generation, and progress tracking.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-05 (ComfyUI Bridge), PRD-07 (Task Execution), PRD-21 (Source Images), PRD-23 (Scene Types), PRD-28 (Checkpointing)
- **Depended on by:** PRD-25, PRD-49, PRD-57, PRD-58, PRD-59, PRD-62, PRD-69
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Automate segment-by-segment video generation chaining outputs to inputs until target duration is met.
- Support intelligent boundary frame selection beyond just the literal last frame.
- Handle clothes-off transitions by switching seed images at configured segment boundaries.
- Enable parallel generation of independent scenes across available workers.

## 4. User Stories
- As a Creator, I want the system to automatically chain segments using last-frame extraction so that long videos are temporally coherent.
- As a Creator, I want elastic duration so that the final segment seeks a stable stopping point instead of cutting abruptly mid-motion.
- As a Creator, I want clothes-off transitions to switch the seed image at the right segment boundary so that the transition is smooth.
- As a Creator, I want parallel scene generation so that my 10 characters x 6 scene types run concurrently across available GPUs.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Seed-to-Segment Pipeline
**Description:** Segment 001 uses the seed image; subsequent segments chain from the previous output. Each segment selects the appropriate prompt type based on its position in the chain.
**Acceptance Criteria:**
- [ ] Segment 001 uses the approved variant from PRD-21 as seed
- [ ] Each subsequent segment uses the extracted last frame of the previous segment
- [ ] Seed frame extraction is automatic after each segment completes
- [ ] Extracted frames are stored as reference images
- [ ] Prompt type selection per segment position (from PRD-23 Requirement 1.3):
  - Single-segment scenes use `full_clip` prompt
  - First segment in a multi-segment chain uses `start_clip` prompt (falls back to `full_clip` if not defined)
  - Subsequent segments in a chain use `continuation_clip` prompt (falls back to `full_clip` if not defined)
- [ ] Selected prompt type is recorded in segment metadata for provenance

#### Requirement 1.2: Boundary Frame Selection
**Description:** Choose the optimal frame from the end of a segment as the seed for the next.
**Acceptance Criteria:**
- [ ] Automatic mode: pick the lowest-motion frame in the final N frames
- [ ] Manual mode: frame scrubber showing the final second with click-to-select
- [ ] Default mode: literal last frame
- [ ] Selected frame becomes both the seed for the next segment and the trim point

#### Requirement 1.3: Duration Accumulation
**Description:** Track cumulative duration and stop when target is met.
**Acceptance Criteria:**
- [ ] Cumulative duration tracked across all segments
- [ ] Generation stops when total meets or exceeds target duration (PRD-23)
- [ ] Segment count calculated from target_duration / segment_duration

#### Requirement 1.4: Elastic Duration
**Description:** Allow the final segment to seek a stable stopping point.
**Acceptance Criteria:**
- [ ] Tolerance window configurable (e.g., target 30s +/- 2s)
- [ ] Final segment prefers ending on a low-motion frame
- [ ] Avoids abrupt mid-motion cuts
- [ ] Actual final duration recorded per scene

#### Requirement 1.5: Clothes-Off Transition
**Description:** Switch seed image from clothed to topless at configured boundary.
**Acceptance Criteria:**
- [ ] At the configured segment boundary (from PRD-23), switch to topless variant
- [ ] Optionally use a different workflow for the transition segment
- [ ] Transition point is recorded in scene metadata
- [ ] Smooth visual transition between variants

#### Requirement 1.6: Parallel Scene Generation
**Description:** Independent scenes generate simultaneously across workers.
**Acceptance Criteria:**
- [ ] Scenes for different characters run concurrently
- [ ] Scenes for the same character with different scene types run concurrently
- [ ] No cross-scene dependencies
- [ ] Worker assignment via PRD-46 load balancing

#### Requirement 1.7: Progress Tracking
**Description:** Real-time generation progress per scene.
**Acceptance Criteria:**
- [ ] Progress: segments completed / segments estimated, cumulative / target duration
- [ ] Reported via PRD-10 event bus
- [ ] Visible in PRD-54 job tray
- [ ] Elapsed time and estimated remaining time per scene

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Adaptive Segment Duration
**Description:** Adjust segment duration based on content complexity.
**Acceptance Criteria:**
- [ ] High-motion scenes use shorter segments for better chaining
- [ ] Low-motion scenes use longer segments for efficiency

## 6. Non-Goals (Out of Scope)
- ComfyUI workflow execution (covered by PRD-05)
- Job scheduling (covered by PRD-08)
- Quality assessment (covered by PRD-49)
- Error recovery (covered by PRD-28)

## 7. Design Considerations
- Progress should show a visual segment strip that fills in as segments complete.
- Boundary frame selection (manual mode) should be a compact scrubber, not a full video player.
- Parallel execution status should be visible in the batch orchestrator (PRD-57).

## 8. Technical Considerations
- **Stack:** Rust orchestrator, FFmpeg for frame extraction, PRD-05 for ComfyUI execution
- **Existing Code to Reuse:** PRD-05 bridge, PRD-07 execution engine, PRD-28 checkpointing
- **New Infrastructure Needed:** Generation loop orchestrator, frame extractor, duration tracker
- **Database Changes:** Generation state tracking on segments (seed_frame_path, last_frame_path, cumulative_duration)
- **API Changes:** POST /scenes/:id/generate, GET /scenes/:id/progress, POST /segments/:id/select-boundary-frame

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Last-frame extraction completes in <2 seconds per segment
- Elastic duration produces final scenes within the configured tolerance
- Parallel generation achieves >90% GPU utilization across available workers
- Clothes-off transition switches at the exact configured segment boundary

## 11. Open Questions
- Should automatic boundary frame selection use motion analysis or a simpler heuristic?
- What is the maximum number of segments per scene before quality degrades?
- How should the system handle generation failures mid-chain (resume vs. restart)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
- **v1.1** (2026-02-19): Added position-based prompt type selection (full_clip, start_clip, continuation_clip) to Requirement 1.1, referencing PRD-23 v1.1
