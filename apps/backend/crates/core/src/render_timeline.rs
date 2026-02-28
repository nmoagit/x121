//! Render queue timeline constants and pure computation (PRD-90).
//!
//! This module provides zoom-level validation, time estimation helpers,
//! and lane assignment logic for the Gantt-style timeline view.
//! All functions are pure (no I/O) so they can be tested without a database.

use chrono::{DateTime, Duration, Utc};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Zoom level constants
// ---------------------------------------------------------------------------

/// 1-hour zoom window.
pub const ZOOM_1H: &str = "1h";

/// 6-hour zoom window.
pub const ZOOM_6H: &str = "6h";

/// 24-hour zoom window.
pub const ZOOM_24H: &str = "24h";

/// 7-day zoom window.
pub const ZOOM_7D: &str = "7d";

/// All valid zoom level strings.
pub const VALID_ZOOM_LEVELS: &[&str] = &[ZOOM_1H, ZOOM_6H, ZOOM_24H, ZOOM_7D];

/// Default zoom level when none is specified.
pub const DEFAULT_ZOOM: &str = ZOOM_6H;

/// Default job duration estimate (in seconds) when no historical data exists.
pub const DEFAULT_DURATION_SECS: f64 = 120.0;

/// Maximum number of timeline jobs returned per request.
pub const MAX_TIMELINE_LIMIT: i64 = 500;

/// Default number of timeline jobs returned per request.
pub const DEFAULT_TIMELINE_LIMIT: i64 = 200;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a zoom level string is one of the known values.
///
/// Returns `Ok(())` if valid, or `CoreError::Validation` with a descriptive
/// message listing valid options.
pub fn validate_zoom_level(zoom: &str) -> Result<(), CoreError> {
    if VALID_ZOOM_LEVELS.contains(&zoom) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid zoom level '{}'. Valid values: {}",
            zoom,
            VALID_ZOOM_LEVELS.join(", ")
        )))
    }
}

/// Convert a zoom level string to a `chrono::Duration`.
///
/// Panics if `zoom` is not a valid zoom level. Call [`validate_zoom_level`]
/// first to get a descriptive error instead.
pub fn zoom_to_duration(zoom: &str) -> Duration {
    match zoom {
        ZOOM_1H => Duration::hours(1),
        ZOOM_6H => Duration::hours(6),
        ZOOM_24H => Duration::hours(24),
        ZOOM_7D => Duration::days(7),
        _ => Duration::hours(6), // fallback to 6h (validated before reaching here)
    }
}

// ---------------------------------------------------------------------------
// Time estimation
// ---------------------------------------------------------------------------

/// Estimate a job's duration in seconds based on historical data.
///
/// If `historical_avg_seconds` is `Some`, returns that value.
/// Otherwise, returns `default_seconds`.
pub fn estimate_job_duration_seconds(
    historical_avg_seconds: Option<f64>,
    default_seconds: f64,
) -> f64 {
    historical_avg_seconds.unwrap_or(default_seconds).max(1.0)
}

/// Compute the estimated end time for a job given its start and duration.
pub fn compute_job_end_estimate(
    start: DateTime<Utc>,
    estimated_duration_seconds: f64,
) -> DateTime<Utc> {
    let duration_ms = (estimated_duration_seconds * 1000.0) as i64;
    start + Duration::milliseconds(duration_ms)
}

// ---------------------------------------------------------------------------
// Timeline job / lane assignment types
// ---------------------------------------------------------------------------

/// A job to be placed on the timeline. Used as input to lane assignment.
#[derive(Debug, Clone)]
pub struct TimelineJob {
    /// Internal job ID.
    pub job_id: i64,
    /// Worker this job is assigned to (if any).
    pub worker_id: Option<i64>,
    /// Current status string (e.g. "running", "pending").
    pub status: String,
    /// When the job actually started (for running/completed jobs).
    pub started_at: Option<DateTime<Utc>>,
    /// When the job is estimated to start (for queued jobs).
    pub estimated_start: Option<DateTime<Utc>>,
    /// Estimated total duration in seconds.
    pub estimated_duration_seconds: f64,
    /// Priority value (higher = more urgent).
    pub priority: i32,
}

/// The result of lane assignment: a job placed at a specific lane and time span.
#[derive(Debug, Clone, PartialEq)]
pub struct LaneAssignment {
    /// The job ID this assignment refers to.
    pub job_id: i64,
    /// Lane index (0-based). Each lane typically represents a worker.
    pub lane: usize,
    /// Start time of the job on the timeline.
    pub start: DateTime<Utc>,
    /// End time of the job on the timeline.
    pub end: DateTime<Utc>,
}

/// Assign jobs to worker lanes for the Gantt view.
///
/// Jobs with a `worker_id` are placed in the lane for that worker.
/// Jobs without a `worker_id` (queued) are placed in a shared "unassigned" lane.
///
/// Within each lane, jobs are sorted by start time. The lane index is
/// determined by the worker ID order (stable sorted).
pub fn assign_lanes(jobs: &[TimelineJob]) -> Vec<LaneAssignment> {
    if jobs.is_empty() {
        return Vec::new();
    }

    // Collect unique worker IDs in sorted order to assign stable lane indices.
    let mut worker_ids: Vec<i64> = jobs.iter().filter_map(|j| j.worker_id).collect();
    worker_ids.sort_unstable();
    worker_ids.dedup();

    // Map worker_id -> lane index (lane 0 = unassigned, lanes 1..N = workers).
    let worker_lane = |wid: i64| -> usize {
        worker_ids
            .iter()
            .position(|&id| id == wid)
            .map(|pos| pos + 1) // +1 because lane 0 is unassigned
            .unwrap_or(0)
    };

    let mut assignments: Vec<LaneAssignment> = jobs
        .iter()
        .map(|job| {
            let lane = job.worker_id.map(worker_lane).unwrap_or(0);
            let start = job
                .started_at
                .or(job.estimated_start)
                .unwrap_or_else(Utc::now);
            let end = compute_job_end_estimate(start, job.estimated_duration_seconds);

            LaneAssignment {
                job_id: job.job_id,
                lane,
                start,
                end,
            }
        })
        .collect();

    // Sort by lane first, then by start time within each lane.
    assignments.sort_by(|a, b| a.lane.cmp(&b.lane).then(a.start.cmp(&b.start)));

    assignments
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn fixed_time(hour: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 2, 28, hour, min, 0).unwrap()
    }

    // -- validate_zoom_level -------------------------------------------------

    #[test]
    fn valid_zoom_1h() {
        assert!(validate_zoom_level(ZOOM_1H).is_ok());
    }

    #[test]
    fn valid_zoom_6h() {
        assert!(validate_zoom_level(ZOOM_6H).is_ok());
    }

    #[test]
    fn valid_zoom_24h() {
        assert!(validate_zoom_level(ZOOM_24H).is_ok());
    }

    #[test]
    fn valid_zoom_7d() {
        assert!(validate_zoom_level(ZOOM_7D).is_ok());
    }

    #[test]
    fn invalid_zoom_returns_error() {
        let err = validate_zoom_level("2h").unwrap_err();
        match err {
            CoreError::Validation(msg) => {
                assert!(msg.contains("Invalid zoom level"));
                assert!(msg.contains("2h"));
            }
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn invalid_zoom_empty_string() {
        assert!(validate_zoom_level("").is_err());
    }

    #[test]
    fn invalid_zoom_case_sensitive() {
        assert!(validate_zoom_level("1H").is_err());
        assert!(validate_zoom_level("6H").is_err());
    }

    // -- zoom_to_duration ----------------------------------------------------

    #[test]
    fn zoom_1h_duration() {
        assert_eq!(zoom_to_duration(ZOOM_1H), Duration::hours(1));
    }

    #[test]
    fn zoom_6h_duration() {
        assert_eq!(zoom_to_duration(ZOOM_6H), Duration::hours(6));
    }

    #[test]
    fn zoom_24h_duration() {
        assert_eq!(zoom_to_duration(ZOOM_24H), Duration::hours(24));
    }

    #[test]
    fn zoom_7d_duration() {
        assert_eq!(zoom_to_duration(ZOOM_7D), Duration::days(7));
    }

    #[test]
    fn zoom_unknown_falls_back_to_6h() {
        assert_eq!(zoom_to_duration("unknown"), Duration::hours(6));
    }

    // -- estimate_job_duration_seconds ---------------------------------------

    #[test]
    fn estimate_uses_historical_when_available() {
        assert_eq!(estimate_job_duration_seconds(Some(45.0), 120.0), 45.0);
    }

    #[test]
    fn estimate_uses_default_when_no_historical() {
        assert_eq!(estimate_job_duration_seconds(None, 120.0), 120.0);
    }

    #[test]
    fn estimate_floors_at_one_second() {
        assert_eq!(estimate_job_duration_seconds(Some(0.0), 120.0), 1.0);
        assert_eq!(estimate_job_duration_seconds(Some(-5.0), 120.0), 1.0);
    }

    #[test]
    fn estimate_default_floors_at_one() {
        assert_eq!(estimate_job_duration_seconds(None, 0.0), 1.0);
    }

    // -- compute_job_end_estimate --------------------------------------------

    #[test]
    fn end_estimate_adds_duration() {
        let start = fixed_time(10, 0);
        let end = compute_job_end_estimate(start, 3600.0); // 1 hour
        assert_eq!(end, fixed_time(11, 0));
    }

    #[test]
    fn end_estimate_fractional_seconds() {
        let start = fixed_time(10, 0);
        let end = compute_job_end_estimate(start, 90.5);
        let expected = start + Duration::milliseconds(90500);
        assert_eq!(end, expected);
    }

    #[test]
    fn end_estimate_zero_duration() {
        let start = fixed_time(10, 0);
        let end = compute_job_end_estimate(start, 0.0);
        assert_eq!(end, start);
    }

    // -- assign_lanes --------------------------------------------------------

    #[test]
    fn assign_lanes_empty_input() {
        let result = assign_lanes(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn assign_lanes_single_assigned_job() {
        let jobs = vec![TimelineJob {
            job_id: 1,
            worker_id: Some(100),
            status: "running".into(),
            started_at: Some(fixed_time(10, 0)),
            estimated_start: None,
            estimated_duration_seconds: 60.0,
            priority: 0,
        }];
        let result = assign_lanes(&jobs);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].job_id, 1);
        assert_eq!(result[0].lane, 1); // lane 0 is unassigned, worker gets lane 1
        assert_eq!(result[0].start, fixed_time(10, 0));
    }

    #[test]
    fn assign_lanes_unassigned_job_goes_to_lane_zero() {
        let jobs = vec![TimelineJob {
            job_id: 1,
            worker_id: None,
            status: "pending".into(),
            started_at: None,
            estimated_start: Some(fixed_time(10, 0)),
            estimated_duration_seconds: 60.0,
            priority: 0,
        }];
        let result = assign_lanes(&jobs);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].lane, 0);
    }

    #[test]
    fn assign_lanes_multiple_workers_get_distinct_lanes() {
        let jobs = vec![
            TimelineJob {
                job_id: 1,
                worker_id: Some(100),
                status: "running".into(),
                started_at: Some(fixed_time(10, 0)),
                estimated_start: None,
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
            TimelineJob {
                job_id: 2,
                worker_id: Some(200),
                status: "running".into(),
                started_at: Some(fixed_time(10, 5)),
                estimated_start: None,
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
        ];
        let result = assign_lanes(&jobs);
        assert_eq!(result.len(), 2);
        // Worker 100 -> lane 1, Worker 200 -> lane 2 (sorted by ID)
        let lane_1 = result.iter().find(|a| a.job_id == 1).unwrap();
        let lane_2 = result.iter().find(|a| a.job_id == 2).unwrap();
        assert_eq!(lane_1.lane, 1);
        assert_eq!(lane_2.lane, 2);
    }

    #[test]
    fn assign_lanes_same_worker_gets_same_lane() {
        let jobs = vec![
            TimelineJob {
                job_id: 1,
                worker_id: Some(100),
                status: "completed".into(),
                started_at: Some(fixed_time(9, 0)),
                estimated_start: None,
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
            TimelineJob {
                job_id: 2,
                worker_id: Some(100),
                status: "running".into(),
                started_at: Some(fixed_time(10, 0)),
                estimated_start: None,
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
        ];
        let result = assign_lanes(&jobs);
        assert_eq!(result[0].lane, result[1].lane);
    }

    #[test]
    fn assign_lanes_sorted_by_start_within_lane() {
        let jobs = vec![
            TimelineJob {
                job_id: 2,
                worker_id: Some(100),
                status: "running".into(),
                started_at: Some(fixed_time(11, 0)),
                estimated_start: None,
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
            TimelineJob {
                job_id: 1,
                worker_id: Some(100),
                status: "completed".into(),
                started_at: Some(fixed_time(10, 0)),
                estimated_start: None,
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
        ];
        let result = assign_lanes(&jobs);
        assert_eq!(result[0].job_id, 1); // earlier start first
        assert_eq!(result[1].job_id, 2);
    }

    #[test]
    fn assign_lanes_uses_estimated_start_when_no_started_at() {
        let jobs = vec![TimelineJob {
            job_id: 1,
            worker_id: None,
            status: "pending".into(),
            started_at: None,
            estimated_start: Some(fixed_time(12, 0)),
            estimated_duration_seconds: 300.0,
            priority: 5,
        }];
        let result = assign_lanes(&jobs);
        assert_eq!(result[0].start, fixed_time(12, 0));
        assert_eq!(
            result[0].end,
            compute_job_end_estimate(fixed_time(12, 0), 300.0)
        );
    }

    #[test]
    fn assign_lanes_prefers_started_at_over_estimated_start() {
        let jobs = vec![TimelineJob {
            job_id: 1,
            worker_id: Some(100),
            status: "running".into(),
            started_at: Some(fixed_time(10, 0)),
            estimated_start: Some(fixed_time(9, 0)),
            estimated_duration_seconds: 60.0,
            priority: 0,
        }];
        let result = assign_lanes(&jobs);
        assert_eq!(result[0].start, fixed_time(10, 0));
    }

    #[test]
    fn assign_lanes_mixed_assigned_and_unassigned() {
        let jobs = vec![
            TimelineJob {
                job_id: 1,
                worker_id: Some(100),
                status: "running".into(),
                started_at: Some(fixed_time(10, 0)),
                estimated_start: None,
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
            TimelineJob {
                job_id: 2,
                worker_id: None,
                status: "pending".into(),
                started_at: None,
                estimated_start: Some(fixed_time(10, 30)),
                estimated_duration_seconds: 60.0,
                priority: 0,
            },
        ];
        let result = assign_lanes(&jobs);
        assert_eq!(result.len(), 2);
        // Unassigned (lane 0) should come first in sorted output
        let unassigned = result.iter().find(|a| a.job_id == 2).unwrap();
        let assigned = result.iter().find(|a| a.job_id == 1).unwrap();
        assert_eq!(unassigned.lane, 0);
        assert_eq!(assigned.lane, 1);
    }

    #[test]
    fn assign_lanes_end_time_computed_correctly() {
        let start = fixed_time(10, 0);
        let jobs = vec![TimelineJob {
            job_id: 1,
            worker_id: Some(100),
            status: "running".into(),
            started_at: Some(start),
            estimated_start: None,
            estimated_duration_seconds: 7200.0, // 2 hours
            priority: 0,
        }];
        let result = assign_lanes(&jobs);
        assert_eq!(result[0].end, fixed_time(12, 0));
    }

    // -- VALID_ZOOM_LEVELS ---------------------------------------------------

    #[test]
    fn valid_zoom_levels_contains_all_constants() {
        assert!(VALID_ZOOM_LEVELS.contains(&ZOOM_1H));
        assert!(VALID_ZOOM_LEVELS.contains(&ZOOM_6H));
        assert!(VALID_ZOOM_LEVELS.contains(&ZOOM_24H));
        assert!(VALID_ZOOM_LEVELS.contains(&ZOOM_7D));
        assert_eq!(VALID_ZOOM_LEVELS.len(), 4);
    }

    // -- DEFAULT constants ---------------------------------------------------

    #[test]
    fn default_zoom_is_valid() {
        assert!(validate_zoom_level(DEFAULT_ZOOM).is_ok());
    }

    #[test]
    fn default_duration_is_positive() {
        assert!(DEFAULT_DURATION_SECS > 0.0);
    }

    #[test]
    fn max_timeline_limit_greater_than_default() {
        assert!(MAX_TIMELINE_LIMIT > DEFAULT_TIMELINE_LIMIT);
    }
}
