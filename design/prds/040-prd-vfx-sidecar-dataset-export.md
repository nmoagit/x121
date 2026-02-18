# PRD-040: VFX Sidecar & Dataset Export

## 1. Introduction/Overview
AI-generated content often feeds into professional VFX pipelines or becomes training data for future models. This PRD bridges the gap between AI generation and these downstream consumers by providing automated XML/CSV technical data generation alongside generated videos (VFX sidecar files) and one-click training dataset ZIP packaging with structured metadata.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus for export notifications), PRD-39 (Scene Assembler for export pipeline)
- **Depended on by:** None
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Generate VFX-standard sidecar files (XML/CSV) containing technical metadata per video.
- Export structured training datasets with properly formatted metadata.
- Support multiple sidecar formats for different VFX tool chains.
- Enable one-click dataset packaging for model training pipelines.

## 4. User Stories
- As a Creator, I want XML sidecar files alongside my exported videos so that VFX teams can ingest them into their pipeline tools (Nuke, After Effects).
- As an Admin, I want one-click training dataset export so that I can package labeled data for model training without manual preparation.
- As a Creator, I want CSV metadata export with frame-level technical data so that I can analyze generation quality in external tools.
- As an Admin, I want configurable sidecar templates so that I can match different downstream pipeline requirements.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: VFX Sidecar Generation
**Description:** Technical metadata files alongside videos.
**Acceptance Criteria:**
- [ ] Generate XML sidecar per video with: resolution, framerate, codec, duration, color space, generation parameters
- [ ] CSV option with frame-level data: face confidence per frame, motion scores, quality metrics
- [ ] Sidecar files named to match their corresponding video file

#### Requirement 1.2: Sidecar Templates
**Description:** Configurable sidecar formats.
**Acceptance Criteria:**
- [ ] Predefined templates for common VFX tools (Nuke, After Effects, Resolve)
- [ ] Custom template editor for studio-specific formats
- [ ] Template selection during export configuration

#### Requirement 1.3: Training Dataset Export
**Description:** One-click packaging for model training.
**Acceptance Criteria:**
- [ ] Package selected segments as a training dataset ZIP
- [ ] Include: video files, face crop images, metadata JSON per sample
- [ ] Metadata includes: prompt text, LoRA weights, quality scores, failure tags
- [ ] Configurable filters: quality threshold, scene types, characters to include

#### Requirement 1.4: Dataset Metadata
**Description:** Structured metadata for training pipeline consumption.
**Acceptance Criteria:**
- [ ] JSON manifest listing all samples with paths and metadata
- [ ] Split configuration: define train/validation/test splits by percentage or explicit assignment
- [ ] Compatible with common ML training data loaders

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Incremental Dataset Updates
**Description:** Append new data to existing datasets.
**Acceptance Criteria:**
- [ ] Export only new/modified samples since the last dataset export
- [ ] Merge into existing dataset without rebuilding from scratch

## 6. Non-Goals (Out of Scope)
- Video concatenation and delivery packaging (covered by PRD-39)
- Video compliance checking (covered by PRD-102)
- Model training execution (external to the platform)

## 7. Design Considerations
- Export configuration should be accessible from the project delivery view.
- Template editor should provide preview of the generated sidecar format.
- Dataset export should show progress for large exports.

## 8. Technical Considerations
- **Stack:** Rust for sidecar generation, Python for dataset packaging, XML/CSV serialization
- **Existing Code to Reuse:** PRD-39 export pipeline, PRD-49 quality score data, PRD-24 generation parameters
- **New Infrastructure Needed:** Sidecar generator, template engine, dataset packager, manifest builder
- **Database Changes:** `sidecar_templates` table (id, name, format, template_json)
- **API Changes:** POST /projects/:id/export-sidecars, POST /projects/:id/export-dataset, CRUD /sidecar-templates

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Sidecar generation completes in <1 second per video
- Generated sidecars are valid and parseable by target VFX tools
- Training dataset export packages correctly formatted data usable by standard ML loaders

## 11. Open Questions
- Which VFX tools should have first-class sidecar template support?
- Should the dataset export support image-only datasets (extracted frames) in addition to video?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
