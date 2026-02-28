//! System Health Page constants, validators, and utilities (PRD-80).
//!
//! Provides health status and service name constants, input validators,
//! uptime percentage calculations, startup checklist types, and status
//! severity helpers.

use serde::Serialize;

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Health status constants
// ---------------------------------------------------------------------------

/// Service is operating normally.
pub const STATUS_HEALTHY: &str = "healthy";
/// Service is experiencing issues but still partially functional.
pub const STATUS_DEGRADED: &str = "degraded";
/// Service is completely unavailable.
pub const STATUS_DOWN: &str = "down";

/// All valid health status values.
pub const VALID_HEALTH_STATUSES: &[&str] = &[STATUS_HEALTHY, STATUS_DEGRADED, STATUS_DOWN];

// ---------------------------------------------------------------------------
// Known service names
// ---------------------------------------------------------------------------

/// PostgreSQL database.
pub const SERVICE_DATABASE: &str = "database";
/// ComfyUI generation backend.
pub const SERVICE_COMFYUI: &str = "comfyui";
/// Background job workers.
pub const SERVICE_WORKERS: &str = "workers";
/// Filesystem / storage layer.
pub const SERVICE_FILESYSTEM: &str = "filesystem";
/// Internal event bus.
pub const SERVICE_EVENT_BUS: &str = "event_bus";
/// This backend API server.
pub const SERVICE_BACKEND: &str = "backend";

/// All known service names.
pub const ALL_SERVICES: &[&str] = &[
    SERVICE_DATABASE,
    SERVICE_COMFYUI,
    SERVICE_WORKERS,
    SERVICE_FILESYSTEM,
    SERVICE_EVENT_BUS,
    SERVICE_BACKEND,
];

// ---------------------------------------------------------------------------
// Default configuration values
// ---------------------------------------------------------------------------

/// Default interval between health checks, in seconds.
pub const DEFAULT_CHECK_INTERVAL_SECONDS: i32 = 30;

/// Default escalation delay before alerting, in seconds.
pub const DEFAULT_ESCALATION_DELAY_SECONDS: i32 = 300;

/// Degraded uptime weight: degraded counts as this fraction of healthy time.
pub const DEGRADED_UPTIME_WEIGHT: f64 = 0.5;

/// Minimum allowed escalation delay in seconds.
const MIN_ESCALATION_DELAY: i32 = 30;

/// Maximum allowed escalation delay in seconds (24 hours).
const MAX_ESCALATION_DELAY: i32 = 86_400;

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/// Validate that a health status string is one of the known statuses.
pub fn validate_health_status(status: &str) -> Result<(), CoreError> {
    if VALID_HEALTH_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown health status: '{status}'. Valid statuses: {}",
            VALID_HEALTH_STATUSES.join(", ")
        )))
    }
}

/// Validate that a service name is one of the known services.
pub fn validate_service_name(name: &str) -> Result<(), CoreError> {
    if ALL_SERVICES.contains(&name) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown service name: '{name}'. Valid services: {}",
            ALL_SERVICES.join(", ")
        )))
    }
}

/// Validate that an escalation delay is within the allowed range (30..=86400).
pub fn validate_escalation_delay(seconds: i32) -> Result<(), CoreError> {
    if (MIN_ESCALATION_DELAY..=MAX_ESCALATION_DELAY).contains(&seconds) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Escalation delay must be between {MIN_ESCALATION_DELAY} and \
             {MAX_ESCALATION_DELAY} seconds, got {seconds}"
        )))
    }
}

// ---------------------------------------------------------------------------
// Uptime calculations
// ---------------------------------------------------------------------------

/// Compute the uptime percentage given durations in each status.
///
/// Degraded time is weighted by [`DEGRADED_UPTIME_WEIGHT`] (0.5 by default),
/// meaning 1 second of degraded counts as half a second of healthy.
///
/// Returns 100.0 when `total_seconds` is zero (no data = assumed healthy).
pub fn compute_uptime_percent(
    healthy_seconds: i64,
    degraded_seconds: i64,
    total_seconds: i64,
) -> f64 {
    if total_seconds == 0 {
        return 100.0;
    }
    let weighted = healthy_seconds as f64 + (degraded_seconds as f64 * DEGRADED_UPTIME_WEIGHT);
    (weighted / total_seconds as f64) * 100.0
}

// ---------------------------------------------------------------------------
// Startup checklist
// ---------------------------------------------------------------------------

/// Result of a single startup prerequisite check.
#[derive(Debug, Clone, Serialize)]
pub struct StartupCheck {
    /// Human-readable name of the check (e.g. "Database connectivity").
    pub name: String,
    /// Whether the check passed.
    pub passed: bool,
    /// Error message when the check failed.
    pub error: Option<String>,
    /// Whether this check must pass for the system to be considered ready.
    pub required: bool,
}

/// Aggregated result of all startup checks.
#[derive(Debug, Clone, Serialize)]
pub struct StartupCheckResult {
    /// Whether all *required* checks passed.
    pub all_passed: bool,
    /// Individual check results.
    pub checks: Vec<StartupCheck>,
}

impl StartupCheckResult {
    /// Build a result from a list of individual checks.
    ///
    /// `all_passed` is true only when every required check has `passed == true`.
    pub fn from_checks(checks: Vec<StartupCheck>) -> Self {
        let all_passed = checks.iter().filter(|c| c.required).all(|c| c.passed);
        Self { all_passed, checks }
    }
}

// ---------------------------------------------------------------------------
// Status severity helpers
// ---------------------------------------------------------------------------

/// Return a numeric severity for a health status.
///
/// Higher values indicate worse status. Returns `-1` for unknown strings.
pub fn status_severity(status: &str) -> i32 {
    match status {
        STATUS_HEALTHY => 0,
        STATUS_DEGRADED => 1,
        STATUS_DOWN => 2,
        _ => -1,
    }
}

/// Given a slice of status strings, return the worst (most severe) status.
///
/// Returns [`STATUS_HEALTHY`] when the slice is empty.
pub fn worst_status<'a>(statuses: &[&'a str]) -> &'a str {
    statuses
        .iter()
        .max_by_key(|s| status_severity(s))
        .copied()
        .unwrap_or(STATUS_HEALTHY)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_health_status -----------------------------------------------

    #[test]
    fn valid_health_statuses_accepted() {
        assert!(validate_health_status("healthy").is_ok());
        assert!(validate_health_status("degraded").is_ok());
        assert!(validate_health_status("down").is_ok());
    }

    #[test]
    fn invalid_health_status_rejected() {
        assert!(validate_health_status("unknown").is_err());
        assert!(validate_health_status("").is_err());
        assert!(validate_health_status("HEALTHY").is_err());
    }

    // -- validate_service_name ------------------------------------------------

    #[test]
    fn valid_service_names_accepted() {
        for name in ALL_SERVICES {
            assert!(
                validate_service_name(name).is_ok(),
                "should accept '{name}'"
            );
        }
    }

    #[test]
    fn invalid_service_name_rejected() {
        assert!(validate_service_name("redis").is_err());
        assert!(validate_service_name("").is_err());
        assert!(validate_service_name("DATABASE").is_err());
    }

    // -- validate_escalation_delay --------------------------------------------

    #[test]
    fn escalation_delay_at_boundaries() {
        assert!(validate_escalation_delay(30).is_ok());
        assert!(validate_escalation_delay(86_400).is_ok());
    }

    #[test]
    fn escalation_delay_within_range() {
        assert!(validate_escalation_delay(300).is_ok());
        assert!(validate_escalation_delay(3_600).is_ok());
    }

    #[test]
    fn escalation_delay_below_minimum_rejected() {
        assert!(validate_escalation_delay(29).is_err());
        assert!(validate_escalation_delay(0).is_err());
        assert!(validate_escalation_delay(-1).is_err());
    }

    #[test]
    fn escalation_delay_above_maximum_rejected() {
        assert!(validate_escalation_delay(86_401).is_err());
        assert!(validate_escalation_delay(100_000).is_err());
    }

    // -- compute_uptime_percent -----------------------------------------------

    #[test]
    fn uptime_zero_total_returns_100() {
        assert!((compute_uptime_percent(0, 0, 0) - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn uptime_all_healthy() {
        let pct = compute_uptime_percent(3600, 0, 3600);
        assert!((pct - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn uptime_all_degraded() {
        // 3600 degraded out of 3600 total => 50% (weighted by 0.5)
        let pct = compute_uptime_percent(0, 3600, 3600);
        assert!((pct - 50.0).abs() < f64::EPSILON);
    }

    #[test]
    fn uptime_all_down() {
        let pct = compute_uptime_percent(0, 0, 3600);
        assert!((pct - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn uptime_mixed() {
        // 1800 healthy + 1800 degraded out of 3600
        // weighted = 1800 + (1800 * 0.5) = 2700
        // pct = 2700 / 3600 * 100 = 75.0
        let pct = compute_uptime_percent(1800, 1800, 3600);
        assert!((pct - 75.0).abs() < f64::EPSILON);
    }

    // -- StartupCheck and StartupCheckResult ----------------------------------

    #[test]
    fn startup_all_required_passed() {
        let checks = vec![
            StartupCheck {
                name: "DB".into(),
                passed: true,
                error: None,
                required: true,
            },
            StartupCheck {
                name: "Workers".into(),
                passed: true,
                error: None,
                required: true,
            },
        ];
        let result = StartupCheckResult::from_checks(checks);
        assert!(result.all_passed);
        assert_eq!(result.checks.len(), 2);
    }

    #[test]
    fn startup_required_failed() {
        let checks = vec![
            StartupCheck {
                name: "DB".into(),
                passed: false,
                error: Some("Connection refused".into()),
                required: true,
            },
            StartupCheck {
                name: "Workers".into(),
                passed: true,
                error: None,
                required: true,
            },
        ];
        let result = StartupCheckResult::from_checks(checks);
        assert!(!result.all_passed);
    }

    #[test]
    fn startup_optional_failure_still_passes() {
        let checks = vec![
            StartupCheck {
                name: "DB".into(),
                passed: true,
                error: None,
                required: true,
            },
            StartupCheck {
                name: "ComfyUI".into(),
                passed: false,
                error: Some("Not running".into()),
                required: false,
            },
        ];
        let result = StartupCheckResult::from_checks(checks);
        assert!(result.all_passed);
    }

    #[test]
    fn startup_empty_checks_passes() {
        let result = StartupCheckResult::from_checks(vec![]);
        assert!(result.all_passed);
        assert!(result.checks.is_empty());
    }

    // -- status_severity ------------------------------------------------------

    #[test]
    fn severity_ordering() {
        assert!(status_severity("healthy") < status_severity("degraded"));
        assert!(status_severity("degraded") < status_severity("down"));
    }

    #[test]
    fn severity_unknown_returns_negative() {
        assert_eq!(status_severity("unknown"), -1);
        assert_eq!(status_severity(""), -1);
    }

    // -- worst_status ---------------------------------------------------------

    #[test]
    fn worst_status_empty_returns_healthy() {
        // worst_status returns STATUS_HEALTHY for empty -- but it's &'static str
        // so we compare by value.
        let result = worst_status(&[]);
        assert_eq!(result, STATUS_HEALTHY);
    }

    #[test]
    fn worst_status_all_healthy() {
        let result = worst_status(&["healthy", "healthy"]);
        assert_eq!(result, "healthy");
    }

    #[test]
    fn worst_status_mixed() {
        let result = worst_status(&["healthy", "degraded", "healthy"]);
        assert_eq!(result, "degraded");
    }

    #[test]
    fn worst_status_with_down() {
        let result = worst_status(&["healthy", "degraded", "down"]);
        assert_eq!(result, "down");
    }

    #[test]
    fn worst_status_single() {
        assert_eq!(worst_status(&["degraded"]), "degraded");
    }

    // -- Constants ------------------------------------------------------------

    #[test]
    fn all_services_count() {
        assert_eq!(ALL_SERVICES.len(), 6);
    }

    #[test]
    fn default_check_interval() {
        assert_eq!(DEFAULT_CHECK_INTERVAL_SECONDS, 30);
    }

    #[test]
    fn default_escalation_delay() {
        assert_eq!(DEFAULT_ESCALATION_DELAY_SECONDS, 300);
    }

    #[test]
    fn degraded_uptime_weight_is_half() {
        assert!((DEGRADED_UPTIME_WEIGHT - 0.5).abs() < f64::EPSILON);
    }
}
