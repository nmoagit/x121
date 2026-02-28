//! Pure business logic for Backup & Disaster Recovery (PRD-81).
//!
//! Contains enums, structs, and validation/computation functions with no
//! database dependencies. All datetime operations use `chrono::DateTime<Utc>`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Type of backup operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupType {
    Full,
    Incremental,
    Config,
    Wal,
}

impl BackupType {
    /// Convert to the database TEXT representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Incremental => "incremental",
            Self::Config => "config",
            Self::Wal => "wal",
        }
    }

    /// Parse from a database TEXT value.
    pub fn parse(s: &str) -> Result<Self, CoreError> {
        match s {
            "full" => Ok(Self::Full),
            "incremental" => Ok(Self::Incremental),
            "config" => Ok(Self::Config),
            "wal" => Ok(Self::Wal),
            other => Err(CoreError::Validation(format!(
                "Invalid backup type: {other}"
            ))),
        }
    }
}

/// Status of a backup operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Verified,
}

impl BackupStatus {
    /// Convert to the database TEXT representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Verified => "verified",
        }
    }

    /// Parse from a database TEXT value.
    pub fn parse(s: &str) -> Result<Self, CoreError> {
        match s {
            "pending" => Ok(Self::Pending),
            "running" => Ok(Self::Running),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            "verified" => Ok(Self::Verified),
            other => Err(CoreError::Validation(format!(
                "Invalid backup status: {other}"
            ))),
        }
    }
}

/// Who or what triggered the backup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggeredBy {
    Schedule,
    Manual,
    System,
}

impl TriggeredBy {
    /// Convert to the database TEXT representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Schedule => "schedule",
            Self::Manual => "manual",
            Self::System => "system",
        }
    }

    /// Parse from a database TEXT value.
    pub fn parse(s: &str) -> Result<Self, CoreError> {
        match s {
            "schedule" => Ok(Self::Schedule),
            "manual" => Ok(Self::Manual),
            "system" => Ok(Self::System),
            other => Err(CoreError::Validation(format!(
                "Invalid triggered_by value: {other}"
            ))),
        }
    }
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/// Retention policy configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionPolicy {
    /// Number of days to retain backups.
    pub retain_days: i32,
    /// Maximum number of backups to keep (0 = unlimited).
    pub max_count: i32,
}

/// Parse a retention policy from a JSON value.
///
/// Expects `{ "retain_days": N, "max_count": N }`. Both fields default to
/// sensible values if missing.
pub fn parse_retention_policy(json: &serde_json::Value) -> Result<RetentionPolicy, CoreError> {
    let retain_days = json
        .get("retain_days")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32)
        .unwrap_or(30);

    let max_count = json
        .get("max_count")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32)
        .unwrap_or(0);

    if retain_days < 1 {
        return Err(CoreError::Validation(
            "retain_days must be at least 1".to_string(),
        ));
    }
    if max_count < 0 {
        return Err(CoreError::Validation(
            "max_count must be non-negative".to_string(),
        ));
    }

    Ok(RetentionPolicy {
        retain_days,
        max_count,
    })
}

/// Check whether a backup has expired based on its completion time and
/// the configured retention period.
pub fn is_backup_expired(completed_at: DateTime<Utc>, retention_days: i32) -> bool {
    let now = Utc::now();
    let age = now.signed_duration_since(completed_at);
    age.num_days() >= retention_days as i64
}

// ---------------------------------------------------------------------------
// Cron validation & scheduling
// ---------------------------------------------------------------------------

/// Number of fields expected in a standard cron expression.
const CRON_FIELD_COUNT_STANDARD: usize = 5;
/// Number of fields in an extended cron expression (with seconds).
const CRON_FIELD_COUNT_EXTENDED: usize = 6;

/// Validate that a cron expression has a valid format.
///
/// Performs lightweight structural validation: checks field count (5 or 6
/// fields) and that each field contains only valid characters
/// (`0-9`, `*`, `/`, `-`, `,`).
pub fn validate_cron_expression(expr: &str) -> Result<(), CoreError> {
    let trimmed = expr.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "Cron expression cannot be empty".to_string(),
        ));
    }

    let fields: Vec<&str> = trimmed.split_whitespace().collect();
    let count = fields.len();
    if count != CRON_FIELD_COUNT_STANDARD && count != CRON_FIELD_COUNT_EXTENDED {
        return Err(CoreError::Validation(format!(
            "Cron expression must have {CRON_FIELD_COUNT_STANDARD} or \
             {CRON_FIELD_COUNT_EXTENDED} fields, got {count}"
        )));
    }

    for (i, field) in fields.iter().enumerate() {
        if !is_valid_cron_field(field) {
            return Err(CoreError::Validation(format!(
                "Invalid cron field at position {}: '{field}'",
                i + 1
            )));
        }
    }

    Ok(())
}

/// Check that a single cron field contains only valid characters.
fn is_valid_cron_field(field: &str) -> bool {
    if field.is_empty() {
        return false;
    }
    field
        .chars()
        .all(|c| c.is_ascii_digit() || matches!(c, '*' | '/' | '-' | ','))
}

/// Compute the next run time for a cron expression relative to a base time.
///
/// This is a simplified computation: it advances `from` by one minute and
/// returns that as the next run. For production scheduling, a full cron
/// parser should be used. This function validates the expression and
/// provides a reasonable placeholder.
pub fn compute_next_run(
    cron_expression: &str,
    from: DateTime<Utc>,
) -> Result<DateTime<Utc>, CoreError> {
    validate_cron_expression(cron_expression)?;

    // Parse the first field to determine the interval in minutes.
    let fields: Vec<&str> = cron_expression.split_whitespace().collect();
    let minute_field = if fields.len() == CRON_FIELD_COUNT_EXTENDED {
        fields[1] // seconds field is [0], minutes is [1]
    } else {
        fields[0] // minutes field
    };

    // If the minute field is a step like "*/N", advance by N minutes.
    // Otherwise advance by 60 minutes as a sensible default.
    let advance_minutes = if let Some(step) = minute_field.strip_prefix("*/") {
        step.parse::<i64>().unwrap_or(60)
    } else if minute_field == "*" {
        1
    } else {
        60
    };

    Ok(from + chrono::Duration::minutes(advance_minutes))
}

// ---------------------------------------------------------------------------
// Size estimation
// ---------------------------------------------------------------------------

/// Estimate backup size in bytes given table count and average row count.
///
/// Uses a rough heuristic: each row is assumed to average ~256 bytes.
const ESTIMATED_BYTES_PER_ROW: i64 = 256;

/// Estimate the total backup size in bytes.
pub fn estimate_backup_size(table_count: i64, avg_row_count: i64) -> i64 {
    table_count
        .saturating_mul(avg_row_count)
        .saturating_mul(ESTIMATED_BYTES_PER_ROW)
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/// Result of a backup verification operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    /// The backup that was verified.
    pub backup_id: i64,
    /// Whether the verification passed.
    pub success: bool,
    /// Time taken to restore (in seconds).
    pub restore_duration_secs: f64,
    /// Number of verification queries that passed.
    pub queries_passed: i32,
    /// Total number of verification queries executed.
    pub queries_total: i32,
    /// Error messages for failed queries.
    pub errors: Vec<String>,
}

/// Produce a human-readable summary of a verification result.
pub fn summarize_verification(result: &VerificationResult) -> String {
    let status = if result.success { "PASSED" } else { "FAILED" };
    let mut summary = format!(
        "Backup #{} verification {status}: {}/{} queries passed in {:.1}s",
        result.backup_id, result.queries_passed, result.queries_total, result.restore_duration_secs,
    );
    if !result.errors.is_empty() {
        summary.push_str(&format!(" ({} errors)", result.errors.len()));
    }
    summary
}

// ---------------------------------------------------------------------------
// Backup health
// ---------------------------------------------------------------------------

/// Aggregate health metrics for the backup subsystem.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupHealth {
    /// Hours since the last full backup completed.
    pub last_full_backup_age_hours: f64,
    /// Hours since the last verified backup.
    pub last_verified_age_hours: f64,
    /// Total size of all stored backups in bytes.
    pub total_backup_size_bytes: i64,
    /// Number of active backup schedules.
    pub schedule_count: i64,
    /// Number of overdue scheduled backups.
    pub overdue_count: i64,
}

/// Warning threshold: no full backup in the last 48 hours.
const FULL_BACKUP_WARNING_HOURS: f64 = 48.0;
/// Critical threshold: no full backup in the last 168 hours (7 days).
const FULL_BACKUP_CRITICAL_HOURS: f64 = 168.0;
/// Warning threshold: no verified backup in the last 168 hours (7 days).
const VERIFIED_WARNING_HOURS: f64 = 168.0;
/// Critical threshold: no verified backup in the last 720 hours (30 days).
const VERIFIED_CRITICAL_HOURS: f64 = 720.0;

/// Compute aggregate backup health metrics.
pub fn compute_backup_health(
    last_full: Option<DateTime<Utc>>,
    last_verified: Option<DateTime<Utc>>,
    total_size: i64,
    schedule_count: i64,
    overdue: i64,
) -> BackupHealth {
    let now = Utc::now();

    let last_full_backup_age_hours = last_full
        .map(|t| now.signed_duration_since(t).num_minutes() as f64 / 60.0)
        .unwrap_or(f64::INFINITY);

    let last_verified_age_hours = last_verified
        .map(|t| now.signed_duration_since(t).num_minutes() as f64 / 60.0)
        .unwrap_or(f64::INFINITY);

    BackupHealth {
        last_full_backup_age_hours,
        last_verified_age_hours,
        total_backup_size_bytes: total_size,
        schedule_count,
        overdue_count: overdue,
    }
}

/// Determine overall backup health status label.
///
/// Returns `"healthy"`, `"warning"`, or `"critical"` based on configurable
/// thresholds for backup age and overdue schedule count.
pub fn backup_health_status(health: &BackupHealth) -> &'static str {
    // Critical conditions.
    if health.last_full_backup_age_hours >= FULL_BACKUP_CRITICAL_HOURS {
        return "critical";
    }
    if health.last_verified_age_hours >= VERIFIED_CRITICAL_HOURS {
        return "critical";
    }
    if health.overdue_count > 2 {
        return "critical";
    }

    // Warning conditions.
    if health.last_full_backup_age_hours >= FULL_BACKUP_WARNING_HOURS {
        return "warning";
    }
    if health.last_verified_age_hours >= VERIFIED_WARNING_HOURS {
        return "warning";
    }
    if health.overdue_count > 0 {
        return "warning";
    }

    "healthy"
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- BackupType ----------------------------------------------------------

    #[test]
    fn backup_type_roundtrip_full() {
        let bt = BackupType::Full;
        assert_eq!(bt.as_str(), "full");
        assert_eq!(BackupType::parse("full").unwrap(), BackupType::Full);
    }

    #[test]
    fn backup_type_roundtrip_incremental() {
        assert_eq!(
            BackupType::parse("incremental").unwrap(),
            BackupType::Incremental
        );
    }

    #[test]
    fn backup_type_roundtrip_config() {
        assert_eq!(BackupType::parse("config").unwrap(), BackupType::Config);
    }

    #[test]
    fn backup_type_roundtrip_wal() {
        assert_eq!(BackupType::parse("wal").unwrap(), BackupType::Wal);
    }

    #[test]
    fn backup_type_invalid_returns_error() {
        assert!(BackupType::parse("snapshot").is_err());
    }

    // -- BackupStatus --------------------------------------------------------

    #[test]
    fn backup_status_roundtrip_all() {
        for (s, expected) in [
            ("pending", BackupStatus::Pending),
            ("running", BackupStatus::Running),
            ("completed", BackupStatus::Completed),
            ("failed", BackupStatus::Failed),
            ("verified", BackupStatus::Verified),
        ] {
            assert_eq!(BackupStatus::parse(s).unwrap(), expected);
            assert_eq!(expected.as_str(), s);
        }
    }

    #[test]
    fn backup_status_invalid_returns_error() {
        assert!(BackupStatus::parse("cancelled").is_err());
    }

    // -- TriggeredBy ---------------------------------------------------------

    #[test]
    fn triggered_by_roundtrip_all() {
        for (s, expected) in [
            ("schedule", TriggeredBy::Schedule),
            ("manual", TriggeredBy::Manual),
            ("system", TriggeredBy::System),
        ] {
            assert_eq!(TriggeredBy::parse(s).unwrap(), expected);
            assert_eq!(expected.as_str(), s);
        }
    }

    #[test]
    fn triggered_by_invalid_returns_error() {
        assert!(TriggeredBy::parse("cron").is_err());
    }

    // -- RetentionPolicy -----------------------------------------------------

    #[test]
    fn parse_retention_defaults() {
        let json = serde_json::json!({});
        let policy = parse_retention_policy(&json).unwrap();
        assert_eq!(policy.retain_days, 30);
        assert_eq!(policy.max_count, 0);
    }

    #[test]
    fn parse_retention_custom_values() {
        let json = serde_json::json!({"retain_days": 90, "max_count": 10});
        let policy = parse_retention_policy(&json).unwrap();
        assert_eq!(policy.retain_days, 90);
        assert_eq!(policy.max_count, 10);
    }

    #[test]
    fn parse_retention_invalid_retain_days() {
        let json = serde_json::json!({"retain_days": 0});
        assert!(parse_retention_policy(&json).is_err());
    }

    #[test]
    fn parse_retention_negative_max_count() {
        let json = serde_json::json!({"max_count": -1});
        assert!(parse_retention_policy(&json).is_err());
    }

    // -- is_backup_expired ---------------------------------------------------

    #[test]
    fn backup_not_expired_within_retention() {
        let completed = Utc::now() - chrono::Duration::days(5);
        assert!(!is_backup_expired(completed, 30));
    }

    #[test]
    fn backup_expired_past_retention() {
        let completed = Utc::now() - chrono::Duration::days(31);
        assert!(is_backup_expired(completed, 30));
    }

    #[test]
    fn backup_expired_exactly_at_boundary() {
        let completed = Utc::now() - chrono::Duration::days(30);
        assert!(is_backup_expired(completed, 30));
    }

    // -- validate_cron_expression --------------------------------------------

    #[test]
    fn cron_valid_five_fields() {
        assert!(validate_cron_expression("0 2 * * *").is_ok());
    }

    #[test]
    fn cron_valid_six_fields() {
        assert!(validate_cron_expression("0 0 2 * * *").is_ok());
    }

    #[test]
    fn cron_valid_with_step() {
        assert!(validate_cron_expression("*/15 * * * *").is_ok());
    }

    #[test]
    fn cron_valid_with_range() {
        assert!(validate_cron_expression("0 1-5 * * *").is_ok());
    }

    #[test]
    fn cron_valid_with_list() {
        assert!(validate_cron_expression("0 1,3,5 * * *").is_ok());
    }

    #[test]
    fn cron_empty_rejected() {
        assert!(validate_cron_expression("").is_err());
    }

    #[test]
    fn cron_too_few_fields() {
        assert!(validate_cron_expression("0 2 *").is_err());
    }

    #[test]
    fn cron_too_many_fields() {
        assert!(validate_cron_expression("0 0 2 * * * *").is_err());
    }

    #[test]
    fn cron_invalid_characters() {
        assert!(validate_cron_expression("0 2 * * MON").is_err());
    }

    // -- compute_next_run ----------------------------------------------------

    #[test]
    fn next_run_with_step() {
        let from = Utc::now();
        let next = compute_next_run("*/15 * * * *", from).unwrap();
        assert_eq!(next.signed_duration_since(from).num_minutes(), 15);
    }

    #[test]
    fn next_run_with_wildcard() {
        let from = Utc::now();
        let next = compute_next_run("* * * * *", from).unwrap();
        assert_eq!(next.signed_duration_since(from).num_minutes(), 1);
    }

    #[test]
    fn next_run_with_fixed_minute() {
        let from = Utc::now();
        let next = compute_next_run("30 2 * * *", from).unwrap();
        // Fixed minute field defaults to 60-minute advance.
        assert_eq!(next.signed_duration_since(from).num_minutes(), 60);
    }

    #[test]
    fn next_run_invalid_cron_rejected() {
        let from = Utc::now();
        assert!(compute_next_run("bad", from).is_err());
    }

    // -- estimate_backup_size ------------------------------------------------

    #[test]
    fn estimate_size_basic() {
        let size = estimate_backup_size(10, 1000);
        assert_eq!(size, 10 * 1000 * ESTIMATED_BYTES_PER_ROW);
    }

    #[test]
    fn estimate_size_zero_tables() {
        assert_eq!(estimate_backup_size(0, 1000), 0);
    }

    #[test]
    fn estimate_size_zero_rows() {
        assert_eq!(estimate_backup_size(10, 0), 0);
    }

    // -- summarize_verification ----------------------------------------------

    #[test]
    fn summarize_success() {
        let result = VerificationResult {
            backup_id: 42,
            success: true,
            restore_duration_secs: 12.5,
            queries_passed: 10,
            queries_total: 10,
            errors: vec![],
        };
        let summary = summarize_verification(&result);
        assert!(summary.contains("PASSED"));
        assert!(summary.contains("10/10"));
        assert!(summary.contains("12.5s"));
    }

    #[test]
    fn summarize_failure_with_errors() {
        let result = VerificationResult {
            backup_id: 7,
            success: false,
            restore_duration_secs: 3.0,
            queries_passed: 8,
            queries_total: 10,
            errors: vec!["table missing".to_string(), "count mismatch".to_string()],
        };
        let summary = summarize_verification(&result);
        assert!(summary.contains("FAILED"));
        assert!(summary.contains("8/10"));
        assert!(summary.contains("2 errors"));
    }

    // -- backup_health_status ------------------------------------------------

    #[test]
    fn health_status_healthy() {
        let health = BackupHealth {
            last_full_backup_age_hours: 12.0,
            last_verified_age_hours: 24.0,
            total_backup_size_bytes: 1_000_000,
            schedule_count: 3,
            overdue_count: 0,
        };
        assert_eq!(backup_health_status(&health), "healthy");
    }

    #[test]
    fn health_status_warning_old_full_backup() {
        let health = BackupHealth {
            last_full_backup_age_hours: 50.0,
            last_verified_age_hours: 24.0,
            total_backup_size_bytes: 1_000_000,
            schedule_count: 3,
            overdue_count: 0,
        };
        assert_eq!(backup_health_status(&health), "warning");
    }

    #[test]
    fn health_status_warning_overdue() {
        let health = BackupHealth {
            last_full_backup_age_hours: 12.0,
            last_verified_age_hours: 24.0,
            total_backup_size_bytes: 1_000_000,
            schedule_count: 3,
            overdue_count: 1,
        };
        assert_eq!(backup_health_status(&health), "warning");
    }

    #[test]
    fn health_status_critical_very_old_full() {
        let health = BackupHealth {
            last_full_backup_age_hours: 200.0,
            last_verified_age_hours: 24.0,
            total_backup_size_bytes: 1_000_000,
            schedule_count: 3,
            overdue_count: 0,
        };
        assert_eq!(backup_health_status(&health), "critical");
    }

    #[test]
    fn health_status_critical_many_overdue() {
        let health = BackupHealth {
            last_full_backup_age_hours: 12.0,
            last_verified_age_hours: 24.0,
            total_backup_size_bytes: 1_000_000,
            schedule_count: 3,
            overdue_count: 5,
        };
        assert_eq!(backup_health_status(&health), "critical");
    }

    #[test]
    fn health_status_critical_no_verified_backup() {
        let health = BackupHealth {
            last_full_backup_age_hours: 12.0,
            last_verified_age_hours: f64::INFINITY,
            total_backup_size_bytes: 0,
            schedule_count: 0,
            overdue_count: 0,
        };
        assert_eq!(backup_health_status(&health), "critical");
    }

    #[test]
    fn health_status_warning_old_verified() {
        let health = BackupHealth {
            last_full_backup_age_hours: 12.0,
            last_verified_age_hours: 200.0,
            total_backup_size_bytes: 1_000_000,
            schedule_count: 3,
            overdue_count: 0,
        };
        assert_eq!(backup_health_status(&health), "warning");
    }

    // -- compute_backup_health -----------------------------------------------

    #[test]
    fn compute_health_with_no_backups() {
        let health = compute_backup_health(None, None, 0, 0, 0);
        assert_eq!(health.last_full_backup_age_hours, f64::INFINITY);
        assert_eq!(health.last_verified_age_hours, f64::INFINITY);
        assert_eq!(health.total_backup_size_bytes, 0);
    }

    #[test]
    fn compute_health_with_recent_backups() {
        let now = Utc::now();
        let recent = now - chrono::Duration::hours(2);
        let health = compute_backup_health(Some(recent), Some(recent), 5000, 2, 0);
        // Age should be roughly 2 hours (allow some tolerance for test execution).
        assert!(health.last_full_backup_age_hours >= 1.9);
        assert!(health.last_full_backup_age_hours <= 2.5);
        assert_eq!(health.total_backup_size_bytes, 5000);
        assert_eq!(health.schedule_count, 2);
    }
}
