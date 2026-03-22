//! Webhook Integration Testing Console business logic (PRD-99).
//!
//! Pure functions for endpoint health computation, mock token generation,
//! and sample payload construction. No database dependencies.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Endpoint type: regular webhook subscription.
pub const ENDPOINT_TYPE_WEBHOOK: &str = "webhook";

/// Endpoint type: pipeline stage hook.
pub const ENDPOINT_TYPE_HOOK: &str = "hook";

/// Delivery result: successful.
pub const DELIVERY_RESULT_SUCCESS: &str = "success";

/// Delivery result: failed.
pub const DELIVERY_RESULT_FAILED: &str = "failed";

/// Health status: endpoint is healthy (>95% success rate).
pub const HEALTH_HEALTHY: &str = "healthy";

/// Health status: endpoint is degraded (80-95% success rate).
pub const HEALTH_DEGRADED: &str = "degraded";

/// Health status: endpoint is down (<80% success rate).
pub const HEALTH_DOWN: &str = "down";

/// Default log retention in days.
pub const DEFAULT_RETENTION_DAYS: i32 = 30;

/// Default mock capture retention in hours.
pub const DEFAULT_MOCK_RETENTION_HOURS: i32 = 24;

/// Length of randomly generated mock tokens (URL-safe alphanumeric avatars).
const MOCK_TOKEN_LENGTH: usize = 22;

// ---------------------------------------------------------------------------
// EndpointHealth
// ---------------------------------------------------------------------------

/// Computed health summary for a webhook endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointHealth {
    /// Percentage of successful deliveries (0.0 - 100.0).
    pub success_rate_pct: f32,
    /// Average response time in milliseconds.
    pub avg_response_time_ms: f32,
    /// Number of recent consecutive failures.
    pub recent_failure_count: i32,
    /// Health status string: "healthy", "degraded", or "down".
    pub status: String,
}

/// Compute the health summary for an endpoint based on delivery statistics.
///
/// Status thresholds:
/// - **healthy**: success rate > 95%
/// - **degraded**: success rate between 80% and 95% (inclusive)
/// - **down**: success rate < 80%
///
/// If `total_deliveries` is zero, returns a healthy status with zeroed metrics.
pub fn compute_endpoint_health(
    total_deliveries: i64,
    successful_deliveries: i64,
    total_duration_ms: i64,
    recent_failures: i32,
) -> EndpointHealth {
    if total_deliveries == 0 {
        return EndpointHealth {
            success_rate_pct: 100.0,
            avg_response_time_ms: 0.0,
            recent_failure_count: recent_failures,
            status: HEALTH_HEALTHY.to_string(),
        };
    }

    let success_rate = (successful_deliveries as f64 / total_deliveries as f64) * 100.0;
    let avg_response = total_duration_ms as f64 / total_deliveries as f64;

    let status = if success_rate > 95.0 {
        HEALTH_HEALTHY
    } else if success_rate >= 80.0 {
        HEALTH_DEGRADED
    } else {
        HEALTH_DOWN
    };

    EndpointHealth {
        success_rate_pct: success_rate as f32,
        avg_response_time_ms: avg_response as f32,
        recent_failure_count: recent_failures,
        status: status.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Mock token generation
// ---------------------------------------------------------------------------

/// Generate a random URL-safe token for mock endpoint identification.
///
/// Produces a 22-avatar alphanumeric string suitable for use in URLs.
pub fn generate_mock_token() -> String {
    use rand::Rng;
    rand::rng()
        .sample_iter(&rand::distr::Alphanumeric)
        .take(MOCK_TOKEN_LENGTH)
        .map(char::from)
        .collect()
}

// ---------------------------------------------------------------------------
// Sample payloads
// ---------------------------------------------------------------------------

/// A sample webhook payload for testing purposes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplePayload {
    /// The event type this sample represents.
    pub event_type: String,
    /// A JSON payload body for the event.
    pub payload: serde_json::Value,
    /// A human-readable description of the event.
    pub description: String,
}

/// Return a collection of sample payloads for webhook testing.
///
/// Covers the most common event types that webhooks are expected to handle.
pub fn get_sample_payloads() -> Vec<SamplePayload> {
    vec![
        SamplePayload {
            event_type: "job.completed".to_string(),
            payload: serde_json::json!({
                "event": "job.completed",
                "job_id": 42,
                "status": "completed",
                "duration_ms": 12500,
                "output_path": "/renders/scene_001/segment_003.mp4",
                "timestamp": "2026-03-01T12:00:00Z"
            }),
            description: "Fired when a generation job finishes successfully.".to_string(),
        },
        SamplePayload {
            event_type: "segment.approved".to_string(),
            payload: serde_json::json!({
                "event": "segment.approved",
                "segment_id": 17,
                "scene_id": 5,
                "approved_by": 3,
                "timestamp": "2026-03-01T12:05:00Z"
            }),
            description: "Fired when a segment passes review approval.".to_string(),
        },
        SamplePayload {
            event_type: "qa.failed".to_string(),
            payload: serde_json::json!({
                "event": "qa.failed",
                "segment_id": 17,
                "check_type": "face_consistency",
                "score": 0.42,
                "threshold": 0.85,
                "timestamp": "2026-03-01T12:10:00Z"
            }),
            description: "Fired when automated QA detects a quality failure.".to_string(),
        },
        SamplePayload {
            event_type: "job.queued".to_string(),
            payload: serde_json::json!({
                "event": "job.queued",
                "job_id": 43,
                "scene_id": 6,
                "priority": 5,
                "estimated_duration_ms": 15000,
                "timestamp": "2026-03-01T12:15:00Z"
            }),
            description: "Fired when a new generation job enters the queue.".to_string(),
        },
        SamplePayload {
            event_type: "job.cancelled".to_string(),
            payload: serde_json::json!({
                "event": "job.cancelled",
                "job_id": 44,
                "cancelled_by": 2,
                "reason": "Superseded by updated prompt",
                "timestamp": "2026-03-01T12:20:00Z"
            }),
            description: "Fired when a queued or running job is cancelled.".to_string(),
        },
    ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Constants ----------------------------------------------------------

    #[test]
    fn endpoint_type_constants_are_distinct() {
        assert_ne!(ENDPOINT_TYPE_WEBHOOK, ENDPOINT_TYPE_HOOK);
    }

    #[test]
    fn delivery_result_constants_are_distinct() {
        assert_ne!(DELIVERY_RESULT_SUCCESS, DELIVERY_RESULT_FAILED);
    }

    #[test]
    fn health_constants_are_distinct() {
        assert_ne!(HEALTH_HEALTHY, HEALTH_DEGRADED);
        assert_ne!(HEALTH_DEGRADED, HEALTH_DOWN);
        assert_ne!(HEALTH_HEALTHY, HEALTH_DOWN);
    }

    #[test]
    fn default_retention_days_is_positive() {
        assert!(DEFAULT_RETENTION_DAYS > 0);
    }

    #[test]
    fn default_mock_retention_hours_is_positive() {
        assert!(DEFAULT_MOCK_RETENTION_HOURS > 0);
    }

    // -- compute_endpoint_health --------------------------------------------

    #[test]
    fn health_zero_deliveries_returns_healthy() {
        let h = compute_endpoint_health(0, 0, 0, 0);
        assert_eq!(h.status, HEALTH_HEALTHY);
        assert_eq!(h.success_rate_pct, 100.0);
        assert_eq!(h.avg_response_time_ms, 0.0);
    }

    #[test]
    fn health_all_successful_is_healthy() {
        let h = compute_endpoint_health(100, 100, 5000, 0);
        assert_eq!(h.status, HEALTH_HEALTHY);
        assert!((h.success_rate_pct - 100.0).abs() < 0.01);
        assert!((h.avg_response_time_ms - 50.0).abs() < 0.01);
    }

    #[test]
    fn health_96_percent_is_healthy() {
        let h = compute_endpoint_health(100, 96, 10000, 0);
        assert_eq!(h.status, HEALTH_HEALTHY);
        assert!((h.success_rate_pct - 96.0).abs() < 0.01);
    }

    #[test]
    fn health_95_percent_is_degraded() {
        let h = compute_endpoint_health(100, 95, 10000, 1);
        assert_eq!(h.status, HEALTH_DEGRADED);
        assert!((h.success_rate_pct - 95.0).abs() < 0.01);
    }

    #[test]
    fn health_80_percent_is_degraded() {
        let h = compute_endpoint_health(100, 80, 20000, 5);
        assert_eq!(h.status, HEALTH_DEGRADED);
        assert!((h.success_rate_pct - 80.0).abs() < 0.01);
    }

    #[test]
    fn health_79_percent_is_down() {
        let h = compute_endpoint_health(100, 79, 30000, 10);
        assert_eq!(h.status, HEALTH_DOWN);
        assert!((h.success_rate_pct - 79.0).abs() < 0.01);
    }

    #[test]
    fn health_zero_success_is_down() {
        let h = compute_endpoint_health(50, 0, 25000, 50);
        assert_eq!(h.status, HEALTH_DOWN);
        assert_eq!(h.success_rate_pct, 0.0);
    }

    #[test]
    fn health_avg_response_time_calculation() {
        let h = compute_endpoint_health(10, 10, 1500, 0);
        assert!((h.avg_response_time_ms - 150.0).abs() < 0.01);
    }

    #[test]
    fn health_preserves_recent_failure_count() {
        let h = compute_endpoint_health(100, 100, 5000, 7);
        assert_eq!(h.recent_failure_count, 7);
    }

    // -- generate_mock_token ------------------------------------------------

    #[test]
    fn mock_token_has_correct_length() {
        let token = generate_mock_token();
        assert_eq!(token.len(), MOCK_TOKEN_LENGTH);
    }

    #[test]
    fn mock_token_is_alphanumeric() {
        let token = generate_mock_token();
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn mock_tokens_are_unique() {
        let a = generate_mock_token();
        let b = generate_mock_token();
        assert_ne!(a, b);
    }

    // -- get_sample_payloads ------------------------------------------------

    #[test]
    fn sample_payloads_returns_five_entries() {
        let payloads = get_sample_payloads();
        assert_eq!(payloads.len(), 5);
    }

    #[test]
    fn sample_payloads_have_unique_event_types() {
        let payloads = get_sample_payloads();
        let mut types: Vec<&str> = payloads.iter().map(|p| p.event_type.as_str()).collect();
        types.sort();
        types.dedup();
        assert_eq!(types.len(), 5);
    }

    #[test]
    fn sample_payloads_contain_expected_events() {
        let payloads = get_sample_payloads();
        let types: Vec<&str> = payloads.iter().map(|p| p.event_type.as_str()).collect();
        assert!(types.contains(&"job.completed"));
        assert!(types.contains(&"segment.approved"));
        assert!(types.contains(&"qa.failed"));
        assert!(types.contains(&"job.queued"));
        assert!(types.contains(&"job.cancelled"));
    }

    #[test]
    fn sample_payloads_descriptions_are_nonempty() {
        let payloads = get_sample_payloads();
        for p in &payloads {
            assert!(
                !p.description.is_empty(),
                "Description for {} is empty",
                p.event_type
            );
        }
    }

    #[test]
    fn sample_payloads_are_valid_json() {
        let payloads = get_sample_payloads();
        for p in &payloads {
            assert!(
                p.payload.is_object(),
                "Payload for {} is not a JSON object",
                p.event_type
            );
        }
    }
}
