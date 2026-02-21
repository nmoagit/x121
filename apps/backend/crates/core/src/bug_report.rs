//! Bug report status constants and validation (PRD-44).
//!
//! Defines the valid bug report statuses, transition rules, and validation
//! helpers used by the API and repository layers.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

/// Initial status for a newly submitted bug report.
pub const STATUS_NEW: &str = "new";
/// Report has been reviewed and categorised by a developer / admin.
pub const STATUS_TRIAGED: &str = "triaged";
/// The underlying issue has been fixed.
pub const STATUS_RESOLVED: &str = "resolved";
/// The report has been closed (resolved and verified, or won't-fix).
pub const STATUS_CLOSED: &str = "closed";

/// All valid bug report statuses.
pub const VALID_STATUSES: &[&str] = &[STATUS_NEW, STATUS_TRIAGED, STATUS_RESOLVED, STATUS_CLOSED];

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

/// Maximum length for the user-provided description field (characters).
pub const MAX_DESCRIPTION_LENGTH: usize = 10_000;

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/// Returns the set of statuses that `from_status` may transition to.
///
/// Transition rules:
/// - `new`      -> `triaged`, `closed`
/// - `triaged`  -> `resolved`, `closed`
/// - `resolved` -> `closed`, `triaged` (re-open)
/// - `closed`   -> `triaged` (re-open)
pub fn valid_transitions(from_status: &str) -> &'static [&'static str] {
    match from_status {
        STATUS_NEW => &[STATUS_TRIAGED, STATUS_CLOSED],
        STATUS_TRIAGED => &[STATUS_RESOLVED, STATUS_CLOSED],
        STATUS_RESOLVED => &[STATUS_CLOSED, STATUS_TRIAGED],
        STATUS_CLOSED => &[STATUS_TRIAGED],
        _ => &[],
    }
}

/// Validate that a status transition from `current` to `next` is allowed.
pub fn validate_transition(current: &str, next: &str) -> Result<(), CoreError> {
    let allowed = valid_transitions(current);
    if allowed.contains(&next) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Cannot transition bug report from '{}' to '{}'. Allowed transitions: {:?}",
            current, next, allowed
        )))
    }
}

/// Validate that a status string is one of the known statuses.
pub fn validate_status(status: &str) -> Result<(), CoreError> {
    if VALID_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid bug report status '{}'. Must be one of: {:?}",
            status, VALID_STATUSES
        )))
    }
}

/// Validate the description length.
pub fn validate_description(description: &str) -> Result<(), CoreError> {
    if description.len() > MAX_DESCRIPTION_LENGTH {
        return Err(CoreError::Validation(format!(
            "Description exceeds maximum length of {} characters (got {})",
            MAX_DESCRIPTION_LENGTH,
            description.len()
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_statuses_are_valid() {
        for s in VALID_STATUSES {
            assert!(validate_status(s).is_ok(), "Status '{s}' should be valid");
        }
    }

    #[test]
    fn unknown_status_is_invalid() {
        assert!(validate_status("unknown").is_err());
        assert!(validate_status("").is_err());
    }

    #[test]
    fn new_can_transition_to_triaged_or_closed() {
        assert!(validate_transition(STATUS_NEW, STATUS_TRIAGED).is_ok());
        assert!(validate_transition(STATUS_NEW, STATUS_CLOSED).is_ok());
        assert!(validate_transition(STATUS_NEW, STATUS_RESOLVED).is_err());
    }

    #[test]
    fn triaged_can_transition_to_resolved_or_closed() {
        assert!(validate_transition(STATUS_TRIAGED, STATUS_RESOLVED).is_ok());
        assert!(validate_transition(STATUS_TRIAGED, STATUS_CLOSED).is_ok());
        assert!(validate_transition(STATUS_TRIAGED, STATUS_NEW).is_err());
    }

    #[test]
    fn resolved_can_transition_to_closed_or_triaged() {
        assert!(validate_transition(STATUS_RESOLVED, STATUS_CLOSED).is_ok());
        assert!(validate_transition(STATUS_RESOLVED, STATUS_TRIAGED).is_ok());
        assert!(validate_transition(STATUS_RESOLVED, STATUS_NEW).is_err());
    }

    #[test]
    fn closed_can_reopen_to_triaged() {
        assert!(validate_transition(STATUS_CLOSED, STATUS_TRIAGED).is_ok());
        assert!(validate_transition(STATUS_CLOSED, STATUS_NEW).is_err());
        assert!(validate_transition(STATUS_CLOSED, STATUS_RESOLVED).is_err());
    }

    #[test]
    fn description_within_limit_is_valid() {
        let desc = "a".repeat(MAX_DESCRIPTION_LENGTH);
        assert!(validate_description(&desc).is_ok());
    }

    #[test]
    fn description_over_limit_is_invalid() {
        let desc = "a".repeat(MAX_DESCRIPTION_LENGTH + 1);
        assert!(validate_description(&desc).is_err());
    }
}
