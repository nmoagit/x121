//! Service restart handler.
//!
//! Receives restart commands from the backend (via WebSocket) and
//! executes `systemctl restart <service_name>`.  Reports success or
//! failure back to the caller.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

/// Default timeout for a restart operation.
const DEFAULT_RESTART_TIMEOUT: Duration = Duration::from_secs(60);

/// Allowed service name characters: alphanumeric, hyphen, underscore, dot.
/// Prevents shell injection via the service name field.
fn is_safe_service_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// Incoming restart command from the backend.
#[derive(Debug, Clone, Deserialize)]
pub struct RestartCommand {
    pub service_name: String,
    #[serde(default)]
    pub force: bool,
}

/// Result reported back to the backend after a restart attempt.
#[derive(Debug, Clone, Serialize)]
pub struct RestartResult {
    pub service_name: String,
    pub success: bool,
    pub message: String,
    pub duration_ms: u64,
}

/// Execute a service restart and return the result.
///
/// Uses `systemctl restart` by default.  If `force` is set, passes
/// `--force` to systemctl (which can help if the unit is in a failed
/// state).
///
/// A timeout of 60 seconds is applied; if the restart command does not
/// complete within that window it is killed and reported as failed.
pub async fn execute_restart(cmd: &RestartCommand) -> RestartResult {
    let start = std::time::Instant::now();

    if !is_safe_service_name(&cmd.service_name) {
        return RestartResult {
            service_name: cmd.service_name.clone(),
            success: false,
            message: "Invalid service name".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        };
    }

    let mut args = vec!["restart", &cmd.service_name];
    if cmd.force {
        // --force is inserted before the unit name for clarity, but
        // systemctl accepts it in any position.
        args.insert(1, "--force");
    }

    tracing::info!(
        service = %cmd.service_name,
        force = cmd.force,
        "Executing service restart",
    );

    let result = tokio::time::timeout(
        DEFAULT_RESTART_TIMEOUT,
        Command::new("systemctl").args(&args).output(),
    )
    .await;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(output)) => {
            let success = output.status.success();
            let stderr = String::from_utf8_lossy(&output.stderr);
            let message = if success {
                format!("Service '{}' restarted successfully", cmd.service_name)
            } else {
                format!(
                    "Service '{}' restart failed (exit {}): {}",
                    cmd.service_name,
                    output.status.code().unwrap_or(-1),
                    stderr.trim(),
                )
            };

            if success {
                tracing::info!(service = %cmd.service_name, elapsed_ms, "Restart succeeded");
            } else {
                tracing::error!(service = %cmd.service_name, elapsed_ms, stderr = %stderr.trim(), "Restart failed");
            }

            RestartResult {
                service_name: cmd.service_name.clone(),
                success,
                message,
                duration_ms: elapsed_ms,
            }
        }
        Ok(Err(e)) => {
            let message = format!("Failed to execute systemctl: {e}");
            tracing::error!(service = %cmd.service_name, error = %e, "Restart execution error");
            RestartResult {
                service_name: cmd.service_name.clone(),
                success: false,
                message,
                duration_ms: elapsed_ms,
            }
        }
        Err(_) => {
            let message = format!(
                "Restart of '{}' timed out after {}s",
                cmd.service_name,
                DEFAULT_RESTART_TIMEOUT.as_secs(),
            );
            tracing::error!(service = %cmd.service_name, "Restart timed out");
            RestartResult {
                service_name: cmd.service_name.clone(),
                success: false,
                message,
                duration_ms: elapsed_ms,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_service_names() {
        assert!(is_safe_service_name("comfyui"));
        assert!(is_safe_service_name("comfyui.service"));
        assert!(is_safe_service_name("my-worker_1"));
        assert!(is_safe_service_name("nvidia-persistenced"));
    }

    #[test]
    fn unsafe_service_names() {
        assert!(!is_safe_service_name(""));
        assert!(!is_safe_service_name("foo; rm -rf /"));
        assert!(!is_safe_service_name("$(evil)"));
        assert!(!is_safe_service_name("foo bar"));
        assert!(!is_safe_service_name(&"a".repeat(200)));
    }
}
