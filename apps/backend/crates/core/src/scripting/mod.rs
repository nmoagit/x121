//! Multi-runtime script orchestration domain logic (PRD-09).
//!
//! Provides executor types and implementations for shell, Python, and binary
//! runtimes. All subprocess management is pure (no DB access) and lives in
//! the `core` crate for isolation and testability.

pub mod binary;
pub mod executor;
pub mod python;
pub mod shell;
pub mod status;
pub mod subprocess;

/// Shared test helpers for executor tests.
#[cfg(test)]
pub(crate) mod test_helpers {
    use std::time::Duration;

    use super::executor::ScriptInput;

    /// Build a default [`ScriptInput`] for tests.
    ///
    /// Uses a simple JSON object (`{"key": "value"}`), no env vars, no
    /// working directory, and a 5-second timeout. The non-empty payload
    /// allows stdin-echo tests to verify piped data.
    pub fn default_input() -> ScriptInput {
        ScriptInput {
            data: serde_json::json!({"key": "value"}),
            env_vars: vec![],
            working_directory: None,
            timeout: Duration::from_secs(5),
        }
    }
}
