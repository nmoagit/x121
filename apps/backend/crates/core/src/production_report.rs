//! Production reporting constants, validation, and aggregate helpers (PRD-73).
//!
//! Provides report type name constants, format and schedule validation,
//! and period-over-period comparison utilities used by report aggregators.

// ---------------------------------------------------------------------------
// Report type name constants
// ---------------------------------------------------------------------------

/// Delivery summary: avatars delivered per period, broken down by project.
pub const DELIVERY_SUMMARY: &str = "delivery_summary";
/// Throughput metrics: average turnaround from onboarding to delivery.
pub const THROUGHPUT_METRICS: &str = "throughput_metrics";
/// GPU utilization: total GPU hours by project, scene type, and resolution.
pub const GPU_UTILIZATION: &str = "gpu_utilization";
/// Quality metrics: auto-QA pass rates, retry counts, and failure trends.
pub const QUALITY_METRICS: &str = "quality_metrics";
/// Cost per avatar: average GPU time and wall-clock time per avatar.
pub const COST_PER_AVATAR: &str = "cost_per_avatar";
/// Reviewer productivity: review turnaround, approval ratios, annotation density.
pub const REVIEWER_PRODUCTIVITY: &str = "reviewer_productivity";
/// Video technical: per-video metadata (dimensions, duration, framerate, codec, size).
pub const VIDEO_TECHNICAL: &str = "video_technical";

/// All valid report type names.
pub const VALID_REPORT_TYPES: &[&str] = &[
    DELIVERY_SUMMARY,
    THROUGHPUT_METRICS,
    GPU_UTILIZATION,
    QUALITY_METRICS,
    COST_PER_AVATAR,
    REVIEWER_PRODUCTIVITY,
    VIDEO_TECHNICAL,
];

// ---------------------------------------------------------------------------
// Valid export formats
// ---------------------------------------------------------------------------

/// Valid report export formats.
pub const VALID_FORMATS: &[&str] = &["json", "csv", "pdf"];

// ---------------------------------------------------------------------------
// Valid schedule keywords
// ---------------------------------------------------------------------------

/// Accepted human-readable schedule keywords.
const VALID_SCHEDULE_KEYWORDS: &[&str] = &["daily", "weekly", "monthly"];

// ---------------------------------------------------------------------------
// Re-export shared job status ID constants with report-prefixed aliases
// ---------------------------------------------------------------------------

use crate::job_status;

/// Status ID for a pending report (alias for `JOB_STATUS_ID_PENDING`).
pub const REPORT_STATUS_ID_PENDING: i64 = job_status::JOB_STATUS_ID_PENDING;
/// Status ID for a running report (alias for `JOB_STATUS_ID_RUNNING`).
pub const REPORT_STATUS_ID_RUNNING: i64 = job_status::JOB_STATUS_ID_RUNNING;
/// Status ID for a completed report (alias for `JOB_STATUS_ID_COMPLETED`).
pub const REPORT_STATUS_ID_COMPLETED: i64 = job_status::JOB_STATUS_ID_COMPLETED;
/// Status ID for a failed report (alias for `JOB_STATUS_ID_FAILED`).
pub const REPORT_STATUS_ID_FAILED: i64 = job_status::JOB_STATUS_ID_FAILED;

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that `format` is one of `json`, `csv`, or `pdf`.
pub fn validate_format(format: &str) -> Result<(), String> {
    if VALID_FORMATS.contains(&format) {
        Ok(())
    } else {
        Err("Invalid format. Must be one of: json, csv, pdf".to_string())
    }
}

/// Validate a schedule string.
///
/// Accepts the keywords `daily`, `weekly`, `monthly`, or a basic cron
/// pattern with exactly 5 space-separated fields.
pub fn validate_schedule(schedule: &str) -> Result<(), String> {
    let trimmed = schedule.trim();
    if trimmed.is_empty() {
        return Err("Schedule cannot be empty".to_string());
    }

    // Accept keyword schedules.
    if VALID_SCHEDULE_KEYWORDS.contains(&trimmed) {
        return Ok(());
    }

    // Accept basic 5-field cron pattern.
    let fields: Vec<&str> = trimmed.split_whitespace().collect();
    if fields.len() == 5 && fields.iter().all(|f| is_valid_cron_field(f)) {
        return Ok(());
    }

    Err("Invalid schedule. Must be daily, weekly, monthly, or a 5-field cron pattern".to_string())
}

/// Check whether a single cron field looks reasonable.
///
/// Accepts `*`, digits, ranges (`1-5`), step values (`*/5`), and
/// comma-separated lists of the above.
fn is_valid_cron_field(field: &str) -> bool {
    if field.is_empty() {
        return false;
    }
    // Split on comma for list values (e.g. "1,3,5").
    field.split(',').all(|part| {
        if part == "*" {
            return true;
        }
        // Step: */N or N-M/N
        if let Some((base, step)) = part.split_once('/') {
            if step.is_empty() || !step.chars().all(|c| c.is_ascii_digit()) {
                return false;
            }
            return base == "*" || is_range_or_number(base);
        }
        is_range_or_number(part)
    })
}

/// Check whether `s` is a plain number or a range like `1-5`.
fn is_range_or_number(s: &str) -> bool {
    if s.chars().all(|c| c.is_ascii_digit()) && !s.is_empty() {
        return true;
    }
    if let Some((a, b)) = s.split_once('-') {
        return !a.is_empty()
            && !b.is_empty()
            && a.chars().all(|c| c.is_ascii_digit())
            && b.chars().all(|c| c.is_ascii_digit());
    }
    false
}

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

/// Period-over-period comparison result.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PeriodComparison {
    /// Value from the previous period.
    pub previous: f64,
    /// Value from the current period.
    pub current: f64,
    /// Percentage change from previous to current.
    pub change_pct: f64,
    /// Direction label: `"up"`, `"down"`, or `"flat"`.
    pub direction: &'static str,
}

/// Compute a period-over-period comparison.
///
/// Returns a [`PeriodComparison`] with the percentage change and direction.
/// When `previous` is zero, `change_pct` is 100.0 if `current > 0`, 0.0 if
/// `current == 0`, or -100.0 if `current < 0`.
pub fn compute_change(previous: f64, current: f64) -> PeriodComparison {
    let change_pct = if previous == 0.0 {
        if current > 0.0 {
            100.0
        } else if current < 0.0 {
            -100.0
        } else {
            0.0
        }
    } else {
        ((current - previous) / previous.abs()) * 100.0
    };

    let direction = if change_pct > 0.0 {
        "up"
    } else if change_pct < 0.0 {
        "down"
    } else {
        "flat"
    };

    PeriodComparison {
        previous,
        current,
        change_pct,
        direction,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_format ------------------------------------------------------

    #[test]
    fn valid_formats_accepted() {
        assert!(validate_format("json").is_ok());
        assert!(validate_format("csv").is_ok());
        assert!(validate_format("pdf").is_ok());
    }

    #[test]
    fn invalid_format_rejected() {
        assert!(validate_format("xml").is_err());
        assert!(validate_format("").is_err());
        assert!(validate_format("JSON").is_err());
    }

    // -- validate_schedule ----------------------------------------------------

    #[test]
    fn keyword_schedules_accepted() {
        assert!(validate_schedule("daily").is_ok());
        assert!(validate_schedule("weekly").is_ok());
        assert!(validate_schedule("monthly").is_ok());
    }

    #[test]
    fn cron_pattern_accepted() {
        assert!(validate_schedule("0 9 * * 1").is_ok());
        assert!(validate_schedule("*/15 * * * *").is_ok());
        assert!(validate_schedule("0 0 1 * *").is_ok());
        assert!(validate_schedule("30 8 * * 1-5").is_ok());
    }

    #[test]
    fn empty_schedule_rejected() {
        assert!(validate_schedule("").is_err());
        assert!(validate_schedule("   ").is_err());
    }

    #[test]
    fn invalid_schedule_rejected() {
        assert!(validate_schedule("every tuesday").is_err());
        assert!(validate_schedule("0 9 *").is_err()); // only 3 fields
        assert!(validate_schedule("0 9 * * * *").is_err()); // 6 fields
    }

    #[test]
    fn cron_with_commas_accepted() {
        assert!(validate_schedule("0 9 1,15 * *").is_ok());
    }

    #[test]
    fn cron_with_step_accepted() {
        assert!(validate_schedule("*/10 * * * *").is_ok());
        assert!(validate_schedule("0-30/5 * * * *").is_ok());
    }

    // -- compute_change -------------------------------------------------------

    #[test]
    fn compute_change_increase() {
        let result = compute_change(100.0, 150.0);
        assert_eq!(result.change_pct, 50.0);
        assert_eq!(result.direction, "up");
    }

    #[test]
    fn compute_change_decrease() {
        let result = compute_change(100.0, 80.0);
        assert_eq!(result.change_pct, -20.0);
        assert_eq!(result.direction, "down");
    }

    #[test]
    fn compute_change_flat() {
        let result = compute_change(100.0, 100.0);
        assert_eq!(result.change_pct, 0.0);
        assert_eq!(result.direction, "flat");
    }

    #[test]
    fn compute_change_from_zero_to_positive() {
        let result = compute_change(0.0, 50.0);
        assert_eq!(result.change_pct, 100.0);
        assert_eq!(result.direction, "up");
    }

    #[test]
    fn compute_change_from_zero_to_zero() {
        let result = compute_change(0.0, 0.0);
        assert_eq!(result.change_pct, 0.0);
        assert_eq!(result.direction, "flat");
    }

    #[test]
    fn compute_change_from_zero_to_negative() {
        let result = compute_change(0.0, -10.0);
        assert_eq!(result.change_pct, -100.0);
        assert_eq!(result.direction, "down");
    }

    #[test]
    fn compute_change_preserves_values() {
        let result = compute_change(200.0, 300.0);
        assert_eq!(result.previous, 200.0);
        assert_eq!(result.current, 300.0);
    }

    // -- constant checks ------------------------------------------------------

    #[test]
    fn report_types_list_complete() {
        assert_eq!(VALID_REPORT_TYPES.len(), 7);
    }

    #[test]
    fn formats_list_complete() {
        assert_eq!(VALID_FORMATS.len(), 3);
    }
}
