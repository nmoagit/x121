//! Script execution service (PRD-143).
//!
//! Executes generator scripts via `std::process::Command` with timeout
//! support. Input is passed as a JSON file, output is captured from stdout.

use std::io::Write;
use std::time::{Duration, Instant};

use serde::Serialize;

/// Maximum execution time for a script (30 seconds).
const EXECUTION_TIMEOUT: Duration = Duration::from_secs(30);

/// Output from a script execution.
#[derive(Debug, Serialize)]
pub struct ScriptOutput {
    /// Parsed JSON from stdout, or None if stdout was not valid JSON.
    pub output_json: Option<serde_json::Value>,
    /// Raw stderr output from the script.
    pub stderr: String,
    /// Execution duration in milliseconds.
    pub duration_ms: u64,
}

/// Execute a script with the given input JSON.
///
/// The script receives the input as a temporary JSON file path. The path is
/// passed as the first command-line argument. Output is captured from stdout
/// and parsed as JSON.
///
/// # Script Types
/// - `python`: Runs via `python3 <script_file> <input_file>`
/// - `javascript`: Runs via `node <script_file> <input_file>`
/// - `shell`: Runs via `bash <script_file> <input_file>`
///
/// # Errors
/// Returns an error if the script type is unknown, temp file creation fails,
/// or the process times out (30s).
pub async fn execute_script(
    script_type: &str,
    script_content: &str,
    input_json: &serde_json::Value,
) -> Result<ScriptOutput, String> {
    let (command, extension) = match script_type {
        "python" => ("python3", "py"),
        "javascript" => ("node", "js"),
        "shell" => ("bash", "sh"),
        _ => return Err(format!("Unknown script type: {script_type}")),
    };

    // Write script content to a temp file.
    let script_file = tempfile::Builder::new()
        .prefix("gen_script_")
        .suffix(&format!(".{extension}"))
        .tempfile()
        .map_err(|e| format!("Failed to create script temp file: {e}"))?;
    std::fs::write(script_file.path(), script_content)
        .map_err(|e| format!("Failed to write script content: {e}"))?;

    // Write input JSON to a temp file.
    let mut input_file = tempfile::Builder::new()
        .prefix("gen_input_")
        .suffix(".json")
        .tempfile()
        .map_err(|e| format!("Failed to create input temp file: {e}"))?;
    let input_bytes = serde_json::to_vec_pretty(input_json)
        .map_err(|e| format!("Failed to serialize input JSON: {e}"))?;
    input_file
        .write_all(&input_bytes)
        .map_err(|e| format!("Failed to write input JSON: {e}"))?;
    input_file
        .flush()
        .map_err(|e| format!("Failed to flush input file: {e}"))?;

    let script_path = script_file.path().to_path_buf();
    let input_path = input_file.path().to_path_buf();

    // Spawn in a blocking task to avoid blocking the async runtime.
    let result = tokio::task::spawn_blocking(move || {
        let start = Instant::now();

        let mut child = std::process::Command::new(command)
            .arg(&script_path)
            .arg(&input_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn {command}: {e}"))?;

        // Wait with timeout.
        let status = match child.wait_timeout(EXECUTION_TIMEOUT) {
            Ok(Some(status)) => status,
            Ok(None) => {
                // Timeout — kill the process.
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Script execution timed out after {}s",
                    EXECUTION_TIMEOUT.as_secs()
                ));
            }
            Err(e) => return Err(format!("Failed to wait for process: {e}")),
        };

        let duration_ms = start.elapsed().as_millis() as u64;

        let stdout = child
            .stdout
            .take()
            .map(|mut s| {
                let mut buf = String::new();
                std::io::Read::read_to_string(&mut s, &mut buf).ok();
                buf
            })
            .unwrap_or_default();

        let stderr = child
            .stderr
            .take()
            .map(|mut s| {
                let mut buf = String::new();
                std::io::Read::read_to_string(&mut s, &mut buf).ok();
                buf
            })
            .unwrap_or_default();

        if !status.success() {
            let code = status.code().unwrap_or(-1);
            return Ok(ScriptOutput {
                output_json: None,
                stderr: format!("Process exited with code {code}. stderr: {stderr}"),
                duration_ms,
            });
        }

        // Try to parse stdout as JSON.
        let output_json = serde_json::from_str(&stdout).ok();

        Ok(ScriptOutput {
            output_json,
            stderr,
            duration_ms,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;

    result
}

/// Extension trait allowing `wait_timeout` on `std::process::Child`.
///
/// Uses a polling approach since Rust's standard library doesn't have
/// built-in timeout support for `Child::wait`.
trait WaitTimeout {
    fn wait_timeout(
        &mut self,
        timeout: Duration,
    ) -> std::io::Result<Option<std::process::ExitStatus>>;
}

impl WaitTimeout for std::process::Child {
    fn wait_timeout(
        &mut self,
        timeout: Duration,
    ) -> std::io::Result<Option<std::process::ExitStatus>> {
        let start = Instant::now();
        let poll_interval = Duration::from_millis(50);

        loop {
            match self.try_wait()? {
                Some(status) => return Ok(Some(status)),
                None => {
                    if start.elapsed() >= timeout {
                        return Ok(None);
                    }
                    std::thread::sleep(poll_interval);
                }
            }
        }
    }
}
