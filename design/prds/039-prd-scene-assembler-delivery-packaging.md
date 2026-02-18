# PRD-039: Scene Assembler & Delivery Packaging

## 1. Introduction/Overview
This is the bridge between "all scenes approved" and "deliverable output." The automated naming eliminates the manual rename step that currently requires scripts (rename_videos.py). This PRD provides concatenation of approved segments into final scene videos, automatic naming per convention, watermarked review cuts, output format profiles for multiple delivery targets, per-character packaging, project ZIP export, delivery validation, and incremental re-export.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for naming convention), PRD-24 (Recursive Video Generation for segment structure), PRD-35 (Review Interface for approval status)
- **Depended on by:** PRD-57 (Batch Orchestrator), PRD-72 (Project Lifecycle for delivery state), PRD-78 (Segment Trimming respects trim points), PRD-82 (Content Sensitivity for watermark distinction), PRD-84 (External Review Links for watermarked previews), PRD-102 (Video Compliance Checker)
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Concatenate approved segments into final scene videos with lossless processing where possible.
- Apply automatic naming per the PRD-01 convention (no manual renaming).
- Support configurable watermarking for review cuts vs. clean final delivery.
- Enable output format profiles for multiple delivery targets.
- Package per-character folders and project-wide ZIP exports.

## 4. User Stories
- As a Creator, I want automatic naming based on scene metadata so that I never have to rename files manually.
- As a Creator, I want review cuts with watermarks so that I can share work-in-progress safely before final delivery.
- As a Creator, I want output format profiles so that I can generate deliverables for multiple platforms (1080p H.264, 720p H.265, etc.) from a single source.
- As an Admin, I want delivery validation that checks for missing scenes before export so that incomplete packages are never shipped.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Segment Concatenation
**Description:** Combine approved segments into final scene videos.
**Acceptance Criteria:**
- [ ] Combine all approved segments for a scene into a single continuous video
- [ ] Lossless concatenation where codec/resolution match
- [ ] Re-encode only when necessary (codec/resolution mismatch)
- [ ] Segment ordering follows the generation sequence

#### Requirement 1.2: Automatic Naming
**Description:** Apply naming convention from scene metadata.
**Acceptance Criteria:**
- [ ] Derive `prefix_` from image variant (`topless_` or none)
- [ ] Derive `content` from scene type name
- [ ] Append `_clothes_off` for transition scenes
- [ ] Append `_index` when multiple scenes of the same type exist
- [ ] No manual renaming required

#### Requirement 1.3: Review Concatenation
**Description:** Watermarked review cuts for approval.
**Acceptance Criteria:**
- [ ] Generate a "review cut" for approval before final delivery
- [ ] Review cuts are watermarked to prevent premature distribution
- [ ] Final delivery versions are clean (no watermark)

#### Requirement 1.4: Watermarking
**Description:** Configurable watermark for review cuts.
**Acceptance Criteria:**
- [ ] Configurable: text or image overlay
- [ ] Position: center or corner
- [ ] Opacity: adjustable
- [ ] Optional timecode burn-in

#### Requirement 1.5: Output Format Profiles
**Description:** Reusable delivery specifications.
**Acceptance Criteria:**
- [ ] Define profiles specifying: resolution, codec, bitrate, container format
- [ ] Examples: "Platform A: 1080p H.264 8Mbps MP4", "Archive: 4K ProRes MOV"
- [ ] Scenes assembled once, then transcoded to each profile automatically
- [ ] CRUD for profiles

#### Requirement 1.6: Per-Character Packaging
**Description:** Character-level delivery folders.
**Acceptance Criteria:**
- [ ] Assemble all approved scene videos for a character
- [ ] Include `metadata.json`, `clothed.png`, and `topless.png` alongside videos
- [ ] Folder structure matches PRD-01 delivery specification

#### Requirement 1.7: Project ZIP Export
**Description:** Complete project packaging.
**Acceptance Criteria:**
- [ ] Package all character folders into a single ZIP
- [ ] One-click export for the entire project or selected characters
- [ ] Supports exporting per output format profile
- [ ] ZIP structure matches the downstream delivery contract

#### Requirement 1.8: Delivery Validation
**Description:** Pre-export completeness check.
**Acceptance Criteria:**
- [ ] Verify all expected scenes are present and approved
- [ ] Verify all required files exist (metadata, images, videos)
- [ ] Verify naming follows convention
- [ ] Warn on missing scenes before allowing export

#### Requirement 1.9: Incremental Re-export
**Description:** Partial re-export for updated scenes.
**Acceptance Criteria:**
- [ ] When a single scene is re-done and re-approved, re-export only that character's folder
- [ ] No need to rebuild the entire ZIP
- [ ] Updated character folder replaces the previous version in the archive

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Delivery History
**Description:** Track all exports for audit purposes.
**Acceptance Criteria:**
- [ ] Record: export date, format profile, included characters, exported by whom
- [ ] Diff between exports: what changed since the last delivery

## 6. Non-Goals (Out of Scope)
- Video compliance checking (covered by PRD-102)
- VFX sidecar export (covered by PRD-40)
- Production reporting (covered by PRD-73)

## 7. Design Considerations
- Export progress should show per-character and per-profile status.
- Delivery validation warnings should be clear and actionable (link to the missing scene for review).
- ZIP export should stream to avoid large memory allocation.

## 8. Technical Considerations
- **Stack:** Rust for concatenation/transcoding orchestration, FFmpeg for video processing, ZIP streaming library
- **Existing Code to Reuse:** PRD-01 naming convention rules, PRD-24 segment metadata, PRD-35 approval status
- **New Infrastructure Needed:** Concatenation engine, transcoding pipeline, packaging engine, validation checker, ZIP streamer
- **Database Changes:** `delivery_exports` table (project_id, format_profile_id, characters_json, status, exported_by, exported_at), `output_format_profiles` table (id, name, resolution, codec, bitrate, container)
- **API Changes:** POST /projects/:id/assemble, POST /projects/:id/export-zip, GET /projects/:id/delivery-validation, CRUD /output-format-profiles

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Concatenation completes in <10 seconds per scene (for typical segment counts)
- Naming convention applied correctly to 100% of exported files
- Delivery validation catches 100% of missing or unapproved scenes
- ZIP export streams without exceeding 2x the output size in memory

## 11. Open Questions
- Should re-export automatically include dependent changes (e.g., updated metadata.json)?
- What happens to existing delivery ZIP downloads when a new export is generated?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
