//! Handlers for the Studio Pulse Dashboard (PRD-42).
//!
//! Provides widget data aggregation endpoints and per-user config CRUD.
//! All endpoints require authentication via [`AuthUser`].

use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use trulience_core::types::{DbId, Timestamp};
use trulience_db::models::dashboard::SaveDashboardConfig;
use trulience_db::models::status::{JobStatus, ProjectStatus, SceneStatus};
use trulience_db::repositories::DashboardRepo;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Widget response types
// ---------------------------------------------------------------------------

/// A single job row for the Active Tasks widget.
#[derive(Debug, Serialize)]
pub struct ActiveTaskItem {
    pub job_id: DbId,
    pub job_type: String,
    pub status: String,
    pub progress_pct: i16,
    pub progress_message: Option<String>,
    pub elapsed_seconds: Option<i32>,
    pub worker_id: Option<DbId>,
    pub submitted_by: DbId,
    pub submitted_at: Timestamp,
}

/// A single project row for the Project Progress widget.
#[derive(Debug, Serialize)]
pub struct ProjectProgressItem {
    pub project_id: DbId,
    pub project_name: String,
    pub scenes_approved: i64,
    pub scenes_total: i64,
    pub progress_pct: f64,
    pub status_color: String,
}

/// Top-level disk health data.
#[derive(Debug, Serialize)]
pub struct DiskHealthData {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub usage_pct: f64,
    pub warning_threshold: f64,
    pub critical_threshold: f64,
}

/// A single event row for the Activity Feed widget.
#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct ActivityFeedItem {
    pub id: DbId,
    pub event_type: String,
    pub category: String,
    pub source_entity_type: Option<String>,
    pub source_entity_id: Option<DbId>,
    pub actor_user_id: Option<DbId>,
    pub actor_name: Option<String>,
    pub payload: serde_json::Value,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query params for `GET /dashboard/widgets/active-tasks`.
#[derive(Debug, Deserialize)]
pub struct ActiveTasksQuery {
    /// Max number of recently completed jobs to include. Defaults to 10.
    pub recent_completed: Option<i64>,
}

/// Query params for `GET /dashboard/widgets/activity-feed`.
#[derive(Debug, Deserialize)]
pub struct ActivityFeedQuery {
    /// Maximum events to return. Defaults to 50, capped at 200.
    pub limit: Option<i64>,
    /// Offset for pagination. Defaults to 0.
    pub offset: Option<i64>,
    /// Filter by event category (e.g. "job", "review", "system").
    pub category: Option<String>,
    /// Filter by project ID (matches source_entity_id where entity type is "project").
    pub project_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Helpers: Active-task row (raw from DB)
// ---------------------------------------------------------------------------

#[derive(Debug, sqlx::FromRow)]
struct ActiveTaskRow {
    id: DbId,
    job_type: String,
    status_id: i16,
    progress_percent: i16,
    progress_message: Option<String>,
    actual_duration_secs: Option<i32>,
    worker_id: Option<DbId>,
    submitted_by: DbId,
    submitted_at: Timestamp,
}

/// Map a status_id to a human-readable label.
fn job_status_label(status_id: i16) -> &'static str {
    match status_id {
        x if x == JobStatus::Pending as i16 => "pending",
        x if x == JobStatus::Running as i16 => "running",
        x if x == JobStatus::Completed as i16 => "completed",
        x if x == JobStatus::Failed as i16 => "failed",
        x if x == JobStatus::Cancelled as i16 => "cancelled",
        x if x == JobStatus::Retrying as i16 => "retrying",
        _ => "unknown",
    }
}

// ---------------------------------------------------------------------------
// Active Tasks Widget
// ---------------------------------------------------------------------------

/// GET /api/v1/dashboard/widgets/active-tasks
///
/// Returns running, pending/queued, and recently completed jobs.
pub async fn active_tasks(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ActiveTasksQuery>,
) -> AppResult<impl IntoResponse> {
    let recent_limit = params.recent_completed.unwrap_or(10).min(50);

    // Fetch all running + pending jobs, plus recently completed jobs.
    let rows = sqlx::query_as::<_, ActiveTaskRow>(
        "SELECT id, job_type, status_id, progress_percent, progress_message, \
                actual_duration_secs, worker_id, submitted_by, submitted_at \
         FROM jobs \
         WHERE status_id IN ($1, $2) \
         UNION ALL \
         (SELECT id, job_type, status_id, progress_percent, progress_message, \
                 actual_duration_secs, worker_id, submitted_by, submitted_at \
          FROM jobs \
          WHERE status_id = $3 \
          ORDER BY completed_at DESC \
          LIMIT $4) \
         ORDER BY submitted_at DESC",
    )
    .bind(JobStatus::Running.id())
    .bind(JobStatus::Pending.id())
    .bind(JobStatus::Completed.id())
    .bind(recent_limit)
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<ActiveTaskItem> = rows
        .into_iter()
        .map(|r| ActiveTaskItem {
            job_id: r.id,
            job_type: r.job_type,
            status: job_status_label(r.status_id).to_string(),
            progress_pct: r.progress_percent,
            progress_message: r.progress_message,
            elapsed_seconds: r.actual_duration_secs,
            worker_id: r.worker_id,
            submitted_by: r.submitted_by,
            submitted_at: r.submitted_at,
        })
        .collect();

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// Project Progress Widget
// ---------------------------------------------------------------------------

/// Row for the project progress aggregation query.
#[derive(Debug, sqlx::FromRow)]
struct ProjectProgressRow {
    project_id: DbId,
    project_name: String,
    scenes_approved: i64,
    scenes_total: i64,
}

/// GET /api/v1/dashboard/widgets/project-progress
///
/// Returns per-project scene completion tracking.
pub async fn project_progress(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    // Query active projects with scene counts.
    // A scene is "approved" when its status_id matches SceneStatus::Approved.
    // We join through characters to link scenes -> projects.
    let rows = sqlx::query_as::<_, ProjectProgressRow>(
        "SELECT \
             p.id AS project_id, \
             p.name AS project_name, \
             COUNT(s.id) FILTER (WHERE s.status_id = $1) AS scenes_approved, \
             COUNT(s.id) AS scenes_total \
         FROM projects p \
         LEFT JOIN characters c ON c.project_id = p.id AND c.deleted_at IS NULL \
         LEFT JOIN scenes s ON s.character_id = c.id AND s.deleted_at IS NULL \
         WHERE p.deleted_at IS NULL \
           AND p.status_id NOT IN ($2, $3) \
         GROUP BY p.id, p.name \
         ORDER BY p.name ASC",
    )
    .bind(SceneStatus::Approved.id())
    .bind(ProjectStatus::Archived.id())
    .bind(ProjectStatus::Completed.id())
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<ProjectProgressItem> = rows
        .into_iter()
        .map(|r| {
            let pct = if r.scenes_total == 0 {
                0.0
            } else {
                (r.scenes_approved as f64 / r.scenes_total as f64) * 100.0
            };

            let color = if pct >= 75.0 {
                "green"
            } else if pct >= 50.0 {
                "yellow"
            } else {
                "red"
            };

            ProjectProgressItem {
                project_id: r.project_id,
                project_name: r.project_name,
                scenes_approved: r.scenes_approved,
                scenes_total: r.scenes_total,
                progress_pct: pct,
                status_color: color.to_string(),
            }
        })
        .collect();

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// Disk Health Widget
// ---------------------------------------------------------------------------

/// Warning threshold: 80% usage.
const DISK_WARNING_THRESHOLD: f64 = 0.8;
/// Critical threshold: 90% usage.
const DISK_CRITICAL_THRESHOLD: f64 = 0.9;

/// GET /api/v1/dashboard/widgets/disk-health
///
/// Returns current disk usage stats from the filesystem.
pub async fn disk_health(
    _auth: AuthUser,
) -> AppResult<impl IntoResponse> {
    // Use statvfs via std::process::Command to read disk stats for the
    // data directory. Falls back to the root mount if DATA_DIR is unset.
    let data_dir =
        std::env::var("DATA_DIR").unwrap_or_else(|_| "/".to_string());

    let stats = tokio::task::spawn_blocking(move || {
        get_disk_stats(&data_dir)
    })
    .await
    .map_err(|e| crate::error::AppError::InternalError(format!("Disk stats task failed: {e}")))?;

    Ok(Json(DataResponse { data: stats }))
}

/// Read disk usage for a given path using `nix::sys::statvfs` or fallback.
///
/// We use the `nix` crate-free approach: parse `/proc/mounts` is complex,
/// so instead we use `std::fs::metadata` + a simpler syscall wrapper.
fn get_disk_stats(path: &str) -> DiskHealthData {
    // Safety: libc::statvfs is well-defined for valid paths.
    #[cfg(unix)]
    {
        use std::ffi::CString;
        use std::mem::MaybeUninit;

        let c_path = CString::new(path).unwrap_or_else(|_| CString::new("/").unwrap());
        let mut stat = MaybeUninit::<libc::statvfs>::uninit();

        let ret = unsafe { libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) };

        if ret == 0 {
            let stat = unsafe { stat.assume_init() };
            let block_size = stat.f_frsize as u64;
            let total = stat.f_blocks as u64 * block_size;
            let free = stat.f_bavail as u64 * block_size;
            let used = total.saturating_sub(free);
            let usage_pct = if total == 0 {
                0.0
            } else {
                used as f64 / total as f64
            };

            return DiskHealthData {
                total_bytes: total,
                used_bytes: used,
                free_bytes: free,
                usage_pct,
                warning_threshold: DISK_WARNING_THRESHOLD,
                critical_threshold: DISK_CRITICAL_THRESHOLD,
            };
        }
    }

    // Fallback: return zeroed stats if syscall fails or non-Unix.
    DiskHealthData {
        total_bytes: 0,
        used_bytes: 0,
        free_bytes: 0,
        usage_pct: 0.0,
        warning_threshold: DISK_WARNING_THRESHOLD,
        critical_threshold: DISK_CRITICAL_THRESHOLD,
    }
}

// ---------------------------------------------------------------------------
// Activity Feed Widget
// ---------------------------------------------------------------------------

/// Maximum events per page.
const FEED_MAX_LIMIT: i64 = 200;
/// Default events per page.
const FEED_DEFAULT_LIMIT: i64 = 50;

/// GET /api/v1/dashboard/widgets/activity-feed
///
/// Returns chronological event stream with optional filtering.
pub async fn activity_feed(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ActivityFeedQuery>,
) -> AppResult<impl IntoResponse> {
    let limit = params.limit.unwrap_or(FEED_DEFAULT_LIMIT).min(FEED_MAX_LIMIT);
    let offset = params.offset.unwrap_or(0);

    // Build dynamic query with optional filters.
    let mut conditions: Vec<String> = Vec::new();
    let mut bind_idx: u32 = 1;

    if params.category.is_some() {
        conditions.push(format!("et.category = ${bind_idx}"));
        bind_idx += 1;
    }

    if params.project_id.is_some() {
        conditions.push(format!(
            "(e.source_entity_type = 'project' AND e.source_entity_id = ${bind_idx})"
        ));
        bind_idx += 1;
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        "SELECT \
             e.id, \
             et.name AS event_type, \
             et.category, \
             e.source_entity_type, \
             e.source_entity_id, \
             e.actor_user_id, \
             u.username AS actor_name, \
             e.payload, \
             e.created_at \
         FROM events e \
         JOIN event_types et ON et.id = e.event_type_id \
         LEFT JOIN users u ON u.id = e.actor_user_id \
         {where_clause} \
         ORDER BY e.created_at DESC \
         LIMIT ${bind_idx} OFFSET ${}",
        bind_idx + 1,
    );

    let mut q = sqlx::query_as::<_, ActivityFeedItem>(&query);

    if let Some(ref cat) = params.category {
        q = q.bind(cat);
    }
    if let Some(pid) = params.project_id {
        q = q.bind(pid);
    }

    q = q.bind(limit).bind(offset);

    let items = q.fetch_all(&state.pool).await?;

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// Dashboard Config CRUD
// ---------------------------------------------------------------------------

/// GET /api/v1/user/dashboard
///
/// Returns the current user's dashboard configuration, or a default if none exists.
pub async fn get_dashboard_config(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let config = DashboardRepo::find_by_user(&state.pool, auth.user_id).await?;

    let data: serde_json::Value = match config {
        Some(c) => serde_json::to_value(c)
            .map_err(|e| crate::error::AppError::InternalError(e.to_string()))?,
        None => {
            // Return a default config instead of 404.
            serde_json::json!({
                "id": 0,
                "user_id": auth.user_id,
                "layout_json": default_layout(),
                "widget_settings_json": {},
                "created_at": null,
                "updated_at": null,
            })
        }
    };

    Ok(Json(DataResponse { data }))
}

/// PUT /api/v1/user/dashboard
///
/// Save the current user's dashboard layout and widget settings.
pub async fn save_dashboard_config(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<SaveDashboardConfig>,
) -> AppResult<impl IntoResponse> {
    let config = DashboardRepo::upsert(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        config_id = config.id,
        "Dashboard config saved",
    );

    Ok(Json(DataResponse { data: config }))
}

/// Default widget layout for new users.
///
/// Grid positions follow a 4-column layout:
/// - Active Tasks: top-left, 2 cols
/// - Project Progress: top-right, 2 cols
/// - Disk Health: bottom-left, 1 col
/// - Activity Feed: bottom-right, 3 cols
fn default_layout() -> serde_json::Value {
    serde_json::json!([
        { "widget": "active-tasks",      "x": 0, "y": 0, "w": 2, "h": 2 },
        { "widget": "project-progress",  "x": 2, "y": 0, "w": 2, "h": 2 },
        { "widget": "disk-health",       "x": 0, "y": 2, "w": 1, "h": 2 },
        { "widget": "activity-feed",     "x": 1, "y": 2, "w": 3, "h": 2 },
    ])
}
