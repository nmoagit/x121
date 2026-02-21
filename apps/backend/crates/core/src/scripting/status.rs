//! Well-known execution status ID constants for `script_executions`.
//!
//! These must match the seed data in
//! `20260221000005_create_script_executions_table.sql`.

/// Execution has been created but not yet started.
pub const EXECUTION_PENDING: i16 = 1;

/// Script process is currently running.
pub const EXECUTION_RUNNING: i16 = 2;

/// Script finished successfully (exit code 0).
pub const EXECUTION_COMPLETED: i16 = 3;

/// Script exited with a non-zero code or encountered an error.
pub const EXECUTION_FAILED: i16 = 4;

/// Script was killed because it exceeded its configured timeout.
pub const EXECUTION_TIMEOUT: i16 = 5;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_constants_match_expected_values() {
        assert_eq!(EXECUTION_PENDING, 1);
        assert_eq!(EXECUTION_RUNNING, 2);
        assert_eq!(EXECUTION_COMPLETED, 3);
        assert_eq!(EXECUTION_FAILED, 4);
        assert_eq!(EXECUTION_TIMEOUT, 5);
    }

    #[test]
    fn status_constants_are_unique() {
        let statuses = [
            EXECUTION_PENDING,
            EXECUTION_RUNNING,
            EXECUTION_COMPLETED,
            EXECUTION_FAILED,
            EXECUTION_TIMEOUT,
        ];
        let mut unique = statuses.to_vec();
        unique.sort();
        unique.dedup();
        assert_eq!(
            unique.len(),
            statuses.len(),
            "all status constants must be unique"
        );
    }

    #[test]
    fn status_constants_are_sequential() {
        assert_eq!(EXECUTION_PENDING + 1, EXECUTION_RUNNING);
        assert_eq!(EXECUTION_RUNNING + 1, EXECUTION_COMPLETED);
        assert_eq!(EXECUTION_COMPLETED + 1, EXECUTION_FAILED);
        assert_eq!(EXECUTION_FAILED + 1, EXECUTION_TIMEOUT);
    }
}
