//! QA gate constants, validation, and scoring logic (PRD-49).
//!
//! Provides check-type constants, threshold evaluation functions,
//! and summary computation for the Automated Quality Gates feature.

use crate::error::CoreError;
use crate::qa_status::{QA_FAIL, QA_PASS, QA_WARN};

// ---------------------------------------------------------------------------
// Check type constants
// ---------------------------------------------------------------------------

/// Face detection confidence score.
pub const CHECK_FACE_CONFIDENCE: &str = "face_confidence";
/// Structural similarity at segment boundaries.
pub const CHECK_BOUNDARY_SSIM: &str = "boundary_ssim";
/// Motion quality score.
pub const CHECK_MOTION: &str = "motion";
/// Resolution compliance check.
pub const CHECK_RESOLUTION: &str = "resolution";
/// Artifact detection score.
pub const CHECK_ARTIFACTS: &str = "artifacts";
/// Likeness drift from reference embedding.
pub const CHECK_LIKENESS_DRIFT: &str = "likeness_drift";

/// All valid check types.
pub const VALID_CHECK_TYPES: &[&str] = &[
    CHECK_FACE_CONFIDENCE,
    CHECK_BOUNDARY_SSIM,
    CHECK_MOTION,
    CHECK_RESOLUTION,
    CHECK_ARTIFACTS,
    CHECK_LIKENESS_DRIFT,
];

/// Technical checks that use strict pass/fail logic (score must be exactly 1.0).
pub const TECHNICAL_CHECK_TYPES: &[&str] = &[CHECK_RESOLUTION, CHECK_ARTIFACTS];

// ---------------------------------------------------------------------------
// Default thresholds
// ---------------------------------------------------------------------------

/// A default threshold definition (matching migration seed data).
pub struct DefaultThreshold {
    pub check_type: &'static str,
    pub warn: f64,
    pub fail: f64,
}

/// Default studio-level thresholds, matching the seed data in migration 000082.
pub const DEFAULT_THRESHOLDS: &[DefaultThreshold] = &[
    DefaultThreshold {
        check_type: CHECK_FACE_CONFIDENCE,
        warn: 0.7,
        fail: 0.4,
    },
    DefaultThreshold {
        check_type: CHECK_BOUNDARY_SSIM,
        warn: 0.85,
        fail: 0.65,
    },
    DefaultThreshold {
        check_type: CHECK_MOTION,
        warn: 0.3,
        fail: 0.1,
    },
    DefaultThreshold {
        check_type: CHECK_RESOLUTION,
        warn: 1.0,
        fail: 1.0,
    },
    DefaultThreshold {
        check_type: CHECK_ARTIFACTS,
        warn: 0.8,
        fail: 0.5,
    },
    DefaultThreshold {
        check_type: CHECK_LIKENESS_DRIFT,
        warn: 0.8,
        fail: 0.6,
    },
];

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/// Evaluate a score against warn/fail thresholds.
///
/// Higher score = better. Returns:
/// - `QA_PASS` if `score >= warn_threshold`
/// - `QA_WARN` if `score >= fail_threshold`
/// - `QA_FAIL` otherwise
pub fn evaluate_score(score: f64, warn_threshold: f64, fail_threshold: f64) -> &'static str {
    if score >= warn_threshold {
        QA_PASS
    } else if score >= fail_threshold {
        QA_WARN
    } else {
        QA_FAIL
    }
}

/// Evaluate a technical check score. Any non-1.0 score is a failure.
pub fn evaluate_technical_score(score: f64) -> &'static str {
    if (score - 1.0).abs() < f64::EPSILON {
        QA_PASS
    } else {
        QA_FAIL
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a check type string is one of the known check types.
pub fn validate_check_type(ct: &str) -> Result<(), CoreError> {
    if VALID_CHECK_TYPES.contains(&ct) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown check type: '{ct}'. Valid types: {}",
            VALID_CHECK_TYPES.join(", ")
        )))
    }
}

/// Validate threshold values.
///
/// Both must be in `[0.0, 1.0]` and `warn >= fail` (since higher = better,
/// the warn line must be at or above the fail line).
pub fn validate_threshold(warn: f64, fail: f64) -> Result<(), CoreError> {
    if !(0.0..=1.0).contains(&warn) {
        return Err(CoreError::Validation(format!(
            "warn_threshold must be between 0.0 and 1.0, got {warn}"
        )));
    }
    if !(0.0..=1.0).contains(&fail) {
        return Err(CoreError::Validation(format!(
            "fail_threshold must be between 0.0 and 1.0, got {fail}"
        )));
    }
    if warn < fail {
        return Err(CoreError::Validation(format!(
            "warn_threshold ({warn}) must be >= fail_threshold ({fail})"
        )));
    }
    Ok(())
}

/// Returns `true` if the given check type is a technical (non-configurable) check.
pub fn is_technical_check(check_type: &str) -> bool {
    TECHNICAL_CHECK_TYPES.contains(&check_type)
}

// ---------------------------------------------------------------------------
// QA summary
// ---------------------------------------------------------------------------

/// Aggregated QA summary across multiple check statuses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QaSummary {
    pub total_checks: usize,
    pub passed: usize,
    pub warned: usize,
    pub failed: usize,
}

/// Compute a summary from a slice of status strings.
pub fn compute_summary(statuses: &[&str]) -> QaSummary {
    let mut passed = 0usize;
    let mut warned = 0usize;
    let mut failed = 0usize;

    for &s in statuses {
        match s {
            QA_PASS => passed += 1,
            QA_WARN => warned += 1,
            QA_FAIL => failed += 1,
            _ => {}
        }
    }

    QaSummary {
        total_checks: statuses.len(),
        passed,
        warned,
        failed,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- evaluate_score -------------------------------------------------------

    #[test]
    fn evaluate_score_pass() {
        assert_eq!(evaluate_score(0.9, 0.7, 0.4), QA_PASS);
    }

    #[test]
    fn evaluate_score_warn() {
        assert_eq!(evaluate_score(0.5, 0.7, 0.4), QA_WARN);
    }

    #[test]
    fn evaluate_score_fail() {
        assert_eq!(evaluate_score(0.3, 0.7, 0.4), QA_FAIL);
    }

    #[test]
    fn evaluate_score_at_warn_boundary() {
        assert_eq!(evaluate_score(0.7, 0.7, 0.4), QA_PASS);
    }

    #[test]
    fn evaluate_score_at_fail_boundary() {
        assert_eq!(evaluate_score(0.4, 0.7, 0.4), QA_WARN);
    }

    // -- evaluate_technical_score ---------------------------------------------

    #[test]
    fn technical_score_pass() {
        assert_eq!(evaluate_technical_score(1.0), QA_PASS);
    }

    #[test]
    fn technical_score_fail() {
        assert_eq!(evaluate_technical_score(0.999), QA_FAIL);
    }

    // -- validate_check_type --------------------------------------------------

    #[test]
    fn valid_check_type_accepted() {
        assert!(validate_check_type("face_confidence").is_ok());
        assert!(validate_check_type("boundary_ssim").is_ok());
        assert!(validate_check_type("resolution").is_ok());
    }

    #[test]
    fn invalid_check_type_rejected() {
        assert!(validate_check_type("unknown_check").is_err());
    }

    // -- validate_threshold ---------------------------------------------------

    #[test]
    fn valid_thresholds() {
        assert!(validate_threshold(0.7, 0.4).is_ok());
        assert!(validate_threshold(1.0, 0.0).is_ok());
        assert!(validate_threshold(0.5, 0.5).is_ok());
    }

    #[test]
    fn warn_below_fail_rejected() {
        assert!(validate_threshold(0.3, 0.7).is_err());
    }

    #[test]
    fn out_of_range_rejected() {
        assert!(validate_threshold(1.1, 0.5).is_err());
        assert!(validate_threshold(0.5, -0.1).is_err());
    }

    // -- is_technical_check ---------------------------------------------------

    #[test]
    fn technical_checks_identified() {
        assert!(is_technical_check("resolution"));
        assert!(is_technical_check("artifacts"));
        assert!(!is_technical_check("face_confidence"));
        assert!(!is_technical_check("motion"));
    }

    // -- compute_summary ------------------------------------------------------

    #[test]
    fn summary_empty() {
        let s = compute_summary(&[]);
        assert_eq!(
            s,
            QaSummary {
                total_checks: 0,
                passed: 0,
                warned: 0,
                failed: 0,
            }
        );
    }

    #[test]
    fn summary_mixed() {
        let s = compute_summary(&[QA_PASS, QA_WARN, QA_FAIL, QA_PASS, QA_PASS]);
        assert_eq!(
            s,
            QaSummary {
                total_checks: 5,
                passed: 3,
                warned: 1,
                failed: 1,
            }
        );
    }

    #[test]
    fn summary_all_pass() {
        let s = compute_summary(&[QA_PASS, QA_PASS, QA_PASS]);
        assert_eq!(
            s,
            QaSummary {
                total_checks: 3,
                passed: 3,
                warned: 0,
                failed: 0,
            }
        );
    }
}
