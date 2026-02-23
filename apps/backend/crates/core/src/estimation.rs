//! Cost & resource estimation constants, types, and pure logic (PRD-61).
//!
//! Provides GPU time and disk usage estimation for single scenes and batches,
//! with confidence levels based on the number of calibration samples.

use crate::error::CoreError;
use crate::threshold_validation::validate_count_range;

// ---------------------------------------------------------------------------
// Confidence thresholds
// ---------------------------------------------------------------------------

/// Sample count at or above which confidence is "High".
pub const HIGH_CONFIDENCE_SAMPLES: i32 = 10;
/// Sample count at or above which confidence is "Medium" (below High).
pub const MEDIUM_CONFIDENCE_SAMPLES: i32 = 3;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/// Maximum number of scenes allowed in a single estimation request.
pub const MAX_ESTIMATE_SCENES: usize = 500;

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/// Seconds per hour (3600.0).
pub const SECS_PER_HOUR: f64 = 3600.0;
/// Megabytes per gigabyte (1024.0).
pub const MB_PER_GB: f64 = 1024.0;

// ---------------------------------------------------------------------------
// Confidence enum
// ---------------------------------------------------------------------------

/// Confidence level for an estimate, derived from the number of
/// historical calibration samples available.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EstimateConfidence {
    High,
    Medium,
    Low,
    None,
}

impl EstimateConfidence {
    /// Derive confidence from the number of calibration samples.
    pub fn from_sample_count(count: i32) -> Self {
        if count >= HIGH_CONFIDENCE_SAMPLES {
            Self::High
        } else if count >= MEDIUM_CONFIDENCE_SAMPLES {
            Self::Medium
        } else if count > 0 {
            Self::Low
        } else {
            Self::None
        }
    }

    /// Human-readable label for display in the UI.
    pub fn label(self) -> &'static str {
        match self {
            Self::High => "High",
            Self::Medium => "Medium",
            Self::Low => "Low",
            Self::None => "No estimate available",
        }
    }
}

// ---------------------------------------------------------------------------
// Estimate types
// ---------------------------------------------------------------------------

/// Estimated resource consumption for a single scene.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SceneEstimate {
    pub segments_needed: u32,
    pub gpu_seconds: f64,
    pub disk_mb: f64,
    pub confidence: EstimateConfidence,
}

/// Estimated resource consumption for a batch of scenes, including
/// worker-aware wall-clock time projection.
#[derive(Debug, Clone, serde::Serialize)]
pub struct BatchEstimate {
    pub total_scenes: u32,
    pub total_gpu_hours: f64,
    pub wall_clock_hours: f64,
    pub total_disk_gb: f64,
    pub worker_count: u32,
    pub confidence: EstimateConfidence,
    pub scene_estimates: Vec<SceneEstimate>,
}

// ---------------------------------------------------------------------------
// Estimation logic
// ---------------------------------------------------------------------------

/// Estimate GPU time and disk usage for a single scene.
pub fn estimate_scene(
    segments_needed: u32,
    avg_gpu_secs: f64,
    avg_disk_mb: f64,
    sample_count: i32,
) -> SceneEstimate {
    let gpu_seconds = segments_needed as f64 * avg_gpu_secs;
    let disk_mb = segments_needed as f64 * avg_disk_mb;
    SceneEstimate {
        segments_needed,
        gpu_seconds,
        disk_mb,
        confidence: EstimateConfidence::from_sample_count(sample_count),
    }
}

/// Estimate batch resource consumption with worker-aware wall-clock time.
///
/// Aggregate confidence is the *lowest* confidence across all scenes,
/// ensuring the overall estimate clearly reflects its weakest link.
pub fn estimate_batch(scene_estimates: Vec<SceneEstimate>, worker_count: u32) -> BatchEstimate {
    let total_gpu_secs: f64 = scene_estimates.iter().map(|e| e.gpu_seconds).sum();
    let total_disk_mb: f64 = scene_estimates.iter().map(|e| e.disk_mb).sum();

    let effective_workers = worker_count.max(1) as f64;
    let wall_clock_secs = total_gpu_secs / effective_workers;

    // Aggregate confidence: lowest of all scene estimates.
    let min_confidence = scene_estimates
        .iter()
        .map(|e| e.confidence)
        .min_by_key(|c| match c {
            EstimateConfidence::High => 3,
            EstimateConfidence::Medium => 2,
            EstimateConfidence::Low => 1,
            EstimateConfidence::None => 0,
        })
        .unwrap_or(EstimateConfidence::None);

    BatchEstimate {
        total_scenes: scene_estimates.len() as u32,
        total_gpu_hours: total_gpu_secs / SECS_PER_HOUR,
        wall_clock_hours: wall_clock_secs / SECS_PER_HOUR,
        total_disk_gb: total_disk_mb / MB_PER_GB,
        worker_count,
        confidence: min_confidence,
        scene_estimates,
    }
}

// ---------------------------------------------------------------------------
// Incremental mean
// ---------------------------------------------------------------------------

/// Compute the incremental (online) mean after observing a new value.
///
/// Formula: `new_avg = old_avg + (new_value - old_avg) / new_count`
pub fn incremental_mean(old_avg: f64, new_value: f64, new_count: i32) -> f64 {
    old_avg + (new_value - old_avg) / new_count as f64
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that the number of scenes in an estimation request is within bounds.
///
/// Delegates to [`validate_count_range`] from the shared threshold validation
/// module to avoid structural duplication (DRY-277).
pub fn validate_estimate_count(count: usize) -> Result<(), CoreError> {
    validate_count_range(count, MAX_ESTIMATE_SCENES, "Estimation")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- EstimateConfidence::from_sample_count boundaries --

    #[test]
    fn confidence_none_for_zero_samples() {
        assert_eq!(
            EstimateConfidence::from_sample_count(0),
            EstimateConfidence::None
        );
    }

    #[test]
    fn confidence_low_for_one_sample() {
        assert_eq!(
            EstimateConfidence::from_sample_count(1),
            EstimateConfidence::Low
        );
    }

    #[test]
    fn confidence_low_for_two_samples() {
        assert_eq!(
            EstimateConfidence::from_sample_count(2),
            EstimateConfidence::Low
        );
    }

    #[test]
    fn confidence_medium_at_threshold() {
        assert_eq!(
            EstimateConfidence::from_sample_count(MEDIUM_CONFIDENCE_SAMPLES),
            EstimateConfidence::Medium
        );
    }

    #[test]
    fn confidence_medium_below_high() {
        assert_eq!(
            EstimateConfidence::from_sample_count(HIGH_CONFIDENCE_SAMPLES - 1),
            EstimateConfidence::Medium
        );
    }

    #[test]
    fn confidence_high_at_threshold() {
        assert_eq!(
            EstimateConfidence::from_sample_count(HIGH_CONFIDENCE_SAMPLES),
            EstimateConfidence::High
        );
    }

    #[test]
    fn confidence_high_above_threshold() {
        assert_eq!(
            EstimateConfidence::from_sample_count(100),
            EstimateConfidence::High
        );
    }

    #[test]
    fn confidence_labels() {
        assert_eq!(EstimateConfidence::High.label(), "High");
        assert_eq!(EstimateConfidence::Medium.label(), "Medium");
        assert_eq!(EstimateConfidence::Low.label(), "Low");
        assert_eq!(EstimateConfidence::None.label(), "No estimate available");
    }

    // -- estimate_scene --

    #[test]
    fn scene_estimate_basic() {
        let est = estimate_scene(6, 10.0, 50.0, 15);
        assert_eq!(est.segments_needed, 6);
        assert!((est.gpu_seconds - 60.0).abs() < f64::EPSILON);
        assert!((est.disk_mb - 300.0).abs() < f64::EPSILON);
        assert_eq!(est.confidence, EstimateConfidence::High);
    }

    #[test]
    fn scene_estimate_zero_segments() {
        let est = estimate_scene(0, 10.0, 50.0, 5);
        assert!((est.gpu_seconds - 0.0).abs() < f64::EPSILON);
        assert!((est.disk_mb - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn scene_estimate_no_samples() {
        let est = estimate_scene(4, 10.0, 50.0, 0);
        assert_eq!(est.confidence, EstimateConfidence::None);
    }

    // -- estimate_batch --

    #[test]
    fn batch_estimate_single_scene() {
        let scenes = vec![estimate_scene(6, 10.0, 50.0, 15)];
        let batch = estimate_batch(scenes, 1);

        assert_eq!(batch.total_scenes, 1);
        assert!((batch.total_gpu_hours - 60.0 / SECS_PER_HOUR).abs() < 1e-9);
        assert!((batch.wall_clock_hours - 60.0 / SECS_PER_HOUR).abs() < 1e-9);
        assert!((batch.total_disk_gb - 300.0 / MB_PER_GB).abs() < 1e-9);
        assert_eq!(batch.confidence, EstimateConfidence::High);
    }

    #[test]
    fn batch_estimate_multiple_workers() {
        let scenes = vec![
            estimate_scene(6, 10.0, 50.0, 15),
            estimate_scene(4, 10.0, 50.0, 15),
        ];
        let batch = estimate_batch(scenes, 2);

        let total_gpu_secs = 60.0 + 40.0;
        assert!((batch.total_gpu_hours - total_gpu_secs / SECS_PER_HOUR).abs() < 1e-9);
        // Wall clock should be half of GPU time with 2 workers.
        assert!((batch.wall_clock_hours - total_gpu_secs / 2.0 / SECS_PER_HOUR).abs() < 1e-9);
        assert_eq!(batch.worker_count, 2);
    }

    #[test]
    fn batch_estimate_zero_workers_treated_as_one() {
        let scenes = vec![estimate_scene(6, 10.0, 50.0, 15)];
        let batch = estimate_batch(scenes, 0);

        // 0 workers should be treated as 1.
        assert!((batch.wall_clock_hours - batch.total_gpu_hours).abs() < 1e-9);
    }

    #[test]
    fn batch_estimate_confidence_is_lowest() {
        let scenes = vec![
            estimate_scene(6, 10.0, 50.0, 15),  // High
            estimate_scene(4, 10.0, 50.0, 2),   // Low
        ];
        let batch = estimate_batch(scenes, 1);
        assert_eq!(batch.confidence, EstimateConfidence::Low);
    }

    #[test]
    fn batch_estimate_empty_scenes() {
        let batch = estimate_batch(vec![], 1);
        assert_eq!(batch.total_scenes, 0);
        assert_eq!(batch.confidence, EstimateConfidence::None);
    }

    // -- incremental_mean --

    #[test]
    fn incremental_mean_first_sample() {
        // old_avg=0, new_value=10, count=1 -> 10
        let result = incremental_mean(0.0, 10.0, 1);
        assert!((result - 10.0).abs() < f64::EPSILON);
    }

    #[test]
    fn incremental_mean_second_sample() {
        // old_avg=10, new_value=20, count=2 -> 15
        let result = incremental_mean(10.0, 20.0, 2);
        assert!((result - 15.0).abs() < f64::EPSILON);
    }

    #[test]
    fn incremental_mean_stable() {
        // old_avg=10, new_value=10, count=5 -> 10
        let result = incremental_mean(10.0, 10.0, 5);
        assert!((result - 10.0).abs() < f64::EPSILON);
    }

    #[test]
    fn incremental_mean_three_values() {
        // Simulate 3 values: 10, 20, 30. Expected mean = 20.
        let avg1 = incremental_mean(0.0, 10.0, 1);
        let avg2 = incremental_mean(avg1, 20.0, 2);
        let avg3 = incremental_mean(avg2, 30.0, 3);
        assert!((avg3 - 20.0).abs() < f64::EPSILON);
    }

    // -- validate_estimate_count --

    #[test]
    fn validate_count_zero_rejected() {
        assert!(validate_estimate_count(0).is_err());
    }

    #[test]
    fn validate_count_one_accepted() {
        assert!(validate_estimate_count(1).is_ok());
    }

    #[test]
    fn validate_count_max_accepted() {
        assert!(validate_estimate_count(MAX_ESTIMATE_SCENES).is_ok());
    }

    #[test]
    fn validate_count_over_max_rejected() {
        assert!(validate_estimate_count(MAX_ESTIMATE_SCENES + 1).is_err());
    }
}
