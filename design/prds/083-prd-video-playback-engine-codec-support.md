# PRD-083: Video Playback Engine & Codec Support

## 1. Introduction/Overview
Every review and preview feature in the platform implicitly depends on a video player, but none of them define it. Frame-accurate seeking is non-negotiable for a QA tool — "the artifact is somewhere around 3 seconds in" is not professional-grade review. This PRD provides the foundational video player component with hardware-accelerated decoding, frame-accurate seeking, professional transport controls, A-B looping, adaptive bitrate preview, and audio management — serving as the engine underlying all review, preview, and comparison features.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-29 (Design System)
- **Depended on by:** PRD-35 (Review Interface), PRD-36 (Cinema Mode), PRD-37 (QA Visual Aids), PRD-55 (Director's View), PRD-68 (Cross-Character Comparison), PRD-78 (Segment Trimming), PRD-82 (Content Sensitivity), PRD-84 (External Review Links)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Support H.264, H.265/HEVC, VP9, and AV1 codecs with graceful fallback.
- Deliver frame-accurate seeking (no nearest-keyframe approximation).
- Provide professional playback controls including speed adjustment, A-B loops, and frame stepping.
- Optimize performance: first frame in <200ms, smooth playback at target framerate.

## 4. User Stories
- As a Reviewer, I want frame-accurate seeking so that I can inspect single-frame artifacts exactly where they occur.
- As a Reviewer, I want A-B loop playback so that I can repeatedly view a specific range to assess transition boundaries.
- As a Creator, I want hardware-accelerated decoding so that playback is smooth even for high-resolution content.
- As a Reviewer, I want playback speed control from 0.1x to 4x so that I can slow-motion through subtle artifacts or fast-forward through clean sections.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Codec Support
**Description:** Decode multiple video formats with graceful fallback.
**Acceptance Criteria:**
- [ ] Decode H.264, H.265/HEVC, VP9, and AV1
- [ ] Graceful fallback when hardware acceleration is unavailable for a given codec
- [ ] Clear error message (not silent failure) when a video uses an unsupported codec

#### Requirement 1.2: Hardware-Accelerated Decoding
**Description:** Leverage GPU decoding via WebCodecs API.
**Acceptance Criteria:**
- [ ] Use WebCodecs API where available for GPU-accelerated decoding
- [ ] Fallback to software decoding for unsupported formats
- [ ] Runtime capability detection selects the optimal decode path

#### Requirement 1.3: Frame-Accurate Seeking
**Description:** Exact frame delivery for QA work.
**Acceptance Criteria:**
- [ ] Seek to any individual frame by frame number or timecode (HH:MM:SS:FF)
- [ ] No nearest-keyframe approximation — exact frame delivery
- [ ] Frame counter display showing current frame number and total frames

#### Requirement 1.4: Playback Speed Control
**Description:** Continuous speed adjustment with frame stepping.
**Acceptance Criteria:**
- [ ] Continuous speed from 0.1x to 4x
- [ ] Frame-by-frame stepping forward and backward (integrated with PRD-37 jog dial)
- [ ] Keyboard shortcuts for common speeds: 1x, 0.5x, 0.25x, 2x

#### Requirement 1.5: A-B Loop
**Description:** Repeated playback of a specific range.
**Acceptance Criteria:**
- [ ] Set loop in-point and out-point
- [ ] Repeated playback within the defined range
- [ ] Clear visual markers on the timeline scrubber for in/out points

#### Requirement 1.6: Adaptive Bitrate Preview
**Description:** Lower-resolution proxy for browsing, full quality on demand.
**Acceptance Criteria:**
- [ ] Serve lower-resolution proxy versions for library browsing and dashboard thumbnails
- [ ] Full-quality playback on demand in the Review Interface (PRD-35)
- [ ] Seamless quality transition without playback interruption

#### Requirement 1.7: Audio Track Management
**Description:** Audio playback and control.
**Acceptance Criteria:**
- [ ] Play, mute, or select audio tracks when present
- [ ] Volume control with waveform visualization
- [ ] Audio follows playback speed with pitch correction
- [ ] Support for audio scrubbing/vinyl mode (PRD-37)

#### Requirement 1.8: Thumbnail Generation
**Description:** Extract representative frames from video files.
**Acceptance Criteria:**
- [ ] Extract thumbnails at configurable intervals
- [ ] Used by library views, dashboard (PRD-42), and comparison grids (PRD-68)
- [ ] Thumbnails cached for performance

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: HDR Support
**Description:** HDR video playback on compatible displays.
**Acceptance Criteria:**
- [ ] Detect HDR capability and render appropriately
- [ ] Tone-mapping fallback for SDR displays

## 6. Non-Goals (Out of Scope)
- Video editing or trimming (covered by PRD-78)
- QA overlay tools and jog dial (covered by PRD-37)
- Video concatenation or assembly (covered by PRD-39)

## 7. Design Considerations
- Player controls should follow video industry conventions (familiar layout for editors).
- Frame counter and timecode should be always-visible during review.
- The player component must be embeddable in any panel/view context.

## 8. Technical Considerations
- **Stack:** WebCodecs API for hardware acceleration, HTMLVideoElement fallback, React component wrapper
- **Existing Code to Reuse:** PRD-29 design system components for player chrome
- **New Infrastructure Needed:** Codec detector, frame-accurate seek engine, adaptive bitrate streaming, thumbnail extractor
- **Database Changes:** `video_thumbnails` table (video_id, frame_number, thumbnail_path, interval_seconds)
- **API Changes:** GET /videos/:id/stream?quality=proxy|full, GET /videos/:id/thumbnail/:frame, GET /videos/:id/metadata (duration, codec, resolution, framerate)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- First frame rendered within 200ms of seek
- Smooth playback at target framerate (24/30/60fps) without dropped frames on recommended hardware
- Memory-efficient: no full-video buffering — stream and decode on demand
- Frame-accurate seeking delivers the exact requested frame 100% of the time

## 11. Open Questions
- What is the minimum hardware specification for smooth 4K playback?
- Should the player support external subtitle/caption tracks?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
