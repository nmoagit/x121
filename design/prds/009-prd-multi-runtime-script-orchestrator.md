# PRD-009: Multi-Runtime Script Orchestrator

## 1. Introduction/Overview
Studios need to integrate custom optimized code — shell scripts, Python processing, and C++ binaries — alongside AI generation workflows. The Multi-Runtime Script Orchestrator provides managed execution of these external scripts within the platform's pipeline, handling virtual environment isolation, dependency management, and execution monitoring. It enables studios to use proprietary or custom tools without modifying core ComfyUI workflows.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation)
- **Depended on by:** PRD-77 (Pipeline Stage Hooks)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Support managed execution of Shell, Python (venv), and C++ binary scripts.
- Provide isolation between script environments to prevent dependency conflicts.
- Track script execution with structured logging, duration, and exit codes.
- Enable pipeline hooks (PRD-77) to invoke custom scripts at defined pipeline stages.

## 4. User Stories
- As a Creator, I want to run a custom Python color-correction script after each segment generation so that our studio's visual standard is automatically applied.
- As an Admin, I want Python scripts to run in isolated virtual environments so that dependency conflicts don't break the platform or other scripts.
- As an Admin, I want to see execution logs for every script run so that I can debug failures in custom processing steps.
- As a Creator, I want to register C++ binaries for high-performance post-processing so that computationally intensive operations complete quickly.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Shell Script Execution
**Description:** Execute shell scripts (bash/sh) with structured input and output handling.
**Acceptance Criteria:**
- [ ] Shell scripts receive input as environment variables and/or JSON on stdin
- [ ] Script execution is sandboxed to a working directory
- [ ] stdout, stderr, exit code, and duration are captured
- [ ] Timeout is configurable per script (default: 5 minutes)

#### Requirement 1.2: Python Virtual Environment Management
**Description:** Create and manage isolated Python environments for script execution.
**Acceptance Criteria:**
- [ ] Each registered Python script can specify its own requirements.txt
- [ ] Virtual environments are created and cached per requirements set
- [ ] Scripts execute within their assigned venv automatically
- [ ] Dependency installation failures are reported clearly

#### Requirement 1.3: C++ Binary Execution
**Description:** Execute pre-compiled C++ binaries as pipeline steps.
**Acceptance Criteria:**
- [ ] Binaries are registered with a path and expected argument format
- [ ] Input is passed via command-line arguments and/or stdin
- [ ] Output is captured from stdout and/or a specified output file path
- [ ] Binary execution permissions are validated at registration time

#### Requirement 1.4: Script Registry
**Description:** Central registry of all available scripts with metadata.
**Acceptance Criteria:**
- [ ] Scripts are registered with name, type (shell/python/binary), path, description, and expected inputs/outputs
- [ ] Registry is manageable through the admin UI
- [ ] Scripts can be enabled/disabled without deletion
- [ ] Version tracking per script (hash-based or explicit)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Script Marketplace
**Description:** Shared library of commonly used scripts with documentation.
**Acceptance Criteria:**
- [ ] Pre-built scripts for common operations (color correction, watermarking, frame extraction)
- [ ] Each script has documentation, usage examples, and parameter descriptions

## 6. Non-Goals (Out of Scope)
- Pipeline hook configuration (covered by PRD-77)
- ComfyUI workflow execution (covered by PRD-05)
- GPU-accelerated script execution (scripts run on CPU)

## 7. Design Considerations
- Script registration UI should clearly show the runtime type and status of each script.
- Execution logs should be easily accessible from the job detail view.

## 8. Technical Considerations
- **Stack:** Rust (tokio::process for async subprocess management), Python venv module, shell executor
- **Existing Code to Reuse:** PRD-02 async infrastructure
- **New Infrastructure Needed:** Script registry table, venv manager, subprocess executor with timeout
- **Database Changes:** `scripts` table (id, name, type, path, requirements, enabled, created_at)
- **API Changes:** CRUD /admin/scripts, POST /admin/scripts/:id/test

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Script execution overhead <500ms (time to set up and launch, excluding script runtime)
- 100% of script executions have complete logs (input, output, duration, exit code)
- Python venv creation completes in <60 seconds for typical requirements
- Zero cross-script dependency conflicts

## 11. Open Questions
- Should scripts have access to the database directly, or only through structured input/output?
- What is the resource limit (CPU, memory) for script execution?
- Should the orchestrator support remote script execution on worker nodes?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
