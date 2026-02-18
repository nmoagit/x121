# PRD-023: Scene Type Configuration

## 1. Introduction/Overview
Scene types are the reusable "recipe" that gets stamped across characters. Without this entity, every scene for every character would need manual workflow/LoRA/prompt/duration configuration — the current manual bottleneck this platform exists to solve. This PRD defines scene types with workflow assignment, prompt templates, duration configuration, variant applicability, transition rules, and batch scene matrix generation.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-17 (Asset Registry), PRD-21 (Source Image Management)
- **Depended on by:** PRD-24, PRD-57, PRD-58, PRD-63, PRD-65, PRD-67, PRD-68, PRD-71, PRD-74
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Define reusable scene types with workflow, model, LoRA, prompt, and duration configuration.
- Support prompt templates with character metadata placeholder substitution.
- Configure variant applicability and clothes_off transition parameters.
- Generate the full scene matrix (N characters x M scene types x K variants) for batch submission.

## 4. User Stories
- As a Creator, I want to define a "dance" scene type once and apply it to all characters so that I configure the workflow/LoRA/prompt just once.
- As a Creator, I want prompt templates with placeholder slots so that character-specific details are automatically substituted from metadata.
- As a Creator, I want to configure which variants each scene type applies to so that I control whether a scene type generates clothed, topless, or both.
- As a Creator, I want to see the full scene matrix before submission so that I can review all combinations and deselect any that aren't needed.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Scene Type Registry
**Description:** Create and manage reusable scene type definitions.
**Acceptance Criteria:**
- [ ] Scene types have: name, description, workflow assignment, LoRA/model config, prompt template, target duration, segment duration
- [ ] Scene types can be created at studio or project level
- [ ] Studio-level types available to all projects; project-level types are project-specific
- [ ] CRUD operations on scene types with validation

#### Requirement 1.2: Workflow Assignment
**Description:** Link scene types to ComfyUI workflows.
**Acceptance Criteria:**
- [ ] Each scene type references a specific workflow (from PRD-75)
- [ ] Different scene types can use different workflows, models, and LoRAs
- [ ] Workflow compatibility validation on assignment
- [ ] Multiple LoRAs with configurable weights per scene type

#### Requirement 1.3: Prompt Template
**Description:** Configurable prompts with metadata substitution.
**Acceptance Criteria:**
- [ ] Base prompt per scene type with placeholder slots: `{character_name}`, `{hair_color}`, etc.
- [ ] Placeholders populated from character metadata at generation time
- [ ] Preview: show resolved prompt for a selected character
- [ ] Template validation warns on unresolvable placeholders

#### Requirement 1.4: Duration Configuration
**Description:** Target total duration and per-segment duration.
**Acceptance Criteria:**
- [ ] Target duration configurable per scene type (e.g., 30s, 60s)
- [ ] Segment duration configurable (e.g., 5s per segment)
- [ ] Generation loop (PRD-24) calculates required segment count from these values
- [ ] Elastic duration support (target ± tolerance)

#### Requirement 1.5: Variant Applicability
**Description:** Configure which image variants a scene type applies to.
**Acceptance Criteria:**
- [ ] Options: clothed only, topless only, both, or clothes_off transition
- [ ] Variant setting affects which scenes are generated in the batch matrix
- [ ] Transition configuration available for clothes_off: segment boundary and optional transition workflow

#### Requirement 1.6: Batch Scene Matrix
**Description:** Generate the full matrix of scenes for review.
**Acceptance Criteria:**
- [ ] Given characters and scene types, generate N x M x K matrix
- [ ] Matrix view: characters as rows, scene types as columns, with variant sub-columns
- [ ] Per-cell status: not started, generating, review, approved
- [ ] Selectable cells for submission

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scene Type Cloning
**Description:** Duplicate a scene type as a starting point for variations.
**Acceptance Criteria:**
- [ ] One-click clone of an existing scene type
- [ ] Clone inherits all settings; name auto-incremented

## 6. Non-Goals (Out of Scope)
- Scene type inheritance and composition (covered by PRD-100)
- Workflow import and validation (covered by PRD-75)
- Scene generation execution (covered by PRD-24)

## 7. Design Considerations
- Scene type editor should show all configuration in a single scrollable form.
- The batch matrix should be a visual grid with color-coded cells.
- Prompt template editor should highlight placeholders distinctively.

## 8. Technical Considerations
- **Stack:** React for configuration UI, Rust for validation and matrix generation
- **Existing Code to Reuse:** PRD-01 data model, PRD-17 asset references
- **New Infrastructure Needed:** Scene type service, prompt template resolver, matrix generator
- **Database Changes:** `scene_types` table (id, name, workflow_id, lora_config, prompt_template, target_duration, segment_duration, variant_applicability, transition_config)
- **API Changes:** CRUD /scene-types, GET /scene-types/:id/preview-prompt/:character_id, POST /scene-types/matrix

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Scene type creation takes <2 minutes with all fields configured
- Prompt template substitution produces correct output for all character metadata combinations
- Matrix generation for 20 characters x 10 scene types completes in <2 seconds
- Zero scenes generated with misconfigured variant applicability

## 11. Open Questions
- Should scene types support conditional LoRA switching based on character attributes?
- How should the system handle prompt templates when a character is missing a required metadata field?
- Should scene types be lockable (prevent modification after scenes are generated)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
