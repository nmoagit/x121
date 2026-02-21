//! Well-known GPU metric name constants and WebSocket message types.
//!
//! These are the canonical metric names used in the `metric_thresholds` table,
//! the threshold evaluation engine, and the agent-to-backend WebSocket protocol
//! (PRD-06).

/// WebSocket message type discriminator for GPU metric payloads.
///
/// Used by the agent when sending metrics and by the backend when parsing them.
pub const MSG_TYPE_GPU_METRICS: &str = "gpu_metrics";

/// GPU core temperature in degrees Celsius.
pub const METRIC_TEMPERATURE: &str = "temperature_celsius";

/// VRAM utilization as a percentage (computed from used / total).
pub const METRIC_VRAM_USED_PERCENT: &str = "vram_used_percent";

/// GPU compute utilization percentage (0-100).
pub const METRIC_UTILIZATION: &str = "utilization_percent";

/// WebSocket message type discriminator for restart result payloads.
///
/// Used by the agent when reporting restart outcomes back to the backend.
pub const MSG_TYPE_RESTART_RESULT: &str = "restart_result";
