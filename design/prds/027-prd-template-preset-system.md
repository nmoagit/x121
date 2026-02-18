# PRD-027: Template & Preset System

## 1. Introduction/Overview
Once creators discover "Known Good" recipes — specific LoRA weight combinations, CFG scales, prompt structures, and duration settings — they need a structured way to reuse and share them. This PRD provides saved workflow templates, parameter presets, and a template marketplace with scope levels (personal, project, studio) and usage statistics. Templates are forward-looking starting points, distinct from M-01 (Hero Propagation) which retroactively pushes settings.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23 (Scene Type Configuration), PRD-33 (Workflow Canvas)
- **Depended on by:** PRD-65, PRD-74
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Save reusable workflow configurations with named parameter slots.
- Package LoRA weights, CFG, prompts, and durations as shareable presets.
- Support personal, project, and studio scope levels.
- Provide a marketplace for discovering and applying team members' proven presets.

## 4. User Stories
- As a Creator, I want to save my successful generation settings as a preset so that I can reuse them on future characters.
- As a Creator, I want to browse presets created by teammates so that I can leverage their proven configurations.
- As an Admin, I want studio-level default presets so that new projects start with our established best practices.
- As a Creator, I want to see which parameters differ from a template's defaults when I apply it so that I understand what I'm changing.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Workflow Templates
**Description:** Saved ComfyUI workflow configurations with named parameter slots.
**Acceptance Criteria:**
- [ ] Save a workflow configuration as a named template
- [ ] Templates include all configurable parameters discovered by PRD-75
- [ ] Templates are versioned (edit creates a new version)
- [ ] Templates can be applied to scene type configurations

#### Requirement 1.2: Parameter Presets
**Description:** Packaged generation settings as reusable recipes.
**Acceptance Criteria:**
- [ ] Presets include: LoRA weights, CFG scale, prompt structure, duration settings
- [ ] Presets are named and described
- [ ] Apply a preset to a scene type with one click
- [ ] Override transparency: clearly show which values differ from defaults

#### Requirement 1.3: Scope Levels
**Description:** Personal, project, and studio scope for templates and presets.
**Acceptance Criteria:**
- [ ] Personal: visible only to the creator
- [ ] Project: shared within a project
- [ ] Studio: global defaults available to all projects
- [ ] Scope is set at creation and changeable by the owner

#### Requirement 1.4: Template Marketplace
**Description:** Browse and apply presets from other studio members.
**Acceptance Criteria:**
- [ ] Browse all shared presets with: name, author, description, usage count, rating
- [ ] Sort by popularity, rating, or recency
- [ ] Apply a preset directly from the marketplace
- [ ] Quality ratings (1-5 stars) per preset

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Template Inheritance
**Description:** Presets that inherit from and override a base preset.
**Acceptance Criteria:**
- [ ] Child presets override specific values while inheriting the rest
- [ ] Parent changes cascade to children that haven't overridden

## 6. Non-Goals (Out of Scope)
- Scene type configuration (covered by PRD-23)
- Workflow canvas editing (covered by PRD-33)
- Project configuration templates (covered by PRD-74)
- Hero asset propagation (covered by M-01)

## 7. Design Considerations
- Preset application should show a clear before/after comparison.
- The marketplace should feel like browsing a catalog with cards.
- Personal vs. shared presets should be clearly distinguished in the UI.

## 8. Technical Considerations
- **Stack:** React for marketplace UI, Rust for template management, PostgreSQL for storage
- **Existing Code to Reuse:** PRD-23 scene type configuration, PRD-75 parameter discovery
- **New Infrastructure Needed:** Template storage, preset application engine, marketplace service
- **Database Changes:** `templates` table, `presets` table, `preset_ratings` table
- **API Changes:** CRUD /templates, CRUD /presets, GET /presets/marketplace, POST /presets/:id/apply

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Template application takes <2 seconds
- Override transparency correctly shows all differing parameters
- Marketplace loads in <1 second with 100+ presets
- Preset usage tracking is accurate

## 11. Open Questions
- Should presets lock parameters they set, or allow further overrides?
- How should version conflicts be handled when a preset references a deprecated workflow?
- Should template ratings require actual usage, or allow rating without applying?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
