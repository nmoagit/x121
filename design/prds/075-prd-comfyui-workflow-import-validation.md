# PRD-075: ComfyUI Workflow Import & Validation

## 1. Introduction/Overview
Scene types (PRD-23) reference ComfyUI workflows, but importing a workflow that references a missing custom node or model results in silent failure during generation — wasting GPU time and creating confusing errors. This PRD provides structured import, validation, and versioning of ComfyUI workflow JSON files before they can be used in scene type configurations. Validation at import time catches issues in seconds instead of during a production batch run.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-17 (Asset Registry), PRD-23 (Scene Type Configuration), PRD-43 (System Integrity), PRD-46 (Worker Pool)
- **Depended on by:** PRD-23, PRD-65, PRD-77
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Provide structured workflow import from JSON files or directly from ComfyUI instances.
- Validate all referenced custom nodes, models, and LoRAs exist on all active workers before allowing production use.
- Automatically discover configurable parameters and expose them as named slots.
- Track workflow versions with diff highlighting and explicit version upgrade actions.

## 4. User Stories
- As a Creator, I want to import a ComfyUI workflow JSON and have it validated automatically so that I know immediately if any required nodes or models are missing.
- As an Admin, I want to run a dry-run test on imported workflows so that I verify the workflow works end-to-end before assigning it to scene types.
- As a Creator, I want parameter discovery to automatically identify configurable values in the workflow so that I don't have to manually figure out which JSON fields are adjustable.
- As a Creator, I want to see version diffs when a workflow is updated so that I understand exactly what changed.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Workflow Import
**Description:** Upload workflow JSON files or pull from connected ComfyUI instances.
**Acceptance Criteria:**
- [ ] Import from file upload (JSON format)
- [ ] Import directly from a connected ComfyUI instance (API pull)
- [ ] Parsed workflow is registered with name, description, and version
- [ ] Duplicate detection warns if a similar workflow already exists

#### Requirement 1.2: Node Validation
**Description:** Check all custom nodes in the workflow are installed on all active workers.
**Acceptance Criteria:**
- [ ] Every custom node referenced is checked against installed nodes on all workers (PRD-46)
- [ ] Missing nodes are flagged with install instructions or auto-installation trigger (PRD-43)
- [ ] Validation report shows pass/fail per node per worker
- [ ] Workflows with missing nodes cannot be marked as "Production Ready"

#### Requirement 1.3: Model/LoRA Validation
**Description:** Verify all models and LoRAs referenced exist in the asset registry.
**Acceptance Criteria:**
- [ ] All model references are checked against PRD-17 asset registry
- [ ] All LoRA references are checked against PRD-17 asset registry
- [ ] Missing assets are flagged before the workflow can be assigned to a scene type
- [ ] Validation report links to the asset registry for missing items

#### Requirement 1.4: Parameter Discovery
**Description:** Automatically detect configurable parameters and expose as named slots.
**Acceptance Criteria:**
- [ ] Seed, CFG, denoise, prompt text, and image inputs are auto-detected
- [ ] Discovered parameters are named and categorized (generation, quality, content)
- [ ] Parameters are exposed as configuration slots for PRD-23 scene type configuration and PRD-27 templates
- [ ] Manual override: users can mark additional parameters as configurable

#### Requirement 1.5: Dry-Run Test
**Description:** Test execution with a sample image to verify end-to-end workflow functionality.
**Acceptance Criteria:**
- [ ] Submit a test execution with a sample image to at least one worker
- [ ] Test completes within a timeout (configurable, default: 5 minutes)
- [ ] Success: workflow marked as "Production Ready"
- [ ] Failure: error details captured and displayed

#### Requirement 1.6: Version Management
**Description:** Track workflow versions with diff highlighting.
**Acceptance Criteria:**
- [ ] Each import or edit creates a new version
- [ ] Diff view shows which nodes changed, which parameters were added/removed
- [ ] Scene types reference a specific workflow version
- [ ] Upgrading to a new version is an explicit action (not automatic)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Workflow Library Browser
**Description:** Browse all imported workflows with status, usage count, and last-used date.
**Acceptance Criteria:**
- [ ] Workflows listed with status (Draft, Tested, Production), usage count, and last-used date
- [ ] Filterable by status, scene type usage, and model/LoRA references

## 6. Non-Goals (Out of Scope)
- Visual workflow editing (covered by PRD-33)
- Workflow execution during generation (covered by PRD-24)
- Template and preset management (covered by PRD-27)

## 7. Design Considerations
- Import wizard should guide users through: upload, validation, parameter discovery, dry-run test.
- Validation results should be visual: green checkmarks for passes, red X for failures, with actionable fix suggestions.
- Version diff should use a side-by-side or inline diff view similar to code review tools.

## 8. Technical Considerations
- **Stack:** Rust for JSON parsing and validation, ComfyUI API for node inventory queries
- **Existing Code to Reuse:** PRD-05 ComfyUI bridge for communication, PRD-17 asset registry for lookups
- **New Infrastructure Needed:** Workflow parser, validator service, parameter discovery engine, version storage
- **Database Changes:** `workflows` table (id, name, description, version, json_content, status, created_at), `workflow_versions` table
- **API Changes:** POST /workflows/import, POST /workflows/:id/validate, POST /workflows/:id/dry-run, GET /workflows/:id/versions

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Node validation catches 100% of missing custom nodes before production use
- Model/LoRA validation catches 100% of missing asset references
- Parameter discovery correctly identifies >90% of configurable parameters automatically
- Dry-run test execution completes within the configured timeout

## 11. Open Questions
- How should parameter discovery handle nested or dynamically generated workflow structures?
- Should dry-run tests run on all workers or just one representative worker?
- What is the version retention policy (keep all versions, or prune old ones)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
