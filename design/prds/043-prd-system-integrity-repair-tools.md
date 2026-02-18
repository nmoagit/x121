# PRD-043: System Integrity & Repair Tools

## 1. Introduction/Overview
Setting up new workers and maintaining a healthy asset library requires automated verification and repair capabilities. This PRD provides a model integrity scanner that validates ComfyUI models, custom nodes, and dependencies across all workers, plus a missing node auto-installer that detects and resolves missing dependencies — simplifying worker setup and ensuring a healthy, consistent runtime environment.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-05 (ComfyUI WebSocket Bridge), PRD-17 (Asset Registry for model tracking), PRD-46 (Worker Pool for worker management)
- **Depended on by:** PRD-75 (Workflow Import Validation), PRD-105 (Platform Setup Wizard)
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Scan and validate model file integrity across all workers.
- Detect and auto-install missing ComfyUI custom nodes.
- Provide a health report for each worker's runtime environment.
- Enable one-click repair for common integrity issues.

## 4. User Stories
- As an Admin, I want a model integrity scanner so that I can verify all required models are present and uncorrupted on every worker.
- As an Admin, I want missing node auto-installation so that new workers can self-configure instead of requiring manual setup.
- As an Admin, I want worker health reports so that I can quickly identify which workers need attention.
- As an Admin, I want one-click repair for common issues so that I can fix problems without SSH access.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Model Integrity Scanner
**Description:** Validate model files across workers.
**Acceptance Criteria:**
- [ ] Scan all registered workers for expected model files
- [ ] Verify file checksums against known-good hashes (from PRD-17 asset registry)
- [ ] Report: missing models, corrupted models (checksum mismatch), extra/unknown models
- [ ] Schedulable: run on demand or on a configured interval

#### Requirement 1.2: Missing Node Auto-Installer
**Description:** Detect and resolve missing ComfyUI nodes.
**Acceptance Criteria:**
- [ ] Detect missing custom nodes required by registered workflows
- [ ] Auto-install from configured sources (git repos, package managers)
- [ ] Version pinning: install the exact version required by the workflow
- [ ] Report installation success/failure per node per worker

#### Requirement 1.3: Worker Health Report
**Description:** Comprehensive per-worker status.
**Acceptance Criteria:**
- [ ] Per-worker report: installed models, installed nodes, disk space, Python/CUDA version, GPU driver version
- [ ] Green/yellow/red status per category
- [ ] Comparison view: highlight differences between workers (e.g., worker 1 has model X but worker 2 doesn't)

#### Requirement 1.4: One-Click Repair
**Description:** Automated fixes for common issues.
**Acceptance Criteria:**
- [ ] "Sync Models" — copy missing models from a reference worker or configured source
- [ ] "Install Missing Nodes" — auto-install detected missing nodes
- [ ] "Verify & Repair" — full scan + auto-fix all resolvable issues
- [ ] Repair actions logged in PRD-45 audit trail

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Dependency Graph
**Description:** Visualize model and node dependencies.
**Acceptance Criteria:**
- [ ] Show which workflows depend on which models and nodes
- [ ] Identify orphaned models (installed but not used by any workflow)

## 6. Non-Goals (Out of Scope)
- Worker pool management and scaling (covered by PRD-46)
- Hardware monitoring (covered by PRD-06)
- ComfyUI workflow import validation (covered by PRD-75)

## 7. Design Considerations
- Health reports should be scannable: traffic-light indicators with expandable details.
- Repair progress should show per-worker status during multi-worker operations.
- Differences between workers should be highlighted clearly.

## 8. Technical Considerations
- **Stack:** Rust for scanner orchestration, Python scripts on workers for local checks, SSH/API for remote execution
- **Existing Code to Reuse:** PRD-17 asset registry for model checksums, PRD-46 worker pool for worker enumeration, PRD-05 WebSocket bridge for node detection
- **New Infrastructure Needed:** Integrity scanner, node auto-installer, health report generator, repair engine
- **Database Changes:** `integrity_scans` table (id, worker_id, results_json, scanned_at), `model_checksums` table (model_name, expected_hash, file_path)
- **API Changes:** POST /admin/integrity-scan, GET /admin/integrity-report/:worker_id, POST /admin/repair/:worker_id, POST /admin/sync-models/:worker_id

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Integrity scan completes in <60 seconds per worker
- Auto-installer successfully resolves >90% of missing node issues
- Model sync correctly copies all missing models without corruption

## 11. Open Questions
- Should the scanner verify model compatibility (correct architecture/format) in addition to file integrity?
- How should the system handle models that exist on some workers but are not in the asset registry?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
