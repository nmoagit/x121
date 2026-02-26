//! Central script orchestrator service.
//!
//! Coordinates script lookup, execution record lifecycle, executor dispatch,
//! and result recording. Held in [`AppState`](crate::state::AppState) as an
//! `Arc<ScriptOrchestrator>`.

use std::time::Duration;

use sqlx::PgPool;
use x121_core::script_types::{SCRIPT_TYPE_BINARY, SCRIPT_TYPE_PYTHON, SCRIPT_TYPE_SHELL};
use x121_core::scripting::binary::BinaryExecutor;
use x121_core::scripting::executor::{ScriptError, ScriptExecutor, ScriptInput, ScriptOutput};
use x121_core::scripting::python::PythonExecutor;
use x121_core::scripting::shell::ShellExecutor;
use x121_core::types::DbId;

use x121_db::models::script::CreateScriptExecution;
use x121_db::repositories::{ScriptExecutionRepo, ScriptRepo};

use crate::error::{AppError, AppResult};

/// Orchestrates script execution across shell, Python, and binary runtimes.
///
/// Manages the full lifecycle:
/// 1. Load script configuration from the registry.
/// 2. Validate the script is enabled.
/// 3. Create an execution record (pending).
/// 4. Mark execution as running.
/// 5. Dispatch to the appropriate executor.
/// 6. Record the result (completed / failed / timeout).
pub struct ScriptOrchestrator {
    pool: PgPool,
    shell_executor: ShellExecutor,
    python_executor: PythonExecutor,
    binary_executor: BinaryExecutor,
}

impl ScriptOrchestrator {
    /// Create a new orchestrator with the given database pool and venv base directory.
    pub fn new(pool: PgPool, venv_base_dir: String) -> Self {
        Self {
            pool,
            shell_executor: ShellExecutor,
            python_executor: PythonExecutor::new(venv_base_dir),
            binary_executor: BinaryExecutor,
        }
    }

    /// Run a registered script by ID.
    ///
    /// `job_id` should be `Some` when triggered by the pipeline engine,
    /// `None` for admin test invocations.
    pub async fn run_script(
        &self,
        script_id: DbId,
        input_data: serde_json::Value,
        job_id: Option<DbId>,
        triggered_by: Option<DbId>,
    ) -> AppResult<ScriptOutput> {
        // 1. Load script from registry.
        let script = ScriptRepo::find_by_id(&self.pool, script_id)
            .await?
            .ok_or_else(|| AppError::BadRequest(format!("Script {script_id} not found")))?;

        // 2. Verify script is enabled.
        if !script.is_enabled {
            return Err(AppError::BadRequest(format!(
                "Script '{}' is disabled",
                script.name
            )));
        }

        // 3. Create execution record (status: pending).
        let execution = ScriptExecutionRepo::create(
            &self.pool,
            &CreateScriptExecution {
                script_id,
                job_id,
                triggered_by,
                input_data: Some(input_data.clone()),
            },
        )
        .await?;

        // 4. Mark as running.
        ScriptExecutionRepo::mark_running(&self.pool, execution.id).await?;

        // 5. Build script input.
        let mut env_vars = vec![
            ("SCRIPT_ID".to_string(), script_id.to_string()),
            ("EXECUTION_ID".to_string(), execution.id.to_string()),
        ];

        // For Python scripts: ensure venv exists and pass the venv dir.
        if script.script_type_name == SCRIPT_TYPE_PYTHON {
            if let (Some(req_path), Some(req_hash)) =
                (&script.requirements_path, &script.requirements_hash)
            {
                match self.python_executor.ensure_venv(req_path, req_hash).await {
                    Ok(venv_dir) => {
                        env_vars.push(("VENV_DIR".to_string(), venv_dir));
                    }
                    Err(e) => {
                        let msg = format!("Failed to prepare venv: {e}");
                        ScriptExecutionRepo::fail(&self.pool, execution.id, &msg).await?;
                        return Err(AppError::InternalError(msg));
                    }
                }
            }
        }

        let script_input = ScriptInput {
            data: input_data,
            env_vars,
            working_directory: script.working_directory.clone(),
            timeout: Duration::from_secs(script.timeout_secs as u64),
        };

        // 6. Dispatch to the correct executor.
        let result = match script.script_type_name.as_str() {
            SCRIPT_TYPE_SHELL => {
                self.shell_executor
                    .execute(&script.file_path, script_input)
                    .await
            }
            SCRIPT_TYPE_PYTHON => {
                self.python_executor
                    .execute(&script.file_path, script_input)
                    .await
            }
            SCRIPT_TYPE_BINARY => {
                self.binary_executor
                    .execute(&script.file_path, script_input)
                    .await
            }
            other => {
                let msg = format!("Unknown script type: {other}");
                ScriptExecutionRepo::fail(&self.pool, execution.id, &msg).await?;
                return Err(AppError::BadRequest(msg));
            }
        };

        // 7. Record result.
        match &result {
            Ok(output) => {
                ScriptExecutionRepo::complete(
                    &self.pool,
                    execution.id,
                    output.exit_code,
                    &output.stdout,
                    &output.stderr,
                    output.duration_ms,
                    output.parsed_output.as_ref(),
                )
                .await?;
            }
            Err(ScriptError::Timeout { elapsed_ms }) => {
                ScriptExecutionRepo::timeout(&self.pool, execution.id, *elapsed_ms).await?;
            }
            Err(e) => {
                ScriptExecutionRepo::fail(&self.pool, execution.id, &e.to_string()).await?;
            }
        }

        result.map_err(|e| AppError::InternalError(format!("Script execution failed: {e}")))
    }
}
