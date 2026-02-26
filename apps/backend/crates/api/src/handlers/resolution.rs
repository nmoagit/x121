//! Handlers for the Multi-Resolution Pipeline feature (PRD-59).
//!
//! Provides resolution tier CRUD plus scene upscale and tier lookup endpoints.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::resolution::{
    can_upscale, validate_dimensions, validate_speed_factor, validate_tier_name,
};
use x121_core::types::DbId;
use x121_db::models::resolution_tier::{
    CreateResolutionTier, ResolutionTier, UpscaleRequest, UpscaleResponse,
};
use x121_db::models::scene::Scene;
use x121_db::repositories::{ResolutionTierRepo, SceneRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers (DRY-274: imported CoreError instead of fully-qualified path)
// ---------------------------------------------------------------------------

/// Verify that a scene exists, returning the full row.
async fn ensure_scene_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Scene> {
    SceneRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id,
        })
    })
}

/// Verify that a resolution tier exists, returning the full row.
async fn ensure_tier_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<ResolutionTier> {
    ResolutionTierRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ResolutionTier",
                id,
            })
        })
}

/* --------------------------------------------------------------------------
Resolution tier CRUD
-------------------------------------------------------------------------- */

/// GET /resolution-tiers
///
/// List all resolution tiers, ordered by sort_order.
pub async fn list_tiers(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let tiers = ResolutionTierRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: tiers }))
}

/// GET /resolution-tiers/{id}
///
/// Fetch a single resolution tier by ID.
pub async fn get_tier(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let tier = ensure_tier_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: tier }))
}

/// POST /resolution-tiers
///
/// Create a new resolution tier. Validates name, dimensions, and speed factor.
pub async fn create_tier(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateResolutionTier>,
) -> AppResult<impl IntoResponse> {
    // CoreError auto-converts to AppError via #[from] -- no .map_err needed (DRY-275).
    validate_tier_name(&input.name)?;
    validate_dimensions(input.width, input.height)?;

    if let Some(factor) = input.speed_factor {
        validate_speed_factor(factor)?;
    }

    let tier = ResolutionTierRepo::create(&state.pool, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        tier_id = tier.id,
        tier_name = %tier.name,
        "Resolution tier created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: tier })))
}

/* --------------------------------------------------------------------------
Scene resolution endpoints
-------------------------------------------------------------------------- */

/// POST /scenes/{id}/upscale
///
/// Upscale a scene to a higher resolution tier. Validates tier ordering.
pub async fn upscale_scene(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
    Json(input): Json<UpscaleRequest>,
) -> AppResult<impl IntoResponse> {
    let scene = ensure_scene_exists(&state.pool, scene_id).await?;

    let current_tier_id = scene.resolution_tier_id.unwrap_or(1);

    // CoreError auto-converts to AppError via #[from] (DRY-275).
    can_upscale(current_tier_id, input.target_tier_id)?;

    let target_tier = ensure_tier_exists(&state.pool, input.target_tier_id).await?;

    // Update the scene's resolution tier.
    ResolutionTierRepo::update_scene_tier(&state.pool, scene_id, input.target_tier_id).await?;

    // Set provenance link (the scene was upscaled from itself).
    ResolutionTierRepo::set_upscaled_from(&state.pool, scene_id, scene_id).await?;

    tracing::info!(
        user_id = auth.user_id,
        scene_id = scene_id,
        from_tier = current_tier_id,
        to_tier = input.target_tier_id,
        "Scene upscaled"
    );

    let response = UpscaleResponse {
        original_scene_id: scene_id,
        new_scene_id: scene_id,
        target_tier: target_tier.name,
    };

    Ok(Json(DataResponse { data: response }))
}

/// GET /scenes/{id}/tier
///
/// Return the current resolution tier for a scene.
pub async fn get_scene_tier(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let scene = ensure_scene_exists(&state.pool, scene_id).await?;

    let tier_id = scene.resolution_tier_id.unwrap_or(1);
    let tier = ensure_tier_exists(&state.pool, tier_id).await?;

    Ok(Json(DataResponse { data: tier }))
}
