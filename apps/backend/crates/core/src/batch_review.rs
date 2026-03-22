//! Batch review business logic and validation (PRD-92).
//!
//! Pure functions for assignment status validation, sort mode validation,
//! QA threshold validation, review pace computation, and segment filtering.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Assignment status constants
// ---------------------------------------------------------------------------

/// Assignment is actively being worked on.
pub const ASSIGNMENT_STATUS_ACTIVE: &str = "active";

/// Assignment has been completed.
pub const ASSIGNMENT_STATUS_COMPLETED: &str = "completed";

/// Assignment has passed its deadline.
pub const ASSIGNMENT_STATUS_OVERDUE: &str = "overdue";

/// All valid assignment statuses.
pub const VALID_ASSIGNMENT_STATUSES: &[&str] = &[
    ASSIGNMENT_STATUS_ACTIVE,
    ASSIGNMENT_STATUS_COMPLETED,
    ASSIGNMENT_STATUS_OVERDUE,
];

// ---------------------------------------------------------------------------
// Sort mode constants
// ---------------------------------------------------------------------------

/// Sort by lowest QA score first (most likely to fail review).
pub const SORT_WORST_QA: &str = "worst_qa_first";

/// Sort by oldest creation date first.
pub const SORT_OLDEST: &str = "oldest_first";

/// Group by scene type.
pub const SORT_BY_SCENE_TYPE: &str = "by_scene_type";

/// Group by avatar.
pub const SORT_BY_AVATAR: &str = "by_avatar";

/// All valid sort modes for the review queue.
pub const VALID_SORT_MODES: &[&str] = &[
    SORT_WORST_QA,
    SORT_OLDEST,
    SORT_BY_SCENE_TYPE,
    SORT_BY_AVATAR,
];

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that an assignment status is one of the accepted values.
pub fn validate_assignment_status(status: &str) -> Result<(), String> {
    if VALID_ASSIGNMENT_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(format!(
            "Invalid assignment status '{status}'. Must be one of: {}",
            VALID_ASSIGNMENT_STATUSES.join(", ")
        ))
    }
}

/// Validate that a sort mode is one of the accepted values.
pub fn validate_sort_mode(mode: &str) -> Result<(), String> {
    if VALID_SORT_MODES.contains(&mode) {
        Ok(())
    } else {
        Err(format!(
            "Invalid sort mode '{mode}'. Must be one of: {}",
            VALID_SORT_MODES.join(", ")
        ))
    }
}

/// Validate that a QA threshold is within the valid range [0.0, 1.0].
///
/// Delegates to [`crate::threshold_validation::validate_unit_range`] to
/// avoid duplicating [0.0, 1.0] range checking (DRY-530).
pub fn validate_qa_threshold(threshold: f64) -> Result<(), CoreError> {
    crate::threshold_validation::validate_unit_range(threshold, "QA threshold")
}

// ---------------------------------------------------------------------------
// Computation helpers
// ---------------------------------------------------------------------------

/// Compute average review pace (seconds per segment).
///
/// Returns `None` if no segments were reviewed.
pub fn compute_avg_pace(total_reviewed: i32, elapsed_seconds: f64) -> Option<f32> {
    if total_reviewed == 0 {
        return None;
    }
    Some((elapsed_seconds / total_reviewed as f64) as f32)
}

/// Estimate remaining review time in seconds.
pub fn estimate_remaining_seconds(remaining_count: i32, avg_pace: f32) -> f64 {
    remaining_count as f64 * avg_pace as f64
}

/// Check if a deadline has passed.
///
/// Returns `false` if no deadline is set.
pub fn is_overdue(deadline: Option<chrono::DateTime<chrono::Utc>>) -> bool {
    deadline.is_some_and(|d| chrono::Utc::now() > d)
}

// ---------------------------------------------------------------------------
// Threshold filtering
// ---------------------------------------------------------------------------

/// Count how many scores are at or above the threshold.
pub fn count_above_threshold(scores: &[f64], threshold: f64) -> usize {
    scores.iter().filter(|&&s| s >= threshold).count()
}

/// Return the IDs of items whose score meets or exceeds the threshold.
pub fn filter_above_threshold(scored_items: &[(i64, f64)], threshold: f64) -> Vec<i64> {
    scored_items
        .iter()
        .filter(|(_, s)| *s >= threshold)
        .map(|(id, _)| *id)
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Assignment status validation --

    #[test]
    fn test_validate_assignment_status_valid() {
        assert!(validate_assignment_status(ASSIGNMENT_STATUS_ACTIVE).is_ok());
        assert!(validate_assignment_status(ASSIGNMENT_STATUS_COMPLETED).is_ok());
        assert!(validate_assignment_status(ASSIGNMENT_STATUS_OVERDUE).is_ok());
    }

    #[test]
    fn test_validate_assignment_status_invalid() {
        let result = validate_assignment_status("unknown");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid assignment status"));
    }

    // -- Sort mode validation --

    #[test]
    fn test_validate_sort_mode_valid() {
        assert!(validate_sort_mode(SORT_WORST_QA).is_ok());
        assert!(validate_sort_mode(SORT_OLDEST).is_ok());
        assert!(validate_sort_mode(SORT_BY_SCENE_TYPE).is_ok());
        assert!(validate_sort_mode(SORT_BY_AVATAR).is_ok());
    }

    #[test]
    fn test_validate_sort_mode_invalid() {
        let result = validate_sort_mode("random");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid sort mode"));
    }

    // -- QA threshold validation (delegates to validate_unit_range) --

    #[test]
    fn test_validate_qa_threshold_valid() {
        assert!(validate_qa_threshold(0.0).is_ok());
        assert!(validate_qa_threshold(0.5).is_ok());
        assert!(validate_qa_threshold(1.0).is_ok());
    }

    #[test]
    fn test_validate_qa_threshold_too_low() {
        assert!(validate_qa_threshold(-0.1).is_err());
    }

    #[test]
    fn test_validate_qa_threshold_too_high() {
        assert!(validate_qa_threshold(1.1).is_err());
    }

    // -- Average pace computation --

    #[test]
    fn test_compute_avg_pace() {
        let pace = compute_avg_pace(10, 60.0);
        assert_eq!(pace, Some(6.0));
    }

    #[test]
    fn test_compute_avg_pace_zero() {
        assert_eq!(compute_avg_pace(0, 100.0), None);
    }

    // -- Remaining time estimation --

    #[test]
    fn test_estimate_remaining_seconds() {
        let remaining = estimate_remaining_seconds(5, 10.0);
        assert!((remaining - 50.0).abs() < f64::EPSILON);
    }

    // -- Overdue check --

    #[test]
    fn test_is_overdue_past() {
        let past = chrono::Utc::now() - chrono::Duration::hours(1);
        assert!(is_overdue(Some(past)));
    }

    #[test]
    fn test_is_overdue_future() {
        let future = chrono::Utc::now() + chrono::Duration::hours(1);
        assert!(!is_overdue(Some(future)));
    }

    #[test]
    fn test_is_overdue_none() {
        assert!(!is_overdue(None));
    }

    // -- Threshold filtering --

    #[test]
    fn test_count_above_threshold() {
        let scores = vec![0.3, 0.5, 0.7, 0.9];
        assert_eq!(count_above_threshold(&scores, 0.5), 3);
    }

    #[test]
    fn test_count_above_threshold_empty() {
        let scores: Vec<f64> = vec![];
        assert_eq!(count_above_threshold(&scores, 0.5), 0);
    }

    #[test]
    fn test_filter_above_threshold() {
        let items = vec![(1, 0.3), (2, 0.6), (3, 0.8)];
        let result = filter_above_threshold(&items, 0.5);
        assert_eq!(result, vec![2, 3]);
    }

    #[test]
    fn test_filter_above_threshold_none_pass() {
        let items = vec![(1, 0.1), (2, 0.2)];
        let result = filter_above_threshold(&items, 0.5);
        assert!(result.is_empty());
    }
}
