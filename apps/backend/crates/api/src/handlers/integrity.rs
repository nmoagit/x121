//! Handlers for System Integrity & Repair Tools endpoints (PRD-43).
//!
//! Provides integrity scan management, repair actions, and model
//! checksum CRUD for the admin dashboard.

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde::Serialize;
use trulience_core::error::CoreError;
use trulience_core::integrity;
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::types::DbId;
use trulience_db::models::integrity_scan::CreateIntegrityScan;
use trulience_db::models::model_checksum::{CreateModelChecksum, UpdateModelChecksum};
use trulience_db::repositories::{IntegrityScanRepo, ModelChecksumRepo};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

/// Query parameters for paginated scan/checksum listing.
#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for listing checksums with optional type filter.
#[derive(Debug, Deserialize)]
pub struct ChecksumListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub model_type: Option<String>,
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Request body for starting a scan without a path param worker_id.
#[derive(Debug, Deserialize)]
pub struct StartScanRequest {
    pub worker_id: DbId,
    pub scan_type: String,
}

/// Request body for starting a worker-scoped scan (worker_id from path).
#[derive(Debug, Deserialize)]
pub struct WorkerScanRequest {
    pub scan_type: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Typed response for worker integrity report (DRY-258).
#[derive(Serialize)]
struct WorkerReportResponse {
    scan: trulience_db::models::integrity_scan::IntegrityScan,
    health_status: String,
}

/// Look up a checksum by ID or return a 404.
async fn ensure_checksum_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<trulience_db::models::model_checksum::ModelChecksum> {
    ModelChecksumRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| CoreError::NotFound { entity: "ModelChecksum", id }.into())
}

/// Shared helper to create an integrity scan for a worker (DRY-259/260).
async fn trigger_scan(
    state: &AppState,
    auth: &AuthUser,
    worker_id: DbId,
    scan_type: &str,
) -> AppResult<impl IntoResponse> {
    integrity::validate_scan_type(scan_type)?;

    let create = CreateIntegrityScan {
        worker_id,
        scan_type: scan_type.to_string(),
        triggered_by: Some(auth.user_id),
    };
    let scan = IntegrityScanRepo::create(&state.pool, &create).await?;
    Ok(Json(DataResponse { data: scan }))
}

// ---------------------------------------------------------------------------
// Integrity scan handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/integrity-scans
///
/// Start a new integrity scan. The worker_id and scan_type come from the body.
pub async fn start_scan(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<StartScanRequest>,
) -> AppResult<impl IntoResponse> {
    trigger_scan(&state, &auth, body.worker_id, &body.scan_type).await
}

/// POST /api/v1/admin/integrity-scans/{worker_id}
///
/// Start an integrity scan for a specific worker (worker_id from path).
pub async fn start_worker_scan(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(worker_id): Path<DbId>,
    Json(body): Json<WorkerScanRequest>,
) -> AppResult<impl IntoResponse> {
    trigger_scan(&state, &auth, worker_id, &body.scan_type).await
}

/// GET /api/v1/admin/integrity-scans/{worker_id}
///
/// Get the latest integrity scan report for a worker.
pub async fn get_worker_report(
    State(state): State<AppState>,
    Path(worker_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let scans = IntegrityScanRepo::list_by_worker(&state.pool, worker_id, 1, 0).await?;
    let latest = scans.into_iter().next();

    let report = latest.map(|scan| {
        let health = integrity::assess_health(
            scan.models_missing,
            scan.models_corrupted,
            scan.nodes_missing,
        );
        WorkerReportResponse {
            scan,
            health_status: health,
        }
    });

    Ok(Json(DataResponse { data: report }))
}

/// GET /api/v1/admin/integrity-scans
///
/// List all integrity scans with pagination.
pub async fn list_scans(
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let scans = IntegrityScanRepo::list_all(&state.pool, limit, offset).await?;
    Ok(Json(DataResponse { data: scans }))
}

// ---------------------------------------------------------------------------
// Repair action handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/repair/{worker_id}
///
/// Trigger a full verify-and-repair pass for a worker.
pub async fn repair_worker(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(worker_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    trigger_scan(&state, &auth, worker_id, integrity::SCAN_TYPE_FULL).await
}

/// POST /api/v1/admin/repair/{worker_id}/sync-models
///
/// Trigger model sync for a worker.
pub async fn sync_models(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(worker_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    trigger_scan(&state, &auth, worker_id, integrity::SCAN_TYPE_MODELS).await
}

/// POST /api/v1/admin/repair/{worker_id}/install-nodes
///
/// Trigger node installation for a worker.
pub async fn install_nodes(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(worker_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    trigger_scan(&state, &auth, worker_id, integrity::SCAN_TYPE_NODES).await
}

// ---------------------------------------------------------------------------
// Model checksum CRUD handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/model-checksums
///
/// List all model checksums with optional type filter and pagination.
pub async fn list_checksums(
    State(state): State<AppState>,
    Query(params): Query<ChecksumListParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let checksums = if let Some(ref model_type) = params.model_type {
        integrity::validate_model_type(model_type)?;
        ModelChecksumRepo::list_by_type(&state.pool, model_type, limit, offset).await?
    } else {
        ModelChecksumRepo::list_all(&state.pool, limit, offset).await?
    };

    Ok(Json(DataResponse { data: checksums }))
}

/// POST /api/v1/admin/model-checksums
///
/// Create a new model checksum record.
pub async fn create_checksum(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateModelChecksum>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref mt) = body.model_type {
        integrity::validate_model_type(mt)?;
    }
    let checksum = ModelChecksumRepo::create(&state.pool, &body).await?;
    Ok(Json(DataResponse { data: checksum }))
}

/// PUT /api/v1/admin/model-checksums/{id}
///
/// Update an existing model checksum.
pub async fn update_checksum(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateModelChecksum>,
) -> AppResult<impl IntoResponse> {
    // Verify existence first.
    let _existing = ensure_checksum_exists(&state.pool, id).await?;

    if let Some(ref mt) = body.model_type {
        integrity::validate_model_type(mt)?;
    }
    let checksum = ModelChecksumRepo::update(&state.pool, id, &body).await?;
    Ok(Json(DataResponse { data: checksum }))
}

/// DELETE /api/v1/admin/model-checksums/{id}
///
/// Delete a model checksum by ID.
pub async fn delete_checksum(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let _existing = ensure_checksum_exists(&state.pool, id).await?;
    ModelChecksumRepo::delete(&state.pool, id).await?;
    Ok(Json(DataResponse {
        data: serde_json::Value::Null,
    }))
}
