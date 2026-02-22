//! Handlers for external & tiered storage management (PRD-48).
//!
//! Provides admin endpoints for managing storage backends, tiering policies,
//! and storage migrations. All endpoints require the admin role.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use trulience_core::error::CoreError;
use trulience_core::storage;
use trulience_core::types::DbId;
use trulience_db::models::status::StorageBackendStatus;
use trulience_db::models::status::StorageMigrationStatus;
use trulience_db::models::storage::{
    CreateStorageBackend, CreateStorageMigration, CreateTieringPolicy, StorageBackend,
    StorageMigration, UpdateStorageBackend,
};
use trulience_db::repositories::{
    AssetLocationRepo, StorageBackendRepo, StorageMigrationRepo, TieringPolicyRepo,
};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a storage backend exists, returning the full row.
async fn ensure_backend_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<StorageBackend> {
    StorageBackendRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "StorageBackend",
                id,
            })
        })
}

/// Verify that a storage migration exists, returning the full row.
async fn ensure_migration_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<StorageMigration> {
    StorageMigrationRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "StorageMigration",
                id,
            })
        })
}

/// Validate backend type and config for create/update operations.
fn validate_backend_type_and_config(
    backend_type_id: i16,
    config: &serde_json::Value,
) -> AppResult<()> {
    let type_name = match backend_type_id {
        1 => "local",
        2 => "s3",
        3 => "nfs",
        _ => {
            return Err(AppError::Core(CoreError::Validation(format!(
                "Unknown backend_type_id: {backend_type_id}. Must be 1 (local), 2 (s3), or 3 (nfs)"
            ))));
        }
    };
    storage::validate_backend_config(type_name, config)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// GET /admin/storage/backends
// ---------------------------------------------------------------------------

/// List all storage backends.
pub async fn list_backends(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let backends = StorageBackendRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: backends }))
}

// ---------------------------------------------------------------------------
// POST /admin/storage/backends
// ---------------------------------------------------------------------------

/// Create a new storage backend.
pub async fn create_backend(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateStorageBackend>,
) -> AppResult<impl IntoResponse> {
    // Validate tier if provided.
    if let Some(ref tier) = input.tier {
        storage::validate_tier(tier)?;
    }

    // Validate config against backend type.
    validate_backend_type_and_config(input.backend_type_id, &input.config)?;

    let backend = StorageBackendRepo::create(&state.pool, &input).await?;

    tracing::info!(
        backend_id = backend.id,
        backend_name = %backend.name,
        admin_id = admin.user_id,
        "Storage backend created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: backend })))
}

// ---------------------------------------------------------------------------
// PUT /admin/storage/backends/{id}
// ---------------------------------------------------------------------------

/// Update an existing storage backend.
pub async fn update_backend(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateStorageBackend>,
) -> AppResult<impl IntoResponse> {
    let current = ensure_backend_exists(&state.pool, id).await?;

    // Validate tier if changing.
    if let Some(ref tier) = input.tier {
        storage::validate_tier(tier)?;
    }

    // Validate config if changing.
    if let Some(ref config) = input.config {
        validate_backend_type_and_config(current.backend_type_id, config)?;
    }

    let backend = StorageBackendRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "StorageBackend",
            id,
        }))?;

    tracing::info!(
        backend_id = id,
        admin_id = admin.user_id,
        "Storage backend updated",
    );

    Ok(Json(DataResponse { data: backend }))
}

// ---------------------------------------------------------------------------
// POST /admin/storage/backends/{id}/decommission
// ---------------------------------------------------------------------------

/// Decommission a storage backend (set status to Decommissioned).
pub async fn decommission_backend(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let current = ensure_backend_exists(&state.pool, id).await?;

    if current.status_id == StorageBackendStatus::Decommissioned.id() {
        return Err(AppError::BadRequest(
            "Storage backend is already decommissioned".to_string(),
        ));
    }

    StorageBackendRepo::update_status(&state.pool, id, StorageBackendStatus::Decommissioned.id())
        .await?;

    tracing::info!(
        backend_id = id,
        admin_id = admin.user_id,
        "Storage backend decommissioned",
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// GET /admin/storage/policies
// ---------------------------------------------------------------------------

/// List all tiering policies.
pub async fn list_policies(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let policies = TieringPolicyRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: policies }))
}

// ---------------------------------------------------------------------------
// POST /admin/storage/policies
// ---------------------------------------------------------------------------

/// Create a new tiering policy.
pub async fn create_policy(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateTieringPolicy>,
) -> AppResult<impl IntoResponse> {
    // Validate source and target tiers.
    storage::validate_tier(&input.source_tier)?;
    storage::validate_tier(&input.target_tier)?;

    if input.source_tier == input.target_tier {
        return Err(AppError::Core(CoreError::Validation(
            "Source and target tiers must be different".into(),
        )));
    }

    // Verify target backend exists.
    ensure_backend_exists(&state.pool, input.target_backend_id).await?;

    let policy = TieringPolicyRepo::create(&state.pool, &input).await?;

    tracing::info!(
        policy_id = policy.id,
        policy_name = %policy.name,
        admin_id = admin.user_id,
        "Tiering policy created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: policy })))
}

// ---------------------------------------------------------------------------
// POST /admin/storage/policies/simulate
// ---------------------------------------------------------------------------

/// Simulate a tiering policy: find assets that would be moved.
#[derive(Debug, Deserialize)]
pub struct SimulatePolicyInput {
    pub entity_type: String,
    pub source_tier: String,
    pub age_threshold_days: Option<i32>,
    pub access_threshold_days: Option<i32>,
}

pub async fn simulate_policy(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<SimulatePolicyInput>,
) -> AppResult<impl IntoResponse> {
    storage::validate_tier(&input.source_tier)?;

    let candidates = AssetLocationRepo::find_tiering_candidates(
        &state.pool,
        &input.entity_type,
        &input.source_tier,
        input.age_threshold_days,
        input.access_threshold_days,
    )
    .await?;

    Ok(Json(DataResponse { data: candidates }))
}

// ---------------------------------------------------------------------------
// POST /admin/storage/migrations
// ---------------------------------------------------------------------------

/// Start a new storage migration.
pub async fn start_migration(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateStorageMigration>,
) -> AppResult<impl IntoResponse> {
    // Verify both backends exist.
    ensure_backend_exists(&state.pool, input.source_backend_id).await?;
    ensure_backend_exists(&state.pool, input.target_backend_id).await?;

    if input.source_backend_id == input.target_backend_id {
        return Err(AppError::Core(CoreError::Validation(
            "Source and target backends must be different".into(),
        )));
    }

    let migration =
        StorageMigrationRepo::create(&state.pool, &input, Some(admin.user_id)).await?;

    tracing::info!(
        migration_id = migration.id,
        source_backend = input.source_backend_id,
        target_backend = input.target_backend_id,
        admin_id = admin.user_id,
        "Storage migration started",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: migration })))
}

// ---------------------------------------------------------------------------
// GET /admin/storage/migrations/{id}
// ---------------------------------------------------------------------------

/// Get the status of a storage migration.
pub async fn get_migration(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let migration = ensure_migration_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: migration }))
}

// ---------------------------------------------------------------------------
// POST /admin/storage/migrations/{id}/rollback
// ---------------------------------------------------------------------------

/// Roll back a storage migration.
pub async fn rollback_migration(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let migration = ensure_migration_exists(&state.pool, id).await?;

    // Only allow rollback for in-progress or failed migrations.
    let allowed_statuses = [
        StorageMigrationStatus::InProgress.id(),
        StorageMigrationStatus::Failed.id(),
    ];
    if !allowed_statuses.contains(&migration.status_id) {
        return Err(AppError::BadRequest(format!(
            "Cannot rollback migration in status {}. Must be in_progress or failed.",
            migration.status_id
        )));
    }

    StorageMigrationRepo::update_status(&state.pool, id, StorageMigrationStatus::RolledBack.id())
        .await?;

    tracing::info!(
        migration_id = id,
        admin_id = admin.user_id,
        "Storage migration rolled back",
    );

    // Refetch to return updated state.
    let updated = ensure_migration_exists(&state.pool, id).await?;

    Ok(Json(DataResponse { data: updated }))
}
