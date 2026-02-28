//! Handlers for the render queue timeline / Gantt view (PRD-90).
//!
//! The timeline endpoint is available to all authenticated users.
//! Job reordering uses the existing `PUT /admin/queue/reorder` from queue.rs (PRD-08).

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use x121_core::render_timeline::{
    self, assign_lanes, compute_job_end_estimate, estimate_job_duration_seconds, zoom_to_duration,
    LaneAssignment, TimelineJob, DEFAULT_DURATION_SECS, DEFAULT_TIMELINE_LIMIT, DEFAULT_ZOOM,
    MAX_TIMELINE_LIMIT,
};
use x121_core::search::clamp_limit;
use x121_core::types::DbId;
use x121_db::repositories::RenderTimelineRepo;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query / request DTOs
// ---------------------------------------------------------------------------

/// Query parameters for `GET /queue/timeline`.
#[derive(Debug, Deserialize)]
pub struct TimelineParams {
    /// Zoom level: "1h", "6h", "24h", "7d". Defaults to "6h".
    pub zoom: Option<String>,
    /// Maximum number of jobs to return. Defaults to 200, capped at 500.
    pub limit: Option<i64>,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// A single job on the timeline.
#[derive(Debug, Serialize)]
pub struct TimelineJobResponse {
    pub job_id: DbId,
    pub worker_id: Option<DbId>,
    pub worker_name: Option<String>,
    pub status_id: i16,
    pub priority: i32,
    pub job_type: String,
    pub progress_percent: i16,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub lane: usize,
}

/// A worker lane header for the timeline.
#[derive(Debug, Serialize)]
pub struct WorkerLaneResponse {
    pub id: DbId,
    pub name: String,
    pub status_id: i16,
    pub current_job_id: Option<DbId>,
}

/// Full timeline response.
#[derive(Debug, Serialize)]
pub struct TimelineResponse {
    pub zoom: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub workers: Vec<WorkerLaneResponse>,
    pub jobs: Vec<TimelineJobResponse>,
    pub idle_workers: i64,
    pub busy_workers: i64,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/v1/queue/timeline?zoom=6h&limit=200`
///
/// Returns timeline data for the Gantt view: jobs placed in worker lanes
/// with computed start/end positions.
pub async fn get_timeline(
    _auth: AuthUser,
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<TimelineParams>,
) -> AppResult<impl IntoResponse> {
    let zoom = params.zoom.as_deref().unwrap_or(DEFAULT_ZOOM);
    render_timeline::validate_zoom_level(zoom)?;

    let limit = clamp_limit(params.limit, DEFAULT_TIMELINE_LIMIT, MAX_TIMELINE_LIMIT);
    let duration = zoom_to_duration(zoom);
    let now = Utc::now();
    let from = now - duration;
    let to = now + duration;

    // Fetch data in parallel-ish (sequential awaits, but keeps code simple).
    let job_rows = RenderTimelineRepo::list_timeline_jobs(&state.pool, from, to, limit).await?;
    let workers = RenderTimelineRepo::list_active_workers(&state.pool).await?;
    let avg_duration = RenderTimelineRepo::get_avg_duration(&state.pool).await?;
    let (idle_workers, busy_workers) =
        RenderTimelineRepo::worker_status_counts(&state.pool).await?;

    // Convert DB rows to core TimelineJob structs for lane assignment.
    let timeline_jobs: Vec<TimelineJob> = job_rows
        .iter()
        .map(|row| {
            let est_dur = estimate_job_duration_seconds(
                row.estimated_duration_secs.map(|s| s as f64),
                avg_duration.unwrap_or(DEFAULT_DURATION_SECS),
            );
            TimelineJob {
                job_id: row.id,
                worker_id: row.worker_id,
                status: format!("{}", row.status_id),
                started_at: row.started_at,
                estimated_start: None,
                estimated_duration_seconds: est_dur,
                priority: row.priority,
            }
        })
        .collect();

    let lane_assignments = assign_lanes(&timeline_jobs);

    // Build the response by merging DB rows with lane assignments.
    let jobs: Vec<TimelineJobResponse> = job_rows
        .iter()
        .map(|row| {
            let assignment = lane_assignments
                .iter()
                .find(|a| a.job_id == row.id)
                .cloned()
                .unwrap_or_else(|| {
                    let start = row.started_at.unwrap_or(row.submitted_at);
                    let est_dur = estimate_job_duration_seconds(
                        row.estimated_duration_secs.map(|s| s as f64),
                        avg_duration.unwrap_or(DEFAULT_DURATION_SECS),
                    );
                    LaneAssignment {
                        job_id: row.id,
                        lane: 0,
                        start,
                        end: compute_job_end_estimate(start, est_dur),
                    }
                });

            TimelineJobResponse {
                job_id: row.id,
                worker_id: row.worker_id,
                worker_name: row.worker_name.clone(),
                status_id: row.status_id,
                priority: row.priority,
                job_type: row.job_type.clone(),
                progress_percent: row.progress_percent,
                start: assignment.start,
                end: assignment.end,
                lane: assignment.lane,
            }
        })
        .collect();

    let worker_responses: Vec<WorkerLaneResponse> = workers
        .iter()
        .map(|w| WorkerLaneResponse {
            id: w.id,
            name: w.name.clone(),
            status_id: w.status_id,
            current_job_id: w.current_job_id,
        })
        .collect();

    let resp = TimelineResponse {
        zoom: zoom.to_string(),
        from,
        to,
        workers: worker_responses,
        jobs,
        idle_workers,
        busy_workers,
    };

    Ok(Json(DataResponse { data: resp }))
}

// NOTE: Job reordering uses the existing `PUT /admin/queue/reorder` endpoint
// from queue.rs (PRD-08). No duplicate reorder handler here (DRY audit).
