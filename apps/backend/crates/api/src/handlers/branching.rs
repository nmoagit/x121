//! Handlers for Content Branching & Exploration (PRD-50).
//!
//! Provides endpoints for creating, listing, comparing, promoting, and
//! deleting branches used for concurrent creative exploration of scenes.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use x121_core::branching;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::branch::{BranchWithStats, CreateBranch, UpdateBranch};
use x121_db::repositories::BranchRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for the stale-branches endpoint.
#[derive(Debug, Deserialize)]
pub struct StaleParams {
    pub older_than_days: Option<i32>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a branch exists, returning the full row.
async fn ensure_branch_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<x121_db::models::branch::Branch> {
    BranchRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "Branch",
            id,
        })
    })
}

// ---------------------------------------------------------------------------
// GET /scenes/:scene_id/branches
// ---------------------------------------------------------------------------

/// List all branches for a scene.
pub async fn list_branches(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let branches = BranchRepo::list_by_scene(&state.pool, scene_id).await?;

    tracing::debug!(
        count = branches.len(),
        scene_id,
        "Listed branches for scene"
    );

    Ok(Json(DataResponse { data: branches }))
}

// ---------------------------------------------------------------------------
// POST /scenes/:scene_id/branch
// ---------------------------------------------------------------------------

/// Create a new branch for a scene.
///
/// Validates the branch name, nesting depth, and per-scene count limits
/// via `x121_core::branching`.
pub async fn create_branch(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(scene_id): Path<DbId>,
    Json(body): Json<CreateBranch>,
) -> AppResult<impl IntoResponse> {
    // Validate name.
    branching::validate_branch_name(&body.name)?;

    // Validate count limit.
    let count = BranchRepo::count_by_scene(&state.pool, scene_id).await?;
    branching::validate_branch_count(count)?;

    // Determine parent depth; new branch depth = parent_depth + 1 (or 0 for root).
    // For simplicity, new branches are root-level (depth 0) unless an explicit
    // parent_branch_id is provided in a future iteration. The spec uses depth 0
    // for the default branch created implicitly.
    let depth: i32 = 0;
    branching::validate_branch_depth(depth)?;

    let branch = BranchRepo::create(
        &state.pool,
        scene_id,
        None, // parent_branch_id
        &body,
        depth,
        auth.user_id,
    )
    .await?;

    tracing::info!(
        branch_id = branch.id,
        scene_id,
        user_id = auth.user_id,
        name = %body.name,
        "Branch created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: branch })))
}

// ---------------------------------------------------------------------------
// GET /branches/:id
// ---------------------------------------------------------------------------

/// Get a single branch by ID.
pub async fn get_branch(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let branch = ensure_branch_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: branch }))
}

// ---------------------------------------------------------------------------
// PUT /branches/:id
// ---------------------------------------------------------------------------

/// Update an existing branch.
pub async fn update_branch(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateBranch>,
) -> AppResult<impl IntoResponse> {
    // Validate name if provided.
    if let Some(ref name) = body.name {
        branching::validate_branch_name(name)?;
    }

    let branch = BranchRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Branch",
                id,
            })
        })?;

    tracing::info!(branch_id = id, "Branch updated");

    Ok(Json(DataResponse { data: branch }))
}

// ---------------------------------------------------------------------------
// DELETE /branches/:id
// ---------------------------------------------------------------------------

/// Delete a branch by ID.
///
/// Prevents deleting the default branch -- the caller must promote another
/// branch first.
pub async fn delete_branch(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let branch = ensure_branch_exists(&state.pool, id).await?;

    if branch.is_default {
        return Err(AppError::Core(CoreError::Conflict(
            "Cannot delete the default branch. Promote another branch first.".to_string(),
        )));
    }

    let deleted = BranchRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Branch deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Branch",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// POST /branches/:id/promote
// ---------------------------------------------------------------------------

/// Promote a branch to the scene's default.
///
/// Uses a transactional promote in the repository.
pub async fn promote_branch(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let branch = ensure_branch_exists(&state.pool, id).await?;

    if branch.is_default {
        return Err(AppError::Core(CoreError::Conflict(
            "Branch is already the default".to_string(),
        )));
    }

    BranchRepo::promote(&state.pool, id, branch.scene_id).await?;

    tracing::info!(
        branch_id = id,
        scene_id = branch.scene_id,
        user_id = auth.user_id,
        "Branch promoted to default"
    );

    // Re-fetch the promoted branch for the response.
    let updated = ensure_branch_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// GET /branches/:id/compare/:other_id
// ---------------------------------------------------------------------------

/// Compare two branches side-by-side.
///
/// Returns parameter diffs and segment counts for each branch.
pub async fn compare_branches(
    State(state): State<AppState>,
    Path((id, other_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let branch_a = ensure_branch_exists(&state.pool, id).await?;
    let branch_b = ensure_branch_exists(&state.pool, other_id).await?;

    let diffs = branching::compare_branch_parameters(
        &branch_a.parameters_snapshot,
        &branch_b.parameters_snapshot,
    );

    // Count segments per branch via the repository.
    let seg_count_a = BranchRepo::count_segments(&state.pool, id).await?;
    let seg_count_b = BranchRepo::count_segments(&state.pool, other_id).await?;

    let entry_a = BranchWithStats {
        branch: branch_a,
        segment_count: seg_count_a,
    };
    let entry_b = BranchWithStats {
        branch: branch_b,
        segment_count: seg_count_b,
    };

    #[derive(serde::Serialize)]
    struct ComparisonResponse {
        branch_a: BranchWithStats,
        branch_b: BranchWithStats,
        diffs: Vec<branching::ParameterDiff>,
    }

    Ok(Json(DataResponse {
        data: ComparisonResponse {
            branch_a: entry_a,
            branch_b: entry_b,
            diffs,
        },
    }))
}

// ---------------------------------------------------------------------------
// GET /branches/stale
// ---------------------------------------------------------------------------

/// List stale branches (not updated in N days, not default).
pub async fn list_stale(
    State(state): State<AppState>,
    Query(params): Query<StaleParams>,
) -> AppResult<impl IntoResponse> {
    let older_than_days = params.older_than_days.unwrap_or(30);

    let branches = BranchRepo::list_stale_branches(&state.pool, older_than_days).await?;

    tracing::debug!(
        count = branches.len(),
        older_than_days,
        "Listed stale branches"
    );

    Ok(Json(DataResponse { data: branches }))
}
