//! Worker pool management constants, scoring, and validation (PRD-46).
//!
//! Pure functions and constants used by both the API and (future) worker agent.
//! Lives in `core` to maintain zero internal dependency constraint.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// If a worker has not sent a heartbeat within this many seconds,
/// it is considered offline and should be marked accordingly.
pub const HEARTBEAT_TIMEOUT_SECS: u64 = 120;

/// How often the heartbeat monitor loop should check for stale workers.
pub const HEARTBEAT_CHECK_INTERVAL_SECS: u64 = 30;

/// Weight factor for GPU utilization when computing a worker load score.
/// Higher means GPU utilization has more impact on the score.
pub const LOAD_WEIGHT_GPU: f64 = 0.6;

/// Weight factor for active job count when computing a worker load score.
/// Higher means job count has more impact on the score.
pub const LOAD_WEIGHT_JOBS: f64 = 0.4;

/// Maximum number of active jobs before a worker is considered fully loaded.
/// Used to normalise the job count into a 0..1 range for scoring.
pub const MAX_JOBS_FOR_SCORING: u32 = 8;

/// Maximum length of a worker name.
const MAX_NAME_LEN: usize = 128;

/// Maximum number of tags a worker may have.
const MAX_TAGS: usize = 32;

/// Maximum length of a single tag.
const MAX_TAG_LEN: usize = 64;

// ---------------------------------------------------------------------------
// Load scoring
// ---------------------------------------------------------------------------

/// Calculate a composite load score for a worker.
///
/// Returns a value in `0.0..=1.0` where 0 means idle and 1 means fully loaded.
///
/// - `gpu_utilization_pct` is expected to be in `0.0..=100.0`.
/// - `active_job_count` is the number of jobs currently assigned to the worker.
pub fn calculate_load_score(gpu_utilization_pct: f64, active_job_count: u32) -> f64 {
    let gpu_norm = (gpu_utilization_pct / 100.0).clamp(0.0, 1.0);
    let job_norm = (active_job_count as f64 / MAX_JOBS_FOR_SCORING as f64).clamp(0.0, 1.0);
    (LOAD_WEIGHT_GPU * gpu_norm + LOAD_WEIGHT_JOBS * job_norm).clamp(0.0, 1.0)
}

// ---------------------------------------------------------------------------
// Tag matching
// ---------------------------------------------------------------------------

/// Count how many of `required` tags are present in `worker_tags`.
///
/// A higher count means a better match. If the returned value equals
/// `required.len()`, the worker satisfies all required tags.
pub fn count_matching_tags(worker_tags: &[String], required: &[String]) -> usize {
    required
        .iter()
        .filter(|req| worker_tags.iter().any(|wt| wt == *req))
        .count()
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a worker name.
///
/// Rules:
/// - Must not be empty.
/// - Must not exceed `MAX_NAME_LEN` characters.
/// - Must contain only alphanumeric, hyphen, underscore, or dot characters.
pub fn validate_worker_name(name: &str) -> Result<(), CoreError> {
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Worker name must not be empty".to_string(),
        ));
    }
    if name.len() > MAX_NAME_LEN {
        return Err(CoreError::Validation(format!(
            "Worker name must not exceed {MAX_NAME_LEN} characters"
        )));
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(CoreError::Validation(
            "Worker name may only contain alphanumeric, hyphen, underscore, or dot characters"
                .to_string(),
        ));
    }
    Ok(())
}

/// Validate a set of worker tags.
///
/// Rules:
/// - At most `MAX_TAGS` tags.
/// - Each tag must not be empty and must not exceed `MAX_TAG_LEN` characters.
/// - No duplicates.
pub fn validate_tags(tags: &[String]) -> Result<(), CoreError> {
    if tags.len() > MAX_TAGS {
        return Err(CoreError::Validation(format!(
            "A worker may have at most {MAX_TAGS} tags"
        )));
    }
    for (i, tag) in tags.iter().enumerate() {
        if tag.is_empty() {
            return Err(CoreError::Validation(format!(
                "Tag at index {i} must not be empty"
            )));
        }
        if tag.len() > MAX_TAG_LEN {
            return Err(CoreError::Validation(format!(
                "Tag at index {i} exceeds {MAX_TAG_LEN} characters"
            )));
        }
    }

    // Check for duplicates.
    let mut seen = std::collections::HashSet::with_capacity(tags.len());
    for tag in tags {
        if !seen.insert(tag.as_str()) {
            return Err(CoreError::Validation(format!(
                "Duplicate tag: \"{tag}\""
            )));
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- calculate_load_score -------------------------------------------------

    #[test]
    fn load_score_zero_when_idle() {
        assert_eq!(calculate_load_score(0.0, 0), 0.0);
    }

    #[test]
    fn load_score_one_when_fully_loaded() {
        let score = calculate_load_score(100.0, MAX_JOBS_FOR_SCORING);
        assert!((score - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn load_score_clamps_gpu_above_100() {
        let score = calculate_load_score(200.0, 0);
        // GPU clamped to 1.0, jobs = 0 => 0.6 * 1.0 + 0.4 * 0.0 = 0.6
        assert!((score - LOAD_WEIGHT_GPU).abs() < f64::EPSILON);
    }

    #[test]
    fn load_score_half_gpu_no_jobs() {
        let score = calculate_load_score(50.0, 0);
        // 0.6 * 0.5 + 0.4 * 0.0 = 0.3
        assert!((score - 0.3).abs() < f64::EPSILON);
    }

    #[test]
    fn load_score_no_gpu_some_jobs() {
        let score = calculate_load_score(0.0, 4);
        // 0.6 * 0.0 + 0.4 * (4/8) = 0.4 * 0.5 = 0.2
        assert!((score - 0.2).abs() < f64::EPSILON);
    }

    // -- count_matching_tags --------------------------------------------------

    #[test]
    fn matching_tags_all_match() {
        let worker = vec!["gpu".to_string(), "fast".to_string(), "a100".to_string()];
        let required = vec!["gpu".to_string(), "a100".to_string()];
        assert_eq!(count_matching_tags(&worker, &required), 2);
    }

    #[test]
    fn matching_tags_none_match() {
        let worker = vec!["gpu".to_string()];
        let required = vec!["cpu".to_string(), "arm".to_string()];
        assert_eq!(count_matching_tags(&worker, &required), 0);
    }

    #[test]
    fn matching_tags_empty_required() {
        let worker = vec!["gpu".to_string()];
        assert_eq!(count_matching_tags(&worker, &[]), 0);
    }

    // -- validate_worker_name -------------------------------------------------

    #[test]
    fn valid_worker_name() {
        assert!(validate_worker_name("worker-01.prod").is_ok());
    }

    #[test]
    fn empty_worker_name_rejected() {
        assert!(validate_worker_name("").is_err());
    }

    #[test]
    fn worker_name_with_spaces_rejected() {
        assert!(validate_worker_name("worker 01").is_err());
    }

    #[test]
    fn worker_name_too_long_rejected() {
        let name = "a".repeat(MAX_NAME_LEN + 1);
        assert!(validate_worker_name(&name).is_err());
    }

    // -- validate_tags --------------------------------------------------------

    #[test]
    fn valid_tags() {
        let tags = vec!["gpu".to_string(), "a100".to_string()];
        assert!(validate_tags(&tags).is_ok());
    }

    #[test]
    fn empty_tag_rejected() {
        let tags = vec!["gpu".to_string(), "".to_string()];
        assert!(validate_tags(&tags).is_err());
    }

    #[test]
    fn duplicate_tag_rejected() {
        let tags = vec!["gpu".to_string(), "gpu".to_string()];
        assert!(validate_tags(&tags).is_err());
    }

    #[test]
    fn too_many_tags_rejected() {
        let tags: Vec<String> = (0..MAX_TAGS + 1).map(|i| format!("tag-{i}")).collect();
        assert!(validate_tags(&tags).is_err());
    }
}
