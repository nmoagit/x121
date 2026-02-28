//! Session management domain logic (PRD-98).
//!
//! Pure functions for session status validation, idle/terminate detection,
//! role-based session limits, duration computation, and suspicious login detection.

use chrono::{DateTime, Utc};

use crate::error::CoreError;
use crate::roles::{ROLE_ADMIN, ROLE_CREATOR, ROLE_REVIEWER};

// ---------------------------------------------------------------------------
// Session status constants
// ---------------------------------------------------------------------------

/// Active session status.
pub const SESSION_ACTIVE: &str = "active";
/// Idle session status (no activity within idle timeout).
pub const SESSION_IDLE: &str = "idle";
/// Terminated session status.
pub const SESSION_TERMINATED: &str = "terminated";
/// All valid session statuses.
pub const VALID_SESSION_STATUSES: &[&str] = &[SESSION_ACTIVE, SESSION_IDLE, SESSION_TERMINATED];

// ---------------------------------------------------------------------------
// Config key constants
// ---------------------------------------------------------------------------

/// Config key: minutes before a session is marked idle.
pub const CONFIG_IDLE_TIMEOUT: &str = "idle_timeout_minutes";
/// Config key: minutes before an idle session is auto-terminated.
pub const CONFIG_TERMINATE_TIMEOUT: &str = "terminate_timeout_minutes";
/// Config key: max concurrent sessions for admin role.
pub const CONFIG_MAX_SESSIONS_ADMIN: &str = "max_sessions_admin";
/// Config key: max concurrent sessions for creator role.
pub const CONFIG_MAX_SESSIONS_CREATOR: &str = "max_sessions_creator";
/// Config key: max concurrent sessions for reviewer role.
pub const CONFIG_MAX_SESSIONS_REVIEWER: &str = "max_sessions_reviewer";

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SESSIONS_ADMIN: i32 = 3;
const DEFAULT_MAX_SESSIONS_CREATOR: i32 = 2;
const DEFAULT_MAX_SESSIONS_REVIEWER: i32 = 1;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a session status string is one of the allowed values.
pub fn validate_session_status(status: &str) -> Result<(), CoreError> {
    if VALID_SESSION_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid session status '{status}'. Must be one of: {}",
            VALID_SESSION_STATUSES.join(", ")
        )))
    }
}

// ---------------------------------------------------------------------------
// Idle / terminate detection
// ---------------------------------------------------------------------------

/// Returns `true` if the session should be considered idle based on the
/// last activity time and the configured idle timeout.
pub fn is_session_idle(last_activity: DateTime<Utc>, idle_timeout_minutes: i64) -> bool {
    let elapsed = Utc::now() - last_activity;
    elapsed.num_minutes() >= idle_timeout_minutes
}

/// Returns `true` if the session should be auto-terminated based on the
/// last activity time and the configured terminate timeout.
pub fn should_terminate(last_activity: DateTime<Utc>, terminate_timeout_minutes: i64) -> bool {
    let elapsed = Utc::now() - last_activity;
    elapsed.num_minutes() >= terminate_timeout_minutes
}

// ---------------------------------------------------------------------------
// Role-based session limits
// ---------------------------------------------------------------------------

/// Return the maximum concurrent session count for a given role.
///
/// Defaults: admin=3, creator=2, reviewer=1, unknown=1.
pub fn max_sessions_for_role(role: &str) -> i32 {
    match role {
        ROLE_ADMIN => DEFAULT_MAX_SESSIONS_ADMIN,
        ROLE_CREATOR => DEFAULT_MAX_SESSIONS_CREATOR,
        ROLE_REVIEWER => DEFAULT_MAX_SESSIONS_REVIEWER,
        _ => DEFAULT_MAX_SESSIONS_REVIEWER, // strictest default
    }
}

// ---------------------------------------------------------------------------
// Duration computation
// ---------------------------------------------------------------------------

/// Compute the duration of a session in seconds.
///
/// If `ended_at` is `None`, uses the current time as the end point.
pub fn compute_session_duration_seconds(
    started_at: DateTime<Utc>,
    ended_at: Option<DateTime<Utc>>,
) -> f64 {
    let end = ended_at.unwrap_or_else(Utc::now);
    let duration = end - started_at;
    duration.num_milliseconds() as f64 / 1000.0
}

/// Compute the average session duration from a slice of durations in seconds.
///
/// Returns `0.0` if the slice is empty.
pub fn compute_avg_session_duration(durations: &[f64]) -> f64 {
    if durations.is_empty() {
        return 0.0;
    }
    let sum: f64 = durations.iter().sum();
    sum / durations.len() as f64
}

// ---------------------------------------------------------------------------
// Suspicious login detection
// ---------------------------------------------------------------------------

/// Returns `true` if the number of recent login failures exceeds the threshold.
pub fn detect_suspicious_login(recent_failures: i32, threshold: i32) -> bool {
    recent_failures >= threshold
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/// Aggregated session analytics for the admin dashboard.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionAnalytics {
    /// Total number of sessions (all statuses).
    pub total_sessions: i64,
    /// Currently active sessions.
    pub active_sessions: i64,
    /// Currently idle sessions.
    pub idle_sessions: i64,
    /// Average session duration in seconds.
    pub avg_duration_seconds: f64,
    /// Peak number of concurrent sessions.
    pub peak_concurrent: i64,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    // -- validate_session_status --

    #[test]
    fn test_validate_active_status() {
        assert!(validate_session_status("active").is_ok());
    }

    #[test]
    fn test_validate_idle_status() {
        assert!(validate_session_status("idle").is_ok());
    }

    #[test]
    fn test_validate_terminated_status() {
        assert!(validate_session_status("terminated").is_ok());
    }

    #[test]
    fn test_validate_invalid_status() {
        let result = validate_session_status("unknown");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Invalid session status"));
        assert!(msg.contains("unknown"));
    }

    #[test]
    fn test_validate_empty_status() {
        assert!(validate_session_status("").is_err());
    }

    // -- is_session_idle --

    #[test]
    fn test_session_is_idle_when_exceeded() {
        let last_activity = Utc::now() - Duration::minutes(20);
        assert!(is_session_idle(last_activity, 15));
    }

    #[test]
    fn test_session_not_idle_when_recent() {
        let last_activity = Utc::now() - Duration::minutes(5);
        assert!(!is_session_idle(last_activity, 15));
    }

    #[test]
    fn test_session_idle_at_exact_boundary() {
        let last_activity = Utc::now() - Duration::minutes(15);
        assert!(is_session_idle(last_activity, 15));
    }

    #[test]
    fn test_session_not_idle_zero_timeout() {
        // Zero timeout: any activity in the past is idle.
        let last_activity = Utc::now() - Duration::seconds(1);
        assert!(is_session_idle(last_activity, 0));
    }

    // -- should_terminate --

    #[test]
    fn test_should_terminate_when_exceeded() {
        let last_activity = Utc::now() - Duration::minutes(130);
        assert!(should_terminate(last_activity, 120));
    }

    #[test]
    fn test_should_not_terminate_when_recent() {
        let last_activity = Utc::now() - Duration::minutes(60);
        assert!(!should_terminate(last_activity, 120));
    }

    #[test]
    fn test_should_terminate_at_boundary() {
        let last_activity = Utc::now() - Duration::minutes(120);
        assert!(should_terminate(last_activity, 120));
    }

    // -- max_sessions_for_role --

    #[test]
    fn test_max_sessions_admin() {
        assert_eq!(max_sessions_for_role("admin"), 3);
    }

    #[test]
    fn test_max_sessions_creator() {
        assert_eq!(max_sessions_for_role("creator"), 2);
    }

    #[test]
    fn test_max_sessions_reviewer() {
        assert_eq!(max_sessions_for_role("reviewer"), 1);
    }

    #[test]
    fn test_max_sessions_unknown_role() {
        assert_eq!(max_sessions_for_role("guest"), 1);
    }

    // -- compute_session_duration_seconds --

    #[test]
    fn test_duration_with_ended_at() {
        let started = Utc::now() - Duration::seconds(3600);
        let ended = Some(Utc::now());
        let duration = compute_session_duration_seconds(started, ended);
        // Should be approximately 3600 seconds (allow 1s tolerance).
        assert!((duration - 3600.0).abs() < 1.0);
    }

    #[test]
    fn test_duration_without_ended_at() {
        let started = Utc::now() - Duration::seconds(60);
        let duration = compute_session_duration_seconds(started, None);
        assert!((duration - 60.0).abs() < 1.0);
    }

    #[test]
    fn test_duration_zero() {
        let now = Utc::now();
        let duration = compute_session_duration_seconds(now, Some(now));
        assert!((duration).abs() < 0.001);
    }

    // -- compute_avg_session_duration --

    #[test]
    fn test_avg_duration_normal() {
        let durations = vec![100.0, 200.0, 300.0];
        assert!((compute_avg_session_duration(&durations) - 200.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_avg_duration_empty() {
        let durations: Vec<f64> = vec![];
        assert!((compute_avg_session_duration(&durations)).abs() < f64::EPSILON);
    }

    #[test]
    fn test_avg_duration_single() {
        let durations = vec![42.0];
        assert!((compute_avg_session_duration(&durations) - 42.0).abs() < f64::EPSILON);
    }

    // -- detect_suspicious_login --

    #[test]
    fn test_suspicious_when_at_threshold() {
        assert!(detect_suspicious_login(5, 5));
    }

    #[test]
    fn test_suspicious_when_above_threshold() {
        assert!(detect_suspicious_login(10, 5));
    }

    #[test]
    fn test_not_suspicious_when_below_threshold() {
        assert!(!detect_suspicious_login(3, 5));
    }

    #[test]
    fn test_not_suspicious_zero_failures() {
        assert!(!detect_suspicious_login(0, 5));
    }

    // -- constants --

    #[test]
    fn test_status_constants_match_valid_list() {
        assert!(VALID_SESSION_STATUSES.contains(&SESSION_ACTIVE));
        assert!(VALID_SESSION_STATUSES.contains(&SESSION_IDLE));
        assert!(VALID_SESSION_STATUSES.contains(&SESSION_TERMINATED));
        assert_eq!(VALID_SESSION_STATUSES.len(), 3);
    }

    #[test]
    fn test_config_key_constants() {
        assert_eq!(CONFIG_IDLE_TIMEOUT, "idle_timeout_minutes");
        assert_eq!(CONFIG_TERMINATE_TIMEOUT, "terminate_timeout_minutes");
        assert_eq!(CONFIG_MAX_SESSIONS_ADMIN, "max_sessions_admin");
        assert_eq!(CONFIG_MAX_SESSIONS_CREATOR, "max_sessions_creator");
        assert_eq!(CONFIG_MAX_SESSIONS_REVIEWER, "max_sessions_reviewer");
    }

    // -- SessionAnalytics --

    #[test]
    fn test_session_analytics_serialization() {
        let analytics = SessionAnalytics {
            total_sessions: 100,
            active_sessions: 25,
            idle_sessions: 10,
            avg_duration_seconds: 1800.5,
            peak_concurrent: 30,
        };
        let json = serde_json::to_value(&analytics).expect("serialize");
        assert_eq!(json["total_sessions"], 100);
        assert_eq!(json["active_sessions"], 25);
        assert_eq!(json["idle_sessions"], 10);
        assert_eq!(json["peak_concurrent"], 30);
    }
}
