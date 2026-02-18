# PRD-096: Poster Frame & Thumbnail Selection

## 1. Introduction/Overview
Auto-generated thumbnails (typically first frame or middle frame) are often unrepresentative — the first frame of a dance scene is a still pose, not a dance. A manually selected hero frame that captures the best moment dramatically improves the visual quality of the entire platform's UI. This PRD provides manual selection of representative frames for scenes and characters, with crop/adjust tools and poster frame galleries — a small feature with outsized impact on perceived production quality.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-49 (Automated Quality Gates for face confidence scoring), PRD-60 (Character Library for poster display), PRD-83 (Video Playback Engine for frame selection)
- **Depended on by:** PRD-57 (Batch Orchestrator grid thumbnails), PRD-68 (Cross-Character Comparison thumbnails), PRD-84 (External Review Links hero images), PRD-89 (Dashboard Widget thumbnails)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Enable manual selection of poster frames from the review player.
- Provide character-level and scene-level poster frame management.
- Support light editing (crop, brightness/contrast) for thumbnail optimization.
- Offer auto-select using face confidence scoring for batch operations.

## 4. User Stories
- As a Creator, I want to select a specific frame as a scene's poster frame so that the thumbnail represents the best moment of the scene.
- As a Creator, I want to set a character poster frame that appears across the platform so that the character's "first impression" is always strong.
- As a Creator, I want "Auto-select best frame" using face confidence so that I can quickly assign poster frames for many characters.
- As a Creator, I want to crop and adjust the poster frame so that I can optimize the thumbnail without external tools.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Frame Selection from Player
**Description:** Set poster frame from the review interface.
**Acceptance Criteria:**
- [ ] "Set as Poster Frame" button while viewing a segment in PRD-35/PRD-83 player
- [ ] Uses the current frame as the scene's thumbnail
- [ ] Selected frame extracted and stored as a static image

#### Requirement 1.2: Character Poster
**Description:** Platform-wide representative image per character.
**Acceptance Criteria:**
- [ ] Character poster frame appears in: library views (PRD-60), dashboard widgets (PRD-42/PRD-89), search results (PRD-20), shared links (PRD-84)
- [ ] Defaults to a keyframe from the first approved scene if not manually set
- [ ] One-click override from any scene's poster frame

#### Requirement 1.3: Scene Poster
**Description:** Representative image per scene.
**Acceptance Criteria:**
- [ ] Poster frame per scene used in: scene list, batch orchestrator grid (PRD-57), comparison views (PRD-68)
- [ ] Defaults to the first frame of the first segment
- [ ] Override from any frame within the scene's segments

#### Requirement 1.4: Poster Frame Gallery
**Description:** Project-wide poster frame overview.
**Acceptance Criteria:**
- [ ] Grid view of all poster frames for a project's characters
- [ ] Quickly identify characters with weak or unrepresentative thumbnails
- [ ] Bulk action: "Auto-select best frame" using face confidence score from PRD-49

#### Requirement 1.5: Crop & Adjust
**Description:** Light editing of poster frames.
**Acceptance Criteria:**
- [ ] Crop to aspect ratio (square, 16:9, 4:3, custom)
- [ ] Brightness/contrast adjustment
- [ ] No full image editing — just enough for a good thumbnail from a good frame
- [ ] Preview before saving

#### Requirement 1.6: Version Persistence
**Description:** Poster frames survive regeneration.
**Acceptance Criteria:**
- [ ] When a scene is regenerated, poster frame selection persists if the selected frame still exists
- [ ] If the segment was regenerated, user is prompted to select a new poster frame
- [ ] Previous poster frame available for reference during re-selection

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Animated Poster Frames
**Description:** Short GIF/WebP clip as poster frame.
**Acceptance Criteria:**
- [ ] Option to use a 1-2 second clip instead of a static frame
- [ ] Plays on hover in library views

## 6. Non-Goals (Out of Scope)
- Full image editing (external tools handle this)
- Video thumbnail generation at intervals (covered by PRD-83)
- Face contact sheet (covered by PRD-103)

## 7. Design Considerations
- "Set as Poster Frame" should be easily accessible during review (floating button or keyboard shortcut).
- Poster frame gallery should show frame quality at a glance (face clarity, lighting).
- Crop/adjust tools should be simple and non-intimidating (not a photo editor).

## 8. Technical Considerations
- **Stack:** React for selection UI, Canvas for crop/adjust, FFmpeg or Canvas for frame extraction
- **Existing Code to Reuse:** PRD-83 video player for frame access, PRD-49 face confidence scores for auto-select
- **New Infrastructure Needed:** Frame extractor, poster frame storage, crop/adjust tool, auto-select algorithm
- **Database Changes:** `poster_frames` table (entity_type, entity_id, frame_number, segment_id, image_path, crop_settings_json, created_at)
- **API Changes:** POST /scenes/:id/poster-frame, POST /characters/:id/poster-frame, GET /projects/:id/poster-gallery, POST /projects/:id/auto-select-posters

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Poster frame extraction completes in <1 second
- Poster frames correctly display in all dependent views (library, dashboard, comparison, shared links)
- Auto-select correctly identifies the highest face-quality frame in >90% of cases

## 11. Open Questions
- What aspect ratio should be the default for character poster frames?
- Should poster frame changes propagate to already-exported delivery packages?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
