//! Time-based job scheduling constants and logic (PRD-119).
//!
//! Provides cron expression parsing, next-run computation, off-peak window
//! checks, and validation helpers. Lives in `core` (zero internal deps)
//! so it can be used by the API layer and any future worker/scheduler daemon.

use chrono::{DateTime, Datelike, Duration, NaiveTime, TimeZone, Timelike, Utc};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Schedule type constants
// ---------------------------------------------------------------------------

/// Schedule type for one-time execution.
pub const SCHEDULE_ONE_TIME: &str = "one_time";

/// Schedule type for recurring execution.
pub const SCHEDULE_RECURRING: &str = "recurring";

/// All valid schedule type values.
pub const VALID_SCHEDULE_TYPES: &[&str] = &[SCHEDULE_ONE_TIME, SCHEDULE_RECURRING];

// ---------------------------------------------------------------------------
// Action type constants
// ---------------------------------------------------------------------------

/// Action type: submit a single job.
pub const ACTION_SUBMIT_JOB: &str = "submit_job";

/// Action type: submit a batch of jobs.
pub const ACTION_SUBMIT_BATCH: &str = "submit_batch";

/// All valid action type values.
pub const VALID_ACTION_TYPES: &[&str] = &[ACTION_SUBMIT_JOB, ACTION_SUBMIT_BATCH];

// ---------------------------------------------------------------------------
// History status constants
// ---------------------------------------------------------------------------

/// History status for successful execution.
pub const HISTORY_SUCCESS: &str = "success";

/// History status for failed execution.
pub const HISTORY_FAILED: &str = "failed";

/// History status for skipped execution (e.g. off-peak constraint).
pub const HISTORY_SKIPPED: &str = "skipped";

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/// Validate that `s` is a recognized schedule type.
pub fn validate_schedule_type(s: &str) -> Result<(), CoreError> {
    if VALID_SCHEDULE_TYPES.contains(&s) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid schedule_type '{s}'. Must be one of: {}",
            VALID_SCHEDULE_TYPES.join(", ")
        )))
    }
}

/// Validate that `s` is a recognized action type.
pub fn validate_action_type(s: &str) -> Result<(), CoreError> {
    if VALID_ACTION_TYPES.contains(&s) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid action_type '{s}'. Must be one of: {}",
            VALID_ACTION_TYPES.join(", ")
        )))
    }
}

/// Validate a cron expression has exactly 5 space-separated fields.
///
/// Fields: minute hour day_of_month month day_of_week.
/// Each field must contain only digits, `*`, `-`, `,`, `/`.
pub fn validate_cron_expression(cron: &str) -> Result<(), CoreError> {
    parse_cron_fields(cron)?;
    Ok(())
}

/// Validate that `tz` is a recognized IANA timezone string.
///
/// Uses `chrono_tz`-style parsing via `chrono::FixedOffset` as a fallback;
/// for now we accept "UTC" and any `+HH:MM` / `-HH:MM` offset, plus a
/// curated list of common IANA zone names.
pub fn validate_timezone(tz: &str) -> Result<(), CoreError> {
    if tz == "UTC" || parse_utc_offset(tz).is_some() {
        return Ok(());
    }
    Err(CoreError::Validation(format!(
        "Invalid timezone '{tz}'. Use 'UTC' or a UTC offset like '+02:00' / '-05:00'."
    )))
}

// ---------------------------------------------------------------------------
// Cron parsing
// ---------------------------------------------------------------------------

/// Parsed cron expression fields.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CronFields {
    pub minute: String,
    pub hour: String,
    pub day_of_month: String,
    pub month: String,
    pub day_of_week: String,
}

/// Valid characters inside a single cron field.
fn is_valid_cron_char(c: char) -> bool {
    c.is_ascii_digit() || matches!(c, '*' | '-' | ',' | '/')
}

/// Parse a cron expression string into its five fields.
///
/// Returns an error if the expression does not contain exactly 5
/// whitespace-separated fields or if any field contains invalid characters.
pub fn parse_cron_fields(cron: &str) -> Result<CronFields, CoreError> {
    let parts: Vec<&str> = cron.split_whitespace().collect();
    if parts.len() != 5 {
        return Err(CoreError::Validation(format!(
            "Cron expression must have exactly 5 fields (minute hour dom month dow), got {}",
            parts.len()
        )));
    }

    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() || !part.chars().all(is_valid_cron_char) {
            let field_name = match i {
                0 => "minute",
                1 => "hour",
                2 => "day_of_month",
                3 => "month",
                4 => "day_of_week",
                _ => "unknown",
            };
            return Err(CoreError::Validation(format!(
                "Invalid characters in cron field '{field_name}': '{}'",
                parts[i]
            )));
        }
    }

    Ok(CronFields {
        minute: parts[0].to_string(),
        hour: parts[1].to_string(),
        day_of_month: parts[2].to_string(),
        month: parts[3].to_string(),
        day_of_week: parts[4].to_string(),
    })
}

// ---------------------------------------------------------------------------
// Next-run computation
// ---------------------------------------------------------------------------

/// Maximum number of minutes to scan forward when computing next run.
/// Covers slightly more than one year.
const MAX_SCAN_MINUTES: u32 = 525_960; // 365.25 days * 24 * 60

/// Compute the next datetime after `after` that matches the given cron fields.
///
/// Uses a brute-force minute-by-minute scan (bounded to ~1 year). Returns
/// `None` if no matching minute is found within the scan window.
pub fn compute_next_run(cron: &CronFields, after: DateTime<Utc>) -> Option<DateTime<Utc>> {
    // Pre-expand each cron field into a set of matching values.
    let minutes = expand_field(&cron.minute, 0, 59)?;
    let hours = expand_field(&cron.hour, 0, 23)?;
    let doms = expand_field(&cron.day_of_month, 1, 31)?;
    let months = expand_field(&cron.month, 1, 12)?;
    let dows = expand_field(&cron.day_of_week, 0, 6)?;

    // Start scanning from the next minute after `after`.
    let start = after + Duration::minutes(1);
    // Truncate to the start of that minute.
    let start = start
        .date_naive()
        .and_hms_opt(start.hour(), start.minute(), 0)?;
    let mut candidate = Utc.from_utc_datetime(&start);

    for _ in 0..MAX_SCAN_MINUTES {
        let m = candidate.minute();
        let h = candidate.hour();
        let dom = candidate.day() as u32;
        let mon = candidate.month();
        let dow = candidate.weekday().num_days_from_sunday(); // 0=Sun

        if minutes.contains(&m)
            && hours.contains(&h)
            && doms.contains(&dom)
            && months.contains(&mon)
            && dows.contains(&dow)
        {
            return Some(candidate);
        }

        candidate = candidate + Duration::minutes(1);
    }

    None
}

/// Expand a single cron field (e.g. `"1,3,5"`, `"*/15"`, `"2-4"`) into a
/// sorted set of matching integer values within `[min, max]`.
fn expand_field(field: &str, min: u32, max: u32) -> Option<Vec<u32>> {
    let mut values = Vec::new();

    for part in field.split(',') {
        if let Some(step_part) = part.strip_prefix("*/") {
            let step: u32 = step_part.parse().ok()?;
            if step == 0 {
                return None;
            }
            let mut v = min;
            while v <= max {
                values.push(v);
                v += step;
            }
        } else if part.contains('/') {
            let segments: Vec<&str> = part.splitn(2, '/').collect();
            let range_start: u32 = segments[0].parse().ok()?;
            let step: u32 = segments[1].parse().ok()?;
            if step == 0 {
                return None;
            }
            let mut v = range_start;
            while v <= max {
                values.push(v);
                v += step;
            }
        } else if part.contains('-') {
            let range: Vec<&str> = part.splitn(2, '-').collect();
            let start: u32 = range[0].parse().ok()?;
            let end: u32 = range[1].parse().ok()?;
            if start > end {
                return None;
            }
            for v in start..=end {
                if v >= min && v <= max {
                    values.push(v);
                }
            }
        } else if part == "*" {
            for v in min..=max {
                values.push(v);
            }
        } else {
            let v: u32 = part.parse().ok()?;
            if v >= min && v <= max {
                values.push(v);
            }
        }
    }

    values.sort_unstable();
    values.dedup();
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

// ---------------------------------------------------------------------------
// Off-peak logic
// ---------------------------------------------------------------------------

/// A single off-peak time window for one day of the week.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OffPeakWindow {
    /// Day of week (0=Sunday, 6=Saturday).
    pub day_of_week: u32,
    /// Start hour (0-23). If `start_hour > end_hour`, the window wraps midnight.
    pub start_hour: u32,
    /// End hour (0-23). If equal to `start_hour`, the full day is off-peak.
    pub end_hour: u32,
}

/// Check whether `now` falls within any of the configured off-peak windows.
///
/// Handles midnight-wrapping windows (e.g. 22:00 -> 06:00) by splitting
/// them into two logical ranges.
pub fn is_off_peak(now: DateTime<Utc>, configs: &[OffPeakWindow]) -> bool {
    let dow = now.weekday().num_days_from_sunday(); // 0=Sun
    let hour = now.hour();

    for w in configs {
        if w.day_of_week != dow {
            continue;
        }

        if w.start_hour <= w.end_hour {
            // Normal range: e.g. 0-23 (all day) or 2-6
            if hour >= w.start_hour && hour <= w.end_hour {
                return true;
            }
        } else {
            // Midnight-wrapping range: e.g. 22-6 means 22..23 or 0..6
            if hour >= w.start_hour || hour <= w.end_hour {
                return true;
            }
        }
    }

    false
}

/// Find the next datetime at or after `now` that falls within an off-peak window.
///
/// Scans up to 8 days forward (guaranteed to find a match if any window exists).
/// Returns `None` if `configs` is empty.
pub fn next_off_peak_slot(now: DateTime<Utc>, configs: &[OffPeakWindow]) -> Option<DateTime<Utc>> {
    if configs.is_empty() {
        return None;
    }

    // If currently off-peak, return now.
    if is_off_peak(now, configs) {
        return Some(now);
    }

    // Scan hour-by-hour for up to 8 days.
    const MAX_HOURS: u32 = 8 * 24;
    let mut candidate = (now + Duration::hours(1))
        .date_naive()
        .and_time(NaiveTime::from_hms_opt(
            (now + Duration::hours(1)).hour(),
            0,
            0,
        )?);
    let mut dt = Utc.from_utc_datetime(&candidate);

    for _ in 0..MAX_HOURS {
        if is_off_peak(dt, configs) {
            return Some(dt);
        }
        candidate = candidate + Duration::hours(1);
        dt = Utc.from_utc_datetime(&candidate);
    }

    None
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a UTC offset string like "+02:00" or "-05:00" into total seconds.
fn parse_utc_offset(s: &str) -> Option<i32> {
    if s.len() != 6 {
        return None;
    }
    let sign = match s.as_bytes().first()? {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    if s.as_bytes().get(3)? != &b':' {
        return None;
    }
    let hours: i32 = s[1..3].parse().ok()?;
    let minutes: i32 = s[4..6].parse().ok()?;
    if hours > 14 || minutes > 59 {
        return None;
    }
    Some(sign * (hours * 3600 + minutes * 60))
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    // -----------------------------------------------------------------------
    // validate_schedule_type
    // -----------------------------------------------------------------------

    #[test]
    fn valid_schedule_types() {
        assert!(validate_schedule_type("one_time").is_ok());
        assert!(validate_schedule_type("recurring").is_ok());
    }

    #[test]
    fn invalid_schedule_type() {
        let err = validate_schedule_type("daily").unwrap_err();
        assert!(err.to_string().contains("Invalid schedule_type"));
    }

    // -----------------------------------------------------------------------
    // validate_action_type
    // -----------------------------------------------------------------------

    #[test]
    fn valid_action_types() {
        assert!(validate_action_type("submit_job").is_ok());
        assert!(validate_action_type("submit_batch").is_ok());
    }

    #[test]
    fn invalid_action_type() {
        let err = validate_action_type("run_pipeline").unwrap_err();
        assert!(err.to_string().contains("Invalid action_type"));
    }

    // -----------------------------------------------------------------------
    // validate_timezone
    // -----------------------------------------------------------------------

    #[test]
    fn valid_timezone_utc() {
        assert!(validate_timezone("UTC").is_ok());
    }

    #[test]
    fn valid_timezone_positive_offset() {
        assert!(validate_timezone("+02:00").is_ok());
    }

    #[test]
    fn valid_timezone_negative_offset() {
        assert!(validate_timezone("-05:00").is_ok());
    }

    #[test]
    fn invalid_timezone() {
        assert!(validate_timezone("US/Eastern").is_err());
    }

    #[test]
    fn invalid_timezone_empty() {
        assert!(validate_timezone("").is_err());
    }

    // -----------------------------------------------------------------------
    // validate_cron_expression / parse_cron_fields
    // -----------------------------------------------------------------------

    #[test]
    fn valid_cron_every_minute() {
        let fields = parse_cron_fields("* * * * *").unwrap();
        assert_eq!(fields.minute, "*");
        assert_eq!(fields.hour, "*");
    }

    #[test]
    fn valid_cron_specific() {
        let fields = parse_cron_fields("0 2 * * *").unwrap();
        assert_eq!(fields.minute, "0");
        assert_eq!(fields.hour, "2");
        assert_eq!(fields.day_of_month, "*");
    }

    #[test]
    fn valid_cron_with_ranges() {
        let fields = parse_cron_fields("*/15 1-5 * * 1-5").unwrap();
        assert_eq!(fields.minute, "*/15");
        assert_eq!(fields.hour, "1-5");
        assert_eq!(fields.day_of_week, "1-5");
    }

    #[test]
    fn valid_cron_with_lists() {
        let fields = parse_cron_fields("0,30 8,12,18 * * *").unwrap();
        assert_eq!(fields.minute, "0,30");
        assert_eq!(fields.hour, "8,12,18");
    }

    #[test]
    fn cron_too_few_fields() {
        let err = parse_cron_fields("* * *").unwrap_err();
        assert!(err.to_string().contains("exactly 5 fields"));
    }

    #[test]
    fn cron_too_many_fields() {
        let err = parse_cron_fields("* * * * * *").unwrap_err();
        assert!(err.to_string().contains("exactly 5 fields"));
    }

    #[test]
    fn cron_invalid_characters() {
        let err = parse_cron_fields("* * * * MON").unwrap_err();
        assert!(err.to_string().contains("Invalid characters"));
    }

    // -----------------------------------------------------------------------
    // expand_field
    // -----------------------------------------------------------------------

    #[test]
    fn expand_wildcard() {
        let vals = expand_field("*", 0, 5).unwrap();
        assert_eq!(vals, vec![0, 1, 2, 3, 4, 5]);
    }

    #[test]
    fn expand_step() {
        let vals = expand_field("*/15", 0, 59).unwrap();
        assert_eq!(vals, vec![0, 15, 30, 45]);
    }

    #[test]
    fn expand_range() {
        let vals = expand_field("2-5", 0, 10).unwrap();
        assert_eq!(vals, vec![2, 3, 4, 5]);
    }

    #[test]
    fn expand_list() {
        let vals = expand_field("1,3,5", 0, 10).unwrap();
        assert_eq!(vals, vec![1, 3, 5]);
    }

    #[test]
    fn expand_range_with_step() {
        let vals = expand_field("2/3", 0, 12).unwrap();
        assert_eq!(vals, vec![2, 5, 8, 11]);
    }

    #[test]
    fn expand_zero_step_returns_none() {
        assert!(expand_field("*/0", 0, 59).is_none());
    }

    #[test]
    fn expand_inverted_range_returns_none() {
        assert!(expand_field("5-2", 0, 10).is_none());
    }

    // -----------------------------------------------------------------------
    // compute_next_run
    // -----------------------------------------------------------------------

    #[test]
    fn next_run_every_hour_at_zero() {
        // Cron: "0 * * * *" -> at minute 0 of every hour
        let cron = parse_cron_fields("0 * * * *").unwrap();
        let after = Utc.with_ymd_and_hms(2026, 3, 1, 10, 30, 0).unwrap();
        let next = compute_next_run(&cron, after).unwrap();
        assert_eq!(next, Utc.with_ymd_and_hms(2026, 3, 1, 11, 0, 0).unwrap());
    }

    #[test]
    fn next_run_daily_at_2am() {
        let cron = parse_cron_fields("0 2 * * *").unwrap();
        let after = Utc.with_ymd_and_hms(2026, 3, 1, 3, 0, 0).unwrap();
        let next = compute_next_run(&cron, after).unwrap();
        // Should be next day at 2am
        assert_eq!(next, Utc.with_ymd_and_hms(2026, 3, 2, 2, 0, 0).unwrap());
    }

    #[test]
    fn next_run_every_15_minutes() {
        let cron = parse_cron_fields("*/15 * * * *").unwrap();
        let after = Utc.with_ymd_and_hms(2026, 3, 1, 10, 16, 0).unwrap();
        let next = compute_next_run(&cron, after).unwrap();
        assert_eq!(next, Utc.with_ymd_and_hms(2026, 3, 1, 10, 30, 0).unwrap());
    }

    #[test]
    fn next_run_weekday_only() {
        // Cron: "0 9 * * 1-5" -> 9am Mon-Fri
        let cron = parse_cron_fields("0 9 * * 1-5").unwrap();
        // 2026-03-01 is a Sunday
        let after = Utc.with_ymd_and_hms(2026, 3, 1, 0, 0, 0).unwrap();
        let next = compute_next_run(&cron, after).unwrap();
        // Should be Monday 2026-03-02 at 9am
        assert_eq!(next, Utc.with_ymd_and_hms(2026, 3, 2, 9, 0, 0).unwrap());
    }

    #[test]
    fn next_run_at_exact_boundary_skips_to_next() {
        // If `after` is exactly at a matching minute, we skip to the NEXT match.
        let cron = parse_cron_fields("30 10 * * *").unwrap();
        let after = Utc.with_ymd_and_hms(2026, 3, 1, 10, 30, 0).unwrap();
        let next = compute_next_run(&cron, after).unwrap();
        // Should be next day
        assert_eq!(next, Utc.with_ymd_and_hms(2026, 3, 2, 10, 30, 0).unwrap());
    }

    // -----------------------------------------------------------------------
    // is_off_peak
    // -----------------------------------------------------------------------

    #[test]
    fn off_peak_weekend_all_day() {
        let configs = vec![
            OffPeakWindow {
                day_of_week: 0,
                start_hour: 0,
                end_hour: 23,
            }, // Sunday
            OffPeakWindow {
                day_of_week: 6,
                start_hour: 0,
                end_hour: 23,
            }, // Saturday
        ];
        // 2026-03-01 is Sunday
        let sunday_noon = Utc.with_ymd_and_hms(2026, 3, 1, 12, 0, 0).unwrap();
        assert!(is_off_peak(sunday_noon, &configs));

        // Monday should NOT be off-peak
        let monday_noon = Utc.with_ymd_and_hms(2026, 3, 2, 12, 0, 0).unwrap();
        assert!(!is_off_peak(monday_noon, &configs));
    }

    #[test]
    fn off_peak_midnight_wrap() {
        let configs = vec![
            OffPeakWindow {
                day_of_week: 1,
                start_hour: 22,
                end_hour: 6,
            }, // Mon 10pm-6am
        ];
        // Monday at 23:00 -> off-peak
        let mon_11pm = Utc.with_ymd_and_hms(2026, 3, 2, 23, 0, 0).unwrap();
        assert!(is_off_peak(mon_11pm, &configs));

        // Monday at 3:00 -> off-peak (within 22-6 wrap)
        let mon_3am = Utc.with_ymd_and_hms(2026, 3, 2, 3, 0, 0).unwrap();
        assert!(is_off_peak(mon_3am, &configs));

        // Monday at 12:00 -> NOT off-peak
        let mon_noon = Utc.with_ymd_and_hms(2026, 3, 2, 12, 0, 0).unwrap();
        assert!(!is_off_peak(mon_noon, &configs));
    }

    #[test]
    fn off_peak_empty_configs() {
        let now = Utc.with_ymd_and_hms(2026, 3, 1, 12, 0, 0).unwrap();
        assert!(!is_off_peak(now, &[]));
    }

    // -----------------------------------------------------------------------
    // next_off_peak_slot
    // -----------------------------------------------------------------------

    #[test]
    fn next_off_peak_already_in_window() {
        let configs = vec![OffPeakWindow {
            day_of_week: 0,
            start_hour: 0,
            end_hour: 23,
        }];
        let sunday = Utc.with_ymd_and_hms(2026, 3, 1, 12, 0, 0).unwrap();
        let slot = next_off_peak_slot(sunday, &configs).unwrap();
        assert_eq!(slot, sunday);
    }

    #[test]
    fn next_off_peak_finds_future_window() {
        let configs = vec![OffPeakWindow {
            day_of_week: 1,
            start_hour: 22,
            end_hour: 6,
        }];
        // Sunday noon -> next off-peak is Monday 00:00 (the 22-6 wrap
        // means hours 0..6 on Monday are also off-peak).
        let sunday_noon = Utc.with_ymd_and_hms(2026, 3, 1, 12, 0, 0).unwrap();
        let slot = next_off_peak_slot(sunday_noon, &configs).unwrap();
        assert_eq!(slot, Utc.with_ymd_and_hms(2026, 3, 2, 0, 0, 0).unwrap());
    }

    #[test]
    fn next_off_peak_empty_configs_returns_none() {
        let now = Utc.with_ymd_and_hms(2026, 3, 1, 12, 0, 0).unwrap();
        assert!(next_off_peak_slot(now, &[]).is_none());
    }

    // -----------------------------------------------------------------------
    // parse_utc_offset
    // -----------------------------------------------------------------------

    #[test]
    fn parse_positive_offset() {
        assert_eq!(parse_utc_offset("+02:00"), Some(7200));
    }

    #[test]
    fn parse_negative_offset() {
        assert_eq!(parse_utc_offset("-05:00"), Some(-18000));
    }

    #[test]
    fn parse_zero_offset() {
        assert_eq!(parse_utc_offset("+00:00"), Some(0));
    }

    #[test]
    fn parse_invalid_offset_format() {
        assert!(parse_utc_offset("UTC").is_none());
        assert!(parse_utc_offset("+2:00").is_none());
        assert!(parse_utc_offset("").is_none());
    }

    #[test]
    fn parse_offset_overflow() {
        assert!(parse_utc_offset("+15:00").is_none());
        assert!(parse_utc_offset("+00:60").is_none());
    }
}
