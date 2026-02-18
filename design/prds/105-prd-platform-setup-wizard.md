# PRD-105: Platform Setup Wizard

## 1. Introduction/Overview
PRD-53 handles onboarding for users who interact with the platform. This PRD handles onboarding for the person who deploys and configures the platform itself — a fundamentally different audience (DevOps/Admin vs. Creator/Reviewer). A complex platform with 5+ external dependencies (PostgreSQL, ComfyUI, GPU workers, filesystem, optional integrations) is daunting to set up from documentation alone. This PRD provides a guided step-by-step configuration wizard that turns "read 20 pages of docs" into "follow the prompts and get confirmation at each step."

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-03 (RBAC for first admin account), PRD-05 (ComfyUI WebSocket Bridge for connectivity test), PRD-46 (Worker Pool for worker registration), PRD-80 (System Health for final verification), PRD-81 (Backup configuration as optional step)
- **Depended on by:** None
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Guide first-time setup through all platform dependencies step by step.
- Validate each step before allowing progression.
- Run a final health check to confirm the platform is ready.
- Support re-running for reconfiguration of specific components.

## 4. User Stories
- As an Admin, I want a step-by-step setup wizard so that I can configure the platform without reading extensive documentation.
- As an Admin, I want validation at each step so that I know my configuration is correct before proceeding.
- As an Admin, I want a final health check so that I have confidence the platform is fully operational after setup.
- As an Admin, I want to re-run the wizard for specific steps so that I can add a new ComfyUI instance without reconfiguring everything.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Database Connection
**Description:** PostgreSQL setup and verification.
**Acceptance Criteria:**
- [ ] Enter PostgreSQL connection string
- [ ] Test connectivity
- [ ] Run initial schema migration
- [ ] Verify successful table creation
- [ ] Clear error messages: "Cannot connect to PostgreSQL at localhost:5432. Is the service running? Check firewall rules."

#### Requirement 1.2: Storage Configuration
**Description:** File system setup.
**Acceptance Criteria:**
- [ ] Set root storage path for assets, temp files, and exports
- [ ] Verify disk space meets minimum requirements
- [ ] Create directory structure
- [ ] Write permissions verification

#### Requirement 1.3: ComfyUI Connection
**Description:** ComfyUI integration setup.
**Acceptance Criteria:**
- [ ] Enter ComfyUI WebSocket URL(s)
- [ ] Test connectivity (PRD-05)
- [ ] Verify version compatibility
- [ ] Discover installed custom nodes and models

#### Requirement 1.4: First Admin Account
**Description:** Initial user creation.
**Acceptance Criteria:**
- [ ] Create the initial admin user
- [ ] Set password with strength validation
- [ ] Configure recovery method (email or security questions)

#### Requirement 1.5: Worker Registration
**Description:** GPU worker setup.
**Acceptance Criteria:**
- [ ] Register at least one GPU worker (PRD-46)
- [ ] Run a test generation to verify the full pipeline works end-to-end
- [ ] Report test generation results (success/failure with diagnostics)

#### Requirement 1.6: Optional Integrations
**Description:** Additional service connections.
**Acceptance Criteria:**
- [ ] Configure email for notifications (PRD-10)
- [ ] Configure Slack integration
- [ ] Set up external webhook endpoints (PRD-12)
- [ ] Configure storage backup destination (PRD-81)
- [ ] Each integration is optional and skippable

#### Requirement 1.7: Validation at Each Step
**Description:** Step-level verification.
**Acceptance Criteria:**
- [ ] Each step validates before allowing progression
- [ ] Clear error messages with troubleshooting hints
- [ ] "Test Connection" buttons with real-time feedback
- [ ] Progress indicator showing completed and remaining steps

#### Requirement 1.8: System Health Check
**Description:** Final verification.
**Acceptance Criteria:**
- [ ] Final step runs PRD-80 health checks
- [ ] Summary: all green = ready to go, any red = what needs fixing
- [ ] Link to the System Health Page for ongoing monitoring

#### Requirement 1.9: Skip for Experts
**Description:** Bypass wizard for experienced admins.
**Acceptance Criteria:**
- [ ] Option to skip the wizard and configure via config files or environment variables
- [ ] Wizard is a convenience, not a requirement
- [ ] Skip option clearly available but not the default path

#### Requirement 1.10: Re-Run Capability
**Description:** Reconfigure specific components.
**Acceptance Criteria:**
- [ ] Re-run from the admin panel to reconfigure any component
- [ ] Only the relevant steps are shown (e.g., "Add ComfyUI Instance" shows only step 3)
- [ ] Previously configured values shown as defaults

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Environment Detection
**Description:** Auto-detect configuration from environment.
**Acceptance Criteria:**
- [ ] Detect environment variables and pre-populate wizard fields
- [ ] Auto-detect available GPU hardware and suggest worker configuration
- [ ] Detect Docker/container environment and adjust recommendations

## 6. Non-Goals (Out of Scope)
- User onboarding and feature tours (covered by PRD-53)
- System health monitoring after setup (covered by PRD-80)
- Worker pool scaling and management (covered by PRD-46)

## 7. Design Considerations
- Each step should be self-contained: complete context within the step, no need to reference external docs.
- Error messages should be actionable: not just "Connection failed" but "Connection failed — verify that PostgreSQL is running on port 5432 and accepting connections from this host."
- The wizard should feel reassuring: green checkmarks, progress indicators, and clear next steps.

## 8. Technical Considerations
- **Stack:** React for wizard UI, Rust for connectivity tests and migration runner
- **Existing Code to Reuse:** PRD-05 WebSocket connectivity test, PRD-46 worker registration, PRD-80 health checks, PRD-03 user creation
- **New Infrastructure Needed:** Wizard state machine, step validator, migration runner, test generation launcher
- **Database Changes:** `platform_setup` table (step_name, completed, configured_at, config_json)
- **API Changes:** POST /admin/setup/step/:step_name, GET /admin/setup/status, POST /admin/setup/test-connection, POST /admin/setup/test-generation

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- A qualified Admin completes initial setup in <30 minutes using the wizard
- Validation catches 100% of misconfiguration issues before the user proceeds
- Final health check correctly identifies all remaining issues
- Re-run correctly preserves existing configuration for unchanged steps

## 11. Open Questions
- Should the wizard support automated setup from a configuration file (headless mode for CI/CD)?
- How should the wizard handle upgrades between platform versions (migration wizard)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
