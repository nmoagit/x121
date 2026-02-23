//! Temporal continuity constants, classification, and validation (PRD-26).
//!
//! Provides drift-severity classification, grain-quality rating,
//! trend-direction analysis, and threshold validation for the
//! temporal continuity normalization feature.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default drift threshold (0 = no drift, 1 = maximum drift).
/// Segments scoring above this are flagged.
pub const DEFAULT_DRIFT_THRESHOLD: f64 = 0.15;

/// Default grain match threshold (higher = better match between segments).
pub const DEFAULT_GRAIN_THRESHOLD: f64 = 0.80;

/// Default centering threshold in pixels — the maximum acceptable
/// offset of the subject from the expected center position.
pub const DEFAULT_CENTERING_THRESHOLD: f64 = 30.0;

/// Metric name constants for logging and analytics.
pub const METRIC_DRIFT_SCORE: &str = "drift_score";
pub const METRIC_GRAIN_MATCH: &str = "grain_match_score";
pub const METRIC_CENTERING_OFFSET: &str = "centering_offset";

// ---------------------------------------------------------------------------
// DriftSeverity
// ---------------------------------------------------------------------------

/// Severity classification for a segment's drift score.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DriftSeverity {
    Normal,
    Warning,
    Critical,
}

/// Classify a drift score against a threshold.
///
/// - `Normal`   — score <= threshold
/// - `Warning`  — score <= threshold * 2
/// - `Critical` — score > threshold * 2
pub fn classify_drift(score: f64, threshold: f64) -> DriftSeverity {
    if score <= threshold {
        DriftSeverity::Normal
    } else if score <= threshold * 2.0 {
        DriftSeverity::Warning
    } else {
        DriftSeverity::Critical
    }
}

// ---------------------------------------------------------------------------
// GrainQuality
// ---------------------------------------------------------------------------

/// Quality classification for grain match between adjacent segments.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GrainQuality {
    Good,
    Marginal,
    Poor,
}

/// Classify a grain match score against a threshold.
///
/// - `Good`     — score >= threshold
/// - `Marginal` — score >= threshold * 0.75
/// - `Poor`     — score < threshold * 0.75
pub fn classify_grain_match(score: f64, threshold: f64) -> GrainQuality {
    if score >= threshold {
        GrainQuality::Good
    } else if score >= threshold * 0.75 {
        GrainQuality::Marginal
    } else {
        GrainQuality::Poor
    }
}

// ---------------------------------------------------------------------------
// TrendDirection
// ---------------------------------------------------------------------------

/// Direction of a metric trend computed from a sequence of scores.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrendDirection {
    Improving,
    Stable,
    Worsening,
}

/// Compute the trend direction from a series of drift scores.
///
/// Uses simple linear regression slope:
/// - slope < -0.01 => Improving  (drift decreasing over time)
/// - slope > 0.01  => Worsening  (drift increasing over time)
/// - otherwise     => Stable
pub fn compute_trend_direction(scores: &[f64]) -> TrendDirection {
    if scores.len() < 2 {
        return TrendDirection::Stable;
    }

    let n = scores.len() as f64;
    let sum_x: f64 = (0..scores.len()).map(|i| i as f64).sum();
    let sum_y: f64 = scores.iter().sum();
    let sum_xy: f64 = scores.iter().enumerate().map(|(i, &y)| i as f64 * y).sum();
    let sum_x2: f64 = (0..scores.len()).map(|i| (i as f64) * (i as f64)).sum();

    let denominator = n * sum_x2 - sum_x * sum_x;
    if denominator.abs() < f64::EPSILON {
        return TrendDirection::Stable;
    }

    let slope = (n * sum_xy - sum_x * sum_y) / denominator;

    if slope < -0.01 {
        TrendDirection::Improving
    } else if slope > 0.01 {
        TrendDirection::Worsening
    } else {
        TrendDirection::Stable
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a drift threshold is in `[0.0, 1.0]`.
pub fn validate_drift_threshold(t: f64) -> Result<(), CoreError> {
    crate::threshold_validation::validate_unit_range(t, "drift_threshold")
}

/// Validate that a grain threshold is in `[0.0, 1.0]`.
pub fn validate_grain_threshold(t: f64) -> Result<(), CoreError> {
    crate::threshold_validation::validate_unit_range(t, "grain_threshold")
}

/// Validate that a centering threshold is positive.
pub fn validate_centering_threshold(t: f64) -> Result<(), CoreError> {
    if t <= 0.0 {
        return Err(CoreError::Validation(format!(
            "centering_threshold must be > 0, got {t}"
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

    // -- classify_drift -------------------------------------------------------

    #[test]
    fn drift_normal_below_threshold() {
        assert_eq!(classify_drift(0.10, 0.15), DriftSeverity::Normal);
    }

    #[test]
    fn drift_normal_at_threshold() {
        assert_eq!(classify_drift(0.15, 0.15), DriftSeverity::Normal);
    }

    #[test]
    fn drift_warning_above_threshold() {
        assert_eq!(classify_drift(0.20, 0.15), DriftSeverity::Warning);
    }

    #[test]
    fn drift_warning_at_double_threshold() {
        assert_eq!(classify_drift(0.30, 0.15), DriftSeverity::Warning);
    }

    #[test]
    fn drift_critical_above_double_threshold() {
        assert_eq!(classify_drift(0.35, 0.15), DriftSeverity::Critical);
    }

    // -- classify_grain_match -------------------------------------------------

    #[test]
    fn grain_good_above_threshold() {
        assert_eq!(classify_grain_match(0.90, 0.80), GrainQuality::Good);
    }

    #[test]
    fn grain_good_at_threshold() {
        assert_eq!(classify_grain_match(0.80, 0.80), GrainQuality::Good);
    }

    #[test]
    fn grain_marginal() {
        assert_eq!(classify_grain_match(0.65, 0.80), GrainQuality::Marginal);
    }

    #[test]
    fn grain_poor() {
        assert_eq!(classify_grain_match(0.50, 0.80), GrainQuality::Poor);
    }

    // -- compute_trend_direction -----------------------------------------------

    #[test]
    fn trend_stable_single_value() {
        assert_eq!(compute_trend_direction(&[0.1]), TrendDirection::Stable);
    }

    #[test]
    fn trend_stable_empty() {
        assert_eq!(compute_trend_direction(&[]), TrendDirection::Stable);
    }

    #[test]
    fn trend_worsening() {
        assert_eq!(
            compute_trend_direction(&[0.05, 0.10, 0.15, 0.20]),
            TrendDirection::Worsening,
        );
    }

    #[test]
    fn trend_improving() {
        assert_eq!(
            compute_trend_direction(&[0.30, 0.20, 0.10, 0.05]),
            TrendDirection::Improving,
        );
    }

    #[test]
    fn trend_stable_flat() {
        assert_eq!(
            compute_trend_direction(&[0.15, 0.15, 0.15, 0.15]),
            TrendDirection::Stable,
        );
    }

    // -- validate_drift_threshold ---------------------------------------------

    #[test]
    fn valid_drift_thresholds() {
        assert!(validate_drift_threshold(0.0).is_ok());
        assert!(validate_drift_threshold(0.5).is_ok());
        assert!(validate_drift_threshold(1.0).is_ok());
    }

    #[test]
    fn invalid_drift_threshold_too_high() {
        assert!(validate_drift_threshold(1.1).is_err());
    }

    #[test]
    fn invalid_drift_threshold_negative() {
        assert!(validate_drift_threshold(-0.1).is_err());
    }

    // -- validate_grain_threshold ---------------------------------------------

    #[test]
    fn valid_grain_thresholds() {
        assert!(validate_grain_threshold(0.0).is_ok());
        assert!(validate_grain_threshold(0.8).is_ok());
        assert!(validate_grain_threshold(1.0).is_ok());
    }

    #[test]
    fn invalid_grain_threshold_too_high() {
        assert!(validate_grain_threshold(1.5).is_err());
    }

    // -- validate_centering_threshold -----------------------------------------

    #[test]
    fn valid_centering_thresholds() {
        assert!(validate_centering_threshold(1.0).is_ok());
        assert!(validate_centering_threshold(30.0).is_ok());
        assert!(validate_centering_threshold(100.0).is_ok());
    }

    #[test]
    fn invalid_centering_threshold_zero() {
        assert!(validate_centering_threshold(0.0).is_err());
    }

    #[test]
    fn invalid_centering_threshold_negative() {
        assert!(validate_centering_threshold(-5.0).is_err());
    }
}
