//! Consistency report constants, validation, and computation helpers (PRD-94).
//!
//! Provides report type validation, outlier detection, pairwise similarity
//! matrix computation, and overall consistency scoring for avatar
//! consistency analysis across scenes.

// ---------------------------------------------------------------------------
// Report type constants
// ---------------------------------------------------------------------------

/// Face similarity report type.
pub const REPORT_TYPE_FACE: &str = "face";
/// Color palette consistency report type.
pub const REPORT_TYPE_COLOR: &str = "color";
/// Full consistency report type (combines face + color).
pub const REPORT_TYPE_FULL: &str = "full";

/// All valid consistency report types.
pub const VALID_REPORT_TYPES: &[&str] = &[REPORT_TYPE_FACE, REPORT_TYPE_COLOR, REPORT_TYPE_FULL];

// ---------------------------------------------------------------------------
// Outlier threshold
// ---------------------------------------------------------------------------

/// Scenes with a similarity score below this threshold are considered outliers.
pub const OUTLIER_THRESHOLD: f64 = 0.7;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a report type string is one of the accepted values.
///
/// Returns `Ok(())` if valid, or `Err` with a descriptive message.
pub fn validate_report_type(report_type: &str) -> Result<(), String> {
    if VALID_REPORT_TYPES.contains(&report_type) {
        Ok(())
    } else {
        Err(format!(
            "Invalid report type '{}'. Must be one of: {}",
            report_type,
            VALID_REPORT_TYPES.join(", ")
        ))
    }
}

// ---------------------------------------------------------------------------
// Computation helpers
// ---------------------------------------------------------------------------

/// Compute a pairwise similarity matrix from a list of scores.
///
/// Given N scores, produces an NxN matrix where each cell `(i, j)` contains
/// `1.0 - |scores[i] - scores[j]|`. The diagonal is always 1.0 (perfect
/// self-similarity). This is a placeholder heuristic; production usage would
/// replace this with actual embedding cosine similarity.
pub fn compute_pairwise_matrix(scores: &[f64]) -> Vec<Vec<f64>> {
    let n = scores.len();
    let mut matrix = vec![vec![0.0; n]; n];
    for i in 0..n {
        for j in 0..n {
            if i == j {
                matrix[i][j] = 1.0;
            } else {
                let diff = (scores[i] - scores[j]).abs();
                matrix[i][j] = (1.0 - diff).max(0.0);
            }
        }
    }
    matrix
}

/// Identify indices of scores that fall below the given threshold.
///
/// Returns a sorted list of indices where `scores[i] < threshold`.
pub fn identify_outliers(scores: &[f64], threshold: f64) -> Vec<usize> {
    scores
        .iter()
        .enumerate()
        .filter(|(_, &s)| s < threshold)
        .map(|(i, _)| i)
        .collect()
}

/// Compute the overall consistency as the arithmetic mean of all scores.
///
/// Returns 0.0 for an empty slice.
pub fn compute_overall_consistency(scores: &[f64]) -> f64 {
    if scores.is_empty() {
        return 0.0;
    }
    let sum: f64 = scores.iter().sum();
    sum / scores.len() as f64
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_report_type -------------------------------------------------

    #[test]
    fn valid_report_types_accepted() {
        assert!(validate_report_type("face").is_ok());
        assert!(validate_report_type("color").is_ok());
        assert!(validate_report_type("full").is_ok());
    }

    #[test]
    fn invalid_report_type_rejected() {
        assert!(validate_report_type("audio").is_err());
        assert!(validate_report_type("").is_err());
        assert!(validate_report_type("Face").is_err());
    }

    #[test]
    fn report_type_error_contains_value() {
        let err = validate_report_type("bogus").unwrap_err();
        assert!(
            err.contains("bogus"),
            "Error should mention the invalid value"
        );
        assert!(err.contains("face"), "Error should list valid types");
    }

    // -- compute_pairwise_matrix ----------------------------------------------

    #[test]
    fn pairwise_matrix_diagonal_is_one() {
        let scores = vec![0.8, 0.6, 0.9];
        let matrix = compute_pairwise_matrix(&scores);
        for i in 0..scores.len() {
            assert!((matrix[i][i] - 1.0).abs() < f64::EPSILON);
        }
    }

    #[test]
    fn pairwise_matrix_is_symmetric() {
        let scores = vec![0.8, 0.6, 0.9, 0.5];
        let matrix = compute_pairwise_matrix(&scores);
        for i in 0..scores.len() {
            for j in 0..scores.len() {
                assert!(
                    (matrix[i][j] - matrix[j][i]).abs() < f64::EPSILON,
                    "Matrix should be symmetric at [{i}][{j}]"
                );
            }
        }
    }

    #[test]
    fn pairwise_matrix_correct_values() {
        let scores = vec![0.9, 0.7];
        let matrix = compute_pairwise_matrix(&scores);
        // diff = |0.9 - 0.7| = 0.2, similarity = 1.0 - 0.2 = 0.8
        assert!((matrix[0][1] - 0.8).abs() < f64::EPSILON);
        assert!((matrix[1][0] - 0.8).abs() < f64::EPSILON);
    }

    #[test]
    fn pairwise_matrix_empty_input() {
        let matrix = compute_pairwise_matrix(&[]);
        assert!(matrix.is_empty());
    }

    #[test]
    fn pairwise_matrix_single_score() {
        let matrix = compute_pairwise_matrix(&[0.5]);
        assert_eq!(matrix.len(), 1);
        assert!((matrix[0][0] - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn pairwise_matrix_clamped_to_zero() {
        // Scores far apart: diff > 1.0 should clamp to 0.0
        let scores = vec![0.0, 1.5];
        let matrix = compute_pairwise_matrix(&scores);
        assert!((matrix[0][1]).abs() < f64::EPSILON, "Should clamp to 0.0");
    }

    // -- identify_outliers ----------------------------------------------------

    #[test]
    fn outliers_below_threshold() {
        let scores = vec![0.9, 0.5, 0.8, 0.3, 0.75];
        let outliers = identify_outliers(&scores, 0.7);
        assert_eq!(outliers, vec![1, 3]);
    }

    #[test]
    fn no_outliers_when_all_above() {
        let scores = vec![0.9, 0.8, 0.95];
        let outliers = identify_outliers(&scores, 0.7);
        assert!(outliers.is_empty());
    }

    #[test]
    fn all_outliers_when_all_below() {
        let scores = vec![0.1, 0.2, 0.3];
        let outliers = identify_outliers(&scores, 0.5);
        assert_eq!(outliers, vec![0, 1, 2]);
    }

    #[test]
    fn outliers_empty_input() {
        let outliers = identify_outliers(&[], 0.7);
        assert!(outliers.is_empty());
    }

    #[test]
    fn outliers_at_threshold_not_included() {
        let scores = vec![0.7, 0.69, 0.71];
        let outliers = identify_outliers(&scores, 0.7);
        // 0.7 is NOT less than 0.7, so only index 1 is an outlier
        assert_eq!(outliers, vec![1]);
    }

    // -- compute_overall_consistency ------------------------------------------

    #[test]
    fn overall_consistency_average() {
        let scores = vec![0.8, 0.6, 1.0];
        let result = compute_overall_consistency(&scores);
        assert!((result - 0.8).abs() < f64::EPSILON);
    }

    #[test]
    fn overall_consistency_empty() {
        assert!((compute_overall_consistency(&[]) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn overall_consistency_single() {
        assert!((compute_overall_consistency(&[0.42]) - 0.42).abs() < f64::EPSILON);
    }

    // -- constant checks ------------------------------------------------------

    #[test]
    fn valid_report_types_count() {
        assert_eq!(VALID_REPORT_TYPES.len(), 3);
    }

    #[test]
    fn outlier_threshold_is_reasonable() {
        assert!(OUTLIER_THRESHOLD > 0.0 && OUTLIER_THRESHOLD < 1.0);
    }
}
