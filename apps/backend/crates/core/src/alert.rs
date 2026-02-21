//! Hardware metric alert types for threshold violation notifications (PRD-06).

use serde::Serialize;

use crate::types::{DbId, Timestamp};

/// Severity level for a metric threshold violation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertLevel {
    /// Value exceeded the warning threshold but not the critical threshold.
    Warning,
    /// Value exceeded the critical threshold.
    Critical,
}

/// A single metric threshold violation for a worker GPU.
#[derive(Debug, Clone, Serialize)]
pub struct MetricAlert {
    /// The worker whose GPU triggered the alert.
    pub worker_id: DbId,
    /// GPU index on the worker (0-based).
    pub gpu_index: i16,
    /// Canonical metric name (see [`crate::metric_names`]).
    pub metric_name: String,
    /// The observed metric value that triggered the alert.
    pub current_value: i32,
    /// The threshold value that was exceeded.
    pub threshold_value: i32,
    /// Whether this is a warning or critical alert.
    pub level: AlertLevel,
    /// When the metric was recorded.
    pub timestamp: Timestamp,
}
