//! Regression testing logic (PRD-65).
//!
//! Pure functions for classifying regression results by comparing baseline
//! and new QA scores.  Reuses [`compute_score_diffs`] from
//! [`segment_comparison`](crate::segment_comparison) to avoid duplication.

use serde::Serialize;
use serde_json::Value;

use crate::segment_comparison::{average_score_diffs, compute_score_diffs};

// -- Verdict constants -------------------------------------------------------

/// The new scores are strictly better on average.
pub const VERDICT_IMPROVED: &str = "improved";
/// The scores are within the tolerance threshold.
pub const VERDICT_SAME: &str = "same";
/// The new scores are worse on average.
pub const VERDICT_DEGRADED: &str = "degraded";
/// The comparison could not be performed (generation failed, etc.).
pub const VERDICT_ERROR: &str = "error";

// -- Trigger type constants --------------------------------------------------

pub const TRIGGER_WORKFLOW_UPDATE: &str = "workflow_update";
pub const TRIGGER_LORA_UPDATE: &str = "lora_update";
pub const TRIGGER_MODEL_UPDATE: &str = "model_update";
pub const TRIGGER_MANUAL: &str = "manual";

/// All valid trigger types.
pub const VALID_TRIGGER_TYPES: &[&str] = &[
    TRIGGER_WORKFLOW_UPDATE,
    TRIGGER_LORA_UPDATE,
    TRIGGER_MODEL_UPDATE,
    TRIGGER_MANUAL,
];

// -- Run status constants ----------------------------------------------------

pub const RUN_STATUS_PENDING: &str = "pending";
pub const RUN_STATUS_RUNNING: &str = "running";
pub const RUN_STATUS_COMPLETED: &str = "completed";
pub const RUN_STATUS_FAILED: &str = "failed";
pub const RUN_STATUS_CANCELLED: &str = "cancelled";

/// All valid run statuses.
pub const VALID_RUN_STATUSES: &[&str] = &[
    RUN_STATUS_PENDING,
    RUN_STATUS_RUNNING,
    RUN_STATUS_COMPLETED,
    RUN_STATUS_FAILED,
    RUN_STATUS_CANCELLED,
];

/// Tolerance threshold: if absolute average diff is below this, classify as "same".
pub const SAME_THRESHOLD: f64 = 0.02;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/// Classify the comparison result as improved, same, or degraded.
///
/// Uses [`compute_score_diffs`] from `segment_comparison` to get per-metric
/// diffs, then classifies based on average:
/// - Average > `SAME_THRESHOLD` -> improved
/// - Average < `-SAME_THRESHOLD` -> degraded
/// - Otherwise -> same
pub fn classify_verdict(baseline_scores: &Value, new_scores: &Value) -> (Value, String) {
    let diffs = compute_score_diffs(baseline_scores, new_scores);
    let verdict = classify_from_diffs(&diffs);
    (diffs, verdict)
}

/// Classify verdict from pre-computed score diffs.
///
/// Uses [`average_score_diffs`](crate::segment_comparison::average_score_diffs)
/// to compute the mean, then classifies based on the [`SAME_THRESHOLD`].
pub fn classify_from_diffs(score_diffs: &Value) -> String {
    let avg = match average_score_diffs(score_diffs) {
        Some(a) => a,
        None => return VERDICT_SAME.to_string(),
    };

    if avg > SAME_THRESHOLD {
        VERDICT_IMPROVED.to_string()
    } else if avg < -SAME_THRESHOLD {
        VERDICT_DEGRADED.to_string()
    } else {
        VERDICT_SAME.to_string()
    }
}

// ---------------------------------------------------------------------------
// Run summary
// ---------------------------------------------------------------------------

/// Aggregate statistics for a completed regression run.
///
/// Uses `i32` fields to match the database column types and avoid
/// redundant conversion in handlers.  Implements [`Serialize`] so it
/// can be embedded directly in API response DTOs.
#[derive(Debug, Clone, Serialize)]
pub struct RunSummary {
    pub total: i32,
    pub improved: i32,
    pub same: i32,
    pub degraded: i32,
    pub errors: i32,
    pub overall_passed: bool,
}

/// Summarize a list of verdict strings into a [`RunSummary`].
///
/// A run is considered passed when there are zero degraded results and zero
/// errors.
pub fn summarize_verdicts(verdicts: &[String]) -> RunSummary {
    let mut improved: i32 = 0;
    let mut same: i32 = 0;
    let mut degraded: i32 = 0;
    let mut errors: i32 = 0;

    for v in verdicts {
        match v.as_str() {
            VERDICT_IMPROVED => improved += 1,
            VERDICT_SAME => same += 1,
            VERDICT_DEGRADED => degraded += 1,
            _ => errors += 1,
        }
    }

    RunSummary {
        total: verdicts.len() as i32,
        improved,
        same,
        degraded,
        errors,
        overall_passed: degraded == 0 && errors == 0,
    }
}

/// Validate that a trigger type is one of the known values.
pub fn validate_trigger_type(trigger_type: &str) -> Result<(), crate::error::CoreError> {
    if VALID_TRIGGER_TYPES.contains(&trigger_type) {
        Ok(())
    } else {
        Err(crate::error::CoreError::Validation(format!(
            "Invalid trigger type '{trigger_type}'. Must be one of: {}",
            VALID_TRIGGER_TYPES.join(", ")
        )))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- classify_verdict ---------------------------------------------------

    #[test]
    fn classify_verdict_improved_when_new_is_better() {
        let baseline = json!({"sharpness": 0.7, "color": 0.6});
        let new = json!({"sharpness": 0.9, "color": 0.8});
        let (diffs, verdict) = classify_verdict(&baseline, &new);

        assert_eq!(verdict, VERDICT_IMPROVED);
        let map = diffs.as_object().unwrap();
        assert!((map["sharpness"].as_f64().unwrap() - 0.2).abs() < 1e-10);
        assert!((map["color"].as_f64().unwrap() - 0.2).abs() < 1e-10);
    }

    #[test]
    fn classify_verdict_degraded_when_new_is_worse() {
        let baseline = json!({"sharpness": 0.9, "color": 0.8});
        let new = json!({"sharpness": 0.7, "color": 0.6});
        let (_diffs, verdict) = classify_verdict(&baseline, &new);
        assert_eq!(verdict, VERDICT_DEGRADED);
    }

    #[test]
    fn classify_verdict_same_within_threshold() {
        let baseline = json!({"sharpness": 0.80, "color": 0.70});
        let new = json!({"sharpness": 0.81, "color": 0.71});
        let (_diffs, verdict) = classify_verdict(&baseline, &new);
        assert_eq!(verdict, VERDICT_SAME);
    }

    #[test]
    fn classify_verdict_same_for_identical_scores() {
        let scores = json!({"sharpness": 0.8, "color": 0.7});
        let (_diffs, verdict) = classify_verdict(&scores, &scores);
        assert_eq!(verdict, VERDICT_SAME);
    }

    #[test]
    fn classify_verdict_same_for_empty_scores() {
        let (_diffs, verdict) = classify_verdict(&json!({}), &json!({}));
        assert_eq!(verdict, VERDICT_SAME);
    }

    // -- classify_from_diffs ------------------------------------------------

    #[test]
    fn classify_from_diffs_improved() {
        let diffs = json!({"sharpness": 0.1, "color": 0.05});
        assert_eq!(classify_from_diffs(&diffs), VERDICT_IMPROVED);
    }

    #[test]
    fn classify_from_diffs_degraded() {
        let diffs = json!({"sharpness": -0.1, "color": -0.05});
        assert_eq!(classify_from_diffs(&diffs), VERDICT_DEGRADED);
    }

    #[test]
    fn classify_from_diffs_same_near_zero() {
        let diffs = json!({"sharpness": 0.01, "color": -0.01});
        assert_eq!(classify_from_diffs(&diffs), VERDICT_SAME);
    }

    #[test]
    fn classify_from_diffs_same_for_empty_object() {
        assert_eq!(classify_from_diffs(&json!({})), VERDICT_SAME);
    }

    #[test]
    fn classify_from_diffs_same_for_non_object() {
        assert_eq!(classify_from_diffs(&json!(42)), VERDICT_SAME);
    }

    #[test]
    fn classify_from_diffs_same_for_null() {
        assert_eq!(classify_from_diffs(&Value::Null), VERDICT_SAME);
    }

    #[test]
    fn classify_from_diffs_ignores_non_numeric_values() {
        let diffs = json!({"sharpness": "not a number", "color": "also not"});
        assert_eq!(classify_from_diffs(&diffs), VERDICT_SAME);
    }

    // -- summarize_verdicts -------------------------------------------------

    #[test]
    fn summarize_all_improved() {
        let verdicts: Vec<String> =
            vec![VERDICT_IMPROVED.to_string(), VERDICT_IMPROVED.to_string()];
        let summary = summarize_verdicts(&verdicts);
        assert_eq!(summary.total, 2);
        assert_eq!(summary.improved, 2);
        assert_eq!(summary.same, 0);
        assert_eq!(summary.degraded, 0);
        assert_eq!(summary.errors, 0);
        assert!(summary.overall_passed);
    }

    #[test]
    fn summarize_mixed_passing() {
        let verdicts = vec![VERDICT_IMPROVED.to_string(), VERDICT_SAME.to_string()];
        let summary = summarize_verdicts(&verdicts);
        assert_eq!(summary.total, 2);
        assert_eq!(summary.improved, 1);
        assert_eq!(summary.same, 1);
        assert!(summary.overall_passed);
    }

    #[test]
    fn summarize_with_degraded_fails() {
        let verdicts = vec![VERDICT_IMPROVED.to_string(), VERDICT_DEGRADED.to_string()];
        let summary = summarize_verdicts(&verdicts);
        assert!(!summary.overall_passed);
        assert_eq!(summary.degraded, 1);
    }

    #[test]
    fn summarize_with_errors_fails() {
        let verdicts = vec![VERDICT_SAME.to_string(), VERDICT_ERROR.to_string()];
        let summary = summarize_verdicts(&verdicts);
        assert!(!summary.overall_passed);
        assert_eq!(summary.errors, 1);
    }

    #[test]
    fn summarize_empty_passes() {
        let summary = summarize_verdicts(&[]);
        assert_eq!(summary.total, 0);
        assert!(summary.overall_passed);
    }

    // -- validate_trigger_type ----------------------------------------------

    #[test]
    fn valid_trigger_types_accepted() {
        for tt in VALID_TRIGGER_TYPES {
            assert!(validate_trigger_type(tt).is_ok());
        }
    }

    #[test]
    fn invalid_trigger_type_rejected() {
        assert!(validate_trigger_type("invalid").is_err());
    }
}
