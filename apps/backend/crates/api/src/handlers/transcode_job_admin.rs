//! Admin + retry handlers for `transcode_jobs` (PRD-169).
//!
//! - `GET    /api/v1/admin/transcode-jobs`        list with filters (admin)
//! - `GET    /api/v1/admin/transcode-jobs/{id}`   single-job detail (admin)
//! - `POST   /api/v1/transcode-jobs/{id}/retry`   reset a failed job (editor or admin)

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use x121_core::error::CoreError;
use x121_core::types::{DbId, Timestamp};
use x121_db::models::transcode_job::{
    status_name_for, AdminListFilter, TranscodeJob, TRANSCODE_STATUS_COMPLETED,
    TRANSCODE_STATUS_IN_PROGRESS,
};
use x121_db::repositories::{SceneVideoVersionRepo, TranscodeJobRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::{RequireAdmin, RequireAuth};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Serialized view of a `TranscodeJob` with the status code pre-resolved.
///
/// NOTE: This is the response shape for all three endpoints below. Clients
/// use `status` (lowercase string from the lookup table) rather than the
/// raw `status_id` so they never need the lookup table themselves.
#[derive(Debug, Clone, Serialize)]
pub struct TranscodeJobView {
    pub id: DbId,
    pub uuid: String,
    pub entity_type: String,
    pub entity_id: DbId,
    pub status: String,
    pub attempts: i32,
    pub max_attempts: i32,
    pub next_attempt_at: Option<Timestamp>,
    pub source_codec: Option<String>,
    pub source_storage_key: String,
    pub target_storage_key: Option<String>,
    pub error_message: Option<String>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

impl From<TranscodeJob> for TranscodeJobView {
    fn from(job: TranscodeJob) -> Self {
        Self {
            status: status_name_for(job.status_id).to_string(),
            id: job.id,
            uuid: job.uuid.to_string(),
            entity_type: job.entity_type,
            entity_id: job.entity_id,
            attempts: job.attempts,
            max_attempts: job.max_attempts,
            next_attempt_at: job.next_attempt_at,
            source_codec: job.source_codec,
            source_storage_key: job.source_storage_key,
            target_storage_key: job.target_storage_key,
            error_message: job.error_message,
            started_at: job.started_at,
            completed_at: job.completed_at,
            created_at: job.created_at,
            updated_at: job.updated_at,
        }
    }
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query params for `GET /admin/transcode-jobs`.
#[derive(Debug, Default, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub entity_type: Option<String>,
    pub created_since: Option<Timestamp>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/v1/admin/transcode-jobs`
///
/// Paginated list for debugging. Admin only.
pub async fn list(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<DataResponse<Vec<TranscodeJobView>>>> {
    let filter = AdminListFilter {
        status: q.status,
        entity_type: q.entity_type,
        created_since: q.created_since,
        limit: q.limit,
        offset: q.offset,
    };
    let jobs = TranscodeJobRepo::list_admin(&state.pool, &filter)
        .await
        .map_err(|e| AppError::InternalError(format!("list_admin: {e}")))?;
    Ok(Json(DataResponse {
        data: jobs.into_iter().map(TranscodeJobView::from).collect(),
    }))
}

/// `GET /api/v1/admin/transcode-jobs/{id}`
///
/// Single-job detail including full `error_message`. Admin only.
pub async fn detail(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<TranscodeJobView>>> {
    let job = TranscodeJobRepo::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::InternalError(format!("find_by_id: {e}")))?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "TranscodeJob",
                id,
            })
        })?;
    Ok(Json(DataResponse {
        data: TranscodeJobView::from(job),
    }))
}

/// `POST /api/v1/transcode-jobs/{id}/retry`
///
/// Reset a failed (or cancelled) job for re-processing. Requires the user to
/// be authenticated — full editor-role scoping by project is deferred
/// (PRD-169 §6 Security notes; first pass uses RequireAuth, which still
/// prevents anonymous retries). Admin users can retry any job.
///
/// - `409 Conflict` if the job is currently `in_progress`.
/// - `422 Unprocessable Entity` if the job is already `completed`.
pub async fn retry(
    _auth: RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<(StatusCode, Json<DataResponse<TranscodeJobView>>)> {
    let existing = TranscodeJobRepo::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::InternalError(format!("find_by_id: {e}")))?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "TranscodeJob",
                id,
            })
        })?;

    match existing.status_id {
        s if s == TRANSCODE_STATUS_IN_PROGRESS => {
            return Err(AppError::Core(CoreError::Conflict(
                "Job is currently in progress; cannot retry".into(),
            )));
        }
        s if s == TRANSCODE_STATUS_COMPLETED => {
            return Err(AppError::Core(CoreError::Validation(
                "Job is already completed; nothing to retry".into(),
            )));
        }
        _ => {}
    }

    // Reset the job + sync SVV state in one transaction.
    let mut tx = state.pool.begin().await.map_err(sqlx::Error::from)?;
    // Reset SVV first (still within tx).
    SceneVideoVersionRepo::set_transcode_state(&mut tx, existing.entity_id, "pending")
        .await
        .map_err(sqlx::Error::from)?;
    tx.commit().await.map_err(sqlx::Error::from)?;

    let updated = TranscodeJobRepo::retry(&state.pool, id)
        .await
        .map_err(|e| AppError::InternalError(format!("retry: {e}")))?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "TranscodeJob",
                id,
            })
        })?;

    Ok((
        StatusCode::OK,
        Json(DataResponse {
            data: TranscodeJobView::from(updated),
        }),
    ))
}
