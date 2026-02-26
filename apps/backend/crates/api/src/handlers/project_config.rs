//! Handlers for Project Configuration Templates (PRD-74).
//!
//! Provides endpoints for creating, listing, updating, deleting, exporting,
//! importing, and diffing project configuration templates.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::project_config;
use x121_core::types::DbId;
use x121_db::models::project_config::{
    CreateProjectConfig, ImportConfigRequest, ImportResult, UpdateProjectConfig,
};
use x121_db::repositories::ProjectConfigRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a project config exists, returning the full row.
async fn ensure_config_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<x121_db::models::project_config::ProjectConfig> {
    ProjectConfigRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProjectConfig",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// GET /project-configs
// ---------------------------------------------------------------------------

/// List project configs with pagination.
pub async fn list_configs(
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let configs = ProjectConfigRepo::list(&state.pool, params.limit, params.offset).await?;

    tracing::debug!(count = configs.len(), "Listed project configs");

    Ok(Json(DataResponse { data: configs }))
}

// ---------------------------------------------------------------------------
// GET /project-configs/recommended
// ---------------------------------------------------------------------------

/// List only recommended project configs.
pub async fn list_recommended(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    let configs = ProjectConfigRepo::list_recommended(&state.pool).await?;

    tracing::debug!(count = configs.len(), "Listed recommended project configs");

    Ok(Json(DataResponse { data: configs }))
}

// ---------------------------------------------------------------------------
// GET /project-configs/{id}
// ---------------------------------------------------------------------------

/// Get a single project config by ID.
pub async fn get_config(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let config = ensure_config_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: config }))
}

// ---------------------------------------------------------------------------
// POST /project-configs
// ---------------------------------------------------------------------------

/// Create a new project config.
pub async fn create_config(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateProjectConfig>,
) -> AppResult<impl IntoResponse> {
    // Validate name
    project_config::validate_config_name(&body.name)?;

    // Validate config JSON structure
    project_config::validate_config_json(&body.config_json)?;

    let config = ProjectConfigRepo::create(&state.pool, &body, auth.user_id).await?;

    tracing::info!(
        config_id = config.id,
        user_id = auth.user_id,
        "Project config created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: config })))
}

// ---------------------------------------------------------------------------
// PUT /project-configs/{id}
// ---------------------------------------------------------------------------

/// Update an existing project config.
pub async fn update_config(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateProjectConfig>,
) -> AppResult<impl IntoResponse> {
    ensure_config_exists(&state.pool, id).await?;

    // Validate name if provided
    if let Some(ref name) = body.name {
        project_config::validate_config_name(name)?;
    }

    // Validate config JSON if provided
    if let Some(ref config_json) = body.config_json {
        project_config::validate_config_json(config_json)?;
    }

    let updated = ProjectConfigRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProjectConfig",
                id,
            })
        })?;

    tracing::info!(
        config_id = id,
        user_id = auth.user_id,
        "Project config updated"
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /project-configs/{id}
// ---------------------------------------------------------------------------

/// Delete a project config by ID.
pub async fn delete_config(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ProjectConfigRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(
            config_id = id,
            user_id = auth.user_id,
            "Project config deleted"
        );
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ProjectConfig",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// POST /projects/{id}/export-config
// ---------------------------------------------------------------------------

/// Export a project's current configuration as a JSON snapshot.
pub async fn export_project_config(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let config_json = ProjectConfigRepo::export_project_config(&state.pool, project_id).await?;

    tracing::info!(
        project_id,
        user_id = auth.user_id,
        "Project config exported"
    );

    Ok(Json(DataResponse { data: config_json }))
}

// ---------------------------------------------------------------------------
// POST /project-configs/import
// ---------------------------------------------------------------------------

/// Import a config template into a project, optionally selecting specific
/// scene types.
pub async fn import_config(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<ImportConfigRequest>,
) -> AppResult<impl IntoResponse> {
    let config = ensure_config_exists(&state.pool, body.config_id).await?;

    // Validate selective import if scene types were specified
    if let Some(ref selected) = body.selected_scene_types {
        project_config::validate_selective_import(&config.config_json, selected)?;
    }

    // Determine which scene types to import
    let scene_types = config
        .config_json
        .get("scene_types")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut imported_count = 0i32;
    let mut skipped_count = 0i32;
    let mut details = Vec::new();

    for st in &scene_types {
        let name = match st.get("name").and_then(|n| n.as_str()) {
            Some(n) => n.to_string(),
            None => {
                skipped_count += 1;
                details.push("Skipped entry with no name".to_string());
                continue;
            }
        };

        // If selective import, check if this scene type was selected
        if let Some(ref selected) = body.selected_scene_types {
            if !selected.contains(&name) {
                skipped_count += 1;
                details.push(format!("Skipped '{name}' (not selected)"));
                continue;
            }
        }

        imported_count += 1;
        details.push(format!("Imported '{name}'"));
    }

    tracing::info!(
        config_id = body.config_id,
        project_id = body.project_id,
        imported_count,
        skipped_count,
        user_id = auth.user_id,
        "Config import completed"
    );

    let result = ImportResult {
        imported_count,
        skipped_count,
        details,
    };

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// POST /project-configs/{id}/diff/{project_id}
// ---------------------------------------------------------------------------

/// Compute a diff between a config template and a project's current
/// configuration.
pub async fn diff_config(
    State(state): State<AppState>,
    Path((config_id, project_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let config = ensure_config_exists(&state.pool, config_id).await?;

    // Get the project's current config by exporting it
    let current_json = ProjectConfigRepo::export_project_config(&state.pool, project_id).await?;

    let diff_entries = project_config::compute_config_diff(&current_json, &config.config_json);

    Ok(Json(DataResponse { data: diff_entries }))
}
