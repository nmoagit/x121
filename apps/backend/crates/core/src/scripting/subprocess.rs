//! Shared subprocess management utilities.
//!
//! Provides [`run_command`], the common subprocess execution logic used by
//! all three executors (shell, python, binary). Each executor builds a
//! [`tokio::process::Command`] appropriate for its runtime and delegates
//! the actual spawn + I/O + timeout handling here.

use std::process::Stdio;
use std::time::Instant;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

use super::executor::{ScriptError, ScriptInput, ScriptOutput};

/// Maximum stdout or stderr size captured per stream (10 MiB).
///
/// Output exceeding this limit is truncated to prevent memory exhaustion
/// from extremely verbose scripts.
const MAX_OUTPUT_BYTES: usize = 10 * 1024 * 1024;

/// Spawn `cmd` as a child process, pipe JSON input to stdin, capture
/// stdout/stderr, and enforce the configured timeout.
///
/// The caller is responsible for setting the command program and arguments
/// before calling this function. Environment variables and working directory
/// from [`ScriptInput`] are applied here.
pub async fn run_command(
    cmd: &mut Command,
    input: ScriptInput,
) -> Result<ScriptOutput, ScriptError> {
    // Configure I/O pipes.
    // `kill_on_drop(true)` ensures the child is killed when dropped (e.g. on timeout).
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    // Set environment variables.
    for (key, value) in &input.env_vars {
        cmd.env(key, value);
    }

    // Set working directory if specified.
    if let Some(dir) = &input.working_directory {
        cmd.current_dir(dir);
    }

    let start = Instant::now();

    let mut child = cmd.spawn().map_err(ScriptError::IoError)?;

    // Write JSON payload to stdin, then close it.
    if let Some(mut stdin) = child.stdin.take() {
        let json_bytes = serde_json::to_vec(&input.data).unwrap_or_default();
        // Best-effort write; if the process closes stdin early, ignore the error.
        let _ = stdin.write_all(&json_bytes).await;
        drop(stdin);
    }

    // Take stdout/stderr handles and read them in spawned tasks so we can
    // still call `child.wait()` (which borrows `&mut child`).
    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    let stdout_task = tokio::spawn(async move { read_stream(stdout_handle).await });
    let stderr_task = tokio::spawn(async move { read_stream(stderr_handle).await });

    // Wait for the child process with a timeout. If the timeout fires,
    // `child` is dropped with `kill_on_drop(true)`, killing the process.
    let wait_result = tokio::time::timeout(input.timeout, child.wait()).await;

    match wait_result {
        Ok(Ok(status)) => {
            let duration_ms = start.elapsed().as_millis() as u64;
            let stdout_bytes = stdout_task.await.unwrap_or_default();
            let stderr_bytes = stderr_task.await.unwrap_or_default();
            let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();
            let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();
            let exit_code = status.code().unwrap_or(-1);
            let parsed_output = serde_json::from_str(stdout.trim()).ok();

            Ok(ScriptOutput {
                stdout,
                stderr,
                exit_code,
                duration_ms,
                parsed_output,
            })
        }
        Ok(Err(e)) => Err(ScriptError::IoError(e)),
        Err(_elapsed) => {
            // Timeout expired. `child` is dropped here, which kills the
            // process because we set `kill_on_drop(true)`.
            Err(ScriptError::Timeout {
                elapsed_ms: start.elapsed().as_millis() as u64,
            })
        }
    }
}

/// Read an entire output stream into a byte buffer, capped at [`MAX_OUTPUT_BYTES`].
async fn read_stream<R: AsyncRead + Unpin>(handle: Option<R>) -> Vec<u8> {
    let mut buf = Vec::new();
    if let Some(mut h) = handle {
        let _ = (&mut h)
            .take(MAX_OUTPUT_BYTES as u64)
            .read_to_end(&mut buf)
            .await;
    }
    buf
}
