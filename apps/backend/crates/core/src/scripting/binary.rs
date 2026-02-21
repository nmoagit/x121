//! Binary executable executor.
//!
//! Runs a pre-compiled binary directly (not through a shell). Validates
//! that the file exists and has execute permissions before spawning.

use std::os::unix::fs::PermissionsExt;

use super::executor::{ScriptError, ScriptExecutor, ScriptInput, ScriptOutput};
use super::subprocess;

/// Executor for pre-compiled binary executables.
pub struct BinaryExecutor;

impl ScriptExecutor for BinaryExecutor {
    async fn execute(
        &self,
        binary_path: &str,
        input: ScriptInput,
    ) -> Result<ScriptOutput, ScriptError> {
        // Verify the binary exists.
        let metadata = tokio::fs::metadata(binary_path)
            .await
            .map_err(|_| ScriptError::NotFound(binary_path.to_string()))?;

        // Verify execute permission.
        let mode = metadata.permissions().mode();
        if mode & 0o111 == 0 {
            return Err(ScriptError::PermissionDenied(format!(
                "{binary_path} is not executable (mode {mode:#o})"
            )));
        }

        let mut cmd = tokio::process::Command::new(binary_path);
        subprocess::run_command(&mut cmd, input).await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scripting::test_helpers::default_input;

    #[tokio::test]
    async fn test_binary_not_found() {
        let result = BinaryExecutor
            .execute("/nonexistent/binary", default_input())
            .await;
        assert!(matches!(result, Err(ScriptError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_binary_not_executable() {
        // Create a temp file without execute permission.
        let f = tempfile::NamedTempFile::new().expect("create temp file");
        let path = f.path().to_str().expect("path");

        let result = BinaryExecutor.execute(path, default_input()).await;
        assert!(matches!(result, Err(ScriptError::PermissionDenied(_))));
    }
}
