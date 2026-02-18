# PRD-077: Pipeline Stage Hooks (Custom Scripts)

## 1. Introduction/Overview
Every studio has custom requirements that don't fit a generic pipeline: proprietary color grading, custom watermarking, metadata enrichment, and integration with internal tools. This PRD provides user-defined pre/post scripts that execute at configurable pipeline stages, enabling custom processing without modifying core ComfyUI workflows. Hooks provide clean extensibility points where studio-specific logic plugs in without touching the core platform.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-09 (Multi-Runtime Script Orchestrator), PRD-10 (Event Bus), PRD-75 (Workflow Import)
- **Depended on by:** PRD-39, PRD-81
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Define hook points at key pipeline stages (post-variant, pre/post-segment, pre-concatenation, post-delivery).
- Support Shell, Python, and HTTP webhook hook types.
- Provide configurable failure handling (block, warn, ignore) per hook.
- Enable hook management at studio, project, or scene type level with downward inheritance.

## 4. User Stories
- As a Creator, I want to run a custom color correction script after each segment generation so that our studio's look is automatically applied.
- As an Admin, I want to configure a webhook hook that notifies our CDN when a delivery ZIP is packaged so that distribution is automated.
- As a Creator, I want hooks to inherit from studio defaults but be overridable at the project level so that I can customize behavior without affecting other projects.
- As an Admin, I want to see execution logs for every hook run so that I can debug failures in custom processing steps.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Hook Points
**Description:** Register scripts at specific pipeline events.
**Acceptance Criteria:**
- [ ] Post-Variant Generation: runs after a clothed variant is generated
- [ ] Pre-Segment Generation: runs before each segment starts
- [ ] Post-Segment Generation: runs after each segment completes
- [ ] Pre-Concatenation: runs before segments are assembled
- [ ] Post-Delivery: runs after ZIP packaging
- [ ] Each hook point receives structured JSON input (segment path, metadata, scene context)

#### Requirement 1.2: Script Types
**Description:** Support multiple execution backends for hooks.
**Acceptance Criteria:**
- [ ] Shell scripts executed via PRD-09 runtime
- [ ] Python scripts executed via PRD-09 venv runtime
- [ ] HTTP webhook calls to external URLs
- [ ] Scripts can return pass/fail status and optional output data

#### Requirement 1.3: Failure Handling
**Description:** Configurable behavior when a hook script fails.
**Acceptance Criteria:**
- [ ] **Block:** Stop pipeline and flag for review
- [ ] **Warn:** Log warning and continue pipeline execution
- [ ] **Ignore:** Silent continue (log only)
- [ ] Failure handling mode is configurable per hook

#### Requirement 1.4: Hook Registry & Inheritance
**Description:** Manage hooks at studio, project, or scene type level with downward inheritance.
**Acceptance Criteria:**
- [ ] Studio-level hooks apply to all projects unless overridden
- [ ] Project-level hooks override studio hooks for that project
- [ ] Scene-type-level hooks override project hooks for that scene type
- [ ] Override transparency: clear indication of which hooks are inherited vs. local

#### Requirement 1.5: Execution Logging
**Description:** Complete logging of every hook execution.
**Acceptance Criteria:**
- [ ] Every execution logged with: input, output, duration, exit code
- [ ] Logs visible in the job detail view
- [ ] Failed executions are highlighted with error details
- [ ] Log retention follows platform-wide retention policies

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Hook Marketplace
**Description:** Shared library of commonly used hooks with documentation.
**Acceptance Criteria:**
- [ ] Pre-built hooks for common operations (watermarking, color grading, metadata extraction)
- [ ] Each hook has documentation, usage examples, and configuration instructions

## 6. Non-Goals (Out of Scope)
- Core pipeline logic modification (hooks extend, not replace, the pipeline)
- Script runtime management (covered by PRD-09)
- UI plugin/extension architecture (covered by PRD-85)

## 7. Design Considerations
- Hook configuration UI should show the inheritance chain clearly (studio > project > scene type).
- Execution logs should be easily accessible from both the hook registry and the job detail view.
- A "Test Hook" button should be available to run a hook with sample data.

## 8. Technical Considerations
- **Stack:** Rust hook executor, PRD-09 for script runtimes, reqwest for webhook calls
- **Existing Code to Reuse:** PRD-09 script orchestrator, PRD-10 event bus for triggering
- **New Infrastructure Needed:** Hook registry table, hook executor service, inheritance resolver
- **Database Changes:** `hooks` table (id, name, type, hook_point, scope_type, scope_id, failure_mode, config)
- **API Changes:** CRUD /hooks, POST /hooks/:id/test, GET /hooks/effective/:scope_type/:scope_id

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Hook execution adds <2 seconds overhead to the pipeline per hook (excluding script runtime)
- 100% of hook executions have complete logs
- Hook inheritance resolution is correct at all scope levels
- Block-mode failures correctly halt the pipeline and flag for review

## 11. Open Questions
- Should hooks be able to modify pipeline data (e.g., change the seed image), or only observe/validate?
- What is the maximum timeout for hook execution?
- Should hooks run in parallel or sequentially when multiple hooks are registered at the same point?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
