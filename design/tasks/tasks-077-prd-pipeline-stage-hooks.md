# Task List: Pipeline Stage Hooks (Custom Scripts)

**PRD Reference:** `design/prds/077-prd-pipeline-stage-hooks.md`
**Scope:** Build user-defined pre/post script hooks at configurable pipeline stages with Shell, Python, and HTTP webhook support, configurable failure handling, and studio/project/scene-type inheritance.

## Overview

Every studio has custom requirements that do not fit a generic pipeline: proprietary color grading, custom watermarking, metadata enrichment, integration with internal tools. This feature provides clean extensibility points where studio-specific logic plugs in without touching the core platform. Hooks execute at defined pipeline stages (post-variant, pre/post-segment, pre-concatenation, post-delivery), support multiple execution backends (Shell, Python, HTTP webhook), and inherit through a three-level hierarchy (studio > project > scene type).

### What Already Exists
- PRD-09 Multi-Runtime Script Orchestrator for execution backends
- PRD-10 Event Bus for triggering hooks
- PRD-75 Workflow Import for workflow context

### What We're Building
1. Database table for hook registry with scope and inheritance
2. Rust hook executor service dispatching to script runtimes and webhooks
3. Inheritance resolver computing effective hooks for any scope
4. Configurable failure handling (block, warn, ignore)
5. Execution logging with full input/output capture
6. API endpoints for hook CRUD, testing, and effective-hooks query
7. React hook management UI with inheritance visualization

### Key Design Decisions
1. **Three-level inheritance** -- Studio hooks apply to all projects. Project hooks override studio hooks. Scene-type hooks override project hooks.
2. **Structured JSON input** -- Every hook receives a structured JSON payload with segment path, metadata, and scene context.
3. **Failure modes are per-hook** -- Each hook independently decides whether failure blocks the pipeline, warns, or is ignored.
4. **Execution logs in job detail** -- Hook execution logs are visible alongside generation job details.

---

## Phase 1: Database Schema

### Task 1.1: Hooks Table
**File:** `migrations/YYYYMMDDHHMMSS_create_hooks.sql`

```sql
CREATE TABLE hooks (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    hook_type TEXT NOT NULL CHECK (hook_type IN ('shell', 'python', 'webhook')),
    hook_point TEXT NOT NULL CHECK (hook_point IN ('post_variant', 'pre_segment', 'post_segment', 'pre_concatenation', 'post_delivery')),
    scope_type TEXT NOT NULL CHECK (scope_type IN ('studio', 'project', 'scene_type')),
    scope_id BIGINT,                   -- NULL for studio scope, project_id or scene_type_id otherwise
    failure_mode TEXT NOT NULL DEFAULT 'warn' CHECK (failure_mode IN ('block', 'warn', 'ignore')),
    config_json JSONB NOT NULL,        -- script path, webhook URL, env vars, timeout, etc.
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hooks_hook_point ON hooks(hook_point);
CREATE INDEX idx_hooks_scope ON hooks(scope_type, scope_id);
CREATE INDEX idx_hooks_created_by ON hooks(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON hooks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Hook types: shell, python, webhook
- [ ] Five hook points covering the full pipeline
- [ ] Scope hierarchy: studio (scope_id NULL), project, scene_type
- [ ] Failure modes: block, warn, ignore
- [ ] Sort order for controlling execution sequence

### Task 1.2: Hook Execution Logs Table
**File:** `migrations/YYYYMMDDHHMMSS_create_hook_execution_logs.sql`

```sql
CREATE TABLE hook_execution_logs (
    id BIGSERIAL PRIMARY KEY,
    hook_id BIGINT NOT NULL REFERENCES hooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL ON UPDATE CASCADE,
    input_json JSONB,
    output_text TEXT,
    exit_code INTEGER,
    duration_ms BIGINT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hook_execution_logs_hook_id ON hook_execution_logs(hook_id);
CREATE INDEX idx_hook_execution_logs_job_id ON hook_execution_logs(job_id);
CREATE INDEX idx_hook_execution_logs_executed_at ON hook_execution_logs(executed_at);
```

**Acceptance Criteria:**
- [ ] Full input/output capture for debugging
- [ ] Linked to both hook and job for traceability
- [ ] Duration tracked for performance monitoring
- [ ] No `updated_at` -- execution logs are immutable

---

## Phase 2: Rust Backend

### Task 2.1: Hook Executor Service
**File:** `src/services/hook_executor.rs`

Dispatches hook execution to the appropriate backend.

```rust
pub struct HookExecutor {
    script_runtime: Arc<ScriptOrchestrator>,  // PRD-09
    http_client: reqwest::Client,
}

pub struct HookInput {
    pub segment_path: Option<String>,
    pub metadata: serde_json::Value,
    pub scene_context: serde_json::Value,
    pub hook_config: serde_json::Value,
}

pub struct HookResult {
    pub success: bool,
    pub output: String,
    pub exit_code: Option<i32>,
    pub duration_ms: i64,
    pub error: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] Shell scripts executed via PRD-09 runtime
- [ ] Python scripts executed via PRD-09 venv runtime
- [ ] HTTP webhooks called via reqwest with configurable timeout
- [ ] Scripts receive structured JSON input via stdin or environment
- [ ] Returns pass/fail status and output data
- [ ] Execution adds <2 seconds overhead (excluding script runtime)

### Task 2.2: Inheritance Resolver
**File:** `src/services/hook_inheritance.rs`

Compute the effective set of hooks for a given scope.

```rust
pub struct InheritanceResolver {
    pool: PgPool,
}

impl InheritanceResolver {
    /// Returns the effective hooks for a scene type, merging studio, project, and scene-type hooks.
    /// Scene-type hooks override project hooks, which override studio hooks.
    pub async fn resolve_effective_hooks(
        &self,
        scene_type_id: DbId,
        project_id: DbId,
        hook_point: &str,
    ) -> Result<Vec<Hook>, HookError> {
        // 1. Get studio-level hooks for this hook_point
        // 2. Get project-level hooks, override studio hooks with same name
        // 3. Get scene-type-level hooks, override project hooks with same name
        // 4. Sort by sort_order
        // 5. Filter out disabled hooks
    }
}
```

**Acceptance Criteria:**
- [ ] Studio-level hooks apply to all projects unless overridden
- [ ] Project-level hooks override studio hooks by name
- [ ] Scene-type hooks override project hooks by name
- [ ] Disabled hooks excluded from effective set
- [ ] Returns hooks sorted by `sort_order`

### Task 2.3: Failure Handler
**File:** `src/services/hook_failure_handler.rs`

Handle hook execution failures based on configured failure mode.

**Acceptance Criteria:**
- [ ] Block: stop pipeline, set job to "failed", flag for review
- [ ] Warn: log warning, continue pipeline execution
- [ ] Ignore: silent continue, log only
- [ ] All failures logged in `hook_execution_logs`
- [ ] Block-mode failures emit event via PRD-10

### Task 2.4: Pipeline Integration
**File:** `src/services/hook_pipeline_integration.rs`

Integrate hook execution into the generation pipeline at each hook point.

**Acceptance Criteria:**
- [ ] Post-Variant: called after clothed variant generation
- [ ] Pre-Segment: called before each segment starts
- [ ] Post-Segment: called after each segment completes
- [ ] Pre-Concatenation: called before segments are assembled
- [ ] Post-Delivery: called after ZIP packaging
- [ ] Each hook point passes appropriate context in HookInput

---

## Phase 3: API Endpoints

### Task 3.1: Hook CRUD Routes
**File:** `src/routes/hooks.rs`

```
GET    /hooks                          -- List hooks (filterable by scope, point)
POST   /hooks                          -- Create a hook
GET    /hooks/:id                      -- Get hook details
PUT    /hooks/:id                      -- Update hook
DELETE /hooks/:id                      -- Delete hook
```

**Acceptance Criteria:**
- [ ] List filterable by scope_type, scope_id, hook_point, enabled
- [ ] Create validates hook_type, hook_point, scope, config
- [ ] Update creates audit trail entry

### Task 3.2: Hook Test Route
**File:** `src/routes/hooks.rs`

```
POST /hooks/:id/test                   -- Execute hook with sample data
```

**Acceptance Criteria:**
- [ ] Runs hook with configurable sample input
- [ ] Returns full execution result (output, exit code, duration)
- [ ] Does not affect real pipeline data
- [ ] Execution logged

### Task 3.3: Effective Hooks Route
**File:** `src/routes/hooks.rs`

```
GET /hooks/effective/:scope_type/:scope_id?hook_point=X
```

**Acceptance Criteria:**
- [ ] Returns the resolved set of hooks after inheritance
- [ ] Each hook annotated with its source level (studio, project, scene_type)
- [ ] Clearly shows which hooks are inherited vs. locally overridden

### Task 3.4: Hook Execution Log Routes
**File:** `src/routes/hooks.rs`

```
GET /hooks/:id/logs                    -- Execution logs for a hook
GET /jobs/:id/hook-logs                -- Hook logs for a job
```

**Acceptance Criteria:**
- [ ] Paginated execution history per hook
- [ ] Per-job hook log shows all hooks executed during that job
- [ ] Filterable by success/failure

---

## Phase 4: React Frontend

### Task 4.1: Hook Registry Manager
**File:** `frontend/src/pages/HookManager.tsx`

**Acceptance Criteria:**
- [ ] List hooks grouped by hook point
- [ ] Scope indicator (studio, project, scene type) with inheritance chain
- [ ] Create/edit form with type, point, scope, failure mode, config
- [ ] Enable/disable toggle per hook
- [ ] Drag to reorder (sort_order)

### Task 4.2: Inheritance Visualization
**File:** `frontend/src/components/hooks/InheritanceView.tsx`

**Acceptance Criteria:**
- [ ] Tree view showing studio > project > scene type hierarchy
- [ ] Inherited hooks shown with dotted border
- [ ] Overridden hooks shown with strikethrough on parent
- [ ] Click to navigate to any hook's definition

### Task 4.3: Hook Test Console
**File:** `frontend/src/components/hooks/HookTestConsole.tsx`

**Acceptance Criteria:**
- [ ] "Test Hook" button on each hook
- [ ] Sample input JSON editor (pre-populated with realistic data)
- [ ] Execute button with loading state
- [ ] Output display: stdout, stderr, exit code, duration

### Task 4.4: Execution Log Viewer
**File:** `frontend/src/components/hooks/ExecutionLogViewer.tsx`

**Acceptance Criteria:**
- [ ] Accessible from both hook detail and job detail views
- [ ] Each log entry: input, output, duration, exit code, success/failure
- [ ] Failed executions highlighted
- [ ] Filterable by success/failure

---

## Phase 5: Testing

### Task 5.1: Inheritance Resolution Tests
**File:** `tests/hook_inheritance_test.rs`

**Acceptance Criteria:**
- [ ] Test studio hooks apply when no project/scene-type overrides
- [ ] Test project hooks override studio hooks
- [ ] Test scene-type hooks override project hooks
- [ ] Test disabled hooks are excluded
- [ ] Test sort_order is respected

### Task 5.2: Hook Execution Tests
**File:** `tests/hook_execution_test.rs`

**Acceptance Criteria:**
- [ ] Test shell script execution with input/output
- [ ] Test Python script execution
- [ ] Test webhook call with response handling
- [ ] Test block failure mode halts pipeline
- [ ] Test warn failure mode continues pipeline
- [ ] Test execution logging captures all details

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_hooks.sql` | Hook registry table |
| `migrations/YYYYMMDDHHMMSS_create_hook_execution_logs.sql` | Execution log table |
| `src/services/hook_executor.rs` | Hook execution dispatcher |
| `src/services/hook_inheritance.rs` | Scope inheritance resolver |
| `src/services/hook_failure_handler.rs` | Failure mode handler |
| `src/services/hook_pipeline_integration.rs` | Pipeline integration points |
| `src/routes/hooks.rs` | Hook API endpoints |
| `frontend/src/pages/HookManager.tsx` | Hook management page |
| `frontend/src/components/hooks/InheritanceView.tsx` | Inheritance visualization |
| `frontend/src/components/hooks/HookTestConsole.tsx` | Test execution UI |
| `frontend/src/components/hooks/ExecutionLogViewer.tsx` | Log viewer |

## Dependencies

### Upstream PRDs
- PRD-09: Multi-Runtime Script Orchestrator
- PRD-10: Event Bus for triggering
- PRD-75: Workflow Import

### Downstream PRDs
- PRD-39: Scene Assembler, PRD-81: Backup & Disaster Recovery

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Rust Backend (Tasks 2.1-2.4)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)

**MVP Success Criteria:**
- Hook execution adds <2 seconds overhead per hook
- 100% of hook executions have complete logs
- Inheritance resolution correct at all scope levels
- Block-mode failures correctly halt the pipeline

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Hook marketplace (PRD Requirement 2.1)

## Notes

1. **Hook config schema** -- Shell: `{script_path, args, env, timeout_seconds}`. Python: `{script_path, venv, args, env, timeout_seconds}`. Webhook: `{url, method, headers, timeout_seconds, auth}`.
2. **Timeouts** -- Each hook has a configurable timeout (default: 30 seconds for scripts, 10 seconds for webhooks). Exceeding the timeout counts as failure.
3. **Override semantics** -- Override is by hook name within the same hook_point. A project hook named "color_grade" at "post_segment" replaces a studio hook with the same name at the same point.
4. **Parallel vs. sequential** -- Hooks at the same point execute sequentially in `sort_order`. The open question about parallel execution is deferred to post-MVP.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-077
