//! Integration tests for the hardware monitoring system (PRD-06, Task 7.2).
//!
//! Tests cover:
//! - GPU metric insert/retrieve operations
//! - Latest-per-worker aggregation
//! - Time-range filtering
//! - Threshold evaluation (pure, no DB required)
//! - Restart log lifecycle
//! - Metrics cleanup (retention)

mod common;

use chrono::{Duration, Utc};
use sqlx::PgPool;
use x121_core::alert::AlertLevel;
use x121_core::hardware::thresholds::{evaluate, AlertCooldownTracker, GpuSnapshot, Threshold};
use x121_core::metric_names::{METRIC_TEMPERATURE, METRIC_UTILIZATION, METRIC_VRAM_USED_PERCENT};
use x121_db::models::hardware::{CreateGpuMetric, CreateRestartLog, UpsertThreshold};
use x121_db::repositories::{GpuMetricRepo, MetricThresholdRepo, RestartLogRepo};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Create a `CreateGpuMetric` DTO with the given temperature and an explicit
/// `recorded_at` timestamp.
fn make_metric_dto(
    gpu_index: i16,
    temperature: i16,
    utilization: i16,
    recorded_at: chrono::DateTime<chrono::Utc>,
) -> CreateGpuMetric {
    CreateGpuMetric {
        gpu_index,
        vram_used_mb: Some(4096),
        vram_total_mb: Some(16384),
        temperature_celsius: Some(temperature),
        utilization_percent: Some(utilization),
        power_draw_watts: Some(250),
        fan_speed_percent: Some(60),
        recorded_at,
    }
}

/// Create a test user in the database and return their ID.
///
/// Required because `restart_logs.initiated_by` is a foreign key to `users.id`.
async fn create_test_user(pool: &PgPool) -> i64 {
    use x121_api::auth::password::hash_password;
    use x121_db::models::user::CreateUser;
    use x121_db::repositories::UserRepo;

    let password_hash = hash_password("test_password_123!").expect("hashing should succeed");
    let input = CreateUser {
        username: format!(
            "hw_test_user_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ),
        email: format!(
            "hw_test_{}@test.com",
            Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ),
        password_hash,
        role_id: 1, // admin
    };
    let user = UserRepo::create(pool, &input)
        .await
        .expect("user creation should succeed");
    user.id
}

// ---------------------------------------------------------------------------
// Test 1: Insert and retrieve GPU metrics
// ---------------------------------------------------------------------------

/// Insert a GPU metric row via `GpuMetricRepo::insert()`, then retrieve
/// it via `get_for_worker()` and verify the data matches.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn insert_and_retrieve_gpu_metrics(pool: PgPool) {
    let worker_id: i64 = 1001;
    let now = Utc::now();
    let dto = make_metric_dto(0, 72, 85, now);

    let inserted = GpuMetricRepo::insert(&pool, worker_id, &dto)
        .await
        .expect("insert should succeed");

    assert_eq!(inserted.worker_id, worker_id);
    assert_eq!(inserted.gpu_index, 0);
    assert_eq!(inserted.temperature_celsius, Some(72));
    assert_eq!(inserted.utilization_percent, Some(85));
    assert_eq!(inserted.vram_used_mb, Some(4096));
    assert_eq!(inserted.vram_total_mb, Some(16384));
    assert_eq!(inserted.power_draw_watts, Some(250));
    assert_eq!(inserted.fan_speed_percent, Some(60));

    // Retrieve via get_for_worker with a window that includes `now`.
    let since = now - Duration::minutes(1);
    let retrieved = GpuMetricRepo::get_for_worker(&pool, worker_id, since)
        .await
        .expect("get_for_worker should succeed");

    assert_eq!(retrieved.len(), 1, "should retrieve exactly one metric row");
    assert_eq!(retrieved[0].id, inserted.id);
    assert_eq!(retrieved[0].temperature_celsius, Some(72));
}

// ---------------------------------------------------------------------------
// Test 2: Latest metrics per worker
// ---------------------------------------------------------------------------

/// Insert metrics for multiple workers and GPUs, call `get_latest_per_worker()`,
/// and verify one result per (worker, gpu_index) combination.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn latest_metrics_per_worker(pool: PgPool) {
    let now = Utc::now();

    // Worker 2001: two snapshots for GPU 0, we expect only the latest.
    let old_dto = make_metric_dto(0, 60, 40, now - Duration::seconds(30));
    let new_dto = make_metric_dto(0, 75, 90, now);
    GpuMetricRepo::insert(&pool, 2001, &old_dto)
        .await
        .expect("insert old metric");
    GpuMetricRepo::insert(&pool, 2001, &new_dto)
        .await
        .expect("insert new metric");

    // Worker 2002: one snapshot for GPU 0.
    let dto_w2 = make_metric_dto(0, 55, 30, now);
    GpuMetricRepo::insert(&pool, 2002, &dto_w2)
        .await
        .expect("insert worker 2002 metric");

    let latest = GpuMetricRepo::get_latest_per_worker(&pool)
        .await
        .expect("get_latest_per_worker should succeed");

    // We should get exactly 2 results: one per (worker_id, gpu_index).
    assert_eq!(latest.len(), 2, "one entry per worker+gpu pair");

    // Verify worker 2001 got the latest (temperature 75), not the old one (60).
    let w2001 = latest
        .iter()
        .find(|m| m.worker_id == 2001)
        .expect("should find worker 2001");
    assert_eq!(w2001.temperature_celsius, Some(75));

    let w2002 = latest
        .iter()
        .find(|m| m.worker_id == 2002)
        .expect("should find worker 2002");
    assert_eq!(w2002.temperature_celsius, Some(55));
}

// ---------------------------------------------------------------------------
// Test 3: Time-range filtering
// ---------------------------------------------------------------------------

/// Insert metrics with different timestamps, query with `since`, and verify
/// only recent ones are returned.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn time_range_filtering(pool: PgPool) {
    let now = Utc::now();
    let worker_id: i64 = 3001;

    // Old metric: 2 hours ago.
    let old_dto = make_metric_dto(0, 50, 20, now - Duration::hours(2));
    GpuMetricRepo::insert(&pool, worker_id, &old_dto)
        .await
        .expect("insert old metric");

    // Recent metric: 10 minutes ago.
    let recent_dto = make_metric_dto(0, 70, 60, now - Duration::minutes(10));
    GpuMetricRepo::insert(&pool, worker_id, &recent_dto)
        .await
        .expect("insert recent metric");

    // Query: last hour only.
    let since = now - Duration::hours(1);
    let results = GpuMetricRepo::get_for_worker(&pool, worker_id, since)
        .await
        .expect("get_for_worker should succeed");

    assert_eq!(
        results.len(),
        1,
        "only the recent metric should be returned"
    );
    assert_eq!(results[0].temperature_celsius, Some(70));
}

// ---------------------------------------------------------------------------
// Test 4: Threshold evaluation triggers alerts (pure — no DB)
// ---------------------------------------------------------------------------

/// Create test thresholds, pass metrics that exceed them, and verify
/// alerts are generated with the correct levels.
#[test]
fn threshold_evaluation_triggers_alerts() {
    let thresholds = vec![
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
    ];

    let mut cooldown = AlertCooldownTracker::new();

    // Snapshot with temperature at 85 (warning) and utilization at 99 (critical).
    let snapshots = vec![GpuSnapshot {
        worker_id: 100,
        gpu_index: 0,
        vram_used_mb: Some(4000),
        vram_total_mb: Some(16000),
        temperature_celsius: Some(85),
        utilization_percent: Some(99),
        recorded_at: Utc::now(),
    }];

    let alerts = evaluate(&snapshots, &thresholds, &mut cooldown);

    // Should have 2 alerts: temperature warning + utilization critical.
    assert_eq!(
        alerts.len(),
        2,
        "expected 2 alerts (temp warning + util critical)"
    );

    let temp_alert = alerts
        .iter()
        .find(|a| a.metric_name == METRIC_TEMPERATURE)
        .expect("should have a temperature alert");
    assert_eq!(temp_alert.level, AlertLevel::Warning);
    assert_eq!(temp_alert.current_value, 85);
    assert_eq!(temp_alert.threshold_value, 80);

    let util_alert = alerts
        .iter()
        .find(|a| a.metric_name == METRIC_UTILIZATION)
        .expect("should have a utilization alert");
    assert_eq!(util_alert.level, AlertLevel::Critical);
    assert_eq!(util_alert.current_value, 99);
    assert_eq!(util_alert.threshold_value, 98);
}

/// No alerts when all metric values are within safe thresholds.
#[test]
fn threshold_evaluation_no_alerts_within_range() {
    let thresholds = vec![
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
    ];

    let mut cooldown = AlertCooldownTracker::new();

    let snapshots = vec![GpuSnapshot {
        worker_id: 100,
        gpu_index: 0,
        vram_used_mb: Some(2000),
        vram_total_mb: Some(16000),
        temperature_celsius: Some(65),
        utilization_percent: Some(50),
        recorded_at: Utc::now(),
    }];

    let alerts = evaluate(&snapshots, &thresholds, &mut cooldown);
    assert!(
        alerts.is_empty(),
        "no alerts expected when within safe range"
    );
}

/// VRAM percent is computed correctly (used / total * 100) and evaluated
/// against the VRAM threshold.
#[test]
fn threshold_evaluation_vram_percent_computed() {
    let thresholds = vec![Threshold {
        metric_name: METRIC_VRAM_USED_PERCENT.to_string(),
        warning_value: 85,
        critical_value: 95,
    }];

    let mut cooldown = AlertCooldownTracker::new();

    // 14400 / 16000 = 90% -> warning (>= 85, < 95).
    let snapshots = vec![GpuSnapshot {
        worker_id: 100,
        gpu_index: 0,
        vram_used_mb: Some(14400),
        vram_total_mb: Some(16000),
        temperature_celsius: None,
        utilization_percent: None,
        recorded_at: Utc::now(),
    }];

    let alerts = evaluate(&snapshots, &thresholds, &mut cooldown);
    assert_eq!(alerts.len(), 1);
    assert_eq!(alerts[0].metric_name, METRIC_VRAM_USED_PERCENT);
    assert_eq!(alerts[0].level, AlertLevel::Warning);
    assert_eq!(alerts[0].current_value, 90);
}

// ---------------------------------------------------------------------------
// Test 5: Restart log creation and status tracking
// ---------------------------------------------------------------------------

/// Create a restart log via `RestartLogRepo::create()`, update its status
/// via `update_status()`, and verify the status changed.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn restart_log_create_and_update_status(pool: PgPool) {
    let user_id = create_test_user(&pool).await;
    let worker_id: i64 = 5001;

    let create_dto = CreateRestartLog {
        worker_id,
        service_name: "comfyui.service".to_string(),
        initiated_by: user_id,
        reason: Some("GPU stuck at 100% utilization".to_string()),
    };

    let log = RestartLogRepo::create(&pool, &create_dto)
        .await
        .expect("restart log creation should succeed");

    assert_eq!(log.worker_id, worker_id);
    assert_eq!(log.service_name, "comfyui.service");
    assert_eq!(log.initiated_by, user_id);
    assert_eq!(log.status_id, 1, "initial status should be 1 (initiated)");
    assert_eq!(log.reason.as_deref(), Some("GPU stuck at 100% utilization"));
    assert!(log.completed_at.is_none(), "not completed yet");

    // Update status to 4 (completed).
    let completed_at = Utc::now();
    let updated = RestartLogRepo::update_status(&pool, log.id, 4, None, Some(completed_at))
        .await
        .expect("status update should succeed");

    assert_eq!(updated.status_id, 4, "status should be 4 (completed)");
    assert!(updated.completed_at.is_some(), "completed_at should be set");
    assert!(
        updated.error_message.is_none(),
        "error_message should remain None on success"
    );
}

/// Update restart log to failed status with an error message.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn restart_log_failed_with_error_message(pool: PgPool) {
    let user_id = create_test_user(&pool).await;

    let create_dto = CreateRestartLog {
        worker_id: 5002,
        service_name: "nvidia-persistenced".to_string(),
        initiated_by: user_id,
        reason: None,
    };

    let log = RestartLogRepo::create(&pool, &create_dto)
        .await
        .expect("restart log creation should succeed");

    // Update to failed (status_id 5) with an error message.
    let updated = RestartLogRepo::update_status(
        &pool,
        log.id,
        5,
        Some("systemctl exit code 1: unit not found"),
        Some(Utc::now()),
    )
    .await
    .expect("status update should succeed");

    assert_eq!(updated.status_id, 5, "status should be 5 (failed)");
    assert_eq!(
        updated.error_message.as_deref(),
        Some("systemctl exit code 1: unit not found")
    );
}

// ---------------------------------------------------------------------------
// Test 6: Metrics cleanup deletes old data
// ---------------------------------------------------------------------------

/// Insert old metrics (far in the past) and recent metrics, call
/// `delete_older_than()`, and verify only recent ones remain.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn metrics_cleanup_deletes_old_data(pool: PgPool) {
    let now = Utc::now();
    let worker_id: i64 = 6001;

    // Old metric: 8 days ago.
    let old_dto = make_metric_dto(0, 50, 20, now - Duration::days(8));
    GpuMetricRepo::insert(&pool, worker_id, &old_dto)
        .await
        .expect("insert old metric");

    // Another old metric: 10 days ago.
    let very_old_dto = make_metric_dto(0, 45, 15, now - Duration::days(10));
    GpuMetricRepo::insert(&pool, worker_id, &very_old_dto)
        .await
        .expect("insert very old metric");

    // Recent metric: 1 hour ago.
    let recent_dto = make_metric_dto(0, 70, 60, now - Duration::hours(1));
    GpuMetricRepo::insert(&pool, worker_id, &recent_dto)
        .await
        .expect("insert recent metric");

    // Delete everything older than 7 days.
    let cutoff = now - Duration::days(7);
    let deleted_count = GpuMetricRepo::delete_older_than(&pool, cutoff)
        .await
        .expect("delete_older_than should succeed");

    assert_eq!(deleted_count, 2, "should delete the two old metrics");

    // Only the recent metric should remain.
    let since = now - Duration::days(30); // wide window to get everything
    let remaining = GpuMetricRepo::get_for_worker(&pool, worker_id, since)
        .await
        .expect("get_for_worker should succeed");

    assert_eq!(remaining.len(), 1, "only the recent metric should remain");
    assert_eq!(remaining[0].temperature_celsius, Some(70));
}

// ---------------------------------------------------------------------------
// Test 7 (bonus): Metric threshold upsert and retrieval
// ---------------------------------------------------------------------------

/// Upsert metric thresholds (global and worker-specific), then verify
/// `get_for_worker` returns both with correct ordering.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn threshold_upsert_and_retrieval(pool: PgPool) {
    let worker_id: i64 = 7001;

    // Insert a global threshold.
    let global_dto = UpsertThreshold {
        worker_id: None,
        metric_name: METRIC_TEMPERATURE.to_string(),
        warning_value: 80,
        critical_value: 90,
    };
    let global = MetricThresholdRepo::upsert(&pool, &global_dto)
        .await
        .expect("global threshold upsert should succeed");

    assert!(global.worker_id.is_none());
    assert_eq!(global.metric_name, METRIC_TEMPERATURE);
    assert_eq!(global.warning_value, 80);
    assert_eq!(global.critical_value, 90);

    // Insert a worker-specific override with stricter values.
    let worker_dto = UpsertThreshold {
        worker_id: Some(worker_id),
        metric_name: METRIC_TEMPERATURE.to_string(),
        warning_value: 70,
        critical_value: 85,
    };
    let worker_thresh = MetricThresholdRepo::upsert(&pool, &worker_dto)
        .await
        .expect("worker threshold upsert should succeed");

    assert_eq!(worker_thresh.worker_id, Some(worker_id));
    assert_eq!(worker_thresh.warning_value, 70);

    // Retrieve effective thresholds for the worker.
    let effective = MetricThresholdRepo::get_for_worker(&pool, worker_id)
        .await
        .expect("get_for_worker should succeed");

    // Should get 2 rows: worker-specific first, global second.
    assert_eq!(
        effective.len(),
        2,
        "should get both worker-specific and global threshold"
    );
    assert_eq!(
        effective[0].worker_id,
        Some(worker_id),
        "worker-specific should sort first"
    );
    assert!(
        effective[1].worker_id.is_none(),
        "global should sort second"
    );
}

// ---------------------------------------------------------------------------
// Test 8 (bonus): Batch insert metrics
// ---------------------------------------------------------------------------

/// Insert multiple metrics via `insert_batch()` and verify they are all
/// retrievable.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn batch_insert_metrics(pool: PgPool) {
    let now = Utc::now();
    let worker_id: i64 = 8001;

    let metrics = vec![
        make_metric_dto(0, 65, 50, now),
        make_metric_dto(1, 70, 55, now),
        make_metric_dto(2, 75, 60, now),
    ];

    GpuMetricRepo::insert_batch(&pool, worker_id, &metrics)
        .await
        .expect("batch insert should succeed");

    let since = now - Duration::minutes(1);
    let results = GpuMetricRepo::get_for_worker(&pool, worker_id, since)
        .await
        .expect("get_for_worker should succeed");

    assert_eq!(results.len(), 3, "all three metrics should be retrievable");

    // Verify each GPU index is present.
    let indices: Vec<i16> = results.iter().map(|m| m.gpu_index).collect();
    assert!(indices.contains(&0));
    assert!(indices.contains(&1));
    assert!(indices.contains(&2));
}

// ---------------------------------------------------------------------------
// Test 9 (bonus): Restart log list by worker
// ---------------------------------------------------------------------------

/// Create multiple restart logs for a worker and verify `list_by_worker`
/// returns them in reverse chronological order.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn restart_log_list_by_worker(pool: PgPool) {
    let user_id = create_test_user(&pool).await;
    let worker_id: i64 = 9001;

    // Create two restart logs.
    let dto1 = CreateRestartLog {
        worker_id,
        service_name: "comfyui.service".to_string(),
        initiated_by: user_id,
        reason: Some("first restart".to_string()),
    };
    let log1 = RestartLogRepo::create(&pool, &dto1)
        .await
        .expect("first restart log creation");

    let dto2 = CreateRestartLog {
        worker_id,
        service_name: "comfyui.service".to_string(),
        initiated_by: user_id,
        reason: Some("second restart".to_string()),
    };
    let log2 = RestartLogRepo::create(&pool, &dto2)
        .await
        .expect("second restart log creation");

    let logs = RestartLogRepo::list_by_worker(&pool, worker_id)
        .await
        .expect("list_by_worker should succeed");

    assert_eq!(logs.len(), 2, "should find both restart logs");
    // Most recent first (DESC order).
    assert_eq!(logs[0].id, log2.id, "most recent log should be first");
    assert_eq!(logs[1].id, log1.id, "older log should be second");
}
