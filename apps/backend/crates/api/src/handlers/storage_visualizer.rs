//! Handlers for the `/admin/storage` resource (PRD-19).
//!
//! Provides admin-only endpoints for disk space visualization: treemap
//! hierarchy, file-type breakdown, storage summary, snapshot refresh,
//! and file type category management.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::storage_visualizer::{
    self, DetailedSnapshot, FileTypeBreakdown, StorageSnapshot, TreemapNode,
};
use x121_core::types::DbId;
use x121_db::models::storage_visualizer::StorageSummary;
use x121_db::repositories::StorageVisualizerRepo;

use crate::error::AppResult;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ── Treemap ─────────────────────────────────────────────────────────

/// Query parameters for the treemap endpoint.
#[derive(Debug, Deserialize)]
pub struct TreemapParams {
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
}

/// GET /api/v1/admin/storage/treemap
///
/// Return hierarchical treemap data for the D3 visualization.
/// Optionally scoped to a specific entity as the root.
pub async fn treemap(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<TreemapParams>,
) -> AppResult<Json<DataResponse<Vec<TreemapNode>>>> {
    // Validate entity_type if provided.
    if let Some(ref et) = params.entity_type {
        storage_visualizer::validate_entity_type(et)?;
    }

    let snapshots = StorageVisualizerRepo::get_hierarchy_snapshots(
        &state.pool,
        params.entity_type.as_deref(),
        params.entity_id,
    )
    .await?;

    // Convert DB snapshots into core StorageSnapshot for hierarchy building.
    let core_snapshots: Vec<StorageSnapshot> = snapshots
        .iter()
        .map(|s| StorageSnapshot {
            entity_type: s.entity_type.clone(),
            entity_id: s.entity_id,
            entity_name: s.entity_name.clone(),
            parent_entity_type: s.parent_entity_type.clone(),
            parent_entity_id: s.parent_entity_id,
            total_bytes: s.total_bytes,
            file_count: s.file_count,
            reclaimable_bytes: s.reclaimable_bytes,
        })
        .collect();

    let tree = storage_visualizer::build_hierarchy(&core_snapshots);
    Ok(Json(DataResponse { data: tree }))
}

// ── Breakdown ───────────────────────────────────────────────────────

/// GET /api/v1/admin/storage/breakdown
///
/// Return file-type distribution across all storage snapshots.
pub async fn breakdown(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<Vec<FileTypeBreakdown>>>> {
    let snapshots =
        StorageVisualizerRepo::list_snapshots(&state.pool, None, None, None, Some(10_000), Some(0))
            .await?;

    let detailed: Vec<DetailedSnapshot> = snapshots
        .iter()
        .map(|s| DetailedSnapshot {
            total_bytes: s.total_bytes,
            file_count: s.file_count,
            video_bytes: s.video_bytes,
            image_bytes: s.image_bytes,
            intermediate_bytes: s.intermediate_bytes,
            metadata_bytes: s.metadata_bytes,
            model_bytes: s.model_bytes,
        })
        .collect();

    let result = storage_visualizer::compute_breakdown(&detailed);
    Ok(Json(DataResponse { data: result }))
}

// ── Summary ─────────────────────────────────────────────────────────

/// GET /api/v1/admin/storage/summary
///
/// Return aggregate storage statistics: total bytes, file count,
/// reclaimable bytes, and reclaimable percentage.
pub async fn summary(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<StorageSummary>>> {
    let row = StorageVisualizerRepo::get_summary(&state.pool).await?;
    let reclaimable_pct =
        storage_visualizer::compute_reclaimable_fraction(row.reclaimable_bytes, row.total_bytes);

    Ok(Json(DataResponse {
        data: StorageSummary {
            total_bytes: row.total_bytes,
            total_files: row.total_files,
            reclaimable_bytes: row.reclaimable_bytes,
            reclaimable_percentage: reclaimable_pct,
            entity_count: row.entity_count,
            snapshot_at: row.latest_snapshot_at,
        },
    }))
}

// ── Refresh ─────────────────────────────────────────────────────────

/// Response from a snapshot refresh operation.
#[derive(Debug, serde::Serialize)]
pub struct RefreshResult {
    /// Number of snapshots cleared before refresh.
    pub cleared_count: u64,
    /// Message indicating the refresh was initiated.
    pub message: String,
}

/// POST /api/v1/admin/storage/refresh
///
/// Trigger a full snapshot refresh. In a production system this would
/// scan the filesystem and populate `storage_usage_snapshots`. For now
/// it clears stale data and returns a confirmation.
pub async fn refresh(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let cleared = StorageVisualizerRepo::delete_all_snapshots(&state.pool).await?;

    Ok((
        StatusCode::OK,
        Json(DataResponse {
            data: RefreshResult {
                cleared_count: cleared,
                message: "Storage snapshot refresh initiated. \
                          New snapshots will be populated asynchronously."
                    .to_string(),
            },
        }),
    ))
}

// ── Categories ──────────────────────────────────────────────────────

/// GET /api/v1/admin/storage/categories
///
/// List all file type categories.
pub async fn list_categories(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let categories = StorageVisualizerRepo::list_categories(&state.pool).await?;
    Ok(Json(DataResponse { data: categories }))
}
