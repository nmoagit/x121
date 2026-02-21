//! Threshold evaluation engine for GPU metrics (PRD-06).
//!
//! Pure logic — no database access. The caller is responsible for fetching
//! metrics and thresholds from the DB and passing them in.

use std::collections::HashMap;
use std::time::Duration;

use chrono::{DateTime, Utc};

use crate::alert::{AlertLevel, MetricAlert};
use crate::metric_names::{METRIC_TEMPERATURE, METRIC_UTILIZATION, METRIC_VRAM_USED_PERCENT};
use crate::types::{DbId, Timestamp};

/// Minimum interval between repeated alerts for the same worker + metric.
const ALERT_COOLDOWN: Duration = Duration::from_secs(300); // 5 minutes

/// A threshold definition used by the evaluator.
#[derive(Debug, Clone)]
pub struct Threshold {
    pub metric_name: String,
    pub warning_value: i32,
    pub critical_value: i32,
}

/// A single GPU metric snapshot used by the evaluator.
#[derive(Debug, Clone)]
pub struct GpuSnapshot {
    pub worker_id: DbId,
    pub gpu_index: i16,
    pub vram_used_mb: Option<i32>,
    pub vram_total_mb: Option<i32>,
    pub temperature_celsius: Option<i16>,
    pub utilization_percent: Option<i16>,
    pub recorded_at: Timestamp,
}

/// Composite key for alert cooldown tracking: (worker_id, gpu_index, metric_name).
type CooldownKey = (DbId, i16, String);

/// Tracks when the last alert was emitted per worker + GPU + metric to suppress
/// repeated alerts within the cooldown window.
#[derive(Debug, Default)]
pub struct AlertCooldownTracker {
    last_alert: HashMap<CooldownKey, DateTime<Utc>>,
}

impl AlertCooldownTracker {
    /// Create a new, empty cooldown tracker.
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if an alert is allowed (not within cooldown) and record it if so.
    ///
    /// Returns `true` if the alert should be emitted.
    fn should_alert(&mut self, key: &CooldownKey, now: DateTime<Utc>) -> bool {
        if let Some(last) = self.last_alert.get(key) {
            let elapsed = now.signed_duration_since(*last);
            if elapsed < chrono::Duration::from_std(ALERT_COOLDOWN).expect("valid duration") {
                return false;
            }
        }
        self.last_alert.insert(key.clone(), now);
        true
    }
}

/// Evaluate a batch of GPU snapshots against thresholds and return any violations.
///
/// The `cooldown` tracker is updated in place so the caller can persist it
/// across invocations (e.g. in an `Arc<Mutex<AlertCooldownTracker>>`).
pub fn evaluate(
    snapshots: &[GpuSnapshot],
    thresholds: &[Threshold],
    cooldown: &mut AlertCooldownTracker,
) -> Vec<MetricAlert> {
    let now = Utc::now();
    let threshold_map: HashMap<&str, &Threshold> = thresholds
        .iter()
        .map(|t| (t.metric_name.as_str(), t))
        .collect();

    let mut alerts = Vec::new();

    for snap in snapshots {
        // Temperature check.
        if let (Some(temp), Some(threshold)) = (
            snap.temperature_celsius,
            threshold_map.get(METRIC_TEMPERATURE),
        ) {
            check_threshold(
                snap,
                METRIC_TEMPERATURE,
                i32::from(temp),
                threshold,
                cooldown,
                now,
                &mut alerts,
            );
        }

        // Utilization check.
        if let (Some(util), Some(threshold)) = (
            snap.utilization_percent,
            threshold_map.get(METRIC_UTILIZATION),
        ) {
            check_threshold(
                snap,
                METRIC_UTILIZATION,
                i32::from(util),
                threshold,
                cooldown,
                now,
                &mut alerts,
            );
        }

        // VRAM used percent (computed).
        if let (Some(used), Some(total), Some(threshold)) = (
            snap.vram_used_mb,
            snap.vram_total_mb,
            threshold_map.get(METRIC_VRAM_USED_PERCENT),
        ) {
            if total > 0 {
                let percent = (used * 100) / total;
                check_threshold(
                    snap,
                    METRIC_VRAM_USED_PERCENT,
                    percent,
                    threshold,
                    cooldown,
                    now,
                    &mut alerts,
                );
            }
        }
    }

    alerts
}

/// Compare a single metric value against a threshold and push an alert if violated.
fn check_threshold(
    snap: &GpuSnapshot,
    metric_name: &str,
    value: i32,
    threshold: &Threshold,
    cooldown: &mut AlertCooldownTracker,
    now: DateTime<Utc>,
    alerts: &mut Vec<MetricAlert>,
) {
    let (level, threshold_value) = if value >= threshold.critical_value {
        (AlertLevel::Critical, threshold.critical_value)
    } else if value >= threshold.warning_value {
        (AlertLevel::Warning, threshold.warning_value)
    } else {
        return; // within normal range
    };

    let key = (snap.worker_id, snap.gpu_index, metric_name.to_string());
    if !cooldown.should_alert(&key, now) {
        return;
    }

    alerts.push(MetricAlert {
        worker_id: snap.worker_id,
        gpu_index: snap.gpu_index,
        metric_name: metric_name.to_string(),
        current_value: value,
        threshold_value,
        level,
        timestamp: snap.recorded_at,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_snapshot(
        worker_id: DbId,
        temp: i16,
        util: i16,
        vram_used: i32,
        vram_total: i32,
    ) -> GpuSnapshot {
        GpuSnapshot {
            worker_id,
            gpu_index: 0,
            vram_used_mb: Some(vram_used),
            vram_total_mb: Some(vram_total),
            temperature_celsius: Some(temp),
            utilization_percent: Some(util),
            recorded_at: Utc::now(),
        }
    }

    fn default_thresholds() -> Vec<Threshold> {
        vec![
            Threshold {
                metric_name: METRIC_TEMPERATURE.to_string(),
                warning_value: 80,
                critical_value: 90,
            },
            Threshold {
                metric_name: METRIC_UTILIZATION.to_string(),
                warning_value: 90,
                critical_value: 98,
            },
            Threshold {
                metric_name: METRIC_VRAM_USED_PERCENT.to_string(),
                warning_value: 85,
                critical_value: 95,
            },
        ]
    }

    #[test]
    fn no_alerts_when_within_thresholds() {
        let mut cooldown = AlertCooldownTracker::new();
        let snaps = vec![make_snapshot(1, 70, 50, 4000, 16000)];
        let alerts = evaluate(&snaps, &default_thresholds(), &mut cooldown);
        assert!(alerts.is_empty());
    }

    #[test]
    fn warning_alert_on_high_temperature() {
        let mut cooldown = AlertCooldownTracker::new();
        let snaps = vec![make_snapshot(1, 85, 50, 4000, 16000)];
        let alerts = evaluate(&snaps, &default_thresholds(), &mut cooldown);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].metric_name, METRIC_TEMPERATURE);
        assert_eq!(alerts[0].level, AlertLevel::Warning);
    }

    #[test]
    fn critical_alert_on_very_high_temperature() {
        let mut cooldown = AlertCooldownTracker::new();
        let snaps = vec![make_snapshot(1, 95, 50, 4000, 16000)];
        let alerts = evaluate(&snaps, &default_thresholds(), &mut cooldown);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].metric_name, METRIC_TEMPERATURE);
        assert_eq!(alerts[0].level, AlertLevel::Critical);
    }

    #[test]
    fn multiple_alerts_from_single_snapshot() {
        let mut cooldown = AlertCooldownTracker::new();
        // High temp + high VRAM
        let snaps = vec![make_snapshot(1, 92, 50, 15500, 16000)];
        let alerts = evaluate(&snaps, &default_thresholds(), &mut cooldown);
        assert_eq!(alerts.len(), 2);
    }

    #[test]
    fn cooldown_suppresses_repeated_alerts() {
        let mut cooldown = AlertCooldownTracker::new();
        let snaps = vec![make_snapshot(1, 85, 50, 4000, 16000)];

        let alerts1 = evaluate(&snaps, &default_thresholds(), &mut cooldown);
        assert_eq!(alerts1.len(), 1);

        // Same evaluation immediately — should be suppressed.
        let alerts2 = evaluate(&snaps, &default_thresholds(), &mut cooldown);
        assert!(alerts2.is_empty());
    }

    #[test]
    fn vram_percent_computed_correctly() {
        let mut cooldown = AlertCooldownTracker::new();
        // 14400 / 16000 = 90% -> warning (>= 85, < 95)
        let snaps = vec![make_snapshot(1, 50, 50, 14400, 16000)];
        let alerts = evaluate(&snaps, &default_thresholds(), &mut cooldown);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].metric_name, METRIC_VRAM_USED_PERCENT);
        assert_eq!(alerts[0].level, AlertLevel::Warning);
        assert_eq!(alerts[0].current_value, 90);
    }
}
