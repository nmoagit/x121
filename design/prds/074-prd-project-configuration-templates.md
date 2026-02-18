# PRD-074: Project Configuration Templates

## 1. Introduction/Overview
When the studio creates a new project with the same scene types, workflows, and settings as a previous project, they shouldn't reconfigure from scratch. This PRD enables export and import of complete project configurations — scene types, workflows, LoRA assignments, prompts, duration targets — as reusable project scaffolds, making project setup a 30-second operation for repeat configurations.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23 (Scene Types), PRD-27 (Templates)
- **Depended on by:** PRD-67 (Bulk Onboarding)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Export complete project configurations as portable JSON files.
- Import configurations when creating new projects.
- Support selective import (specific scene types only).
- Maintain a versioned config library at the studio level.

## 4. User Stories
- As a Creator, I want to import a saved project configuration so that new projects with the same scene types are set up in seconds.
- As an Admin, I want to maintain a library of project configurations so that standardized setups are available to all creators.
- As a Creator, I want selective import so that I can pick just the scene types I need from an existing configuration.
- As a Creator, I want config diff so that I see what will change when importing into an existing project.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Project Config Export
**Description:** Package all project configuration as a portable JSON.
**Acceptance Criteria:**
- [ ] Exports: scene types, workflow assignments, prompt templates, duration settings, variant applicability, auto-retry policies
- [ ] Named and described export file
- [ ] Export includes a version identifier

#### Requirement 1.2: Project Config Import
**Description:** Apply a saved configuration to a new or existing project.
**Acceptance Criteria:**
- [ ] Import during new project creation
- [ ] Project inherits all scene type definitions and settings
- [ ] Validation on import (referenced workflows/LoRAs exist)

#### Requirement 1.3: Config Library
**Description:** Studio-level library of saved configurations.
**Acceptance Criteria:**
- [ ] Named, described, and versioned configs
- [ ] Browsable by all creators
- [ ] Admin can mark configs as recommended

#### Requirement 1.4: Selective Import
**Description:** Import only specific scene types.
**Acceptance Criteria:**
- [ ] Checkbox selection of which scene types to import
- [ ] Dependencies resolved: if scene type A depends on a workflow, the workflow is included

#### Requirement 1.5: Config Diff
**Description:** Show changes when importing into an existing project.
**Acceptance Criteria:**
- [ ] Side-by-side: what will be added, changed, or remain untouched
- [ ] User can accept or cancel after review

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Config Auto-Sync
**Description:** Keep projects in sync with a master configuration.
**Acceptance Criteria:**
- [ ] Projects can subscribe to a master config; changes propagate automatically

## 6. Non-Goals (Out of Scope)
- Per-scene-type templates (covered by PRD-27)
- Scene type inheritance (covered by PRD-100)

## 7. Design Considerations
- Import wizard should be part of the new project creation flow.
- Config library should look like a catalog with preview cards.

## 8. Technical Considerations
- **Stack:** Rust for export/import, JSON for config format
- **Existing Code to Reuse:** PRD-23 scene type data, PRD-27 template data
- **New Infrastructure Needed:** Config serializer/deserializer, library storage, diff engine
- **Database Changes:** `project_configs` table (id, name, description, version, config_json)
- **API Changes:** POST /projects/:id/export-config, POST /projects/import-config, CRUD /project-configs

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Config export completes in <5 seconds
- Config import creates a fully configured project in <10 seconds
- Selective import correctly resolves dependencies

## 11. Open Questions
- Should configs include user-specific settings or only project-level settings?
- How should configs handle referenced assets that don't exist in the target environment?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
