# Task List: Platform Setup Wizard

**PRD Reference:** `design/prds/105-prd-platform-setup-wizard.md`
**Scope:** Build a guided step-by-step configuration wizard for first-time platform setup, covering database connection, storage, ComfyUI integration, first admin account, worker registration, optional integrations, and a final system health check.

## Overview

This setup wizard turns "read 20 pages of docs" into "follow the prompts and get confirmation at each step." It guides the Admin through configuring all platform dependencies: PostgreSQL, storage paths, ComfyUI instances, the first admin account, GPU workers, and optional integrations (email, Slack, webhooks, backup). Each step validates before allowing progression, and a final health check confirms the platform is ready for use. The wizard is re-runnable for reconfiguring individual components.

### What Already Exists
- PRD-03 RBAC for user creation
- PRD-05 ComfyUI WebSocket Bridge for connectivity tests
- PRD-46 Worker Pool for worker registration
- PRD-80 System Health for final verification
- PRD-81 Backup configuration

### What We're Building
1. Database table for setup state tracking
2. Rust step validators and connectivity testers
3. Migration runner integration
4. Test generation launcher for end-to-end verification
5. Wizard state machine with step tracking
6. API endpoints for each setup step
7. React wizard UI with progress indicators and validation feedback

### Key Design Decisions
1. **Each step is independent** -- Steps validate independently and can be re-run. No hidden dependencies between steps.
2. **Wizard is optional** -- Experts can skip it and configure via environment variables or config files.
3. **Re-run shows previous values** -- When re-running a step, previously configured values are shown as defaults.
4. **Test generation is the final proof** -- The wizard submits a minimal test generation job to verify the full pipeline works end-to-end.

---

## Phase 1: Database Schema

### Task 1.1: Platform Setup Table
**File:** `migrations/YYYYMMDDHHMMSS_create_platform_setup.sql`

```sql
CREATE TABLE platform_setup (
    id BIGSERIAL PRIMARY KEY,
    step_name TEXT NOT NULL UNIQUE,
    completed BOOLEAN NOT NULL DEFAULT false,
    config_json JSONB,                 -- step-specific configuration
    validated_at TIMESTAMPTZ,
    configured_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_setup
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Pre-populate all wizard steps
INSERT INTO platform_setup (step_name) VALUES
    ('database'),
    ('storage'),
    ('comfyui'),
    ('admin_account'),
    ('worker_registration'),
    ('integrations'),
    ('health_check');
```

**Acceptance Criteria:**
- [ ] One row per setup step, pre-populated
- [ ] `config_json` stores step-specific configuration
- [ ] `completed` and `validated_at` track step status
- [ ] Steps are idempotent: re-running updates existing row

---

## Phase 2: Rust Backend -- Step Validators

### Task 2.1: Database Connection Step
**File:** `src/services/setup/database_step.rs`

```rust
pub struct DatabaseStepConfig {
    pub host: String,
    pub port: u16,
    pub name: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
}

pub struct DatabaseStepResult {
    pub connected: bool,
    pub migrations_current: bool,
    pub tables_created: i32,
    pub error: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] Tests PostgreSQL connectivity with provided credentials
- [ ] Runs initial schema migration if needed
- [ ] Verifies successful table creation
- [ ] Clear error messages: "Cannot connect to PostgreSQL at localhost:5432"

### Task 2.2: Storage Configuration Step
**File:** `src/services/setup/storage_step.rs`

**Acceptance Criteria:**
- [ ] Sets root storage path for assets, temp files, exports
- [ ] Verifies disk space meets minimum requirements (configurable, default: 50GB)
- [ ] Creates directory structure (assets/, temp/, exports/)
- [ ] Verifies write permissions with a test file

### Task 2.3: ComfyUI Connection Step
**File:** `src/services/setup/comfyui_step.rs`

**Acceptance Criteria:**
- [ ] Tests WebSocket connectivity to each ComfyUI URL (PRD-05)
- [ ] Verifies version compatibility
- [ ] Discovers installed custom nodes and models
- [ ] Reports available capabilities per instance

### Task 2.4: First Admin Account Step
**File:** `src/services/setup/admin_account_step.rs`

**Acceptance Criteria:**
- [ ] Creates initial admin user via PRD-03
- [ ] Password strength validation (minimum 12 characters, mixed case, numbers)
- [ ] Only runs if no admin user exists
- [ ] Returns auth token for immediate use

### Task 2.5: Worker Registration Step
**File:** `src/services/setup/worker_step.rs`

**Acceptance Criteria:**
- [ ] Registers at least one GPU worker (PRD-46)
- [ ] Tests worker connectivity and GPU detection
- [ ] Launches a test generation to verify full pipeline
- [ ] Reports test generation results with diagnostics on failure

### Task 2.6: Optional Integrations Step
**File:** `src/services/setup/integrations_step.rs`

**Acceptance Criteria:**
- [ ] Email configuration with SMTP test
- [ ] Slack webhook URL with test message
- [ ] External webhook endpoints with connectivity test
- [ ] Backup destination configuration with write test
- [ ] Each integration is optional and skippable

### Task 2.7: Final Health Check Step
**File:** `src/services/setup/health_check_step.rs`

**Acceptance Criteria:**
- [ ] Runs PRD-80 health checks for all configured services
- [ ] Summary: all green = ready, any red = what needs fixing
- [ ] Links to the System Health Page for ongoing monitoring
- [ ] Sets platform "ready" flag on success

### Task 2.8: Wizard State Machine
**File:** `src/services/setup/wizard.rs`

Manages wizard state and step progression.

```rust
pub struct WizardState {
    pub steps: Vec<SetupStep>,
    pub current_step: usize,
    pub completed: bool,
}

pub struct SetupStep {
    pub name: String,
    pub completed: bool,
    pub required: bool,
    pub config: Option<serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] Tracks completion status of all steps
- [ ] Validates step completion before allowing progression
- [ ] Supports re-running individual steps
- [ ] Returns overall wizard status

---

## Phase 3: API Endpoints

### Task 3.1: Setup Step Routes
**File:** `src/routes/setup.rs`

```
GET  /admin/setup/status               -- Get wizard state (all steps)
POST /admin/setup/step/:step_name      -- Execute/validate a step
POST /admin/setup/test-connection      -- Test connectivity (DB, ComfyUI, etc.)
POST /admin/setup/test-generation      -- Run test generation job
```

**Acceptance Criteria:**
- [ ] Status returns all steps with completion state and configuration
- [ ] Step execution validates and saves configuration
- [ ] Test connection accepts service type and connection params
- [ ] Test generation triggers minimal job and returns result
- [ ] Clear error messages with troubleshooting hints

### Task 3.2: Skip Wizard Route
**File:** `src/routes/setup.rs`

```
POST /admin/setup/skip
```

**Acceptance Criteria:**
- [ ] Marks wizard as complete without validation
- [ ] Available for experts who configure via env vars
- [ ] Logs skip in audit trail

---

## Phase 4: React Frontend

### Task 4.1: Wizard Container
**File:** `frontend/src/pages/SetupWizard.tsx`

Multi-step wizard with progress indicator.

**Acceptance Criteria:**
- [ ] Step progress bar showing completed, current, and remaining steps
- [ ] Each step is a self-contained form
- [ ] Previous/Next navigation with validation gating
- [ ] "Skip Wizard" option for experts
- [ ] Green checkmarks on completed steps

### Task 4.2: Database Connection Step UI
**File:** `frontend/src/components/setup/DatabaseStep.tsx`

**Acceptance Criteria:**
- [ ] Form: host, port, database name, user, password, SSL toggle
- [ ] "Test Connection" button with real-time feedback
- [ ] "Run Migrations" button after successful connection
- [ ] Error messages with troubleshooting hints

### Task 4.3: Storage Configuration Step UI
**File:** `frontend/src/components/setup/StorageStep.tsx`

**Acceptance Criteria:**
- [ ] Path input for root storage directory
- [ ] Disk space check display (available vs. required)
- [ ] Directory creation confirmation
- [ ] Write permission verification indicator

### Task 4.4: ComfyUI Connection Step UI
**File:** `frontend/src/components/setup/ComfyUIStep.tsx`

**Acceptance Criteria:**
- [ ] URL input(s) for ComfyUI instances
- [ ] "Test Connection" per instance
- [ ] Discovered nodes and models displayed
- [ ] "Add Another Instance" for multi-instance setups

### Task 4.5: Admin Account Step UI
**File:** `frontend/src/components/setup/AdminAccountStep.tsx`

**Acceptance Criteria:**
- [ ] Username and password form
- [ ] Password strength indicator
- [ ] Skip if admin already exists
- [ ] Immediate login after creation

### Task 4.6: Worker Registration Step UI
**File:** `frontend/src/components/setup/WorkerStep.tsx`

**Acceptance Criteria:**
- [ ] Worker connection details form
- [ ] GPU detection results display
- [ ] "Run Test Generation" button with progress and result
- [ ] Diagnostics on test failure

### Task 4.7: Integration Steps UI
**File:** `frontend/src/components/setup/IntegrationsStep.tsx`

**Acceptance Criteria:**
- [ ] Collapsible sections for each integration
- [ ] "Test" buttons for each configured integration
- [ ] "Skip" button per integration
- [ ] Clear indication of optional status

### Task 4.8: Final Health Check UI
**File:** `frontend/src/components/setup/HealthCheckStep.tsx`

**Acceptance Criteria:**
- [ ] Runs all health checks with per-service status display
- [ ] All green: "Platform is ready!" success message
- [ ] Any red: specific issues with fix suggestions
- [ ] Link to System Health Page for ongoing monitoring

---

## Phase 5: Testing

### Task 5.1: Step Validation Tests
**File:** `tests/setup_wizard_test.rs`

**Acceptance Criteria:**
- [ ] Test database step with valid and invalid credentials
- [ ] Test storage step with valid and insufficient disk space
- [ ] Test ComfyUI step with reachable and unreachable instances
- [ ] Test wizard state machine step progression
- [ ] Test re-run preserves previous configuration

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_platform_setup.sql` | Setup state table |
| `src/services/setup/database_step.rs` | Database connection validator |
| `src/services/setup/storage_step.rs` | Storage configuration validator |
| `src/services/setup/comfyui_step.rs` | ComfyUI connectivity tester |
| `src/services/setup/admin_account_step.rs` | First admin creation |
| `src/services/setup/worker_step.rs` | Worker registration and test |
| `src/services/setup/integrations_step.rs` | Optional integration setup |
| `src/services/setup/health_check_step.rs` | Final health verification |
| `src/services/setup/wizard.rs` | Wizard state machine |
| `src/routes/setup.rs` | Setup API endpoints |
| `frontend/src/pages/SetupWizard.tsx` | Wizard container page |
| `frontend/src/components/setup/*.tsx` | Per-step UI components |

## Dependencies

### Upstream PRDs
- PRD-03: RBAC for admin account creation
- PRD-05: ComfyUI Bridge for connectivity tests
- PRD-46: Worker Pool for registration
- PRD-80: System Health for final checks
- PRD-81: Backup configuration

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Task 1.1)
2. Phase 2: Rust Backend (Tasks 2.1-2.8)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)
4. Phase 4: React Frontend (Tasks 4.1-4.8)

**MVP Success Criteria:**
- Admin completes initial setup in <30 minutes
- Validation catches 100% of misconfiguration issues
- Final health check identifies all remaining issues
- Re-run correctly preserves existing configuration

### Post-MVP Enhancements
1. Phase 5: Testing (Task 5.1)
2. Environment detection and auto-population (PRD Requirement 2.1)

## Notes

1. **First-run detection** -- The wizard should auto-launch on first platform access if no admin user exists. Check `platform_setup` table for completion status.
2. **Wizard bypass for CI/CD** -- Environment variable `SKIP_SETUP_WIZARD=true` should bypass the wizard entirely for automated deployments.
3. **Security during setup** -- The admin account step is the only unauthenticated wizard step. All subsequent steps require the newly created admin token.
4. **Test generation sample** -- The test generation should use a built-in sample image and minimal workflow to verify the pipeline without requiring user-supplied assets.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-105
