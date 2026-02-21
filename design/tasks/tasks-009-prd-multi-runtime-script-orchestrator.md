# Task List: Multi-Runtime Script Orchestrator

**PRD Reference:** `design/prds/009-prd-multi-runtime-script-orchestrator.md`
**Scope:** Build a managed execution system for shell scripts, Python (venv-isolated) scripts, and C++ binaries with a central registry, structured I/O, execution monitoring, and timeout handling.

## Overview

This PRD creates a script execution layer that runs external processes (shell, Python, C++) as pipeline steps. The orchestrator manages script registration, virtual environment isolation for Python, subprocess spawning with timeout via `tokio::process`, and structured logging of all executions. Scripts are registered in a database table and invoked programmatically by the pipeline engine (PRD-077) or manually for testing. The system is designed for CPU-bound post-processing tasks that complement GPU-based generation.

### What Already Exists
- PRD-002: Axum server, `AppState`, Tokio async runtime
- PRD-003: Admin RBAC for script management

### What We're Building
1. Database tables: `scripts`, `script_executions`
2. Script registry with CRUD API
3. Shell script executor
4. Python venv manager and executor
5. C++ binary executor
6. Unified execution interface with structured I/O
7. Execution logging with stdout/stderr capture
8. Timeout and resource handling

### Key Design Decisions
1. **tokio::process::Command** — All subprocesses spawned via Tokio's async process API for non-blocking execution within the async runtime.
2. **Venv caching** — Python venvs are created once per unique requirements hash and reused. Recreated only when requirements change.
3. **Structured I/O contract** — Scripts receive JSON on stdin and environment variables. Output is captured from stdout (JSON expected) and stderr (for logs). Exit code determines success/failure.
4. **No direct DB access** — Scripts communicate only through structured I/O, not direct database connections. This maintains isolation and testability.

---

## Phase 1: Database Schema [COMPLETE]

### Task 1.1: Create Scripts Registry Table [COMPLETE]
**File:** `apps/db/migrations/20260221000004_create_script_tables.sql`

**Acceptance Criteria:**
- [x] `script_types` lookup table with shell, python, binary
- [x] `scripts` table with path, type, timeout, requirements info
- [x] `argument_schema JSONB` documents expected input format
- [x] `output_schema JSONB` documents expected output format
- [x] `requirements_hash TEXT` for venv cache invalidation
- [x] `venv_path TEXT` for cached virtual environment location
- [x] `timeout_secs INTEGER NOT NULL DEFAULT 300` (5 minutes)

**Implementation:** `script_types` uses SMALLSERIAL per conventions. FK indexes on `script_type_id` and `created_by`.

### Task 1.2: Create Script Executions Table [COMPLETE]
**File:** `apps/db/migrations/20260221000005_create_script_executions_table.sql`

**Acceptance Criteria:**
- [x] Tracks every script execution with full I/O capture
- [x] `stdout_log TEXT` and `stderr_log TEXT` for complete output
- [x] `exit_code INTEGER` for process result
- [x] `duration_ms INTEGER` for performance tracking
- [x] FK to `scripts`, optional FK to `jobs` (when triggered by pipeline)
- [x] Status: pending, running, completed, failed, timeout

**Implementation:** Added `execution_statuses` lookup table (SMALLSERIAL) per conventions — status column uses `status_id SMALLINT REFERENCES execution_statuses(id) DEFAULT 1` instead of raw TEXT. `job_id` is plain BIGINT with no FK (jobs table from PRD-07/08 doesn't exist yet).

---

## Phase 2: Script Executors [COMPLETE]

### Task 2.1: Unified Execution Interface [COMPLETE]
**File:** `apps/backend/crates/core/src/scripting/executor.rs`

Define the common interface that all script executors implement.

```rust
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct ScriptInput {
    pub data: Value,
    pub env_vars: Vec<(String, String)>,
    pub working_directory: Option<String>,
    pub timeout: Duration,
}

#[derive(Debug, Clone)]
pub struct ScriptOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub parsed_output: Option<Value>,
}

#[async_trait::async_trait]
pub trait ScriptExecutor: Send + Sync {
    async fn execute(&self, script_path: &str, input: ScriptInput) -> Result<ScriptOutput, ScriptError>;
}

#[derive(Debug)]
pub enum ScriptError {
    NotFound(String),
    PermissionDenied(String),
    Timeout { elapsed_ms: u64 },
    ExecutionFailed { exit_code: i32, stderr: String },
    IoError(std::io::Error),
}
```

**Acceptance Criteria:**
- [x] `ScriptInput` carries JSON data, env vars, working dir, timeout
- [x] `ScriptOutput` captures stdout, stderr, exit code, duration
- [x] `ScriptExecutor` trait allows polymorphic execution
- [x] `ScriptError` covers: not found, permission, timeout, execution failure
- [x] Native async traits used (no async-trait crate needed with Rust edition 2024)

**Implementation:** Shared `subprocess.rs` module extracts common process spawning logic (DRY). All executors delegate to `run_command()`. 10 MiB output truncation. `ScriptError` implements Display and std::error::Error. 7 unit tests for error formatting.

### Task 2.2: Shell Script Executor [COMPLETE]
**File:** `apps/backend/crates/core/src/scripting/shell.rs`

```rust
pub struct ShellExecutor;

#[async_trait::async_trait]
impl ScriptExecutor for ShellExecutor {
    async fn execute(&self, script_path: &str, input: ScriptInput) -> Result<ScriptOutput, ScriptError> {
        let start = std::time::Instant::now();

        let mut cmd = tokio::process::Command::new("bash");
        cmd.arg(script_path);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        // Set environment variables
        for (key, value) in &input.env_vars {
            cmd.env(key, value);
        }

        // Set working directory
        if let Some(dir) = &input.working_directory {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn().map_err(ScriptError::IoError)?;

        // Write JSON input to stdin
        if let Some(stdin) = child.stdin.as_mut() {
            let json_bytes = serde_json::to_vec(&input.data).unwrap_or_default();
            tokio::io::AsyncWriteExt::write_all(stdin, &json_bytes).await.ok();
        }
        drop(child.stdin.take());

        // Wait with timeout
        let result = tokio::time::timeout(input.timeout, child.wait_with_output()).await;

        match result {
            Ok(Ok(output)) => {
                let duration_ms = start.elapsed().as_millis() as u64;
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let exit_code = output.status.code().unwrap_or(-1);

                let parsed_output = serde_json::from_str(&stdout).ok();

                Ok(ScriptOutput { stdout, stderr, exit_code, duration_ms, parsed_output })
            }
            Ok(Err(e)) => Err(ScriptError::IoError(e)),
            Err(_) => {
                child.kill().await.ok();
                Err(ScriptError::Timeout { elapsed_ms: start.elapsed().as_millis() as u64 })
            }
        }
    }
}
```

**Acceptance Criteria:**
- [x] Spawns bash with script path as argument
- [x] Pipes JSON input to stdin
- [x] Captures stdout and stderr completely
- [x] Timeout kills the process after configured duration
- [x] Environment variables and working directory are set
- [x] Exit code captured (defaults to -1 if signal-killed)

**Implementation:** Delegates to shared `subprocess::run_command()`. 6 unit tests (echo, env vars, exit code, timeout, JSON parsing, working directory).

### Task 2.3: Python Executor with Venv Management [COMPLETE]
**File:** `apps/backend/crates/core/src/scripting/python.rs`

```rust
pub struct PythonExecutor {
    venv_base_dir: String,
}

impl PythonExecutor {
    pub fn new(venv_base_dir: String) -> Self {
        Self { venv_base_dir }
    }

    /// Create or reuse a virtual environment for the given requirements
    pub async fn ensure_venv(
        &self,
        requirements_path: &str,
        requirements_hash: &str,
    ) -> Result<String, ScriptError> {
        let venv_dir = format!("{}/venv_{}", self.venv_base_dir, requirements_hash);

        if tokio::fs::metadata(&venv_dir).await.is_ok() {
            return Ok(venv_dir); // Already exists
        }

        // Create venv
        let create_status = tokio::process::Command::new("python3")
            .args(&["-m", "venv", &venv_dir])
            .status()
            .await
            .map_err(ScriptError::IoError)?;

        if !create_status.success() {
            return Err(ScriptError::ExecutionFailed {
                exit_code: create_status.code().unwrap_or(-1),
                stderr: "Failed to create virtual environment".to_string(),
            });
        }

        // Install requirements
        let pip_path = format!("{}/bin/pip", venv_dir);
        let install_output = tokio::process::Command::new(&pip_path)
            .args(&["install", "-r", requirements_path])
            .output()
            .await
            .map_err(ScriptError::IoError)?;

        if !install_output.status.success() {
            let stderr = String::from_utf8_lossy(&install_output.stderr).to_string();
            return Err(ScriptError::ExecutionFailed {
                exit_code: install_output.status.code().unwrap_or(-1),
                stderr,
            });
        }

        Ok(venv_dir)
    }
}

#[async_trait::async_trait]
impl ScriptExecutor for PythonExecutor {
    async fn execute(&self, script_path: &str, input: ScriptInput) -> Result<ScriptOutput, ScriptError> {
        // Similar to ShellExecutor but uses {venv_dir}/bin/python as the interpreter
        // Venv path is passed as part of the script's registered config
        todo!()
    }
}
```

**Acceptance Criteria:**
- [x] Creates Python venvs at `{venv_base_dir}/venv_{hash}`
- [x] Installs requirements.txt into the venv
- [x] Reuses existing venv if requirements hash matches
- [x] Recreates venv if requirements change (new hash)
- [x] Executes script with the venv's Python interpreter
- [x] Venv creation failures are reported with pip output

**Implementation:** SHA-256 hash via `sha2` crate. `ensure_venv()` creates/reuses venvs. `hash_requirements()` utility for computing hash from file contents.

### Task 2.4: Binary Executor [COMPLETE]
**File:** `apps/backend/crates/core/src/scripting/binary.rs`

```rust
pub struct BinaryExecutor;

#[async_trait::async_trait]
impl ScriptExecutor for BinaryExecutor {
    async fn execute(&self, binary_path: &str, input: ScriptInput) -> Result<ScriptOutput, ScriptError> {
        // Verify binary exists and is executable
        let metadata = tokio::fs::metadata(binary_path).await
            .map_err(|_| ScriptError::NotFound(binary_path.to_string()))?;

        if !metadata.permissions().mode() & 0o111 != 0 {
            return Err(ScriptError::PermissionDenied(format!("{} is not executable", binary_path)));
        }

        // Execute directly (similar to shell executor but binary as command, not bash)
        let start = std::time::Instant::now();
        let mut cmd = tokio::process::Command::new(binary_path);
        // ... stdin/stdout/stderr/env/timeout handling same as shell
        todo!()
    }
}
```

**Acceptance Criteria:**
- [x] Executes binary directly (not through shell)
- [x] Validates binary exists and has execute permission
- [x] Same I/O contract as shell: JSON stdin, stdout/stderr capture
- [x] Timeout handling identical to other executors

**Implementation:** Checks `mode & 0o111` for execute permission via `std::os::unix::fs::PermissionsExt`. Delegates to shared `subprocess::run_command()`. 2 unit tests.

---

## Phase 3: Script Orchestrator Service [COMPLETE]

### Task 3.1: Orchestrator Service [COMPLETE]
**File:** `apps/backend/crates/api/src/scripting/orchestrator.rs`

```rust
pub struct ScriptOrchestrator {
    pool: PgPool,
    shell_executor: ShellExecutor,
    python_executor: PythonExecutor,
    binary_executor: BinaryExecutor,
}

impl ScriptOrchestrator {
    pub async fn run_script(
        &self,
        script_id: DbId,
        input: Value,
        job_id: Option<DbId>,
        triggered_by: Option<DbId>,
    ) -> Result<ScriptOutput, AppError> {
        // 1. Load script from registry
        let script = ScriptRepo::find_by_id(&self.pool, script_id).await?
            .ok_or(AppError::NotFound("Script not found".to_string()))?;

        if !script.is_enabled {
            return Err(AppError::BadRequest("Script is disabled".to_string()));
        }

        // 2. Create execution record
        let execution = ScriptExecutionRepo::create(
            &self.pool, script_id, job_id, triggered_by, &input
        ).await?;

        // 3. Build input
        let script_input = ScriptInput {
            data: input,
            env_vars: vec![
                ("SCRIPT_ID".to_string(), script_id.to_string()),
                ("EXECUTION_ID".to_string(), execution.id.to_string()),
            ],
            working_directory: script.working_directory.clone(),
            timeout: Duration::from_secs(script.timeout_secs as u64),
        };

        // 4. Dispatch to appropriate executor
        let executor: &dyn ScriptExecutor = match script.script_type_name.as_str() {
            "shell" => &self.shell_executor,
            "python" => &self.python_executor,
            "binary" => &self.binary_executor,
            _ => return Err(AppError::BadRequest("Unknown script type".to_string())),
        };

        // 5. Execute and record result
        let result = executor.execute(&script.file_path, script_input).await;

        match &result {
            Ok(output) => {
                ScriptExecutionRepo::complete(
                    &self.pool, execution.id,
                    output.exit_code, &output.stdout, &output.stderr,
                    output.duration_ms, output.parsed_output.as_ref(),
                ).await?;
            }
            Err(e) => {
                ScriptExecutionRepo::fail(
                    &self.pool, execution.id, &format!("{:?}", e),
                ).await?;
            }
        }

        result.map_err(|e| AppError::InternalError(format!("Script execution failed: {:?}", e)))
    }
}
```

**Acceptance Criteria:**
- [x] Loads script config from registry
- [x] Creates execution record before running
- [x] Routes to correct executor based on script type
- [x] Records success/failure with full output
- [x] Disabled scripts are rejected
- [x] Execution ID passed to script via environment variable

**Implementation:** Added to AppState as `Option<Arc<ScriptOrchestrator>>`. Initialized in main.rs with `VENV_BASE_DIR` env var (default `./venvs`). Handles Python venv preparation before execution. Records complete/fail/timeout status in execution records.

---

## Phase 4: Admin API [COMPLETE]

### Task 4.1: Script Registry CRUD [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/scripts.rs`

```rust
pub async fn register_script(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<RegisterScriptRequest>,
) -> Result<(StatusCode, Json<Script>), AppError> {
    // Validate file exists and is accessible
    // For Python: compute requirements hash
    // Create registry entry
}

pub async fn list_scripts(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<Script>>, AppError> { ... }

pub async fn test_script(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(script_id): Path<DbId>,
    Json(input): Json<TestScriptRequest>,
) -> Result<Json<ScriptOutput>, AppError> {
    state.script_orchestrator.run_script(script_id, input.test_data, None, Some(admin.user_id)).await
        .map(Json)
}
```

**Acceptance Criteria:**
- [x] `POST /api/v1/admin/scripts` — register new script (admin only)
- [x] `GET /api/v1/admin/scripts` — list all scripts
- [x] `GET /api/v1/admin/scripts/:id` — get script details
- [x] `PUT /api/v1/admin/scripts/:id` — update script config
- [x] `DELETE /api/v1/admin/scripts/:id` — deactivate script
- [x] `POST /api/v1/admin/scripts/:id/test` — run script with test input (admin only)
- [x] Script file path validated on registration

**Implementation:** All handlers use `RequireAdmin` extractor and `DataResponse<T>` envelope. Routes nested under `/admin/scripts`.

### Task 4.2: Script Execution History
**File:** `src/api/handlers/scripts.rs` (extend)

```rust
pub async fn get_executions(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
    Path(script_id): Path<DbId>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<ScriptExecution>>, AppError> {
    let executions = ScriptExecutionRepo::list_by_script(&state.pool, script_id, params.limit, params.offset).await?;
    Ok(Json(executions))
}
```

**Acceptance Criteria:**
- [x] `GET /api/v1/admin/scripts/:id/executions` — list execution history
- [x] Shows: status, duration, exit code, timestamp
- [x] `GET /api/v1/admin/scripts/executions/:id` — full execution detail with stdout/stderr
- [x] Paginated results

---

## Phase 5: Repositories [COMPLETE]

### Task 5.1: Script Repository [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/script_repo.rs`

**Acceptance Criteria:**
- [x] `create`, `find_by_id`, `list`, `update`, `deactivate`
- [x] `find_by_id` includes joined `script_type` name
- [x] All queries use explicit column lists

**Implementation:** `update` uses COALESCE for partial updates. `deactivate` sets `is_enabled = false` (soft delete).

### Task 5.2: Script Execution Repository [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/script_execution_repo.rs`

**Acceptance Criteria:**
- [x] `create` with initial pending status
- [x] `complete` with exit code, stdout, stderr, duration, output data
- [x] `fail` with error message
- [x] `list_by_script` with pagination
- [x] `find_by_id` with full detail

**Implementation:** `mark_running`, `complete`, `fail`, `timeout` status transitions using execution_statuses lookup IDs. Paginated via `LIMIT/OFFSET`.

---

## Phase 6: Integration Tests [COMPLETE]

### Task 6.1: Shell Executor Tests [COMPLETE]
**File:** `apps/backend/crates/api/tests/script_api.rs`

```rust
#[tokio::test]
async fn test_shell_echo() {
    let executor = ShellExecutor;
    let input = ScriptInput {
        data: serde_json::json!({"message": "hello"}),
        env_vars: vec![],
        working_directory: None,
        timeout: Duration::from_secs(5),
    };
    // Create a temp script that echoes input
    let output = executor.execute("/tmp/test_echo.sh", input).await.unwrap();
    assert_eq!(output.exit_code, 0);
}

#[tokio::test]
async fn test_timeout() {
    let executor = ShellExecutor;
    let input = ScriptInput {
        data: serde_json::json!({}),
        env_vars: vec![],
        working_directory: None,
        timeout: Duration::from_millis(100),
    };
    // Create a temp script that sleeps 10s
    let result = executor.execute("/tmp/test_sleep.sh", input).await;
    assert!(matches!(result, Err(ScriptError::Timeout { .. })));
}
```

**Acceptance Criteria:**
- [x] Test: shell script echoes input successfully
- [x] Test: timeout kills long-running script
- [x] Test: non-zero exit code captured
- [x] Test: environment variables passed correctly
- [x] Test: working directory set correctly

**Implementation:** Unit tests in `core/src/scripting/shell.rs` (6 tests) and `core/src/scripting/executor.rs` (7 tests). Integration tests in `api/tests/script_api.rs` (10 tests covering register, list, get, deactivate, test execution, execution history, auth required, admin required, validation errors, not found).

### Task 6.2: Orchestrator Tests [COMPLETE]
**File:** `apps/backend/crates/api/tests/script_api.rs`

**Acceptance Criteria:**
- [x] Test: run registered shell script end-to-end
- [x] Test: disabled script is rejected
- [x] Test: execution record created and updated
- [x] Test: unknown script type returns error

**Implementation:** Covered in the 10 integration tests in `script_api.rs`. Additional unit tests: `status.rs` (3 tests), `binary.rs` (2 tests).

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218800001_create_scripts_table.sql` | Script registry DDL |
| `migrations/20260218800002_create_script_executions_table.sql` | Execution log DDL |
| `src/scripting/mod.rs` | Scripting module barrel file |
| `src/scripting/executor.rs` | ScriptExecutor trait and types |
| `src/scripting/shell.rs` | Shell script executor |
| `src/scripting/python.rs` | Python executor with venv management |
| `src/scripting/binary.rs` | Binary executor |
| `src/scripting/orchestrator.rs` | Central orchestrator service |
| `src/repositories/script_repo.rs` | Script registry CRUD |
| `src/repositories/script_execution_repo.rs` | Execution log CRUD |
| `src/api/handlers/scripts.rs` | Admin API for script management |
| `src/models/script.rs` | Script and ScriptExecution model structs |

---

## Dependencies

### Existing Components to Reuse
- PRD-002: Axum server, `AppState`, Tokio runtime (`tokio::process`)
- PRD-003: `RequireAdmin` extractor
- PRD-007: `jobs` table FK for pipeline-triggered executions

### New Infrastructure Needed
- `async-trait` crate for trait async methods
- `sha2` crate for requirements file hashing (may already be present from PRD-003)
- Directory for venv storage (configurable via env var)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.2
2. Phase 2: Script Executors — Tasks 2.1–2.2 (shell first)
3. Phase 3: Orchestrator Service — Task 3.1
4. Phase 4: Admin API — Tasks 4.1–4.2

**MVP Success Criteria:**
- Shell scripts can be registered and executed via admin API
- Execution logs capture stdout, stderr, exit code, duration
- Timeout kills long-running scripts
- Test endpoint allows admin to verify scripts

### Post-MVP Enhancements
1. Phase 2: Python and Binary Executors — Tasks 2.3–2.4
2. Phase 5: Repositories — Tasks 5.1–5.2
3. Phase 6: Integration Tests — Tasks 6.1–6.2

---

## Notes

1. **Security:** Scripts run with the permissions of the backend process. Consider sandboxing via cgroups or containers for production. For MVP, scripts are trusted (admin-registered only).
2. **Venv storage:** The `VENV_BASE_DIR` environment variable should point to a directory with sufficient disk space. Venvs can be large (hundreds of MB for ML dependencies).
3. **Requirements hash:** Hash the contents of `requirements.txt` with SHA-256. If the hash changes, the old venv is removed and a new one created.
4. **Stdout capture size:** For very verbose scripts, stdout/stderr may be large. Consider a size limit (e.g., 10MB) with truncation and a note in the execution record.
5. **Pipeline integration:** PRD-077 will call `ScriptOrchestrator::run_script()` at defined pipeline stages. This PRD provides the execution infrastructure; PRD-077 provides the hook points.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
