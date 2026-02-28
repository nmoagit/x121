//! Generation Budget & Quota Management business logic (PRD-93).
//!
//! Pure functions for budget checking, exemption matching, and trend
//! projection. No database dependencies -- all data is passed in.

use serde::Serialize;

// ---------------------------------------------------------------------------
// Period type constants
// ---------------------------------------------------------------------------

/// Budget period: daily reset.
pub const PERIOD_DAILY: &str = "daily";

/// Budget period: weekly reset.
pub const PERIOD_WEEKLY: &str = "weekly";

/// Budget period: monthly reset.
pub const PERIOD_MONTHLY: &str = "monthly";

/// Budget period: no reset.
pub const PERIOD_UNLIMITED: &str = "unlimited";

// ---------------------------------------------------------------------------
// Threshold defaults
// ---------------------------------------------------------------------------

/// Default warning threshold percentage (75%).
pub const DEFAULT_WARNING_THRESHOLD_PCT: i32 = 75;

/// Default critical threshold percentage (90%).
pub const DEFAULT_CRITICAL_THRESHOLD_PCT: i32 = 90;

// ---------------------------------------------------------------------------
// Budget check result
// ---------------------------------------------------------------------------

/// Outcome of a pre-submission budget check.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BudgetCheckResult {
    /// Submission is allowed without warnings.
    Allowed,

    /// Submission is allowed but a warning threshold has been crossed.
    Warning { message: String, consumed_pct: f64 },

    /// Submission is blocked because the hard limit would be exceeded.
    Blocked { message: String, consumed_pct: f64 },

    /// No budget is configured for this project -- submission is allowed.
    NoBudget,
}

/// Check whether a job submission should be allowed, warned, or blocked.
///
/// Returns [`BudgetCheckResult`] indicating the outcome.
pub fn check_budget(
    budget_gpu_hours: f64,
    consumed_gpu_hours: f64,
    estimated_gpu_hours: f64,
    warning_threshold_pct: i32,
    critical_threshold_pct: i32,
    hard_limit_enabled: bool,
) -> BudgetCheckResult {
    if budget_gpu_hours <= 0.0 {
        return BudgetCheckResult::NoBudget;
    }

    let after_submission = consumed_gpu_hours + estimated_gpu_hours;
    let consumed_pct = (after_submission / budget_gpu_hours) * 100.0;

    // Check hard limit first
    if hard_limit_enabled && after_submission > budget_gpu_hours {
        return BudgetCheckResult::Blocked {
            message: format!(
                "Budget exhausted. {:.1} of {:.1} GPU hours used. \
                 This job requires {:.2} hours. Contact your Admin to increase the budget.",
                consumed_gpu_hours, budget_gpu_hours, estimated_gpu_hours
            ),
            consumed_pct,
        };
    }

    // Check critical threshold
    if consumed_pct >= critical_threshold_pct as f64 {
        return BudgetCheckResult::Warning {
            message: format!(
                "Critical: {:.1}% of budget consumed ({:.1}/{:.1} GPU hours). \
                 Only {:.2} hours remaining.",
                consumed_pct,
                after_submission,
                budget_gpu_hours,
                (budget_gpu_hours - after_submission).max(0.0)
            ),
            consumed_pct,
        };
    }

    // Check warning threshold
    if consumed_pct >= warning_threshold_pct as f64 {
        return BudgetCheckResult::Warning {
            message: format!(
                "Warning: {:.1}% of budget consumed ({:.1}/{:.1} GPU hours). \
                 {:.2} hours remaining.",
                consumed_pct,
                after_submission,
                budget_gpu_hours,
                (budget_gpu_hours - after_submission).max(0.0)
            ),
            consumed_pct,
        };
    }

    BudgetCheckResult::Allowed
}

// ---------------------------------------------------------------------------
// Exemption matching
// ---------------------------------------------------------------------------

/// An exemption rule used to decide if a job is budget-exempt.
#[derive(Debug, Clone)]
pub struct ExemptionRule {
    /// Matching job type (e.g. "regression_test", "draft_resolution").
    pub job_type: String,
    /// Optional resolution tier filter (e.g. "draft").
    pub resolution_tier: Option<String>,
    /// Human-readable exemption reason.
    pub name: String,
}

/// Check whether a job is exempt from budget tracking.
///
/// Returns `Some(reason)` if an exemption applies, `None` otherwise.
pub fn is_exempt(
    job_type: &str,
    resolution_tier: Option<&str>,
    exemptions: &[ExemptionRule],
) -> Option<String> {
    for rule in exemptions {
        if rule.job_type != job_type {
            continue;
        }
        // If rule has a resolution_tier filter, the job must match it.
        if let Some(ref required_tier) = rule.resolution_tier {
            if resolution_tier != Some(required_tier.as_str()) {
                continue;
            }
        }
        return Some(rule.name.clone());
    }
    None
}

// ---------------------------------------------------------------------------
// Trend projection
// ---------------------------------------------------------------------------

/// Projected budget consumption trend.
#[derive(Debug, Clone, Serialize)]
pub struct TrendProjection {
    /// Estimated days until budget is exhausted (None if not computable).
    pub days_until_exhaustion: Option<f64>,
    /// Daily average GPU hours consumed.
    pub daily_avg: f64,
    /// Trend direction: "increasing", "stable", or "decreasing".
    pub trend_direction: &'static str,
}

/// Compute a budget trend projection from daily consumption data.
///
/// `daily_consumption` should be ordered oldest-first; each entry is the total
/// GPU hours consumed on that day.
pub fn compute_trend_projection(daily_consumption: &[f64]) -> TrendProjection {
    let daily_avg = compute_daily_avg(daily_consumption);
    let trend_direction = determine_consumption_trend(daily_consumption);

    let days_until_exhaustion = None; // Needs remaining budget to compute
    TrendProjection {
        days_until_exhaustion,
        daily_avg,
        trend_direction,
    }
}

/// Compute a budget trend projection with remaining budget information.
///
/// `daily_consumption` should be ordered oldest-first.
pub fn compute_trend_projection_with_budget(
    daily_consumption: &[f64],
    remaining_gpu_hours: f64,
) -> TrendProjection {
    let daily_avg = compute_daily_avg(daily_consumption);
    let trend_direction = determine_consumption_trend(daily_consumption);

    let days_until_exhaustion = if daily_avg > 0.0 && remaining_gpu_hours > 0.0 {
        Some(remaining_gpu_hours / daily_avg)
    } else {
        None
    };

    TrendProjection {
        days_until_exhaustion,
        daily_avg,
        trend_direction,
    }
}

/// Compute the average daily consumption from an array of daily totals.
pub fn compute_daily_avg(consumption_entries: &[f64]) -> f64 {
    if consumption_entries.is_empty() {
        return 0.0;
    }
    let sum: f64 = consumption_entries.iter().sum();
    sum / consumption_entries.len() as f64
}

/// Determine the consumption trend direction via simple linear regression.
///
/// Returns `"increasing"`, `"stable"`, or `"decreasing"`.
pub fn determine_consumption_trend(daily_consumption: &[f64]) -> &'static str {
    if daily_consumption.len() < 2 {
        return "stable";
    }

    let n = daily_consumption.len() as f64;

    // x values: 0, 1, 2, ...
    let x_mean = (n - 1.0) / 2.0;
    let y_mean: f64 = daily_consumption.iter().sum::<f64>() / n;

    let mut numerator = 0.0;
    let mut denominator = 0.0;

    for (i, &y) in daily_consumption.iter().enumerate() {
        let x = i as f64;
        numerator += (x - x_mean) * (y - y_mean);
        denominator += (x - x_mean) * (x - x_mean);
    }

    if denominator.abs() < f64::EPSILON {
        return "stable";
    }

    let slope = numerator / denominator;

    // Use a threshold relative to the mean to determine significance.
    // A slope is significant if it is > 5% of the daily average per day.
    let threshold = y_mean.abs() * 0.05;

    if slope > threshold {
        "increasing"
    } else if slope < -threshold {
        "decreasing"
    } else {
        "stable"
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- check_budget: Allowed -----------------------------------------------

    #[test]
    fn check_budget_allowed_below_warning() {
        let result = check_budget(100.0, 50.0, 5.0, 75, 90, true);
        assert_eq!(result, BudgetCheckResult::Allowed);
    }

    #[test]
    fn check_budget_allowed_zero_consumed() {
        let result = check_budget(100.0, 0.0, 1.0, 75, 90, true);
        assert_eq!(result, BudgetCheckResult::Allowed);
    }

    #[test]
    fn check_budget_allowed_just_below_warning() {
        // 74% after submission -> just below 75% warning
        let result = check_budget(100.0, 70.0, 4.0, 75, 90, true);
        assert_eq!(result, BudgetCheckResult::Allowed);
    }

    // -- check_budget: Warning -----------------------------------------------

    #[test]
    fn check_budget_warning_at_threshold() {
        // 75% exactly
        let result = check_budget(100.0, 70.0, 5.0, 75, 90, true);
        match result {
            BudgetCheckResult::Warning { consumed_pct, .. } => {
                assert!((consumed_pct - 75.0).abs() < f64::EPSILON);
            }
            other => panic!("Expected Warning, got {other:?}"),
        }
    }

    #[test]
    fn check_budget_warning_between_thresholds() {
        // 80% -> above 75%, below 90%
        let result = check_budget(100.0, 70.0, 10.0, 75, 90, true);
        match result {
            BudgetCheckResult::Warning { consumed_pct, .. } => {
                assert!((consumed_pct - 80.0).abs() < f64::EPSILON);
            }
            other => panic!("Expected Warning, got {other:?}"),
        }
    }

    #[test]
    fn check_budget_critical_warning() {
        // 95% -> above 90% critical
        let result = check_budget(100.0, 90.0, 5.0, 75, 90, true);
        match result {
            BudgetCheckResult::Warning {
                consumed_pct,
                message,
            } => {
                assert!((consumed_pct - 95.0).abs() < f64::EPSILON);
                assert!(message.contains("Critical"));
            }
            other => panic!("Expected Warning (critical), got {other:?}"),
        }
    }

    // -- check_budget: Blocked -----------------------------------------------

    #[test]
    fn check_budget_blocked_exceeds_budget() {
        let result = check_budget(100.0, 95.0, 10.0, 75, 90, true);
        match result {
            BudgetCheckResult::Blocked { consumed_pct, .. } => {
                assert!(consumed_pct > 100.0);
            }
            other => panic!("Expected Blocked, got {other:?}"),
        }
    }

    #[test]
    fn check_budget_blocked_exactly_at_limit() {
        // 100.01 hours on a 100h budget -> blocked
        let result = check_budget(100.0, 99.0, 1.01, 75, 90, true);
        match result {
            BudgetCheckResult::Blocked { .. } => {}
            other => panic!("Expected Blocked, got {other:?}"),
        }
    }

    #[test]
    fn check_budget_not_blocked_when_hard_limit_disabled() {
        // Would exceed budget, but hard limit is off -> warning instead
        let result = check_budget(100.0, 95.0, 10.0, 75, 90, false);
        match result {
            BudgetCheckResult::Warning { consumed_pct, .. } => {
                assert!(consumed_pct > 100.0);
            }
            other => panic!("Expected Warning (hard limit disabled), got {other:?}"),
        }
    }

    // -- check_budget: NoBudget ----------------------------------------------

    #[test]
    fn check_budget_no_budget_zero() {
        let result = check_budget(0.0, 0.0, 5.0, 75, 90, true);
        assert_eq!(result, BudgetCheckResult::NoBudget);
    }

    #[test]
    fn check_budget_no_budget_negative() {
        let result = check_budget(-1.0, 0.0, 5.0, 75, 90, true);
        assert_eq!(result, BudgetCheckResult::NoBudget);
    }

    // -- is_exempt -----------------------------------------------------------

    #[test]
    fn exempt_matching_job_type() {
        let rules = vec![ExemptionRule {
            job_type: "regression_test".to_string(),
            resolution_tier: None,
            name: "Regression tests exempt".to_string(),
        }];
        let result = is_exempt("regression_test", None, &rules);
        assert_eq!(result, Some("Regression tests exempt".to_string()));
    }

    #[test]
    fn exempt_no_match() {
        let rules = vec![ExemptionRule {
            job_type: "regression_test".to_string(),
            resolution_tier: None,
            name: "Regression tests exempt".to_string(),
        }];
        let result = is_exempt("standard", None, &rules);
        assert_eq!(result, None);
    }

    #[test]
    fn exempt_with_resolution_tier_match() {
        let rules = vec![ExemptionRule {
            job_type: "generation".to_string(),
            resolution_tier: Some("draft".to_string()),
            name: "Draft resolution exempt".to_string(),
        }];
        let result = is_exempt("generation", Some("draft"), &rules);
        assert_eq!(result, Some("Draft resolution exempt".to_string()));
    }

    #[test]
    fn exempt_with_resolution_tier_mismatch() {
        let rules = vec![ExemptionRule {
            job_type: "generation".to_string(),
            resolution_tier: Some("draft".to_string()),
            name: "Draft resolution exempt".to_string(),
        }];
        let result = is_exempt("generation", Some("full"), &rules);
        assert_eq!(result, None);
    }

    #[test]
    fn exempt_with_resolution_tier_none_vs_required() {
        let rules = vec![ExemptionRule {
            job_type: "generation".to_string(),
            resolution_tier: Some("draft".to_string()),
            name: "Draft resolution exempt".to_string(),
        }];
        let result = is_exempt("generation", None, &rules);
        assert_eq!(result, None);
    }

    #[test]
    fn exempt_empty_rules() {
        let result = is_exempt("regression_test", None, &[]);
        assert_eq!(result, None);
    }

    #[test]
    fn exempt_first_matching_rule_wins() {
        let rules = vec![
            ExemptionRule {
                job_type: "regression_test".to_string(),
                resolution_tier: None,
                name: "First rule".to_string(),
            },
            ExemptionRule {
                job_type: "regression_test".to_string(),
                resolution_tier: None,
                name: "Second rule".to_string(),
            },
        ];
        let result = is_exempt("regression_test", None, &rules);
        assert_eq!(result, Some("First rule".to_string()));
    }

    // -- compute_daily_avg ---------------------------------------------------

    #[test]
    fn daily_avg_empty() {
        assert!((compute_daily_avg(&[]) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn daily_avg_single() {
        assert!((compute_daily_avg(&[10.0]) - 10.0).abs() < f64::EPSILON);
    }

    #[test]
    fn daily_avg_multiple() {
        assert!((compute_daily_avg(&[10.0, 20.0, 30.0]) - 20.0).abs() < f64::EPSILON);
    }

    #[test]
    fn daily_avg_all_zeros() {
        assert!((compute_daily_avg(&[0.0, 0.0, 0.0]) - 0.0).abs() < f64::EPSILON);
    }

    // -- determine_consumption_trend -----------------------------------------

    #[test]
    fn trend_empty_stable() {
        assert_eq!(determine_consumption_trend(&[]), "stable");
    }

    #[test]
    fn trend_single_stable() {
        assert_eq!(determine_consumption_trend(&[10.0]), "stable");
    }

    #[test]
    fn trend_constant_stable() {
        assert_eq!(determine_consumption_trend(&[10.0, 10.0, 10.0]), "stable");
    }

    #[test]
    fn trend_increasing() {
        assert_eq!(
            determine_consumption_trend(&[1.0, 3.0, 5.0, 7.0, 9.0]),
            "increasing"
        );
    }

    #[test]
    fn trend_decreasing() {
        assert_eq!(
            determine_consumption_trend(&[9.0, 7.0, 5.0, 3.0, 1.0]),
            "decreasing"
        );
    }

    #[test]
    fn trend_slightly_increasing_is_stable() {
        // Very small increase relative to the mean should be "stable"
        assert_eq!(
            determine_consumption_trend(&[100.0, 100.1, 100.2]),
            "stable"
        );
    }

    // -- compute_trend_projection --------------------------------------------

    #[test]
    fn trend_projection_empty() {
        let proj = compute_trend_projection(&[]);
        assert!((proj.daily_avg - 0.0).abs() < f64::EPSILON);
        assert_eq!(proj.trend_direction, "stable");
        assert!(proj.days_until_exhaustion.is_none());
    }

    #[test]
    fn trend_projection_with_data() {
        let proj = compute_trend_projection(&[10.0, 10.0, 10.0]);
        assert!((proj.daily_avg - 10.0).abs() < f64::EPSILON);
        assert_eq!(proj.trend_direction, "stable");
    }

    // -- compute_trend_projection_with_budget --------------------------------

    #[test]
    fn trend_projection_with_budget_remaining() {
        let proj = compute_trend_projection_with_budget(&[10.0, 10.0, 10.0], 50.0);
        assert!((proj.daily_avg - 10.0).abs() < f64::EPSILON);
        assert_eq!(proj.trend_direction, "stable");
        let days = proj.days_until_exhaustion.expect("Should have projection");
        assert!((days - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn trend_projection_with_zero_remaining() {
        let proj = compute_trend_projection_with_budget(&[10.0, 10.0], 0.0);
        assert!(proj.days_until_exhaustion.is_none());
    }

    #[test]
    fn trend_projection_with_zero_avg() {
        let proj = compute_trend_projection_with_budget(&[0.0, 0.0], 50.0);
        assert!(proj.days_until_exhaustion.is_none());
    }
}
