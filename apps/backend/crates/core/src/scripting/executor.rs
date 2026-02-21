//! Unified script execution interface and shared types.
//!
//! Defines [`ScriptExecutor`], the trait that all runtime executors implement,
//! along with [`ScriptInput`], [`ScriptOutput`], and [`ScriptError`].

use std::fmt;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Input data passed to a script executor.
#[derive(Debug, Clone)]
pub struct ScriptInput {
    /// JSON payload piped to the script's stdin.
    pub data: Value,
    /// Additional environment variables set for the child process.
    pub env_vars: Vec<(String, String)>,
    /// Working directory for the child process (uses current dir if `None`).
    pub working_directory: Option<String>,
    /// Maximum wall-clock time before the process is killed.
    pub timeout: Duration,
}

/// Captured output from a script execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptOutput {
    /// Complete stdout captured from the process.
    pub stdout: String,
    /// Complete stderr captured from the process.
    pub stderr: String,
    /// Process exit code (`-1` if killed by signal).
    pub exit_code: i32,
    /// Wall-clock duration in milliseconds.
    pub duration_ms: u64,
    /// Stdout parsed as JSON, or `None` if stdout is not valid JSON.
    pub parsed_output: Option<Value>,
}

/// Errors that can occur during script execution.
#[derive(Debug)]
pub enum ScriptError {
    /// The script file was not found at the specified path.
    NotFound(String),
    /// The script file exists but lacks execute permissions.
    PermissionDenied(String),
    /// The script exceeded its configured timeout and was killed.
    Timeout {
        /// Elapsed wall-clock time before the process was killed.
        elapsed_ms: u64,
    },
    /// The script ran but exited with a non-zero exit code.
    ExecutionFailed {
        /// Process exit code.
        exit_code: i32,
        /// Captured stderr output.
        stderr: String,
    },
    /// An I/O error occurred while spawning or communicating with the process.
    IoError(std::io::Error),
}

impl fmt::Display for ScriptError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(path) => write!(f, "Script not found: {path}"),
            Self::PermissionDenied(path) => write!(f, "Permission denied: {path}"),
            Self::Timeout { elapsed_ms } => {
                write!(f, "Script timed out after {elapsed_ms}ms")
            }
            Self::ExecutionFailed { exit_code, stderr } => {
                write!(f, "Script failed with exit code {exit_code}: {stderr}")
            }
            Self::IoError(err) => write!(f, "I/O error: {err}"),
        }
    }
}

impl std::error::Error for ScriptError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::IoError(err) => Some(err),
            _ => None,
        }
    }
}

/// Trait implemented by all script runtime executors (shell, python, binary).
///
/// Each executor receives a file path and structured input, spawns the
/// appropriate subprocess, and returns structured output or an error.
pub trait ScriptExecutor: Send + Sync {
    /// Execute the script at `script_path` with the given `input`.
    fn execute(
        &self,
        script_path: &str,
        input: ScriptInput,
    ) -> impl std::future::Future<Output = Result<ScriptOutput, ScriptError>> + Send;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_not_found() {
        let err = ScriptError::NotFound("/tmp/missing.sh".to_string());
        assert_eq!(err.to_string(), "Script not found: /tmp/missing.sh");
    }

    #[test]
    fn display_permission_denied() {
        let err = ScriptError::PermissionDenied("/opt/locked.bin".to_string());
        assert_eq!(err.to_string(), "Permission denied: /opt/locked.bin");
    }

    #[test]
    fn display_timeout() {
        let err = ScriptError::Timeout { elapsed_ms: 5000 };
        assert_eq!(err.to_string(), "Script timed out after 5000ms");
    }

    #[test]
    fn display_execution_failed() {
        let err = ScriptError::ExecutionFailed {
            exit_code: 42,
            stderr: "segfault".to_string(),
        };
        assert_eq!(err.to_string(), "Script failed with exit code 42: segfault");
    }

    #[test]
    fn display_io_error() {
        let inner = std::io::Error::new(std::io::ErrorKind::NotFound, "file gone");
        let err = ScriptError::IoError(inner);
        assert!(err.to_string().starts_with("I/O error:"));
        assert!(err.to_string().contains("file gone"));
    }

    #[test]
    fn error_source_io() {
        let inner = std::io::Error::other("boom");
        let err = ScriptError::IoError(inner);
        assert!(
            std::error::Error::source(&err).is_some(),
            "IoError variant should have a source"
        );
    }

    #[test]
    fn error_source_none_for_non_io() {
        let err = ScriptError::Timeout { elapsed_ms: 100 };
        assert!(
            std::error::Error::source(&err).is_none(),
            "Timeout variant should have no source"
        );
    }
}
