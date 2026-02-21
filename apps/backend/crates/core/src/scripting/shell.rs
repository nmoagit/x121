//! Shell script executor.
//!
//! Spawns `bash` with the script path as its argument, piping JSON input
//! to stdin and capturing stdout/stderr.

use super::executor::{ScriptError, ScriptExecutor, ScriptInput, ScriptOutput};
use super::subprocess;

/// Executor for shell (bash) scripts.
pub struct ShellExecutor;

impl ScriptExecutor for ShellExecutor {
    async fn execute(
        &self,
        script_path: &str,
        input: ScriptInput,
    ) -> Result<ScriptOutput, ScriptError> {
        let mut cmd = tokio::process::Command::new("bash");
        cmd.arg(script_path);
        subprocess::run_command(&mut cmd, input).await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::scripting::test_helpers::default_input;

    /// Helper to create a temporary shell script from the given body.
    fn write_temp_script(body: &str) -> tempfile::NamedTempFile {
        use std::io::Write;
        let mut f = tempfile::Builder::new()
            .suffix(".sh")
            .tempfile()
            .expect("create temp file");
        writeln!(f, "#!/bin/bash").expect("write shebang");
        write!(f, "{body}").expect("write body");
        f
    }

    #[tokio::test]
    async fn test_shell_echo_stdin() {
        let script = write_temp_script("cat\n");
        let input = default_input();
        let output = ShellExecutor
            .execute(script.path().to_str().expect("path"), input)
            .await
            .expect("execute");
        assert_eq!(output.exit_code, 0);
        assert!(output.stdout.contains("key"));
    }

    #[tokio::test]
    async fn test_shell_env_vars() {
        let script = write_temp_script("echo $MY_VAR\n");
        let input = ScriptInput {
            data: serde_json::json!({}),
            env_vars: vec![("MY_VAR".to_string(), "hello_world".to_string())],
            working_directory: None,
            timeout: Duration::from_secs(5),
        };
        let output = ShellExecutor
            .execute(script.path().to_str().expect("path"), input)
            .await
            .expect("execute");
        assert_eq!(output.exit_code, 0);
        assert!(output.stdout.contains("hello_world"));
    }

    #[tokio::test]
    async fn test_shell_nonzero_exit() {
        let script = write_temp_script("exit 42\n");
        let input = default_input();
        let output = ShellExecutor
            .execute(script.path().to_str().expect("path"), input)
            .await
            .expect("execute");
        assert_eq!(output.exit_code, 42);
    }

    #[tokio::test]
    async fn test_shell_timeout() {
        let script = write_temp_script("sleep 60\n");
        let input = ScriptInput {
            data: serde_json::json!({}),
            env_vars: vec![],
            working_directory: None,
            timeout: Duration::from_millis(200),
        };
        let result = ShellExecutor
            .execute(script.path().to_str().expect("path"), input)
            .await;
        assert!(matches!(result, Err(ScriptError::Timeout { .. })));
    }

    #[tokio::test]
    async fn test_shell_parsed_json_output() {
        let script = write_temp_script(r#"echo '{"result": 123}'"#);
        let input = default_input();
        let output = ShellExecutor
            .execute(script.path().to_str().expect("path"), input)
            .await
            .expect("execute");
        assert_eq!(output.exit_code, 0);
        let parsed = output.parsed_output.expect("should parse JSON");
        assert_eq!(parsed["result"], 123);
    }

    #[tokio::test]
    async fn test_shell_working_directory() {
        let dir = tempfile::tempdir().expect("create temp dir");
        let script = write_temp_script("pwd\n");
        let input = ScriptInput {
            data: serde_json::json!({}),
            env_vars: vec![],
            working_directory: Some(dir.path().to_str().expect("path").to_string()),
            timeout: Duration::from_secs(5),
        };
        let output = ShellExecutor
            .execute(script.path().to_str().expect("path"), input)
            .await
            .expect("execute");
        assert_eq!(output.exit_code, 0);
        // The resolved path may differ due to symlinks, so canonicalize both.
        let expected = dir
            .path()
            .canonicalize()
            .expect("canonicalize dir")
            .to_str()
            .expect("path")
            .to_string();
        assert!(
            output
                .stdout
                .trim()
                .ends_with(expected.trim_start_matches('/')),
            "pwd output '{}' should match working directory '{}'",
            output.stdout.trim(),
            expected
        );
    }
}
