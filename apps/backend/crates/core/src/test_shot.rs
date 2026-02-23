//! Scene Preview & Quick Test constants and validation (PRD-58).
//!
//! Provides constants for test shot duration limits, quality score bounds,
//! batch size constraints, and validation functions used by the API layer.

use crate::error::CoreError;
use crate::threshold_validation::{validate_count_range, validate_unit_range};

// ---------------------------------------------------------------------------
// Duration constants
// ---------------------------------------------------------------------------

/// Default test shot duration in seconds (short preview segment).
pub const DEFAULT_TEST_SHOT_DURATION_SECS: f64 = 3.0;

/// Maximum allowed test shot duration in seconds.
pub const MAX_TEST_SHOT_DURATION_SECS: f64 = 10.0;

/// Minimum allowed test shot duration in seconds.
pub const MIN_TEST_SHOT_DURATION_SECS: f64 = 0.5;

// ---------------------------------------------------------------------------
// Quality score bounds
// ---------------------------------------------------------------------------

/// Minimum quality score value.
pub const MIN_QUALITY_SCORE: f64 = 0.0;

/// Maximum quality score value.
pub const MAX_QUALITY_SCORE: f64 = 1.0;

// ---------------------------------------------------------------------------
// Batch limits
// ---------------------------------------------------------------------------

/// Maximum number of test shots in a single batch request.
pub const MAX_BATCH_SIZE: usize = 50;

// ---------------------------------------------------------------------------
// Test shot status
// ---------------------------------------------------------------------------

/// Status of a test shot through its lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TestShotStatus {
    /// Created but not yet generating.
    Pending,
    /// Generation is in progress.
    Generating,
    /// Generation completed successfully.
    Completed,
    /// Generation failed.
    Failed,
    /// Promoted to a full scene.
    Promoted,
}

impl TestShotStatus {
    /// Return the string representation of a status.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Generating => "generating",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Promoted => "promoted",
        }
    }
}

impl std::fmt::Display for TestShotStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that the test shot duration is within allowed bounds.
///
/// Duration must be between [`MIN_TEST_SHOT_DURATION_SECS`] and
/// [`MAX_TEST_SHOT_DURATION_SECS`] inclusive.
pub fn validate_test_shot_params(duration_secs: f64) -> Result<(), CoreError> {
    if !(MIN_TEST_SHOT_DURATION_SECS..=MAX_TEST_SHOT_DURATION_SECS).contains(&duration_secs) {
        return Err(CoreError::Validation(format!(
            "duration_secs must be between {MIN_TEST_SHOT_DURATION_SECS} and \
             {MAX_TEST_SHOT_DURATION_SECS}, got {duration_secs}"
        )));
    }
    Ok(())
}

/// Validate that a quality score is within the unit range `[0.0, 1.0]`.
///
/// Delegates to [`validate_unit_range`] from the shared threshold validation
/// module to avoid duplicating range-check logic.
pub fn validate_quality_score(score: f64) -> Result<(), CoreError> {
    validate_unit_range(score, "quality_score")
}

/// Validate that a batch size does not exceed [`MAX_BATCH_SIZE`].
///
/// Delegates to [`validate_count_range`] from the shared threshold validation
/// module to avoid structural duplication (DRY-277).
pub fn validate_batch_size(count: usize) -> Result<(), CoreError> {
    validate_count_range(count, MAX_BATCH_SIZE, "Batch")
}

/// Validate that a test shot can be promoted.
///
/// Returns an error if the shot has already been promoted.
pub fn can_promote(is_promoted: bool) -> Result<(), CoreError> {
    if is_promoted {
        return Err(CoreError::Conflict(
            "Test shot has already been promoted".to_string(),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_test_shot_params ------------------------------------------

    #[test]
    fn valid_duration_at_minimum() {
        assert!(validate_test_shot_params(MIN_TEST_SHOT_DURATION_SECS).is_ok());
    }

    #[test]
    fn valid_duration_at_default() {
        assert!(validate_test_shot_params(DEFAULT_TEST_SHOT_DURATION_SECS).is_ok());
    }

    #[test]
    fn valid_duration_at_maximum() {
        assert!(validate_test_shot_params(MAX_TEST_SHOT_DURATION_SECS).is_ok());
    }

    #[test]
    fn rejects_duration_below_minimum() {
        assert!(validate_test_shot_params(0.1).is_err());
    }

    #[test]
    fn rejects_duration_above_maximum() {
        assert!(validate_test_shot_params(11.0).is_err());
    }

    #[test]
    fn rejects_negative_duration() {
        assert!(validate_test_shot_params(-1.0).is_err());
    }

    // -- validate_quality_score ---------------------------------------------

    #[test]
    fn valid_quality_score_boundaries() {
        assert!(validate_quality_score(0.0).is_ok());
        assert!(validate_quality_score(0.5).is_ok());
        assert!(validate_quality_score(1.0).is_ok());
    }

    #[test]
    fn rejects_quality_score_above_one() {
        assert!(validate_quality_score(1.01).is_err());
    }

    #[test]
    fn rejects_quality_score_below_zero() {
        assert!(validate_quality_score(-0.1).is_err());
    }

    // -- validate_batch_size ------------------------------------------------

    #[test]
    fn valid_batch_size() {
        assert!(validate_batch_size(1).is_ok());
        assert!(validate_batch_size(25).is_ok());
        assert!(validate_batch_size(MAX_BATCH_SIZE).is_ok());
    }

    #[test]
    fn rejects_empty_batch() {
        assert!(validate_batch_size(0).is_err());
    }

    #[test]
    fn rejects_batch_above_max() {
        assert!(validate_batch_size(MAX_BATCH_SIZE + 1).is_err());
    }

    // -- can_promote --------------------------------------------------------

    #[test]
    fn can_promote_when_not_promoted() {
        assert!(can_promote(false).is_ok());
    }

    #[test]
    fn cannot_promote_when_already_promoted() {
        assert!(can_promote(true).is_err());
    }

    // -- TestShotStatus display ---------------------------------------------

    #[test]
    fn status_display_values() {
        assert_eq!(TestShotStatus::Pending.as_str(), "pending");
        assert_eq!(TestShotStatus::Generating.as_str(), "generating");
        assert_eq!(TestShotStatus::Completed.as_str(), "completed");
        assert_eq!(TestShotStatus::Failed.as_str(), "failed");
        assert_eq!(TestShotStatus::Promoted.as_str(), "promoted");
    }
}
