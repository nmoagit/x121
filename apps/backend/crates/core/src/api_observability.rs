//! API Usage & Observability constants, types, and pure business logic (PRD-106).
//!
//! All functions in this module are pure (no database dependencies) and operate
//! on in-memory data structures. The database layer uses these types and helpers
//! for metrics aggregation, spike detection, and heatmap normalization.

use std::collections::HashMap;

use serde::Serialize;

use crate::types::DbId;

// ---------------------------------------------------------------------------
// Granularity constants
// ---------------------------------------------------------------------------

/// 1-minute aggregation granularity.
pub const GRANULARITY_1M: &str = "1m";
/// 5-minute aggregation granularity.
pub const GRANULARITY_5M: &str = "5m";
/// 1-hour aggregation granularity.
pub const GRANULARITY_1H: &str = "1h";
/// 1-day aggregation granularity.
pub const GRANULARITY_1D: &str = "1d";

/// All valid granularity values.
pub const VALID_GRANULARITIES: &[&str] = &[
    GRANULARITY_1M,
    GRANULARITY_5M,
    GRANULARITY_1H,
    GRANULARITY_1D,
];

// ---------------------------------------------------------------------------
// Alert type constants
// ---------------------------------------------------------------------------

/// Alert type for error rate spikes.
pub const ALERT_TYPE_ERROR_RATE: &str = "error_rate";
/// Alert type for response time spikes.
pub const ALERT_TYPE_RESPONSE_TIME: &str = "response_time";
/// Alert type for rate limit proximity.
pub const ALERT_TYPE_RATE_LIMIT: &str = "rate_limit";

/// All valid alert types.
pub const VALID_ALERT_TYPES: &[&str] = &[
    ALERT_TYPE_ERROR_RATE,
    ALERT_TYPE_RESPONSE_TIME,
    ALERT_TYPE_RATE_LIMIT,
];

// ---------------------------------------------------------------------------
// Comparison operator constants
// ---------------------------------------------------------------------------

/// Greater than.
pub const COMPARISON_GT: &str = "gt";
/// Less than.
pub const COMPARISON_LT: &str = "lt";
/// Greater than or equal to.
pub const COMPARISON_GTE: &str = "gte";
/// Less than or equal to.
pub const COMPARISON_LTE: &str = "lte";

/// All valid comparison operators.
pub const VALID_COMPARISONS: &[&str] =
    &[COMPARISON_GT, COMPARISON_LT, COMPARISON_GTE, COMPARISON_LTE];

// ---------------------------------------------------------------------------
// Retention constants
// ---------------------------------------------------------------------------

/// Retention period for 1-minute granularity data, in hours.
pub const RETENTION_1M_HOURS: i64 = 24;
/// Retention period for 5-minute granularity data, in days.
pub const RETENTION_5M_DAYS: i64 = 7;
/// Retention period for 1-hour granularity data, in days.
pub const RETENTION_1H_DAYS: i64 = 90;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single raw API request metric, captured by middleware.
#[derive(Debug, Clone)]
pub struct RequestMetric {
    /// The endpoint path (e.g. "/api/v1/characters").
    pub endpoint: String,
    /// HTTP method (GET, POST, etc.).
    pub http_method: String,
    /// The API key ID, if the request was authenticated via API key.
    pub api_key_id: Option<DbId>,
    /// HTTP response status code.
    pub response_status: u16,
    /// Response time in milliseconds.
    pub response_time_ms: f64,
    /// Request body size in bytes.
    pub request_bytes: i64,
    /// Response body size in bytes.
    pub response_bytes: i64,
    /// When the request was made.
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// An aggregated metrics bucket for a specific (endpoint, method, api_key, minute).
#[derive(Debug, Clone, Serialize)]
pub struct MetricsBucket {
    /// Start of the time period.
    pub period_start: chrono::DateTime<chrono::Utc>,
    /// Granularity of this bucket.
    pub period_granularity: String,
    /// Endpoint path.
    pub endpoint: String,
    /// HTTP method.
    pub http_method: String,
    /// API key ID (None for unauthenticated).
    pub api_key_id: Option<DbId>,
    /// Total request count.
    pub request_count: i32,
    /// Count of 4xx responses.
    pub error_count_4xx: i32,
    /// Count of 5xx responses.
    pub error_count_5xx: i32,
    /// 50th percentile response time in ms.
    pub response_time_p50_ms: f64,
    /// 95th percentile response time in ms.
    pub response_time_p95_ms: f64,
    /// 99th percentile response time in ms.
    pub response_time_p99_ms: f64,
    /// Average response time in ms.
    pub response_time_avg_ms: f64,
    /// Total request body bytes.
    pub total_request_bytes: i64,
    /// Total response body bytes.
    pub total_response_bytes: i64,
}

/// A single cell in a heatmap grid (endpoint x time bucket).
#[derive(Debug, Clone, Serialize)]
pub struct HeatmapCell {
    /// The endpoint path.
    pub endpoint: String,
    /// The time bucket label (ISO 8601 string).
    pub time_bucket: String,
    /// Number of requests in this cell.
    pub request_count: i64,
    /// Normalized intensity (0.0 to 1.0) relative to the maximum cell.
    pub intensity: f32,
}

/// Result of checking whether a metric exceeds an alert threshold.
#[derive(Debug, Clone, Serialize)]
pub struct SpikeCheck {
    /// The alert configuration that triggered this check.
    pub alert_config_id: DbId,
    /// The current measured value.
    pub current_value: f64,
    /// The configured threshold value.
    pub threshold_value: f64,
    /// The comparison operator (gt, lt, gte, lte).
    pub comparison: String,
    /// Whether the threshold was exceeded.
    pub exceeded: bool,
    /// Human-readable message describing the result.
    pub message: String,
}

// ---------------------------------------------------------------------------
// Aggregation bucket key
// ---------------------------------------------------------------------------

/// Unique key for grouping metrics into buckets.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct BucketKey {
    endpoint: String,
    http_method: String,
    api_key_id: Option<DbId>,
    minute: chrono::DateTime<chrono::Utc>,
}

// ---------------------------------------------------------------------------
// Aggregation functions
// ---------------------------------------------------------------------------

/// Truncate a timestamp to the start of its containing minute.
fn truncate_to_minute(ts: chrono::DateTime<chrono::Utc>) -> chrono::DateTime<chrono::Utc> {
    use chrono::Timelike;
    ts.with_second(0)
        .and_then(|t| t.with_nanosecond(0))
        .unwrap_or(ts)
}

/// Aggregate raw request metrics into per-minute buckets.
///
/// Groups by (endpoint, method, api_key_id, truncated minute) and computes
/// counts, error counts, percentiles, averages, and byte totals.
pub fn aggregate_metrics(metrics: &[RequestMetric]) -> Vec<MetricsBucket> {
    let mut groups: HashMap<BucketKey, Vec<&RequestMetric>> = HashMap::new();

    for m in metrics {
        let key = BucketKey {
            endpoint: m.endpoint.clone(),
            http_method: m.http_method.clone(),
            api_key_id: m.api_key_id,
            minute: truncate_to_minute(m.timestamp),
        };
        groups.entry(key).or_default().push(m);
    }

    let mut buckets = Vec::with_capacity(groups.len());
    for (key, group) in groups {
        let request_count = group.len() as i32;
        let error_count_4xx = group
            .iter()
            .filter(|m| (400..500).contains(&m.response_status))
            .count() as i32;
        let error_count_5xx = group
            .iter()
            .filter(|m| (500..600).contains(&m.response_status))
            .count() as i32;

        let times: Vec<f64> = group.iter().map(|m| m.response_time_ms).collect();
        let (p50, p95, p99) = compute_percentiles(&times);
        let avg = if times.is_empty() {
            0.0
        } else {
            times.iter().sum::<f64>() / times.len() as f64
        };

        let total_request_bytes: i64 = group.iter().map(|m| m.request_bytes).sum();
        let total_response_bytes: i64 = group.iter().map(|m| m.response_bytes).sum();

        buckets.push(MetricsBucket {
            period_start: key.minute,
            period_granularity: GRANULARITY_1M.to_string(),
            endpoint: key.endpoint,
            http_method: key.http_method,
            api_key_id: key.api_key_id,
            request_count,
            error_count_4xx,
            error_count_5xx,
            response_time_p50_ms: p50,
            response_time_p95_ms: p95,
            response_time_p99_ms: p99,
            response_time_avg_ms: avg,
            total_request_bytes,
            total_response_bytes,
        });
    }

    // Sort for deterministic output.
    buckets.sort_by(|a, b| {
        a.period_start
            .cmp(&b.period_start)
            .then_with(|| a.endpoint.cmp(&b.endpoint))
            .then_with(|| a.http_method.cmp(&b.http_method))
    });

    buckets
}

/// Compute percentiles (p50, p95, p99) from a slice of values using a
/// simple sorting approach.
///
/// Returns `(0.0, 0.0, 0.0)` for an empty slice.
pub fn compute_percentiles(values: &[f64]) -> (f64, f64, f64) {
    if values.is_empty() {
        return (0.0, 0.0, 0.0);
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let p50 = percentile_value(&sorted, 50.0);
    let p95 = percentile_value(&sorted, 95.0);
    let p99 = percentile_value(&sorted, 99.0);

    (p50, p95, p99)
}

/// Compute the value at a given percentile from a sorted slice using
/// linear interpolation.
fn percentile_value(sorted: &[f64], pct: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }

    let rank = (pct / 100.0) * (sorted.len() - 1) as f64;
    let lower = rank.floor() as usize;
    let upper = rank.ceil() as usize;

    if lower == upper {
        sorted[lower]
    } else {
        let frac = rank - lower as f64;
        sorted[lower] * (1.0 - frac) + sorted[upper] * frac
    }
}

// ---------------------------------------------------------------------------
// Heatmap normalization
// ---------------------------------------------------------------------------

/// Normalize heatmap cell intensities to the range 0.0..=1.0 relative to
/// the maximum request count across all cells.
///
/// If all cells have zero requests (or the slice is empty), intensity is set
/// to 0.0 for every cell.
pub fn normalize_heatmap(cells: &mut [HeatmapCell]) {
    let max_count = cells.iter().map(|c| c.request_count).max().unwrap_or(0);
    if max_count == 0 {
        for cell in cells.iter_mut() {
            cell.intensity = 0.0;
        }
        return;
    }
    for cell in cells.iter_mut() {
        cell.intensity = cell.request_count as f32 / max_count as f32;
    }
}

// ---------------------------------------------------------------------------
// Spike detection
// ---------------------------------------------------------------------------

/// Check whether a current value exceeds a threshold given a comparison
/// operator.
///
/// Valid operators: "gt", "lt", "gte", "lte".
/// Returns `false` for unknown operators.
pub fn check_spike(current_value: f64, threshold_value: f64, comparison: &str) -> bool {
    match comparison {
        COMPARISON_GT => current_value > threshold_value,
        COMPARISON_LT => current_value < threshold_value,
        COMPARISON_GTE => current_value >= threshold_value,
        COMPARISON_LTE => current_value <= threshold_value,
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Rate limit utilization
// ---------------------------------------------------------------------------

/// Compute the utilization percentage given requests made and the configured
/// rate limit.
///
/// Returns 0.0 if `rate_limit` is zero or negative (prevents division by zero).
pub fn compute_utilization_pct(requests_made: i32, rate_limit: i32) -> f32 {
    if rate_limit <= 0 {
        return 0.0;
    }
    (requests_made as f32 / rate_limit as f32) * 100.0
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/// Validate that a granularity string is one of the known values.
pub fn validate_granularity(granularity: &str) -> Result<(), crate::error::CoreError> {
    if VALID_GRANULARITIES.contains(&granularity) {
        Ok(())
    } else {
        Err(crate::error::CoreError::Validation(format!(
            "Unknown granularity: '{granularity}'. Valid values: {}",
            VALID_GRANULARITIES.join(", ")
        )))
    }
}

/// Validate that an alert type string is one of the known values.
pub fn validate_alert_type(alert_type: &str) -> Result<(), crate::error::CoreError> {
    if VALID_ALERT_TYPES.contains(&alert_type) {
        Ok(())
    } else {
        Err(crate::error::CoreError::Validation(format!(
            "Unknown alert type: '{alert_type}'. Valid values: {}",
            VALID_ALERT_TYPES.join(", ")
        )))
    }
}

/// Validate that a comparison operator is one of the known values.
pub fn validate_comparison(comparison: &str) -> Result<(), crate::error::CoreError> {
    if VALID_COMPARISONS.contains(&comparison) {
        Ok(())
    } else {
        Err(crate::error::CoreError::Validation(format!(
            "Unknown comparison: '{comparison}'. Valid values: {}",
            VALID_COMPARISONS.join(", ")
        )))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    // -- Constants ----------------------------------------------------------

    #[test]
    fn granularity_constants_are_correct() {
        assert_eq!(GRANULARITY_1M, "1m");
        assert_eq!(GRANULARITY_5M, "5m");
        assert_eq!(GRANULARITY_1H, "1h");
        assert_eq!(GRANULARITY_1D, "1d");
    }

    #[test]
    fn alert_type_constants_are_correct() {
        assert_eq!(ALERT_TYPE_ERROR_RATE, "error_rate");
        assert_eq!(ALERT_TYPE_RESPONSE_TIME, "response_time");
        assert_eq!(ALERT_TYPE_RATE_LIMIT, "rate_limit");
    }

    #[test]
    fn comparison_constants_are_correct() {
        assert_eq!(COMPARISON_GT, "gt");
        assert_eq!(COMPARISON_LT, "lt");
        assert_eq!(COMPARISON_GTE, "gte");
        assert_eq!(COMPARISON_LTE, "lte");
    }

    #[test]
    fn retention_constants_are_correct() {
        assert_eq!(RETENTION_1M_HOURS, 24);
        assert_eq!(RETENTION_5M_DAYS, 7);
        assert_eq!(RETENTION_1H_DAYS, 90);
    }

    // -- compute_percentiles -----------------------------------------------

    #[test]
    fn percentiles_empty_returns_zeros() {
        let (p50, p95, p99) = compute_percentiles(&[]);
        assert_eq!(p50, 0.0);
        assert_eq!(p95, 0.0);
        assert_eq!(p99, 0.0);
    }

    #[test]
    fn percentiles_single_value() {
        let (p50, p95, p99) = compute_percentiles(&[42.0]);
        assert_eq!(p50, 42.0);
        assert_eq!(p95, 42.0);
        assert_eq!(p99, 42.0);
    }

    #[test]
    fn percentiles_two_values() {
        let (p50, p95, p99) = compute_percentiles(&[10.0, 20.0]);
        assert!((p50 - 15.0).abs() < 0.01);
        assert!(p95 > p50);
        assert!(p99 >= p95);
    }

    #[test]
    fn percentiles_hundred_values() {
        let values: Vec<f64> = (1..=100).map(|i| i as f64).collect();
        let (p50, p95, p99) = compute_percentiles(&values);
        assert!((p50 - 50.0).abs() < 1.0);
        assert!((p95 - 95.0).abs() < 1.0);
        assert!((p99 - 99.0).abs() < 1.0);
    }

    #[test]
    fn percentiles_unsorted_input() {
        let values = vec![100.0, 1.0, 50.0, 25.0, 75.0];
        let (p50, p95, p99) = compute_percentiles(&values);
        assert!((p50 - 50.0).abs() < 0.01);
        assert!(p95 > p50);
        assert!(p99 >= p95);
    }

    #[test]
    fn percentiles_all_same_value() {
        let values = vec![5.0; 10];
        let (p50, p95, p99) = compute_percentiles(&values);
        assert_eq!(p50, 5.0);
        assert_eq!(p95, 5.0);
        assert_eq!(p99, 5.0);
    }

    // -- check_spike -------------------------------------------------------

    #[test]
    fn spike_gt_exceeded() {
        assert!(check_spike(11.0, 10.0, "gt"));
    }

    #[test]
    fn spike_gt_not_exceeded() {
        assert!(!check_spike(10.0, 10.0, "gt"));
    }

    #[test]
    fn spike_lt_exceeded() {
        assert!(check_spike(9.0, 10.0, "lt"));
    }

    #[test]
    fn spike_lt_not_exceeded() {
        assert!(!check_spike(10.0, 10.0, "lt"));
    }

    #[test]
    fn spike_gte_at_threshold() {
        assert!(check_spike(10.0, 10.0, "gte"));
    }

    #[test]
    fn spike_gte_exceeded() {
        assert!(check_spike(11.0, 10.0, "gte"));
    }

    #[test]
    fn spike_lte_at_threshold() {
        assert!(check_spike(10.0, 10.0, "lte"));
    }

    #[test]
    fn spike_lte_exceeded() {
        assert!(check_spike(9.0, 10.0, "lte"));
    }

    #[test]
    fn spike_unknown_comparison_returns_false() {
        assert!(!check_spike(100.0, 10.0, "unknown"));
    }

    // -- compute_utilization_pct -------------------------------------------

    #[test]
    fn utilization_normal() {
        let pct = compute_utilization_pct(50, 100);
        assert!((pct - 50.0).abs() < f32::EPSILON);
    }

    #[test]
    fn utilization_at_limit() {
        let pct = compute_utilization_pct(100, 100);
        assert!((pct - 100.0).abs() < f32::EPSILON);
    }

    #[test]
    fn utilization_over_limit() {
        let pct = compute_utilization_pct(150, 100);
        assert!((pct - 150.0).abs() < f32::EPSILON);
    }

    #[test]
    fn utilization_zero_limit_returns_zero() {
        assert_eq!(compute_utilization_pct(50, 0), 0.0);
    }

    #[test]
    fn utilization_negative_limit_returns_zero() {
        assert_eq!(compute_utilization_pct(50, -1), 0.0);
    }

    #[test]
    fn utilization_zero_requests() {
        assert_eq!(compute_utilization_pct(0, 100), 0.0);
    }

    // -- normalize_heatmap -------------------------------------------------

    #[test]
    fn heatmap_normalize_basic() {
        let mut cells = vec![
            HeatmapCell {
                endpoint: "/a".into(),
                time_bucket: "2026-01-01T00:00:00Z".into(),
                request_count: 100,
                intensity: 0.0,
            },
            HeatmapCell {
                endpoint: "/b".into(),
                time_bucket: "2026-01-01T00:00:00Z".into(),
                request_count: 50,
                intensity: 0.0,
            },
            HeatmapCell {
                endpoint: "/c".into(),
                time_bucket: "2026-01-01T00:00:00Z".into(),
                request_count: 0,
                intensity: 0.0,
            },
        ];
        normalize_heatmap(&mut cells);
        assert!((cells[0].intensity - 1.0).abs() < f32::EPSILON);
        assert!((cells[1].intensity - 0.5).abs() < f32::EPSILON);
        assert!((cells[2].intensity - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn heatmap_normalize_empty() {
        let mut cells: Vec<HeatmapCell> = vec![];
        normalize_heatmap(&mut cells);
        assert!(cells.is_empty());
    }

    #[test]
    fn heatmap_normalize_all_zero() {
        let mut cells = vec![
            HeatmapCell {
                endpoint: "/a".into(),
                time_bucket: "t".into(),
                request_count: 0,
                intensity: 0.5,
            },
            HeatmapCell {
                endpoint: "/b".into(),
                time_bucket: "t".into(),
                request_count: 0,
                intensity: 0.5,
            },
        ];
        normalize_heatmap(&mut cells);
        assert_eq!(cells[0].intensity, 0.0);
        assert_eq!(cells[1].intensity, 0.0);
    }

    // -- aggregate_metrics -------------------------------------------------

    fn make_metric(
        endpoint: &str,
        method: &str,
        status: u16,
        time_ms: f64,
        ts: chrono::DateTime<chrono::Utc>,
    ) -> RequestMetric {
        RequestMetric {
            endpoint: endpoint.to_string(),
            http_method: method.to_string(),
            api_key_id: None,
            response_status: status,
            response_time_ms: time_ms,
            request_bytes: 100,
            response_bytes: 200,
            timestamp: ts,
        }
    }

    #[test]
    fn aggregate_empty_input() {
        let result = aggregate_metrics(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn aggregate_single_metric() {
        let ts = Utc.with_ymd_and_hms(2026, 1, 1, 12, 30, 15).unwrap();
        let metrics = vec![make_metric("/api/v1/test", "GET", 200, 10.0, ts)];
        let buckets = aggregate_metrics(&metrics);

        assert_eq!(buckets.len(), 1);
        assert_eq!(buckets[0].request_count, 1);
        assert_eq!(buckets[0].error_count_4xx, 0);
        assert_eq!(buckets[0].error_count_5xx, 0);
        assert_eq!(buckets[0].endpoint, "/api/v1/test");
        assert_eq!(buckets[0].http_method, "GET");
    }

    #[test]
    fn aggregate_groups_by_endpoint() {
        let ts = Utc.with_ymd_and_hms(2026, 1, 1, 12, 30, 0).unwrap();
        let metrics = vec![
            make_metric("/a", "GET", 200, 10.0, ts),
            make_metric("/b", "GET", 200, 20.0, ts),
            make_metric("/a", "GET", 200, 30.0, ts),
        ];
        let buckets = aggregate_metrics(&metrics);

        assert_eq!(buckets.len(), 2);
        let bucket_a = buckets
            .iter()
            .find(|b| b.endpoint == "/a")
            .expect("bucket /a");
        assert_eq!(bucket_a.request_count, 2);
    }

    #[test]
    fn aggregate_counts_errors() {
        let ts = Utc.with_ymd_and_hms(2026, 1, 1, 12, 30, 0).unwrap();
        let metrics = vec![
            make_metric("/api", "POST", 200, 10.0, ts),
            make_metric("/api", "POST", 404, 5.0, ts),
            make_metric("/api", "POST", 422, 8.0, ts),
            make_metric("/api", "POST", 500, 50.0, ts),
            make_metric("/api", "POST", 503, 100.0, ts),
        ];
        let buckets = aggregate_metrics(&metrics);

        assert_eq!(buckets.len(), 1);
        assert_eq!(buckets[0].request_count, 5);
        assert_eq!(buckets[0].error_count_4xx, 2);
        assert_eq!(buckets[0].error_count_5xx, 2);
    }

    #[test]
    fn aggregate_separates_by_minute() {
        let ts1 = Utc.with_ymd_and_hms(2026, 1, 1, 12, 30, 10).unwrap();
        let ts2 = Utc.with_ymd_and_hms(2026, 1, 1, 12, 31, 10).unwrap();
        let metrics = vec![
            make_metric("/api", "GET", 200, 10.0, ts1),
            make_metric("/api", "GET", 200, 20.0, ts2),
        ];
        let buckets = aggregate_metrics(&metrics);
        assert_eq!(buckets.len(), 2);
    }

    #[test]
    fn aggregate_computes_avg() {
        let ts = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();
        let metrics = vec![
            make_metric("/api", "GET", 200, 10.0, ts),
            make_metric("/api", "GET", 200, 20.0, ts),
            make_metric("/api", "GET", 200, 30.0, ts),
        ];
        let buckets = aggregate_metrics(&metrics);
        assert_eq!(buckets.len(), 1);
        assert!((buckets[0].response_time_avg_ms - 20.0).abs() < 0.01);
    }

    #[test]
    fn aggregate_sums_bytes() {
        let ts = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();
        let metrics = vec![
            make_metric("/api", "GET", 200, 10.0, ts),
            make_metric("/api", "GET", 200, 10.0, ts),
        ];
        let buckets = aggregate_metrics(&metrics);
        assert_eq!(buckets[0].total_request_bytes, 200);
        assert_eq!(buckets[0].total_response_bytes, 400);
    }

    // -- truncate_to_minute ------------------------------------------------

    #[test]
    fn truncate_minute_strips_seconds() {
        let ts = Utc.with_ymd_and_hms(2026, 3, 15, 14, 30, 45).unwrap();
        let truncated = truncate_to_minute(ts);
        assert_eq!(
            truncated,
            Utc.with_ymd_and_hms(2026, 3, 15, 14, 30, 0).unwrap()
        );
    }

    // -- Validators --------------------------------------------------------

    #[test]
    fn validate_granularity_valid() {
        assert!(validate_granularity("1m").is_ok());
        assert!(validate_granularity("5m").is_ok());
        assert!(validate_granularity("1h").is_ok());
        assert!(validate_granularity("1d").is_ok());
    }

    #[test]
    fn validate_granularity_invalid() {
        assert!(validate_granularity("2m").is_err());
        assert!(validate_granularity("").is_err());
    }

    #[test]
    fn validate_alert_type_valid() {
        assert!(validate_alert_type("error_rate").is_ok());
        assert!(validate_alert_type("response_time").is_ok());
        assert!(validate_alert_type("rate_limit").is_ok());
    }

    #[test]
    fn validate_alert_type_invalid() {
        assert!(validate_alert_type("unknown").is_err());
    }

    #[test]
    fn validate_comparison_valid() {
        assert!(validate_comparison("gt").is_ok());
        assert!(validate_comparison("lt").is_ok());
        assert!(validate_comparison("gte").is_ok());
        assert!(validate_comparison("lte").is_ok());
    }

    #[test]
    fn validate_comparison_invalid() {
        assert!(validate_comparison("eq").is_err());
    }
}
