# PRD-001: Project, Character & Scene Data Model

## 1. Introduction/Overview
This PRD defines the hierarchical entity model that underpins the entire platform: Projects contain Characters, Characters have Source Images and Derived Variants, Scene Types define reusable generation recipes, Scenes are concrete instances of a Character + Scene Type + Variant, and Segments are individual generated video clips within a Scene. This taxonomy reflects the actual production workflow and establishes the naming conventions and delivery structure that serve as the contractual interface with downstream consumers. Every other PRD implicitly depends on this data model.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-00 (Database Normalization)
- **Depended on by:** PRD-03, PRD-04, PRD-08, PRD-13, PRD-14, PRD-15, PRD-16, PRD-20, PRD-21, PRD-23, PRD-39, PRD-45, PRD-47, PRD-50, PRD-57, PRD-60, PRD-66, PRD-69, PRD-72
- **Part:** Part 0 — Architecture & Data Standards

## 3. Goals
- Define the complete entity hierarchy: Project > Character > Source Image / Derived Images / Image Variants / Metadata > Scene Type > Scene > Segment.
- Establish the naming convention for scene video files that drives automatic naming in the delivery pipeline.
- Define the delivery ZIP structure that serves as the contractual output format.
- Capture all entity states, transitions, and relationships with sufficient detail for implementation.

## 4. User Stories
- As a Creator, I want a clear hierarchical data model so that I can navigate from a Project down to individual Segments without confusion about where entities live.
- As an Admin, I want the Scene Type entity to capture reusable workflow/LoRA/prompt/duration configuration so that I configure each recipe once and stamp it across all characters.
- As a Reviewer, I want each Segment to track its status (Pending, Generating, QA Pass, QA Fail, Approved, Rejected) so that I can see exactly where each piece of content stands in the pipeline.
- As a Creator, I want the naming convention to be automatically applied so that I never need to manually rename output files.
- As an Admin, I want the delivery ZIP structure to be enforced by the system so that downstream consumers always receive a consistent package.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Project Entity
**Description:** Top-level container with name, status, and retention policy. A project contains one or more Characters.
**Acceptance Criteria:**
- [ ] Projects can be created, renamed, and deleted (with cascade confirmation)
- [ ] Project status tracks lifecycle state (Setup, Active, Delivered, Archived, Closed)
- [ ] Retention policy is configurable per project
- [ ] Projects have a unique identifier and display name

#### Requirement 1.2: Character Entity
**Description:** Belongs to a project. Represents a single model/avatar identity with source images, derived images, image variants, and metadata.
**Acceptance Criteria:**
- [ ] Characters belong to exactly one project (or optionally to the studio library per PRD-60)
- [ ] Each character has a Source Image (original/ground-truth reference)
- [ ] Derived Images are generated variants of the source (e.g., clothed from topless)
- [ ] Image Variants track the set of available seed images with status (pending / approved / rejected)
- [ ] Character metadata is stored as structured JSON (managed by PRD-13)

#### Requirement 1.3: Scene Type Entity
**Description:** Reusable definition for a kind of scene (e.g., dance, idle) defined at the project or studio level.
**Acceptance Criteria:**
- [ ] Scene types have a name, associated ComfyUI workflow JSON, LoRA/model configuration, prompt template, target duration, and segment duration
- [ ] Scene types can be created at studio or project level
- [ ] Variant applicability is configurable (clothed only, topless only, both, clothes_off transition)
- [ ] Transition configuration specifies the segment boundary for clothes_off scenes

#### Requirement 1.4: Scene Entity
**Description:** A concrete instance: one Character + one Scene Type + one Image Variant.
**Acceptance Criteria:**
- [ ] Scenes are uniquely identified by the combination of Character, Scene Type, and Image Variant
- [ ] Scene status tracks: Pending, Generating, Review, Approved, Rejected
- [ ] Transition mode is configurable: Normal or clothes_off
- [ ] Each scene contains an ordered sequence of Segments

#### Requirement 1.5: Segment Entity
**Description:** An individual generated video clip within a scene, with sequence index, seed frame, output video, last frame, quality scores, and status.
**Acceptance Criteria:**
- [ ] Segments have a sequence index (001, 002, 003...) within their scene
- [ ] Each segment records its seed frame (input image used for generation)
- [ ] Each segment stores its output video file path
- [ ] Each segment stores its extracted last frame (used as seed for next segment)
- [ ] Quality scores from auto-QA (PRD-49) are attached as structured metadata
- [ ] Segment status tracks: Pending, Generating, QA Pass, QA Fail, Approved, Rejected

#### Requirement 1.6: Naming Convention Enforcement
**Description:** Scene video names follow the pattern: `{prefix_}{content}{_clothes_off}{_index}.mp4` as defined in the specification.
**Acceptance Criteria:**
- [ ] `prefix_` is `topless_` for topless variant scenes, omitted for clothed
- [ ] `content` is the lowercase snake_case scene type name
- [ ] `_clothes_off` is appended for transition scenes
- [ ] `_index` is `_1`, `_2`, etc. when multiple videos exist for the same content
- [ ] Naming is applied automatically — no manual renaming required

#### Requirement 1.7: Delivery ZIP Structure
**Description:** Final output is a ZIP archive per project with the defined folder structure.
**Acceptance Criteria:**
- [ ] ZIP contains one folder per character, named by character name
- [ ] Each character folder contains: metadata.json, clothed.png, topless.png, and all scene videos
- [ ] Scene videos are named according to the naming convention (Requirement 1.6)
- [ ] The structure matches the contractual delivery format exactly

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Batch Scene Matrix Generation
**Description:** Given a set of characters and scene types, generate the full matrix of scenes (N characters x M scene types x K applicable variants) for review before submission.
**Acceptance Criteria:**
- [ ] Matrix view shows all combinations with their current status
- [ ] Users can select/deselect individual cells before submission
- [ ] Estimated GPU time is shown for the selected matrix

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Entity Relationship Graph Visualization
**Description:** Visual graph showing how entities relate to each other for debugging and understanding data flow.
**Acceptance Criteria:**
- [ ] Interactive graph shows Projects > Characters > Scenes > Segments hierarchy
- [ ] Clicking an entity navigates to its detail view

## 6. Non-Goals (Out of Scope)
- Scene generation logic (covered by PRD-24)
- Source image upload and variant generation workflows (covered by PRD-21)
- Quality assessment of segments (covered by PRD-49)
- Metadata content and schema (covered by PRD-13, PRD-14)
- Delivery packaging implementation (covered by PRD-39)

## 7. Design Considerations
- The entity hierarchy should be clearly visible in navigation: sidebar shows Projects, expanding to Characters, expanding to Scenes/Scene Types.
- Status indicators should use consistent visual language (color-coded badges) across all entity types.
- The data model must support the "Batch Scene Matrix" view where Characters are rows and Scene Types are columns.

## 8. Technical Considerations
- **Stack:** PostgreSQL (via PRD-00 standards), SQLx for Rust
- **Existing Code to Reuse:** PRD-00 lookup tables for all status fields
- **New Infrastructure Needed:** Core entity tables (projects, characters, source_images, derived_images, image_variants, scene_types, scenes, segments)
- **Database Changes:** Major — this creates the core schema that all other PRDs extend
- **API Changes:** CRUD endpoints for all entity types; hierarchical query endpoints (e.g., GET /projects/:id/characters/:id/scenes)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- All entity CRUD operations work correctly with referential integrity enforced
- Naming convention produces correct filenames for all variant/scene type/transition combinations
- Delivery ZIP structure matches the contractual format verified by automated tests
- Zero orphaned records across all entity relationships

## 11. Open Questions
- Should character names allow special characters, or be restricted to filesystem-safe characters for the ZIP structure?
- What is the maximum hierarchy depth if sub-projects or character groups are needed in the future?
- How should the system handle scene type name changes after scenes have been generated (rename files or keep original names)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
