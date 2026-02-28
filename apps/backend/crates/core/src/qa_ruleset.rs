//! QA ruleset resolution and A/B testing (PRD-91).
//!
//! Provides threshold layering logic for per-scene-type QA overrides.
//! Resolution order: custom_thresholds > qa_profile > project defaults > studio defaults.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::qa_status::{QA_PASS, QA_WARN};
use crate::quality_gate::evaluate_score;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single metric threshold with warn and fail levels.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MetricThreshold {
    pub warn: f64,
    pub fail: f64,
}

/// Resolved thresholds for all metrics, keyed by check_type name.
pub type ResolvedThresholds = HashMap<String, MetricThreshold>;

// ---------------------------------------------------------------------------
// A/B test result types
// ---------------------------------------------------------------------------

/// Result of A/B threshold testing against historical data.
#[derive(Debug, Serialize)]
pub struct AbTestResult {
    pub total_segments: i64,
    pub current_pass: i64,
    pub current_warn: i64,
    pub current_fail: i64,
    pub proposed_pass: i64,
    pub proposed_warn: i64,
    pub proposed_fail: i64,
    pub per_metric: Vec<MetricAbResult>,
}

/// Per-metric breakdown of A/B threshold test results.
#[derive(Debug, Serialize)]
pub struct MetricAbResult {
    pub check_type: String,
    pub current_pass: i64,
    pub current_warn: i64,
    pub current_fail: i64,
    pub proposed_pass: i64,
    pub proposed_warn: i64,
    pub proposed_fail: i64,
}

// ---------------------------------------------------------------------------
// Threshold resolution
// ---------------------------------------------------------------------------

/// Resolve effective thresholds by merging layers.
///
/// Priority (lowest to highest):
/// 1. Studio defaults
/// 2. Project overrides
/// 3. QA profile thresholds
/// 4. Custom thresholds (highest priority)
pub fn resolve_thresholds(
    studio_defaults: &ResolvedThresholds,
    project_overrides: &ResolvedThresholds,
    profile_thresholds: Option<&ResolvedThresholds>,
    custom_thresholds: Option<&ResolvedThresholds>,
) -> ResolvedThresholds {
    let mut result = studio_defaults.clone();

    // Layer project overrides.
    for (k, v) in project_overrides {
        result.insert(k.clone(), v.clone());
    }

    // Layer profile thresholds.
    if let Some(profile) = profile_thresholds {
        for (k, v) in profile {
            result.insert(k.clone(), v.clone());
        }
    }

    // Layer custom thresholds (highest priority).
    if let Some(custom) = custom_thresholds {
        for (k, v) in custom {
            result.insert(k.clone(), v.clone());
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Score classification
// ---------------------------------------------------------------------------

/// Classify a score against a threshold.
///
/// Returns `QA_PASS` if score >= warn, `QA_WARN` if score >= fail, else `QA_FAIL`.
/// Delegates to `quality_gate::evaluate_score` for the actual classification logic.
pub fn classify_score(score: f64, threshold: &MetricThreshold) -> &'static str {
    evaluate_score(score, threshold.warn, threshold.fail)
}

// ---------------------------------------------------------------------------
// A/B testing
// ---------------------------------------------------------------------------

/// Run A/B comparison of proposed thresholds against historical scores.
///
/// `scores` contains `(check_type, score)` pairs from the `quality_scores` table.
/// For each score, classifies it under both `current` and `proposed` thresholds,
/// then aggregates the results.
pub fn run_ab_test(
    scores: &[(String, f64)],
    current: &ResolvedThresholds,
    proposed: &ResolvedThresholds,
) -> AbTestResult {
    // Collect unique check types that appear in scores.
    let mut metric_names: Vec<String> = scores
        .iter()
        .map(|(ct, _)| ct.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    metric_names.sort();

    // Initialise per-metric counters.
    let mut per_metric: HashMap<String, (i64, i64, i64, i64, i64, i64)> = metric_names
        .iter()
        .map(|name| (name.clone(), (0, 0, 0, 0, 0, 0)))
        .collect();

    // Global counters.
    let mut current_pass: i64 = 0;
    let mut current_warn: i64 = 0;
    let mut current_fail: i64 = 0;
    let mut proposed_pass: i64 = 0;
    let mut proposed_warn: i64 = 0;
    let mut proposed_fail: i64 = 0;

    for (check_type, score) in scores {
        // Classify under current thresholds (default to pass if no threshold defined).
        let cur_class = current
            .get(check_type)
            .map(|t| classify_score(*score, t))
            .unwrap_or(QA_PASS);

        let prop_class = proposed
            .get(check_type)
            .map(|t| classify_score(*score, t))
            .unwrap_or(QA_PASS);

        // Increment globals.
        match cur_class {
            QA_PASS => current_pass += 1,
            QA_WARN => current_warn += 1,
            _ => current_fail += 1,
        }
        match prop_class {
            QA_PASS => proposed_pass += 1,
            QA_WARN => proposed_warn += 1,
            _ => proposed_fail += 1,
        }

        // Increment per-metric.
        if let Some(counters) = per_metric.get_mut(check_type) {
            match cur_class {
                QA_PASS => counters.0 += 1,
                QA_WARN => counters.1 += 1,
                _ => counters.2 += 1,
            }
            match prop_class {
                QA_PASS => counters.3 += 1,
                QA_WARN => counters.4 += 1,
                _ => counters.5 += 1,
            }
        }
    }

    let per_metric_results: Vec<MetricAbResult> = metric_names
        .into_iter()
        .map(|name| {
            let (cp, cw, cf, pp, pw, pf) = per_metric.get(&name).copied().unwrap_or_default();
            MetricAbResult {
                check_type: name,
                current_pass: cp,
                current_warn: cw,
                current_fail: cf,
                proposed_pass: pp,
                proposed_warn: pw,
                proposed_fail: pf,
            }
        })
        .collect();

    AbTestResult {
        total_segments: scores.len() as i64,
        current_pass,
        current_warn,
        current_fail,
        proposed_pass,
        proposed_warn,
        proposed_fail,
        per_metric: per_metric_results,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn threshold(warn: f64, fail: f64) -> MetricThreshold {
        MetricThreshold { warn, fail }
    }

    #[test]
    fn test_resolve_thresholds_layering() {
        let studio: ResolvedThresholds = HashMap::from([
            ("face".into(), threshold(0.7, 0.5)),
            ("motion".into(), threshold(0.6, 0.4)),
        ]);
        let project: ResolvedThresholds = HashMap::from([("face".into(), threshold(0.75, 0.55))]);
        let profile: ResolvedThresholds = HashMap::from([("motion".into(), threshold(0.8, 0.6))]);

        let result = resolve_thresholds(&studio, &project, Some(&profile), None);

        // Face: studio(0.7/0.5) -> project(0.75/0.55) => project wins.
        assert_eq!(result["face"], threshold(0.75, 0.55));
        // Motion: studio(0.6/0.4) -> profile(0.8/0.6) => profile wins.
        assert_eq!(result["motion"], threshold(0.8, 0.6));
    }

    #[test]
    fn test_resolve_thresholds_custom_overrides_profile() {
        let studio: ResolvedThresholds = HashMap::from([("face".into(), threshold(0.7, 0.5))]);
        let project: ResolvedThresholds = HashMap::new();
        let profile: ResolvedThresholds = HashMap::from([("face".into(), threshold(0.8, 0.6))]);
        let custom: ResolvedThresholds = HashMap::from([("face".into(), threshold(0.9, 0.7))]);

        let result = resolve_thresholds(&studio, &project, Some(&profile), Some(&custom));

        // Custom should win over profile.
        assert_eq!(result["face"], threshold(0.9, 0.7));
    }

    #[test]
    fn test_resolve_thresholds_empty_layers() {
        let studio: ResolvedThresholds = HashMap::from([("face".into(), threshold(0.7, 0.5))]);
        let empty: ResolvedThresholds = HashMap::new();

        let result = resolve_thresholds(&studio, &empty, None, None);

        assert_eq!(result.len(), 1);
        assert_eq!(result["face"], threshold(0.7, 0.5));
    }

    #[test]
    fn test_classify_score_pass_warn_fail() {
        let t = threshold(0.8, 0.5);

        assert_eq!(classify_score(0.9, &t), "pass");
        assert_eq!(classify_score(0.8, &t), "pass"); // exactly at warn
        assert_eq!(classify_score(0.7, &t), "warn");
        assert_eq!(classify_score(0.5, &t), "warn"); // exactly at fail
        assert_eq!(classify_score(0.3, &t), "fail");
    }

    #[test]
    fn test_ab_test_basic() {
        let current: ResolvedThresholds = HashMap::from([("face".into(), threshold(0.7, 0.5))]);
        let proposed: ResolvedThresholds = HashMap::from([("face".into(), threshold(0.8, 0.6))]);

        let scores = vec![
            ("face".into(), 0.9),  // current: pass, proposed: pass
            ("face".into(), 0.75), // current: pass, proposed: warn
            ("face".into(), 0.55), // current: warn, proposed: fail
            ("face".into(), 0.4),  // current: fail, proposed: fail
        ];

        let result = run_ab_test(&scores, &current, &proposed);

        assert_eq!(result.total_segments, 4);
        // Current: 2 pass, 1 warn, 1 fail.
        assert_eq!(result.current_pass, 2);
        assert_eq!(result.current_warn, 1);
        assert_eq!(result.current_fail, 1);
        // Proposed: 1 pass, 1 warn, 2 fail.
        assert_eq!(result.proposed_pass, 1);
        assert_eq!(result.proposed_warn, 1);
        assert_eq!(result.proposed_fail, 2);

        // Per-metric.
        assert_eq!(result.per_metric.len(), 1);
        assert_eq!(result.per_metric[0].check_type, "face");
    }
}
