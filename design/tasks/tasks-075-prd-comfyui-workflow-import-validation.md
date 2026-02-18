# Task List: ComfyUI Workflow Import & Validation

**PRD Reference:** `design/prds/075-prd-comfyui-workflow-import-validation.md`
**Scope:** Build structured import, validation, and versioning of ComfyUI workflow JSON files with node validation, model/LoRA verification, parameter discovery, dry-run testing, and version management.

## Overview

Scene types reference ComfyUI workflows, but importing a workflow that references a missing custom node or model results in silent failure during generation. This feature validates workflows at import time, checking every custom node against installed nodes on all active workers and every model/LoRA reference against the asset registry. It automatically discovers configurable parameters (seed, CFG, denoise, prompts) and exposes them as named slots for scene type configuration. Workflows are versioned with diff views, and a dry-run test verifies end-to-end functionality before production use.

### What Already Exists
- PRD-05 ComfyUI WebSocket Bridge for communication
- PRD-17 Asset Registry for model/LoRA tracking
- PRD-23 Scene Type Configuration referencing workflows
- PRD-43 System Integrity for node detection
- PRD-46 Worker Pool for worker enumeration

### What We're Building
1. Database tables for workflows and workflow versions
2. Rust workflow parser and node/model validator
3. Parameter discovery engine
4. Dry-run test execution service
5. Version management with diff computation
6. API endpoints for import, validate, dry-run, and version management
7. React import wizard UI

### Key Design Decisions
1. **Validation at import time** -- Catch issues immediately, not during a production batch run.
2. **Three-state workflow status** -- Draft (just imported), Tested (dry-run passed), Production (assigned to scene types).
3. **Parameter discovery is heuristic** -- Auto-detection identifies common parameter patterns; users can manually mark additional parameters.
4. **Scene types pin to versions** -- Scene types reference a specific workflow version, not "latest." Upgrading is explicit.

---

## Phase 1: Database Schema

### Task 1.1: Workflow Statuses Table
**File:** `migrations/YYYYMMDDHHMMSS_create_workflow_statuses.sql`

```sql
CREATE TABLE workflow_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflow_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO workflow_statuses (name, description) VALUES
    ('draft', 'Workflow imported but not yet validated or tested'),
    ('validated', 'All nodes and models verified present on workers'),
    ('tested', 'Dry-run test passed successfully'),
    ('production', 'Approved for use in scene type configurations'),
    ('deprecated', 'Replaced by a newer version, no new assignments');
```

**Acceptance Criteria:**
- [ ] Five workflow statuses seeded
- [ ] Follows status lookup table convention from PRD-000

### Task 1.2: Workflows Table
**File:** `migrations/YYYYMMDDHHMMSS_create_workflows.sql`

```sql
CREATE TABLE workflows (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    current_version INTEGER NOT NULL DEFAULT 1,
    status_id BIGINT NOT NULL REFERENCES workflow_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    json_content JSONB NOT NULL,       -- ComfyUI workflow JSON
    discovered_params_json JSONB,      -- auto-discovered configurable parameters
    validation_results_json JSONB,     -- latest validation results
    imported_from TEXT,                -- 'file_upload' or 'comfyui_api'
    imported_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflows_status_id ON workflows(status_id);
CREATE INDEX idx_workflows_imported_by ON workflows(imported_by);
CREATE UNIQUE INDEX uq_workflows_name ON workflows(name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Workflow JSON stored as JSONB for querying
- [ ] Discovered parameters stored alongside for quick access
- [ ] Unique name constraint
- [ ] Status FK with index

### Task 1.3: Workflow Versions Table
**File:** `migrations/YYYYMMDDHHMMSS_create_workflow_versions.sql`

```sql
CREATE TABLE workflow_versions (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version INTEGER NOT NULL,
    json_content JSONB NOT NULL,
    discovered_params_json JSONB,
    change_summary TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);
CREATE UNIQUE INDEX uq_workflow_versions_workflow_version ON workflow_versions(workflow_id, version);
CREATE INDEX idx_workflow_versions_created_by ON workflow_versions(created_by);
```

**Acceptance Criteria:**
- [ ] One row per version per workflow
- [ ] Unique constraint on (workflow_id, version)
- [ ] Stores the full JSON for each version

---

## Phase 2: Rust Backend

### Task 2.1: Workflow Parser
**File:** `src/services/workflow_parser.rs`

Parse ComfyUI workflow JSON and extract node references.

```rust
pub struct ParsedWorkflow {
    pub nodes: Vec<WorkflowNode>,
    pub connections: Vec<NodeConnection>,
    pub referenced_models: Vec<String>,
    pub referenced_loras: Vec<String>,
    pub referenced_custom_nodes: Vec<String>,
}

pub struct WorkflowNode {
    pub id: String,
    pub class_type: String,
    pub inputs: serde_json::Value,
}
```

**Acceptance Criteria:**
- [ ] Parses ComfyUI workflow JSON format
- [ ] Extracts all referenced custom node types
- [ ] Extracts all model and LoRA file references
- [ ] Handles nested and dynamic workflow structures
- [ ] Returns structured representation for validation

### Task 2.2: Node Validator
**File:** `src/services/workflow_node_validator.rs`

Check all custom nodes are installed on all active workers.

**Acceptance Criteria:**
- [ ] Queries each worker for installed node list (via PRD-05/PRD-43)
- [ ] Compares against workflow's required nodes
- [ ] Reports per-node, per-worker pass/fail
- [ ] Missing nodes flagged with install instructions or auto-install trigger (PRD-43)
- [ ] Workflows with missing nodes cannot reach "production" status

### Task 2.3: Model/LoRA Validator
**File:** `src/services/workflow_model_validator.rs`

Verify all model and LoRA references exist in the asset registry.

**Acceptance Criteria:**
- [ ] Checks each model reference against PRD-17 asset registry
- [ ] Checks each LoRA reference against PRD-17 asset registry
- [ ] Reports missing assets with links to the asset registry
- [ ] Workflows with missing assets cannot reach "production" status

### Task 2.4: Parameter Discovery Engine
**File:** `src/services/parameter_discovery.rs`

Automatically detect configurable parameters in the workflow.

```rust
pub struct DiscoveredParameter {
    pub node_id: String,
    pub input_name: String,
    pub param_type: ParamType,         // Seed, CFG, Denoise, Prompt, Image, etc.
    pub current_value: serde_json::Value,
    pub suggested_name: String,        // human-readable slot name
    pub category: String,              // "generation", "quality", "content"
    pub is_user_marked: bool,          // false = auto-discovered, true = manually added
}
```

**Acceptance Criteria:**
- [ ] Auto-detects: seed, CFG, denoise, prompt text, image inputs
- [ ] Categories: generation, quality, content
- [ ] Parameters exposed as named slots for PRD-23 scene type configuration
- [ ] Manual override: users can mark additional parameters as configurable
- [ ] Discovery runs automatically on import

### Task 2.5: Dry-Run Test Service
**File:** `src/services/workflow_dry_run.rs`

Submit a test execution with a sample image to verify end-to-end functionality.

**Acceptance Criteria:**
- [ ] Submits test execution to at least one worker
- [ ] Uses a built-in sample image (ships with platform)
- [ ] Configurable timeout (default: 5 minutes)
- [ ] On success: marks workflow as "tested"
- [ ] On failure: captures error details and displays them

### Task 2.6: Version Management Service
**File:** `src/services/workflow_version.rs`

**Acceptance Criteria:**
- [ ] Each import or edit creates a new version
- [ ] Diff between two versions: nodes added/removed, parameters changed
- [ ] Scene types reference a specific version
- [ ] Upgrading a scene type to a new workflow version is explicit

### Task 2.7: Duplicate Detection
**File:** `src/services/workflow_duplicate_detector.rs`

**Acceptance Criteria:**
- [ ] On import, check if a structurally similar workflow already exists
- [ ] Compare node graph topology (ignoring parameter values)
- [ ] Warn user if a potential duplicate is found
- [ ] Does not block import -- just warns

---

## Phase 3: API Endpoints

### Task 3.1: Workflow Import Routes
**File:** `src/routes/workflows.rs`

```
POST /workflows/import                 -- Import from file upload
POST /workflows/import-from-comfyui    -- Pull from connected instance
```

**Acceptance Criteria:**
- [ ] File upload accepts JSON
- [ ] ComfyUI pull connects to instance API and downloads current workflow
- [ ] Both paths: parse, validate, discover params, check duplicates
- [ ] Returns workflow ID with validation results

### Task 3.2: Validation & Dry-Run Routes
**File:** `src/routes/workflows.rs`

```
POST /workflows/:id/validate          -- Run node/model validation
POST /workflows/:id/dry-run           -- Execute test run
GET  /workflows/:id/validation-report -- Get latest validation results
```

**Acceptance Criteria:**
- [ ] Validate triggers node and model checks against all workers
- [ ] Dry-run is async: returns job ID for polling
- [ ] Validation report returns structured pass/fail per node/model per worker

### Task 3.3: Version Routes
**File:** `src/routes/workflows.rs`

```
GET /workflows/:id/versions            -- List versions
GET /workflows/:id/versions/:v         -- Get specific version
GET /workflows/:id/diff?v1=X&v2=Y     -- Diff between versions
```

**Acceptance Criteria:**
- [ ] Version list with created_by, date, and summary
- [ ] Diff shows nodes changed, parameters added/removed
- [ ] Version content includes full JSON

### Task 3.4: Workflow CRUD Routes
**File:** `src/routes/workflows.rs`

```
GET    /workflows                      -- List all workflows
GET    /workflows/:id                  -- Get workflow details
PUT    /workflows/:id                  -- Update (creates new version)
DELETE /workflows/:id                  -- Delete (only if not in use)
```

**Acceptance Criteria:**
- [ ] List filterable by status, scene type usage
- [ ] Update creates new version and re-validates
- [ ] Delete blocked if workflow is referenced by active scene types

---

## Phase 4: React Frontend

### Task 4.1: Workflow Import Wizard
**File:** `frontend/src/pages/WorkflowImport.tsx`

Guided import flow: upload -> validate -> discover params -> dry-run.

**Acceptance Criteria:**
- [ ] Step 1: Upload JSON or select ComfyUI instance
- [ ] Step 2: Validation results with per-node/model pass/fail
- [ ] Step 3: Discovered parameters with rename/categorize controls
- [ ] Step 4: Dry-run test with result display
- [ ] Progress through steps with back/next navigation

### Task 4.2: Validation Results View
**File:** `frontend/src/components/workflows/ValidationResults.tsx`

**Acceptance Criteria:**
- [ ] Per-node, per-worker status grid (green check / red X)
- [ ] Missing nodes with install action buttons (PRD-43)
- [ ] Missing models with links to asset registry (PRD-17)
- [ ] Overall pass/fail summary

### Task 4.3: Parameter Discovery Editor
**File:** `frontend/src/components/workflows/ParameterEditor.tsx`

**Acceptance Criteria:**
- [ ] List of discovered parameters with type and current value
- [ ] Rename and recategorize parameters
- [ ] Toggle parameters as configurable or fixed
- [ ] Add manual parameters not auto-discovered

### Task 4.4: Version Diff View
**File:** `frontend/src/components/workflows/VersionDiff.tsx`

**Acceptance Criteria:**
- [ ] Side-by-side or inline diff between two versions
- [ ] Nodes added (green), removed (red), modified (yellow)
- [ ] Parameter changes highlighted
- [ ] Version selector dropdown

---

## Phase 5: Testing

### Task 5.1: Workflow Parser Tests
**File:** `tests/workflow_parser_test.rs`

**Acceptance Criteria:**
- [ ] Test parsing valid ComfyUI workflow JSON
- [ ] Test extraction of custom node references
- [ ] Test extraction of model/LoRA references
- [ ] Test handling of malformed JSON

### Task 5.2: Validation Tests
**File:** `tests/workflow_validation_test.rs`

**Acceptance Criteria:**
- [ ] Test node validation catches missing nodes
- [ ] Test model validation catches missing models
- [ ] Test parameter discovery identifies seed, CFG, denoise, prompt
- [ ] Test duplicate detection identifies similar workflows

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_workflow_statuses.sql` | Workflow status lookup |
| `migrations/YYYYMMDDHHMMSS_create_workflows.sql` | Workflow storage table |
| `migrations/YYYYMMDDHHMMSS_create_workflow_versions.sql` | Version tracking |
| `src/services/workflow_parser.rs` | JSON parser and node extractor |
| `src/services/workflow_node_validator.rs` | Node installation checker |
| `src/services/workflow_model_validator.rs` | Model/LoRA checker |
| `src/services/parameter_discovery.rs` | Auto parameter detection |
| `src/services/workflow_dry_run.rs` | Test execution service |
| `src/services/workflow_version.rs` | Version management and diff |
| `src/services/workflow_duplicate_detector.rs` | Duplicate detection |
| `src/routes/workflows.rs` | Workflow API endpoints |
| `frontend/src/pages/WorkflowImport.tsx` | Import wizard |
| `frontend/src/components/workflows/ValidationResults.tsx` | Validation display |
| `frontend/src/components/workflows/ParameterEditor.tsx` | Parameter editor |
| `frontend/src/components/workflows/VersionDiff.tsx` | Version diff view |

## Dependencies

### Upstream PRDs
- PRD-05: ComfyUI Bridge, PRD-17: Asset Registry, PRD-23: Scene Types, PRD-43: System Integrity, PRD-46: Worker Pool

### Downstream PRDs
- PRD-23: Scene Type Configuration, PRD-65: Regression Testing, PRD-77: Pipeline Hooks

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.7)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)

**MVP Success Criteria:**
- Node validation catches 100% of missing custom nodes
- Model/LoRA validation catches 100% of missing references
- Parameter discovery identifies >90% of configurable parameters
- Dry-run test completes within configured timeout

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Workflow library browser (PRD Requirement 2.1)

## Notes

1. **ComfyUI JSON format** -- ComfyUI workflows use a node graph format with numbered nodes and connection references. The parser must handle this specific structure.
2. **Parameter discovery heuristics** -- Look for nodes of type `KSampler` (seed, CFG, denoise), `CLIPTextEncode` (prompt), `LoadImage` (image input). These are the most common configurable parameters.
3. **Dry-run sample image** -- Ship a small (512x512) sample image with the platform for dry-run testing. This avoids requiring user-supplied assets during setup.
4. **Version retention** -- Keep all workflow versions indefinitely. They are small (JSON) and referenced by scene types.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-075
