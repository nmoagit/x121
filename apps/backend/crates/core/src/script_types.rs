//! Well-known script runtime type name constants.
//!
//! These must match the seed data in
//! `20260221000004_create_script_tables.sql`.

/// Shell runtime (executed via `bash`).
pub const SCRIPT_TYPE_SHELL: &str = "shell";

/// Python runtime (executed via `python3`, with optional venv isolation).
pub const SCRIPT_TYPE_PYTHON: &str = "python";

/// Pre-compiled binary runtime (executed directly).
pub const SCRIPT_TYPE_BINARY: &str = "binary";
