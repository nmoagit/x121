//! Python script executor with virtual environment management.
//!
//! Creates and caches venvs keyed by a SHA-256 hash of the
//! `requirements.txt` contents. Reuses existing venvs when the hash
//! matches; recreates when requirements change.

use sha2::{Digest, Sha256};
use tokio::fs;

use super::executor::{ScriptError, ScriptExecutor, ScriptInput, ScriptOutput};
use super::subprocess;

/// Executor for Python scripts with per-requirements venv isolation.
pub struct PythonExecutor {
    /// Root directory under which all venvs are created.
    /// Each venv lives at `{venv_base_dir}/venv_{hash}`.
    venv_base_dir: String,
}

impl PythonExecutor {
    /// Create a new executor with the given base directory for venvs.
    pub fn new(venv_base_dir: String) -> Self {
        Self { venv_base_dir }
    }

    /// Ensure a virtual environment exists for the given requirements file.
    ///
    /// If a venv with a matching hash already exists it is reused.
    /// Otherwise a new venv is created and requirements are installed.
    ///
    /// Returns the absolute path to the venv directory.
    pub async fn ensure_venv(
        &self,
        requirements_path: &str,
        requirements_hash: &str,
    ) -> Result<String, ScriptError> {
        let venv_dir = format!("{}/venv_{}", self.venv_base_dir, requirements_hash);

        // Reuse existing venv.
        if fs::metadata(&venv_dir).await.is_ok() {
            return Ok(venv_dir);
        }

        // Ensure the base directory exists.
        fs::create_dir_all(&self.venv_base_dir)
            .await
            .map_err(ScriptError::IoError)?;

        // Create the venv.
        let create_status = tokio::process::Command::new("python3")
            .args(["-m", "venv", &venv_dir])
            .status()
            .await
            .map_err(ScriptError::IoError)?;

        if !create_status.success() {
            return Err(ScriptError::ExecutionFailed {
                exit_code: create_status.code().unwrap_or(-1),
                stderr: "Failed to create virtual environment".to_string(),
            });
        }

        // Install requirements.
        let pip_path = format!("{venv_dir}/bin/pip");
        let install_output = tokio::process::Command::new(&pip_path)
            .args(["install", "-r", requirements_path])
            .output()
            .await
            .map_err(ScriptError::IoError)?;

        if !install_output.status.success() {
            // Clean up the partially-created venv.
            let _ = fs::remove_dir_all(&venv_dir).await;
            let stderr = String::from_utf8_lossy(&install_output.stderr).to_string();
            return Err(ScriptError::ExecutionFailed {
                exit_code: install_output.status.code().unwrap_or(-1),
                stderr,
            });
        }

        Ok(venv_dir)
    }

    /// Compute a SHA-256 hash of a requirements file's contents.
    ///
    /// The hex-encoded hash is used as the venv directory suffix.
    pub async fn hash_requirements(requirements_path: &str) -> Result<String, ScriptError> {
        let contents = fs::read(requirements_path)
            .await
            .map_err(ScriptError::IoError)?;
        let hash = Sha256::digest(&contents);
        Ok(format!("{hash:x}"))
    }
}

impl ScriptExecutor for PythonExecutor {
    async fn execute(
        &self,
        script_path: &str,
        input: ScriptInput,
    ) -> Result<ScriptOutput, ScriptError> {
        // Determine the Python interpreter to use.
        // If a VENV_DIR env var is set in the input, use that venv's python.
        // Otherwise fall back to `python3` on PATH.
        let python_bin = input
            .env_vars
            .iter()
            .find(|(k, _)| k == "VENV_DIR")
            .map(|(_, v)| format!("{v}/bin/python"))
            .unwrap_or_else(|| "python3".to_string());

        let mut cmd = tokio::process::Command::new(&python_bin);
        cmd.arg(script_path);
        subprocess::run_command(&mut cmd, input).await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_deterministic() {
        // The same bytes should always produce the same hash.
        let contents = b"numpy==1.24.0\npandas==2.0.0\n";
        let hash1 = format!("{:x}", Sha256::digest(contents));
        let hash2 = format!("{:x}", Sha256::digest(contents));
        assert_eq!(hash1, hash2);
        assert!(!hash1.is_empty());
    }
}
