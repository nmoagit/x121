//! Schedule executor background service (PRD-119/PRD-134).
//!
//! Periodically checks for due schedules and executes their actions.
//! Currently supports the `schedule_generation` action type which triggers
//! batch scene generation.

use std::time::Duration;

use chrono::Utc;
use tokio_util::sync::CancellationToken;
use x121_core::job_scheduling::{
    ACTION_SCHEDULE_GENERATION, ACTION_SUBMIT_BATCH, ACTION_SUBMIT_JOB, HISTORY_FAILED,
    HISTORY_SKIPPED, HISTORY_SUCCESS,
};
use x121_core::types::DbId;
use x121_db::repositories::{ScheduleHistoryRepo, ScheduleRepo};

use crate::state::AppState;

/// How often the executor checks for due schedules.
const CHECK_INTERVAL: Duration = Duration::from_secs(30);

/// Run the schedule executor loop.
///
/// Checks for due schedules every 30 seconds and executes their actions.
pub async fn run(state: AppState, cancel: CancellationToken) {
    tracing::info!(
        interval_secs = CHECK_INTERVAL.as_secs(),
        "Schedule executor started"
    );

    let mut interval = tokio::time::interval(CHECK_INTERVAL);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Schedule executor stopping");
                break;
            }
            _ = interval.tick() => {
                if let Err(e) = process_due_schedules(&state).await {
                    tracing::error!(error = %e, "Schedule executor: tick failed");
                }
            }
        }
    }
}

/// Find and execute all due schedules.
async fn process_due_schedules(state: &AppState) -> Result<(), Box<dyn std::error::Error>> {
    let now = Utc::now();
    let due = ScheduleRepo::find_due(&state.pool, now).await?;

    if due.is_empty() {
        return Ok(());
    }

    tracing::info!(
        count = due.len(),
        "Schedule executor: processing due schedules"
    );

    for schedule in due {
        let start = std::time::Instant::now();

        let result = match schedule.action_type.as_str() {
            ACTION_SCHEDULE_GENERATION => {
                execute_schedule_generation(state, &schedule.action_config).await
            }
            ACTION_SUBMIT_JOB | ACTION_SUBMIT_BATCH => {
                // Placeholder for future job submission action types.
                tracing::warn!(
                    schedule_id = schedule.id,
                    action_type = %schedule.action_type,
                    "Action type not yet implemented in executor"
                );
                Ok("skipped: action type not implemented".to_string())
            }
            other => {
                tracing::warn!(
                    schedule_id = schedule.id,
                    action_type = other,
                    "Unknown action type"
                );
                Err(format!("Unknown action type: {other}"))
            }
        };

        let elapsed_ms = start.elapsed().as_millis() as i32;

        // Record execution in history.
        let (status, error_message) = match &result {
            Ok(msg) => {
                if msg.starts_with("skipped") {
                    (HISTORY_SKIPPED, Some(msg.clone()))
                } else {
                    (HISTORY_SUCCESS, None)
                }
            }
            Err(e) => (HISTORY_FAILED, Some(e.clone())),
        };

        let _ = ScheduleHistoryRepo::record(
            &state.pool,
            schedule.id,
            status,
            None, // result_job_id
            error_message.as_deref(),
            Some(elapsed_ms),
        )
        .await;

        // Update schedule: increment run_count, set last_run_at.
        let _ = ScheduleRepo::record_execution(&state.pool, schedule.id, now).await;

        // For one-time schedules, deactivate after execution.
        if schedule.schedule_type == x121_core::job_scheduling::SCHEDULE_ONE_TIME {
            let _ = ScheduleRepo::set_active(&state.pool, schedule.id, false).await;
        } else {
            // Recompute next_run_at for recurring schedules.
            if let Some(cron_str) = schedule.cron_expression.as_deref() {
                if let Ok(fields) = x121_core::job_scheduling::parse_cron_fields(cron_str) {
                    let next = x121_core::job_scheduling::compute_next_run(&fields, now);
                    let _ = ScheduleRepo::set_next_run(&state.pool, schedule.id, next).await;
                }
            }
        }

        tracing::info!(
            schedule_id = schedule.id,
            action_type = %schedule.action_type,
            elapsed_ms,
            status,
            "Schedule executed"
        );
    }

    Ok(())
}

/// Execute the `schedule_generation` action: start batch generation for the scene IDs
/// stored in the schedule's action_config.
async fn execute_schedule_generation(
    state: &AppState,
    action_config: &serde_json::Value,
) -> Result<String, String> {
    use x121_db::models::generation::UpdateSceneGeneration;
    use x121_db::models::status::SceneStatus;
    use x121_db::repositories::{SceneGenerationLogRepo, SceneRepo, SegmentRepo};

    let scene_ids: Vec<DbId> = action_config
        .get("scene_ids")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .ok_or("action_config missing scene_ids")?;

    if scene_ids.is_empty() {
        return Err("No scene_ids in action_config".into());
    }

    let mut started = 0u32;
    let mut skipped = 0u32;

    for &scene_id in &scene_ids {
        // Verify scene still exists and is in Scheduled status.
        let scene = match SceneRepo::find_by_id(&state.pool, scene_id).await {
            Ok(Some(s)) => s,
            _ => {
                tracing::warn!(scene_id, "Scheduled scene not found — skipping");
                skipped += 1;
                continue;
            }
        };

        if scene.status_id != SceneStatus::Scheduled.id() {
            tracing::warn!(
                scene_id,
                status_id = scene.status_id,
                "Scene no longer in Scheduled status — skipping"
            );
            skipped += 1;
            continue;
        }

        // Clear old logs and segments.
        let _ = SceneGenerationLogRepo::delete_for_scene(&state.pool, scene_id).await;
        let _ = SegmentRepo::delete_for_scene(&state.pool, scene_id).await;

        // Use the existing init_scene_generation + submit_first_segment flow.
        match crate::handlers::generation::init_scene_generation(state, scene_id, None).await {
            Ok((estimated, _)) => {
                x121_pipeline::gen_log::log(
                    &state.pool,
                    scene_id,
                    "info",
                    "Starting scheduled video generation",
                )
                .await;
                x121_pipeline::gen_log::log(
                    &state.pool,
                    scene_id,
                    "info",
                    format!("Generation started \u{2014} {estimated} segments estimated"),
                )
                .await;
                crate::handlers::generation::submit_first_segment(state, scene_id);
                started += 1;
            }
            Err(e) => {
                tracing::warn!(scene_id, error = %e, "Scheduled scene failed preconditions — skipping");
                // Revert to appropriate status.
                let restore =
                    crate::handlers::generation::resolve_restore_status(&state.pool, scene_id)
                        .await;
                let update = UpdateSceneGeneration::reset_to(restore);
                let _ = SceneRepo::update_generation_state(&state.pool, scene_id, &update).await;
                skipped += 1;
            }
        }
    }

    Ok(format!("started: {started}, skipped: {skipped}"))
}
