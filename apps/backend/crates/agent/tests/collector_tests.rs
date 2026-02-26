//! Integration tests for the GPU metrics collector (PRD-06, Task 7.1).
//!
//! Verifies serialization of [`GpuMetrics`] and graceful handling of
//! missing NVIDIA drivers.

use x121_agent::collector::{GpuMetrics, MetricsCollector};

// ---------------------------------------------------------------------------
// Test: GpuMetrics serialization round-trip
// ---------------------------------------------------------------------------

/// Constructing a `GpuMetrics` and serializing to JSON produces all expected
/// fields with correct values, including `None` → `null` for optional fields.
#[test]
fn gpu_metrics_serialization_includes_all_fields() {
    let snapshot = GpuMetrics {
        gpu_index: 0,
        vram_used_mb: 4096,
        vram_total_mb: 16384,
        temperature_celsius: 72,
        utilization_percent: 85,
        power_draw_watts: Some(250),
        fan_speed_percent: Some(60),
    };

    let json_str = serde_json::to_string(&snapshot).expect("serialization should succeed");
    let parsed: serde_json::Value =
        serde_json::from_str(&json_str).expect("deserialization should succeed");

    assert_eq!(parsed["gpu_index"], 0);
    assert_eq!(parsed["vram_used_mb"], 4096);
    assert_eq!(parsed["vram_total_mb"], 16384);
    assert_eq!(parsed["temperature_celsius"], 72);
    assert_eq!(parsed["utilization_percent"], 85);
    assert_eq!(parsed["power_draw_watts"], 250);
    assert_eq!(parsed["fan_speed_percent"], 60);
}

/// Optional fields serialize to `null` when set to `None`.
#[test]
fn gpu_metrics_optional_fields_serialize_as_null() {
    let snapshot = GpuMetrics {
        gpu_index: 1,
        vram_used_mb: 2048,
        vram_total_mb: 8192,
        temperature_celsius: 55,
        utilization_percent: 30,
        power_draw_watts: None,
        fan_speed_percent: None,
    };

    let json_str = serde_json::to_string(&snapshot).expect("serialization should succeed");
    let parsed: serde_json::Value =
        serde_json::from_str(&json_str).expect("deserialization should succeed");

    assert!(
        parsed["power_draw_watts"].is_null(),
        "power_draw_watts should be null when None"
    );
    assert!(
        parsed["fan_speed_percent"].is_null(),
        "fan_speed_percent should be null when None"
    );
    // Required fields should still be present.
    assert_eq!(parsed["gpu_index"], 1);
    assert_eq!(parsed["vram_used_mb"], 2048);
}

// ---------------------------------------------------------------------------
// Test: NVML initialization handles missing drivers gracefully
// ---------------------------------------------------------------------------

/// On a machine without NVIDIA drivers (typical CI), `MetricsCollector::new()`
/// should not panic. It returns a collector that reports zero GPUs and
/// `collect()` returns an empty vec.
#[test]
fn nvml_init_graceful_without_nvidia_drivers() {
    // This should never panic, even without NVIDIA hardware.
    let collector = MetricsCollector::new();

    // On CI without a GPU, gpu_count returns 0.
    // On a machine with GPUs, it returns the device count.
    // Either way, this must not panic.
    let _count = collector.gpu_count();
}

/// `collect()` returns an empty vec when no GPUs are available (CI scenario).
/// On a machine with GPUs this returns actual metrics, so we only assert
/// the call does not panic and returns a vec.
#[test]
fn collect_returns_vec_without_panicking() {
    let collector = MetricsCollector::new();
    let metrics = collector.collect();

    // On CI: empty vec. On a GPU machine: populated vec. Both are valid.
    // The key assertion is that this does not panic.
    assert!(
        metrics.len() == collector.gpu_count() as usize || metrics.is_empty(),
        "collect() should return one entry per GPU or be empty"
    );
}
