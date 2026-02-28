//! Smart Auto-Retry: parameter jitter, best-of-N selection, and retry
//! decision logic (PRD-71).
//!
//! This module is pure logic with no database or I/O dependencies.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Policy constraints (canonical source -- frontend mirrors these)
// ---------------------------------------------------------------------------

/// Minimum allowed value for `max_attempts` on a retry policy.
pub const MIN_RETRY_ATTEMPTS: i32 = 1;
/// Maximum allowed value for `max_attempts` on a retry policy.
pub const MAX_RETRY_ATTEMPTS: i32 = 10;

// ---------------------------------------------------------------------------
// Retry attempt status
// ---------------------------------------------------------------------------

/// Lifecycle states for a single retry attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetryAttemptStatus {
    Pending,
    Generating,
    QaRunning,
    Passed,
    Failed,
    Selected,
}

impl RetryAttemptStatus {
    /// Database-stored string representation.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Generating => "generating",
            Self::QaRunning => "qa_running",
            Self::Passed => "passed",
            Self::Failed => "failed",
            Self::Selected => "selected",
        }
    }

    /// Parse from database string. Returns `None` for unknown values.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Self::Pending),
            "generating" => Some(Self::Generating),
            "qa_running" => Some(Self::QaRunning),
            "passed" => Some(Self::Passed),
            "failed" => Some(Self::Failed),
            "selected" => Some(Self::Selected),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Configuration structs
// ---------------------------------------------------------------------------

/// Controls how parameters are jittered between retry attempts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitterConfig {
    /// Maximum +/- jitter applied to `cfg_scale` (e.g. 0.5 means +/-0.5).
    pub cfg_jitter_range: f64,
    /// Whether to generate a fresh random seed on each retry.
    pub seed_variation: bool,
    /// Optional per-parameter jitter ranges (key = param name, value = +/- range).
    pub custom_ranges: HashMap<String, f64>,
}

/// Retry policy as configured on a scene type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub enabled: bool,
    pub max_attempts: i32,
    /// Which QA check names must fail to trigger a retry.
    pub trigger_checks: Vec<String>,
    pub seed_variation: bool,
    /// Maximum +/- jitter on `cfg_scale`.
    pub cfg_jitter: f64,
}

// ---------------------------------------------------------------------------
// Retry decision
// ---------------------------------------------------------------------------

/// The result of evaluating whether another retry should be attempted.
#[derive(Debug, Clone, PartialEq)]
pub enum RetryDecision {
    /// Retry with the given attempt number and jittered parameters.
    Retry {
        attempt_number: i32,
        seed: i64,
        parameters: serde_json::Value,
    },
    /// All attempts exhausted or no passing attempt; escalate to human review.
    Escalate {
        total_attempts: i32,
        all_scores: Vec<serde_json::Value>,
    },
    /// Already at the maximum number of attempts.
    AlreadyMaxed,
}

/// Score data for a single retry attempt, used by the best-of-N selector.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryAttemptScore {
    /// Overall status string (should be "passed" to be eligible).
    pub status: String,
    /// Aggregate quality score (higher is better).
    pub quality_score: f64,
    /// Full quality scores JSON for reporting.
    pub quality_scores: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Parameter jitter engine
// ---------------------------------------------------------------------------

/// Apply jitter to generation parameters, producing a new parameter set.
///
/// Modifies `cfg_scale` and `denoise_strength` (if present) by a random
/// amount within `config.cfg_jitter_range`, and generates a new seed if
/// `config.seed_variation` is true.
pub fn jitter_parameters(original: &serde_json::Value, config: &JitterConfig) -> serde_json::Value {
    let mut params = original.clone();

    if let Some(obj) = params.as_object_mut() {
        // Jitter cfg_scale.
        if config.cfg_jitter_range > 0.0 {
            jitter_float_field(obj, "cfg_scale", config.cfg_jitter_range);
        }

        // Jitter denoise_strength with the same range.
        if config.cfg_jitter_range > 0.0 {
            jitter_float_field(obj, "denoise_strength", config.cfg_jitter_range);
        }

        // Apply custom per-parameter jitter.
        for (key, range) in &config.custom_ranges {
            if *range > 0.0 {
                jitter_float_field(obj, key, *range);
            }
        }

        // Generate a new seed if configured.
        if config.seed_variation {
            let new_seed = rand::random::<u32>() as i64;
            obj.insert("seed".to_string(), serde_json::json!(new_seed));
        }
    }

    params
}

/// Jitter a single float field by +/- `range`. Clamps result to >= 0.
fn jitter_float_field(obj: &mut serde_json::Map<String, serde_json::Value>, key: &str, range: f64) {
    if let Some(val) = obj.get(key).and_then(|v| v.as_f64()) {
        // Random value in [-range, +range].
        let delta = (rand::random::<f64>() * 2.0 - 1.0) * range;
        let jittered = (val + delta).max(0.0);
        obj.insert(key.to_string(), serde_json::json!(jittered));
    }
}

// ---------------------------------------------------------------------------
// Best-of-N selector
// ---------------------------------------------------------------------------

/// Select the best passing attempt by highest quality score.
///
/// Returns the index of the best attempt within the slice, or `None` if
/// no attempt has status "passed".
pub fn select_best_attempt(attempts: &[RetryAttemptScore]) -> Option<usize> {
    attempts
        .iter()
        .enumerate()
        .filter(|(_, a)| a.status == RetryAttemptStatus::Passed.as_str())
        .max_by(|(_, a), (_, b)| {
            a.quality_score
                .partial_cmp(&b.quality_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(idx, _)| idx)
}

// ---------------------------------------------------------------------------
// Retry decision logic
// ---------------------------------------------------------------------------

/// Determine whether a retry should be attempted based on the policy,
/// current attempt count, and which QA checks failed.
///
/// Returns `AlreadyMaxed` if `current_attempt >= max_attempts`,
/// `Retry` if any `failure_checks` overlap with `policy.trigger_checks`,
/// or `Escalate` otherwise.
pub fn should_retry(
    policy: &RetryPolicy,
    current_attempt: i32,
    failure_checks: &[String],
    original_params: &serde_json::Value,
    existing_scores: &[serde_json::Value],
) -> RetryDecision {
    if !policy.enabled {
        return RetryDecision::Escalate {
            total_attempts: current_attempt,
            all_scores: existing_scores.to_vec(),
        };
    }

    if current_attempt >= policy.max_attempts {
        return RetryDecision::AlreadyMaxed;
    }

    // Check if any failed checks match the trigger checks.
    let should_trigger = failure_checks
        .iter()
        .any(|fc| policy.trigger_checks.iter().any(|tc| tc == fc));

    if !should_trigger {
        return RetryDecision::Escalate {
            total_attempts: current_attempt,
            all_scores: existing_scores.to_vec(),
        };
    }

    // Build jitter config from policy.
    let config = JitterConfig {
        cfg_jitter_range: policy.cfg_jitter,
        seed_variation: policy.seed_variation,
        custom_ranges: HashMap::new(),
    };

    let jittered = jitter_parameters(original_params, &config);
    let seed = jittered
        .get("seed")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| rand::random::<u32>() as i64);

    RetryDecision::Retry {
        attempt_number: current_attempt + 1,
        seed,
        parameters: jittered,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retry_attempt_status_roundtrip() {
        let statuses = [
            RetryAttemptStatus::Pending,
            RetryAttemptStatus::Generating,
            RetryAttemptStatus::QaRunning,
            RetryAttemptStatus::Passed,
            RetryAttemptStatus::Failed,
            RetryAttemptStatus::Selected,
        ];
        for status in statuses {
            let s = status.as_str();
            let parsed = RetryAttemptStatus::from_str(s);
            assert_eq!(parsed, Some(status));
        }
        assert_eq!(RetryAttemptStatus::from_str("unknown"), None);
    }

    #[test]
    fn test_jitter_parameters_modifies_cfg_scale() {
        let original = serde_json::json!({
            "cfg_scale": 7.0,
            "seed": 12345,
            "steps": 20
        });
        let config = JitterConfig {
            cfg_jitter_range: 1.0,
            seed_variation: false,
            custom_ranges: HashMap::new(),
        };

        let jittered = jitter_parameters(&original, &config);
        let cfg = jittered.get("cfg_scale").unwrap().as_f64().unwrap();

        // cfg_scale should be within [6.0, 8.0] (original 7.0 +/- 1.0).
        assert!(cfg >= 6.0 && cfg <= 8.0, "cfg_scale out of range: {cfg}");
        // steps should be unchanged (not a jittered field).
        assert_eq!(jittered.get("steps").unwrap().as_i64(), Some(20));
        // seed should be unchanged since seed_variation is false.
        assert_eq!(jittered.get("seed").unwrap().as_i64(), Some(12345));
    }

    #[test]
    fn test_jitter_parameters_new_seed() {
        let original = serde_json::json!({
            "cfg_scale": 7.0,
            "seed": 12345
        });
        let config = JitterConfig {
            cfg_jitter_range: 0.0,
            seed_variation: true,
            custom_ranges: HashMap::new(),
        };

        let jittered = jitter_parameters(&original, &config);
        let seed = jittered.get("seed").unwrap().as_i64().unwrap();

        // New seed should have been generated (extremely unlikely to be same).
        // We just check it exists and is non-negative.
        assert!(seed >= 0);
    }

    #[test]
    fn test_jitter_clamps_negative() {
        let original = serde_json::json!({
            "cfg_scale": 0.1,
            "denoise_strength": 0.05
        });
        let config = JitterConfig {
            cfg_jitter_range: 5.0, // Large range to force potential negative.
            seed_variation: false,
            custom_ranges: HashMap::new(),
        };

        let jittered = jitter_parameters(&original, &config);
        let cfg = jittered.get("cfg_scale").unwrap().as_f64().unwrap();
        let denoise = jittered.get("denoise_strength").unwrap().as_f64().unwrap();

        assert!(cfg >= 0.0, "cfg_scale should be clamped to >= 0");
        assert!(denoise >= 0.0, "denoise_strength should be clamped to >= 0");
    }

    #[test]
    fn test_select_best_attempt_picks_highest_passing() {
        let attempts = vec![
            RetryAttemptScore {
                status: "failed".to_string(),
                quality_score: 0.9,
                quality_scores: serde_json::json!({}),
            },
            RetryAttemptScore {
                status: "passed".to_string(),
                quality_score: 0.7,
                quality_scores: serde_json::json!({}),
            },
            RetryAttemptScore {
                status: "passed".to_string(),
                quality_score: 0.85,
                quality_scores: serde_json::json!({}),
            },
        ];

        let best = select_best_attempt(&attempts);
        assert_eq!(best, Some(2)); // Index 2 has highest passing score (0.85).
    }

    #[test]
    fn test_select_best_attempt_no_passing() {
        let attempts = vec![
            RetryAttemptScore {
                status: "failed".to_string(),
                quality_score: 0.9,
                quality_scores: serde_json::json!({}),
            },
            RetryAttemptScore {
                status: "failed".to_string(),
                quality_score: 0.7,
                quality_scores: serde_json::json!({}),
            },
        ];

        assert_eq!(select_best_attempt(&attempts), None);
    }

    #[test]
    fn test_select_best_attempt_empty() {
        assert_eq!(select_best_attempt(&[]), None);
    }

    #[test]
    fn test_should_retry_disabled_policy() {
        let policy = RetryPolicy {
            enabled: false,
            max_attempts: 5,
            trigger_checks: vec!["face_confidence".to_string()],
            seed_variation: true,
            cfg_jitter: 0.5,
        };
        let result = should_retry(
            &policy,
            1,
            &["face_confidence".to_string()],
            &serde_json::json!({}),
            &[],
        );
        assert!(matches!(result, RetryDecision::Escalate { .. }));
    }

    #[test]
    fn test_should_retry_maxed_out() {
        let policy = RetryPolicy {
            enabled: true,
            max_attempts: 3,
            trigger_checks: vec!["face_confidence".to_string()],
            seed_variation: true,
            cfg_jitter: 0.5,
        };
        let result = should_retry(
            &policy,
            3,
            &["face_confidence".to_string()],
            &serde_json::json!({}),
            &[],
        );
        assert_eq!(result, RetryDecision::AlreadyMaxed);
    }

    #[test]
    fn test_should_retry_no_matching_checks() {
        let policy = RetryPolicy {
            enabled: true,
            max_attempts: 5,
            trigger_checks: vec!["face_confidence".to_string()],
            seed_variation: true,
            cfg_jitter: 0.5,
        };
        // Failed on "motion" but policy only triggers on "face_confidence".
        let result = should_retry(
            &policy,
            1,
            &["motion".to_string()],
            &serde_json::json!({}),
            &[],
        );
        assert!(matches!(result, RetryDecision::Escalate { .. }));
    }

    #[test]
    fn test_should_retry_triggers_retry() {
        let policy = RetryPolicy {
            enabled: true,
            max_attempts: 5,
            trigger_checks: vec!["face_confidence".to_string()],
            seed_variation: true,
            cfg_jitter: 0.5,
        };
        let original = serde_json::json!({ "cfg_scale": 7.0, "seed": 100 });
        let result = should_retry(&policy, 2, &["face_confidence".to_string()], &original, &[]);
        match result {
            RetryDecision::Retry {
                attempt_number,
                seed,
                parameters,
            } => {
                assert_eq!(attempt_number, 3);
                assert!(seed >= 0);
                // Parameters should have a cfg_scale.
                assert!(parameters.get("cfg_scale").is_some());
            }
            other => panic!("Expected Retry, got {other:?}"),
        }
    }
}
