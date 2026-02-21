//! Job scheduling constants and state machine (PRD-08).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API/repository layer and any future worker or CLI tooling.

// ---------------------------------------------------------------------------
// Priority constants
// ---------------------------------------------------------------------------

/// Priority value for urgent jobs. Dispatched before all others.
pub const PRIORITY_URGENT: i32 = 10;

/// Priority value for normal jobs. Default.
pub const PRIORITY_NORMAL: i32 = 0;

/// Priority value for background jobs. Dispatched last.
pub const PRIORITY_BACKGROUND: i32 = -10;

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/// Job status IDs matching `job_statuses` seed data (1-based SMALLSERIAL).
///
/// The state machine is intentionally duplicated from the `db` crate's
/// `JobStatus` enum because `core` must have zero internal deps.
pub mod state_machine {
    /// Returns the set of valid target status IDs reachable from `from_status`.
    ///
    /// Terminal states (Completed=3, Failed=4, Cancelled=5) return an empty
    /// slice because no further transitions are allowed.
    pub fn valid_transitions(from_status: i16) -> &'static [i16] {
        match from_status {
            // Scheduled -> Pending, Cancelled
            7 => &[1, 5],
            // Pending -> Dispatched, Paused, Cancelled
            1 => &[9, 8, 5],
            // Dispatched -> Running, Failed, Cancelled
            9 => &[2, 4, 5],
            // Running -> Completed, Failed, Cancelled, Paused
            2 => &[3, 4, 5, 8],
            // Paused -> Pending, Cancelled
            8 => &[1, 5],
            // Retrying -> Pending
            6 => &[1],
            // Terminal states: Completed, Failed, Cancelled
            3 | 4 | 5 => &[],
            // Unknown status: no transitions allowed
            _ => &[],
        }
    }

    /// Check whether a transition from `from` to `to` is valid.
    pub fn can_transition(from: i16, to: i16) -> bool {
        valid_transitions(from).contains(&to)
    }

    /// Validate a state transition, returning an error message for invalid ones.
    pub fn validate_transition(from: i16, to: i16) -> Result<(), String> {
        if can_transition(from, to) {
            Ok(())
        } else {
            let from_name = status_name(from);
            let to_name = status_name(to);
            Err(format!(
                "Invalid transition: {from_name} ({from}) -> {to_name} ({to})"
            ))
        }
    }

    /// Human-readable name for a status ID (for error messages).
    fn status_name(id: i16) -> &'static str {
        match id {
            1 => "Pending",
            2 => "Running",
            3 => "Completed",
            4 => "Failed",
            5 => "Cancelled",
            6 => "Retrying",
            7 => "Scheduled",
            8 => "Paused",
            9 => "Dispatched",
            _ => "Unknown",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::state_machine::*;

    // -----------------------------------------------------------------------
    // Valid transitions
    // -----------------------------------------------------------------------

    #[test]
    fn scheduled_to_pending() {
        assert!(can_transition(7, 1));
    }

    #[test]
    fn scheduled_to_cancelled() {
        assert!(can_transition(7, 5));
    }

    #[test]
    fn pending_to_dispatched() {
        assert!(can_transition(1, 9));
    }

    #[test]
    fn pending_to_paused() {
        assert!(can_transition(1, 8));
    }

    #[test]
    fn pending_to_cancelled() {
        assert!(can_transition(1, 5));
    }

    #[test]
    fn dispatched_to_running() {
        assert!(can_transition(9, 2));
    }

    #[test]
    fn dispatched_to_failed() {
        assert!(can_transition(9, 4));
    }

    #[test]
    fn dispatched_to_cancelled() {
        assert!(can_transition(9, 5));
    }

    #[test]
    fn running_to_completed() {
        assert!(can_transition(2, 3));
    }

    #[test]
    fn running_to_failed() {
        assert!(can_transition(2, 4));
    }

    #[test]
    fn running_to_cancelled() {
        assert!(can_transition(2, 5));
    }

    #[test]
    fn running_to_paused() {
        assert!(can_transition(2, 8));
    }

    #[test]
    fn paused_to_pending() {
        assert!(can_transition(8, 1));
    }

    #[test]
    fn paused_to_cancelled() {
        assert!(can_transition(8, 5));
    }

    #[test]
    fn retrying_to_pending() {
        assert!(can_transition(6, 1));
    }

    // -----------------------------------------------------------------------
    // Terminal states have no outgoing transitions
    // -----------------------------------------------------------------------

    #[test]
    fn completed_has_no_transitions() {
        assert!(valid_transitions(3).is_empty());
    }

    #[test]
    fn failed_has_no_transitions() {
        assert!(valid_transitions(4).is_empty());
    }

    #[test]
    fn cancelled_has_no_transitions() {
        assert!(valid_transitions(5).is_empty());
    }

    // -----------------------------------------------------------------------
    // Invalid transitions
    // -----------------------------------------------------------------------

    #[test]
    fn completed_to_running_invalid() {
        assert!(!can_transition(3, 2));
    }

    #[test]
    fn failed_to_running_invalid() {
        assert!(!can_transition(4, 2));
    }

    #[test]
    fn cancelled_to_pending_invalid() {
        assert!(!can_transition(5, 1));
    }

    #[test]
    fn pending_to_completed_invalid() {
        assert!(!can_transition(1, 3));
    }

    #[test]
    fn scheduled_to_running_invalid() {
        assert!(!can_transition(7, 2));
    }

    #[test]
    fn dispatched_to_paused_invalid() {
        assert!(!can_transition(9, 8));
    }

    // -----------------------------------------------------------------------
    // validate_transition returns descriptive error
    // -----------------------------------------------------------------------

    #[test]
    fn validate_transition_ok() {
        assert!(validate_transition(1, 9).is_ok());
    }

    #[test]
    fn validate_transition_err() {
        let err = validate_transition(3, 2).unwrap_err();
        assert!(err.contains("Completed"));
        assert!(err.contains("Running"));
    }

    // -----------------------------------------------------------------------
    // Unknown status ID
    // -----------------------------------------------------------------------

    #[test]
    fn unknown_status_has_no_transitions() {
        assert!(valid_transitions(99).is_empty());
    }
}
