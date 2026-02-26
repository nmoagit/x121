//! Failure pattern tracking domain logic (PRD-64).
//!
//! Provides severity classification, pattern key computation, heatmap matrix
//! building, and trend data structures for correlating quality gate failures
//! with generation parameters.

use crate::error::CoreError;
use crate::threshold_validation::validate_unit_range;
use crate::types::DbId;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Minimum number of observations before a pattern is considered statistically
/// significant. Patterns with fewer observations are classified as `Low`
/// regardless of failure rate.
pub const MIN_SAMPLE_COUNT: i32 = 5;

/// Failure rate threshold for high severity (>= 50% failure rate).
pub const SEVERITY_THRESHOLD_HIGH: f64 = 0.5;

/// Failure rate threshold for medium severity (>= 20% failure rate).
pub const SEVERITY_THRESHOLD_MEDIUM: f64 = 0.2;

// ---------------------------------------------------------------------------
// PatternSeverity
// ---------------------------------------------------------------------------

/// Severity classification for a failure pattern.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatternSeverity {
    High,
    Medium,
    Low,
}

impl PatternSeverity {
    /// String representation for database storage.
    pub fn as_str(&self) -> &'static str {
        match self {
            PatternSeverity::High => "high",
            PatternSeverity::Medium => "medium",
            PatternSeverity::Low => "low",
        }
    }

    /// Parse from a string, defaulting to `Low` for unknown values.
    pub fn from_str(s: &str) -> Self {
        match s {
            "high" => PatternSeverity::High,
            "medium" => PatternSeverity::Medium,
            _ => PatternSeverity::Low,
        }
    }

    /// Classify severity based on failure rate alone (no sample count guard).
    pub fn from_failure_rate(rate: f64) -> Self {
        if rate >= SEVERITY_THRESHOLD_HIGH {
            PatternSeverity::High
        } else if rate >= SEVERITY_THRESHOLD_MEDIUM {
            PatternSeverity::Medium
        } else {
            PatternSeverity::Low
        }
    }
}

// ---------------------------------------------------------------------------
// EffectivenessRating
// ---------------------------------------------------------------------------

/// Effectiveness rating for a recorded fix.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EffectivenessRating {
    Resolved,
    Improved,
    NoEffect,
}

impl EffectivenessRating {
    /// String representation for database storage.
    pub fn as_str(&self) -> &'static str {
        match self {
            EffectivenessRating::Resolved => "resolved",
            EffectivenessRating::Improved => "improved",
            EffectivenessRating::NoEffect => "no_effect",
        }
    }

    /// Parse from a string, defaulting to `NoEffect` for unknown values.
    pub fn from_str(s: &str) -> Self {
        match s {
            "resolved" => EffectivenessRating::Resolved,
            "improved" => EffectivenessRating::Improved,
            _ => EffectivenessRating::NoEffect,
        }
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a failure rate is within `[0.0, 1.0]`.
///
/// Delegates to the shared [`validate_unit_range`] helper to avoid duplication.
pub fn validate_failure_rate(rate: f64) -> Result<(), CoreError> {
    validate_unit_range(rate, "failure_rate")
}

// ---------------------------------------------------------------------------
// Severity classification
// ---------------------------------------------------------------------------

/// Classify severity from raw counts.
///
/// Applies the [`MIN_SAMPLE_COUNT`] filter: if `total_count` is below the
/// minimum, returns `Low` regardless of failure rate. Otherwise computes the
/// rate and classifies via [`PatternSeverity::from_failure_rate`].
pub fn classify_severity(failure_count: i32, total_count: i32) -> PatternSeverity {
    if total_count < MIN_SAMPLE_COUNT {
        return PatternSeverity::Low;
    }
    let rate = failure_count as f64 / total_count as f64;
    PatternSeverity::from_failure_rate(rate)
}

// ---------------------------------------------------------------------------
// Pattern key
// ---------------------------------------------------------------------------

/// Compute a deterministic pattern key from dimension values.
///
/// The key format is `"w:{wf}:l:{lr}:c:{ch}:st:{st}:sp:{sp}"` with `None`
/// dimensions omitted. This produces stable, unique keys for upsert operations.
///
/// # Examples
///
/// ```
/// use x121_core::failure_tracking::compute_pattern_key;
///
/// let key = compute_pattern_key(Some(5), Some(3), Some(12), Some(7), Some("6+"));
/// assert_eq!(key, "w:5:l:3:c:12:st:7:sp:6+");
///
/// let key2 = compute_pattern_key(Some(5), None, None, None, None);
/// assert_eq!(key2, "w:5");
/// ```
pub fn compute_pattern_key(
    workflow_id: Option<DbId>,
    lora_id: Option<DbId>,
    character_id: Option<DbId>,
    scene_type_id: Option<DbId>,
    segment_position: Option<&str>,
) -> String {
    let mut parts = Vec::new();
    if let Some(id) = workflow_id {
        parts.push(format!("w:{id}"));
    }
    if let Some(id) = lora_id {
        parts.push(format!("l:{id}"));
    }
    if let Some(id) = character_id {
        parts.push(format!("c:{id}"));
    }
    if let Some(id) = scene_type_id {
        parts.push(format!("st:{id}"));
    }
    if let Some(pos) = segment_position {
        parts.push(format!("sp:{pos}"));
    }
    parts.join(":")
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

/// Input data for building a heatmap matrix cell.
pub struct PatternInput {
    pub row_label: String,
    pub col_label: String,
    pub failure_count: i32,
    pub total_count: i32,
}

/// A single cell in a failure heatmap matrix.
#[derive(Debug, Clone)]
pub struct HeatmapCell {
    pub row_label: String,
    pub col_label: String,
    pub failure_rate: f64,
    pub sample_count: i32,
    pub severity: PatternSeverity,
}

/// Build a heatmap matrix from a list of pattern inputs.
///
/// Groups inputs by `(row_label, col_label)` pairs, aggregating counts and
/// computing failure rates and severity classifications for each cell.
pub fn build_heatmap_matrix(patterns: &[PatternInput]) -> Vec<HeatmapCell> {
    use std::collections::HashMap;

    // Aggregate counts by (row, col).
    let mut aggregates: HashMap<(String, String), (i32, i32)> = HashMap::new();
    for p in patterns {
        let key = (p.row_label.clone(), p.col_label.clone());
        let entry = aggregates.entry(key).or_insert((0, 0));
        entry.0 += p.failure_count;
        entry.1 += p.total_count;
    }

    let mut cells: Vec<HeatmapCell> = aggregates
        .into_iter()
        .map(|((row, col), (failures, total))| {
            let rate = if total > 0 {
                failures as f64 / total as f64
            } else {
                0.0
            };
            HeatmapCell {
                row_label: row,
                col_label: col,
                failure_rate: rate,
                sample_count: total,
                severity: classify_severity(failures, total),
            }
        })
        .collect();

    // Sort for deterministic output: row first, then col.
    cells.sort_by(|a, b| {
        a.row_label
            .cmp(&b.row_label)
            .then_with(|| a.col_label.cmp(&b.col_label))
    });

    cells
}

// ---------------------------------------------------------------------------
// Trend data
// ---------------------------------------------------------------------------

/// A single data point in a failure trend time series.
#[derive(Debug, Clone)]
pub struct TrendPoint {
    pub period: String,
    pub failure_rate: f64,
    pub sample_count: i32,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- PatternSeverity --

    #[test]
    fn severity_as_str_returns_correct_strings() {
        assert_eq!(PatternSeverity::High.as_str(), "high");
        assert_eq!(PatternSeverity::Medium.as_str(), "medium");
        assert_eq!(PatternSeverity::Low.as_str(), "low");
    }

    #[test]
    fn severity_from_str_parses_known_values() {
        assert_eq!(PatternSeverity::from_str("high"), PatternSeverity::High);
        assert_eq!(PatternSeverity::from_str("medium"), PatternSeverity::Medium);
        assert_eq!(PatternSeverity::from_str("low"), PatternSeverity::Low);
    }

    #[test]
    fn severity_from_str_defaults_unknown_to_low() {
        assert_eq!(PatternSeverity::from_str("unknown"), PatternSeverity::Low);
        assert_eq!(PatternSeverity::from_str(""), PatternSeverity::Low);
    }

    #[test]
    fn severity_from_failure_rate_high() {
        assert_eq!(
            PatternSeverity::from_failure_rate(0.5),
            PatternSeverity::High
        );
        assert_eq!(
            PatternSeverity::from_failure_rate(0.8),
            PatternSeverity::High
        );
        assert_eq!(
            PatternSeverity::from_failure_rate(1.0),
            PatternSeverity::High
        );
    }

    #[test]
    fn severity_from_failure_rate_medium() {
        assert_eq!(
            PatternSeverity::from_failure_rate(0.2),
            PatternSeverity::Medium
        );
        assert_eq!(
            PatternSeverity::from_failure_rate(0.35),
            PatternSeverity::Medium
        );
        assert_eq!(
            PatternSeverity::from_failure_rate(0.499),
            PatternSeverity::Medium
        );
    }

    #[test]
    fn severity_from_failure_rate_low() {
        assert_eq!(
            PatternSeverity::from_failure_rate(0.0),
            PatternSeverity::Low
        );
        assert_eq!(
            PatternSeverity::from_failure_rate(0.1),
            PatternSeverity::Low
        );
        assert_eq!(
            PatternSeverity::from_failure_rate(0.199),
            PatternSeverity::Low
        );
    }

    // -- EffectivenessRating --

    #[test]
    fn effectiveness_as_str_returns_correct_strings() {
        assert_eq!(EffectivenessRating::Resolved.as_str(), "resolved");
        assert_eq!(EffectivenessRating::Improved.as_str(), "improved");
        assert_eq!(EffectivenessRating::NoEffect.as_str(), "no_effect");
    }

    #[test]
    fn effectiveness_from_str_parses_known_values() {
        assert_eq!(
            EffectivenessRating::from_str("resolved"),
            EffectivenessRating::Resolved
        );
        assert_eq!(
            EffectivenessRating::from_str("improved"),
            EffectivenessRating::Improved
        );
        assert_eq!(
            EffectivenessRating::from_str("no_effect"),
            EffectivenessRating::NoEffect
        );
    }

    #[test]
    fn effectiveness_from_str_defaults_unknown_to_no_effect() {
        assert_eq!(
            EffectivenessRating::from_str(""),
            EffectivenessRating::NoEffect
        );
        assert_eq!(
            EffectivenessRating::from_str("garbage"),
            EffectivenessRating::NoEffect
        );
    }

    // -- validate_failure_rate --

    #[test]
    fn validate_failure_rate_accepts_valid_values() {
        assert!(validate_failure_rate(0.0).is_ok());
        assert!(validate_failure_rate(0.5).is_ok());
        assert!(validate_failure_rate(1.0).is_ok());
    }

    #[test]
    fn validate_failure_rate_rejects_negative() {
        assert!(validate_failure_rate(-0.01).is_err());
    }

    #[test]
    fn validate_failure_rate_rejects_above_one() {
        assert!(validate_failure_rate(1.01).is_err());
    }

    // -- classify_severity --

    #[test]
    fn classify_severity_low_sample_returns_low() {
        // Even 100% failure rate should be Low if sample count is too small.
        assert_eq!(classify_severity(4, 4), PatternSeverity::Low);
        assert_eq!(classify_severity(3, 3), PatternSeverity::Low);
    }

    #[test]
    fn classify_severity_high_rate() {
        assert_eq!(classify_severity(5, 10), PatternSeverity::High);
        assert_eq!(classify_severity(8, 10), PatternSeverity::High);
    }

    #[test]
    fn classify_severity_medium_rate() {
        assert_eq!(classify_severity(2, 10), PatternSeverity::Medium);
        assert_eq!(classify_severity(4, 10), PatternSeverity::Medium);
    }

    #[test]
    fn classify_severity_low_rate() {
        assert_eq!(classify_severity(1, 10), PatternSeverity::Low);
        assert_eq!(classify_severity(0, 10), PatternSeverity::Low);
    }

    #[test]
    fn classify_severity_at_boundary() {
        // Exactly 5 total is valid sample.
        assert_eq!(classify_severity(0, 5), PatternSeverity::Low);
        // 1/5 = 0.2 should be medium.
        assert_eq!(classify_severity(1, 5), PatternSeverity::Medium);
    }

    // -- compute_pattern_key --

    #[test]
    fn pattern_key_all_dimensions() {
        let key = compute_pattern_key(Some(5), Some(3), Some(12), Some(7), Some("6+"));
        assert_eq!(key, "w:5:l:3:c:12:st:7:sp:6+");
    }

    #[test]
    fn pattern_key_some_dimensions() {
        let key = compute_pattern_key(Some(5), None, Some(12), None, None);
        assert_eq!(key, "w:5:c:12");
    }

    #[test]
    fn pattern_key_single_dimension() {
        assert_eq!(compute_pattern_key(Some(1), None, None, None, None), "w:1");
        assert_eq!(
            compute_pattern_key(None, None, None, None, Some("1-3")),
            "sp:1-3"
        );
    }

    #[test]
    fn pattern_key_no_dimensions() {
        assert_eq!(compute_pattern_key(None, None, None, None, None), "");
    }

    // -- build_heatmap_matrix --

    #[test]
    fn heatmap_empty_input() {
        let cells = build_heatmap_matrix(&[]);
        assert!(cells.is_empty());
    }

    #[test]
    fn heatmap_single_cell() {
        let input = vec![PatternInput {
            row_label: "Character A".to_string(),
            col_label: "Scene Type X".to_string(),
            failure_count: 3,
            total_count: 10,
        }];
        let cells = build_heatmap_matrix(&input);
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].row_label, "Character A");
        assert_eq!(cells[0].col_label, "Scene Type X");
        assert!((cells[0].failure_rate - 0.3).abs() < f64::EPSILON);
        assert_eq!(cells[0].sample_count, 10);
        assert_eq!(cells[0].severity, PatternSeverity::Medium);
    }

    #[test]
    fn heatmap_aggregates_same_cell() {
        let input = vec![
            PatternInput {
                row_label: "A".to_string(),
                col_label: "B".to_string(),
                failure_count: 2,
                total_count: 5,
            },
            PatternInput {
                row_label: "A".to_string(),
                col_label: "B".to_string(),
                failure_count: 3,
                total_count: 5,
            },
        ];
        let cells = build_heatmap_matrix(&input);
        assert_eq!(cells.len(), 1);
        // 5 failures / 10 total = 0.5 -> High
        assert_eq!(cells[0].failure_rate, 0.5);
        assert_eq!(cells[0].sample_count, 10);
        assert_eq!(cells[0].severity, PatternSeverity::High);
    }

    #[test]
    fn heatmap_multiple_cells_sorted() {
        let input = vec![
            PatternInput {
                row_label: "B".to_string(),
                col_label: "Y".to_string(),
                failure_count: 1,
                total_count: 10,
            },
            PatternInput {
                row_label: "A".to_string(),
                col_label: "Z".to_string(),
                failure_count: 5,
                total_count: 10,
            },
            PatternInput {
                row_label: "A".to_string(),
                col_label: "Y".to_string(),
                failure_count: 0,
                total_count: 10,
            },
        ];
        let cells = build_heatmap_matrix(&input);
        assert_eq!(cells.len(), 3);
        // Sorted by row, then col.
        assert_eq!(cells[0].row_label, "A");
        assert_eq!(cells[0].col_label, "Y");
        assert_eq!(cells[1].row_label, "A");
        assert_eq!(cells[1].col_label, "Z");
        assert_eq!(cells[2].row_label, "B");
        assert_eq!(cells[2].col_label, "Y");
    }

    #[test]
    fn heatmap_zero_total_gives_zero_rate() {
        let input = vec![PatternInput {
            row_label: "A".to_string(),
            col_label: "B".to_string(),
            failure_count: 0,
            total_count: 0,
        }];
        let cells = build_heatmap_matrix(&input);
        assert_eq!(cells[0].failure_rate, 0.0);
    }

    // -- TrendPoint --

    #[test]
    fn trend_point_creation() {
        let point = TrendPoint {
            period: "2026-02-01".to_string(),
            failure_rate: 0.35,
            sample_count: 20,
        };
        assert_eq!(point.period, "2026-02-01");
        assert_eq!(point.failure_rate, 0.35);
        assert_eq!(point.sample_count, 20);
    }

    // -- Constants --

    #[test]
    fn min_sample_count_is_five() {
        assert_eq!(MIN_SAMPLE_COUNT, 5);
    }

    #[test]
    fn severity_thresholds_are_correct() {
        assert_eq!(SEVERITY_THRESHOLD_HIGH, 0.5);
        assert_eq!(SEVERITY_THRESHOLD_MEDIUM, 0.2);
    }
}
