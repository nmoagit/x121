//! Handlers for external & tiered storage management (PRD-48).
//!
//! Provides admin endpoints for managing storage backends, tiering policies,
//! and storage migrations. All endpoints require the admin role.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::storage;
use x121_core::storage::StorageProvider as _;
use x121_core::types::DbId;
use x121_db::models::status::StorageBackendStatus;
use x121_db::models::status::StorageMigrationStatus;
use x121_db::models::storage::{
    CreateStorageBackend, CreateStorageMigration, CreateTieringPolicy, StorageBackend,
    StorageMigration, UpdateStorageBackend,
};
use x121_db::repositories::{
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
async fn ensure_migration_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<StorageMigration> {
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

    let migration = StorageMigrationRepo::create(&state.pool, &input, Some(admin.user_id)).await?;

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

// ---------------------------------------------------------------------------
// PATCH /admin/storage/backends/{id}/set-default  (PRD-122)
// ---------------------------------------------------------------------------

/// Set a storage backend as the platform default and hot-swap the runtime provider.
pub async fn set_default_backend(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let backend = ensure_backend_exists(&state.pool, id).await?;

    if backend.status_id != StorageBackendStatus::Active.id() {
        return Err(AppError::BadRequest(
            "Cannot set an inactive backend as default".to_string(),
        ));
    }

    let updated = StorageBackendRepo::set_default(&state.pool, id).await?;

    // Build a new runtime provider and hot-swap it.
    let new_provider: Arc<dyn x121_core::storage::StorageProvider> = if updated.backend_type_id == 2
    {
        let s3_config = serde_json::from_value::<x121_cloud::storage_provider::S3Config>(
            updated.config.clone(),
        )
        .map_err(|e| AppError::InternalError(format!("Invalid S3 config: {e}")))?;
        Arc::new(
            x121_cloud::storage_provider::S3StorageProvider::new(s3_config)
                .await
                .map_err(|e| AppError::InternalError(format!("Failed to init S3 provider: {e}")))?,
        )
    } else {
        let backend_config = x121_core::storage::factory::StorageBackendConfig {
            backend_type: "local".to_string(),
            config: updated.config.clone(),
        };
        x121_core::storage::factory::build_provider(Some(&backend_config), &state.settings_service)
            .map_err(|e| AppError::InternalError(format!("Failed to init local provider: {e}")))?
    };
    state.swap_storage_provider(new_provider).await;

    tracing::info!(
        backend_id = id,
        backend_name = %updated.name,
        admin_id = admin.user_id,
        "Default storage backend changed",
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /admin/storage/test-connection  (PRD-122)
// ---------------------------------------------------------------------------

/// Request body for the S3 connection test endpoint.
#[derive(Debug, Deserialize)]
pub struct TestS3ConnectionRequest {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: String,
}

/// Response body for the S3 connection test endpoint.
#[derive(Debug, serde::Serialize)]
pub struct TestS3ConnectionResponse {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

/// Test an S3 connection without persisting any configuration.
pub async fn test_s3_connection(
    RequireAdmin(_admin): RequireAdmin,
    State(_state): State<AppState>,
    Json(input): Json<TestS3ConnectionRequest>,
) -> AppResult<impl IntoResponse> {
    let start = std::time::Instant::now();

    let config = x121_cloud::storage_provider::S3Config {
        bucket: input.bucket,
        region: input.region,
        endpoint: input.endpoint,
        access_key_id: input.access_key_id,
        secret_access_key: input.secret_access_key,
        path_prefix: None,
    };

    let provider = match x121_cloud::storage_provider::S3StorageProvider::new(config).await {
        Ok(p) => p,
        Err(e) => {
            return Ok(Json(TestS3ConnectionResponse {
                success: false,
                message: format!("Failed to initialize S3 client: {e}"),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            }));
        }
    };

    match provider.test_connection().await {
        Ok(()) => Ok(Json(TestS3ConnectionResponse {
            success: true,
            message: "Connection successful".to_string(),
            latency_ms: Some(start.elapsed().as_millis() as u64),
        })),
        Err(e) => Ok(Json(TestS3ConnectionResponse {
            success: false,
            message: format!("{e}"),
            latency_ms: Some(start.elapsed().as_millis() as u64),
        })),
    }
}
