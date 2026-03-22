//! Handlers for scene assembly & delivery packaging (PRD-39).
//!
//! Provides endpoints for managing output format profiles, watermark settings,
//! starting delivery exports, listing exports, and running pre-export validation.

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::assembly;
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::delivery_export::{
    AssemblyStartedResponse, CreateDeliveryExport, DeliveryExport, DeliveryValidationResponse,
    StartAssemblyRequest, ValidationIssueDto,
};
use x121_db::models::output_format_profile::{
    CreateOutputFormatProfile, OutputFormatProfile, UpdateOutputFormatProfile,
};
use x121_db::models::watermark_setting::{
    CreateWatermarkSetting, UpdateWatermarkSetting, WatermarkSetting,
};
use x121_db::repositories::{
    AvatarMetadataVersionRepo, AvatarRepo, DeliveryExportRepo, OutputFormatProfileRepo,
    PlatformSettingRepo, ProjectDeliveryLogRepo, ProjectRepo, SceneVideoVersionRepo,
    WatermarkSettingRepo,
};

use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

/// Query parameters for delivery log listing.
#[derive(Debug, Deserialize)]
pub struct DeliveryLogQueryParams {
    pub level: Option<String>,
    pub limit: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that an output format profile exists, returning the full row.
async fn ensure_profile_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<OutputFormatProfile> {
    OutputFormatProfileRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "OutputFormatProfile",
                id,
            })
        })
}

/// Verify that a watermark setting exists, returning the full row.
async fn ensure_watermark_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<WatermarkSetting> {
    WatermarkSettingRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "WatermarkSetting",
                id,
            })
        })
}

/// Verify that a delivery export exists, returning the full row.
async fn ensure_export_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<DeliveryExport> {
    DeliveryExportRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DeliveryExport",
                id,
            })
        })
}

// ===========================================================================
// OUTPUT FORMAT PROFILE HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /output-format-profiles
// ---------------------------------------------------------------------------

/// List all output format profiles.
pub async fn list_profiles(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    let items = OutputFormatProfileRepo::list_all(&state.pool).await?;
    tracing::debug!(count = items.len(), "Listed output format profiles");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /output-format-profiles
// ---------------------------------------------------------------------------

/// Create a new output format profile.
pub async fn create_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateOutputFormatProfile>,
) -> AppResult<impl IntoResponse> {
    assembly::validate_codec(&body.codec)?;
    assembly::validate_container(&body.container)?;
    assembly::validate_resolution_str(&body.resolution)?;
    if let Some(ref pf) = body.pixel_format {
        assembly::validate_pixel_format(pf)?;
    }

    let created = OutputFormatProfileRepo::create(&state.pool, &body).await?;
    tracing::info!(id = created.id, name = %created.name, "Output format profile created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /output-format-profiles/{id}
// ---------------------------------------------------------------------------

/// Get a single output format profile by ID.
pub async fn get_profile(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let profile = ensure_profile_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: profile }))
}

// ---------------------------------------------------------------------------
// PUT /output-format-profiles/{id}
// ---------------------------------------------------------------------------

/// Update an existing output format profile.
pub async fn update_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateOutputFormatProfile>,
) -> AppResult<impl IntoResponse> {
    ensure_profile_exists(&state.pool, id).await?;

    if let Some(ref codec) = body.codec {
        assembly::validate_codec(codec)?;
    }
    if let Some(ref container) = body.container {
        assembly::validate_container(container)?;
    }
    if let Some(ref resolution) = body.resolution {
        assembly::validate_resolution_str(resolution)?;
    }
    if let Some(ref pf) = body.pixel_format {
        assembly::validate_pixel_format(pf)?;
    }

    let updated = OutputFormatProfileRepo::update(&state.pool, id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "OutputFormatProfile",
            id,
        }))?;
    tracing::info!(id = updated.id, "Output format profile updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /output-format-profiles/{id}
// ---------------------------------------------------------------------------

/// Set a profile as the system default.
pub async fn set_profile_default(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let profile = OutputFormatProfileRepo::set_default(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "OutputFormatProfile",
            id,
        }))?;
    tracing::info!(id = profile.id, "Output format profile set as default");
    Ok(Json(DataResponse { data: profile }))
}

/// Delete an output format profile by ID.
pub async fn delete_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = OutputFormatProfileRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Output format profile deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "OutputFormatProfile",
            id,
        }))
    }
}

// ===========================================================================
// ASSEMBLY & EXPORT HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// POST /projects/{project_id}/assemble
// ---------------------------------------------------------------------------

/// Start a new delivery assembly/export job for a project.
pub async fn start_assembly(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<DbId>,
    Json(body): Json<StartAssemblyRequest>,
) -> AppResult<impl IntoResponse> {
    // Verify the format profile exists.
    let profile = ensure_profile_exists(&state.pool, body.format_profile_id).await?;

    // Resolve avatar names for the activity log message.
    let all_avatars = AvatarRepo::list_by_project(&state.pool, project_id).await?;
    let (model_names, model_count) = match &body.avatar_ids {
        Some(ids) => {
            let names: Vec<&str> = all_avatars
                .iter()
                .filter(|c| ids.contains(&c.id))
                .map(|c| c.name.as_str())
                .collect();
            let count = names.len();
            (names.join(", "), count)
        }
        None => {
            let names: Vec<&str> = all_avatars.iter().map(|c| c.name.as_str()).collect();
            let count = names.len();
            (names.join(", "), count)
        }
    };

    let avatars_json = body
        .avatar_ids
        .as_ref()
        .map(|ids| serde_json::to_value(ids).unwrap_or(serde_json::Value::Null));

    let input = CreateDeliveryExport {
        project_id,
        format_profile_id: body.format_profile_id,
        exported_by: auth.user_id,
        include_watermark: body.include_watermark,
        avatars_json,
    };

    let export = DeliveryExportRepo::create(&state.pool, &input).await?;
    tracing::info!(
        export_id = export.id,
        project_id,
        user_id = auth.user_id,
        "Delivery assembly started"
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!(
                "Delivery export started — {model_count} model{}: {model_names} (profile: {})",
                if model_count != 1 { "s" } else { "" },
                profile.name,
            ),
        )
        .with_user(auth.user_id)
        .with_project(project_id)
        .with_entity("delivery_export", export.id)
        .with_fields(serde_json::json!({
            "export_id": export.id,
            "profile": profile.name,
            "model_count": model_count,
            "models": model_names,
            "include_watermark": body.include_watermark,
        })),
    );

    let response = AssemblyStartedResponse {
        export_id: export.id,
        status: assembly::EXPORT_STATUS_PENDING.to_string(),
    };

    Ok((StatusCode::CREATED, Json(DataResponse { data: response })))
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/exports
// ---------------------------------------------------------------------------

/// List delivery exports for a project.
pub async fn list_exports(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    let items = DeliveryExportRepo::list_by_project(&state.pool, project_id, limit, offset).await?;
    tracing::debug!(count = items.len(), project_id, "Listed delivery exports");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/exports/{export_id}
// ---------------------------------------------------------------------------

/// Get a single delivery export by ID.
pub async fn get_export(
    State(state): State<AppState>,
    Path((_project_id, export_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let export = ensure_export_exists(&state.pool, export_id).await?;
    Ok(Json(DataResponse { data: export }))
}

// ---------------------------------------------------------------------------
// POST /projects/{project_id}/exports/{export_id}/cancel
// ---------------------------------------------------------------------------

/// Cancel a pending or in-progress delivery export.
pub async fn cancel_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, export_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let export = ensure_export_exists(&state.pool, export_id).await?;

    // Only allow cancelling exports that are not already completed or failed.
    if export.status_id >= assembly::EXPORT_STATUS_ID_COMPLETED {
        return Err(AppError::Core(CoreError::Validation(
            "Export is already completed or failed and cannot be cancelled".into(),
        )));
    }

    let status_label = assembly::export_status_label(export.status_id).unwrap_or("unknown");

    let updated = DeliveryExportRepo::mark_failed(&state.pool, export_id, "Cancelled by user")
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DeliveryExport",
                id: export_id,
            })
        })?;

    tracing::info!(export_id, "Delivery export cancelled by user");

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Warn,
            ActivityLogSource::Api,
            format!("Delivery export #{export_id} cancelled (was {status_label})"),
        )
        .with_user(auth.user_id)
        .with_project(project_id)
        .with_entity("delivery_export", export_id),
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/exports/{export_id}/download
// ---------------------------------------------------------------------------

/// Download a completed delivery export.
///
/// If the export contains a single RAR, streams it directly.
/// If multiple RARs, lazily creates a combined RAR containing all
/// individual model RARs (cached for subsequent downloads).
pub async fn download_export(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((_project_id, export_id)): Path<(DbId, DbId)>,
) -> AppResult<Response> {
    let export = ensure_export_exists(&state.pool, export_id).await?;

    if export.status_id != assembly::EXPORT_STATUS_ID_COMPLETED {
        return Err(AppError::BadRequest(
            "Export is not yet completed".to_string(),
        ));
    }

    let file_path = export
        .file_path
        .as_deref()
        .ok_or_else(|| AppError::InternalError("Completed export has no file_path".to_string()))?;

    let abs_path = state.resolve_to_path(file_path).await?;

    if !abs_path.exists() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "DeliveryExportFile",
            id: export_id,
        }));
    }

    // If it's a file (legacy exports), serve directly.
    if abs_path.is_file() {
        return serve_file(&abs_path).await;
    }

    // Directory of RAR archives — find all .rar files.
    let mut rars: Vec<std::path::PathBuf> = Vec::new();
    let mut entries = tokio::fs::read_dir(&abs_path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("rar")
            && !path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("delivery_"))
        {
            rars.push(path);
        }
    }

    if rars.is_empty() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "DeliveryExportFile",
            id: export_id,
        }));
    }

    // Single RAR — serve it directly.
    if rars.len() == 1 {
        return serve_file(&rars[0]).await;
    }

    // Multiple RARs — lazily create a combined RAR (cached on disk).
    let combined_path = abs_path.join(format!("delivery_{export_id}.rar"));
    if !combined_path.exists() {
        // Use `rar a` with -ep1 to store only filenames (no directory paths).
        let mut cmd = tokio::process::Command::new("rar");
        cmd.args(["a", "-ep1"]);
        cmd.arg(&combined_path);
        for rar in &rars {
            cmd.arg(rar);
        }
        let output = cmd
            .output()
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to run rar: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::InternalError(format!("rar failed: {stderr}")));
        }
    }

    serve_file(&combined_path).await
}

/// Stream a file as a download response.
async fn serve_file(path: &std::path::Path) -> AppResult<Response> {
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("delivery");

    let content_type = match path.extension().and_then(|e| e.to_str()) {
        Some("rar") => "application/x-rar-compressed",
        Some("zip") => "application/zip",
        _ => "application/octet-stream",
    };

    let stream = tokio_util::io::ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{file_name}\""),
        )
        .body(body)
        .unwrap())
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/exports/{export_id}/download/{avatar_slug}
// ---------------------------------------------------------------------------

/// Download a single model's RAR from a completed delivery export.
pub async fn download_model_archive(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((_project_id, export_id, avatar_slug)): Path<(DbId, DbId, String)>,
) -> AppResult<Response> {
    let export = ensure_export_exists(&state.pool, export_id).await?;

    if export.status_id != assembly::EXPORT_STATUS_ID_COMPLETED {
        return Err(AppError::BadRequest("Export is not yet completed".into()));
    }

    let file_path = export
        .file_path
        .as_deref()
        .ok_or_else(|| AppError::InternalError("Completed export has no file_path".into()))?;

    let abs_dir = state.resolve_to_path(file_path).await?;
    let rar_path = abs_dir.join(format!("{avatar_slug}.rar"));

    if !rar_path.exists() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ModelArchive",
            id: export_id,
        }));
    }

    serve_file(&rar_path).await
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/delivery-validation
// ---------------------------------------------------------------------------

/// Optional query parameters for delivery validation.
#[derive(Debug, Deserialize)]
pub struct ValidationQueryParams {
    /// Comma-separated avatar IDs to validate. When absent, validates all.
    pub avatar_ids: Option<String>,
}

/// Run pre-export validation checks for a project.
///
/// Validates that all scenes in the project have finalized video versions
/// and that each avatar has at least one scene.
/// Accepts optional `?avatar_ids=1,2,3` to scope validation to selected models.
pub async fn validate_delivery(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(params): Query<ValidationQueryParams>,
) -> AppResult<impl IntoResponse> {
    let mut issues: Vec<assembly::ValidationIssue> = Vec::new();

    // Parse optional avatar_ids filter.
    let filter_ids: Option<Vec<DbId>> = params.avatar_ids.as_ref().map(|ids_str| {
        ids_str
            .split(',')
            .filter_map(|s| s.trim().parse::<DbId>().ok())
            .collect()
    });

    // Resolve blocking deliverables: project override → studio setting → hardcoded default.
    let project = ProjectRepo::find_by_id(&state.pool, project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: project_id,
        }))?;
    let blocking_sections: Vec<String> = if let Some(ref bd) = project.blocking_deliverables {
        bd.clone()
    } else {
        // Fall back to studio-level setting, then hardcoded default.
        let studio_bd =
            PlatformSettingRepo::find_by_key(&state.pool, "blocking_deliverables").await?;
        if let Some(setting) = studio_bd {
            serde_json::from_str::<Vec<String>>(&setting.value).unwrap_or_else(|_| {
                vec![
                    "metadata".to_string(),
                    "images".to_string(),
                    "scenes".to_string(),
                ]
            })
        } else {
            vec![
                "metadata".to_string(),
                "images".to_string(),
                "scenes".to_string(),
            ]
        }
    };

    let check_scenes = blocking_sections.iter().any(|s| s == "scenes");
    let check_metadata = blocking_sections.iter().any(|s| s == "metadata");
    let check_images = blocking_sections.iter().any(|s| s == "images");
    let check_speech = blocking_sections.iter().any(|s| s == "speech");

    // All possible sections — emit "skipped" info for non-blocking ones.
    let all_sections = ["metadata", "images", "scenes", "speech"];
    for section in &all_sections {
        if !blocking_sections.iter().any(|s| s == section) {
            issues.push(assembly::ValidationIssue {
                severity: assembly::IssueSeverity::Info,
                category: format!("skipped_{section}"),
                message: format!(
                    "{} validation skipped — not in blocking deliverables",
                    section[..1].to_uppercase() + &section[1..]
                ),
                entity_id: None,
            });
        }
    }
    let _ = (check_images, check_speech); // reserved for future validation checks

    // Check that the project has avatars.
    let all_avatars = AvatarRepo::list_by_project(&state.pool, project_id)
        .await
        .map_err(|e| {
            tracing::error!(%e, "validate_delivery: list_by_project failed");
            e
        })?;

    // If avatar_ids filter is provided, scope to only those avatars.
    let avatars: Vec<_> = if let Some(ref ids) = filter_ids {
        all_avatars
            .into_iter()
            .filter(|c| ids.contains(&c.id))
            .collect()
    } else {
        all_avatars
    };

    if avatars.is_empty() {
        issues.push(assembly::ValidationIssue {
            severity: assembly::IssueSeverity::Error,
            category: "missing_avatars".to_string(),
            message: "Project has no models".to_string(),
            entity_id: Some(project_id),
        });
    }

    // Build avatar name map (needed for scene-level checks).
    let char_name_map: std::collections::HashMap<DbId, &str> =
        avatars.iter().map(|c| (c.id, c.name.as_str())).collect();

    // --- Scene-related checks (only when "scenes" is a blocking deliverable) ---
    if check_scenes {
        let all_scenes: Vec<(DbId, DbId)> = sqlx::query_as(
            "SELECT s.id, s.avatar_id FROM scenes s \
             JOIN avatars c ON s.avatar_id = c.id \
             WHERE c.project_id = $1 AND s.deleted_at IS NULL AND c.deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_all(&state.pool)
        .await?;
        let scene_to_char: std::collections::HashMap<DbId, &str> = all_scenes
            .iter()
            .filter_map(|(sid, cid)| char_name_map.get(cid).map(|name| (*sid, *name)))
            .collect();

        // Missing finalized video versions.
        let missing_final =
            SceneVideoVersionRepo::find_scenes_missing_final(&state.pool, project_id)
                .await
                .map_err(|e| {
                    tracing::error!(%e, "validate_delivery: find_scenes_missing_final failed");
                    e
                })?;
        for scene_id in &missing_final {
            let Some(model_name) = scene_to_char.get(scene_id) else {
                continue;
            };
            issues.push(assembly::ValidationIssue {
                severity: assembly::IssueSeverity::Error,
                category: "missing_final_video".to_string(),
                message: format!(
                    "Model '{}' — scene {scene_id} has no finalized video version",
                    model_name
                ),
                entity_id: Some(*scene_id),
            });
        }

        // Non-H.264 codec warnings.
        let all_versions = SceneVideoVersionRepo::list_non_h264_finals(&state.pool, project_id)
            .await
            .map_err(|e| {
                tracing::error!(%e, "validate_delivery: list_non_h264_finals failed");
                e
            })?;
        for version in &all_versions {
            let Some(model_name) = scene_to_char.get(&version.scene_id) else {
                continue;
            };
            let codec = version.video_codec.as_deref().unwrap_or("unknown");
            issues.push(assembly::ValidationIssue {
                severity: assembly::IssueSeverity::Warning,
                category: "non_h264_codec".to_string(),
                message: format!(
                    "Model '{}' — scene {} v{} uses {} codec, will be transcoded to H.264",
                    model_name, version.scene_id, version.version_number, codec
                ),
                entity_id: Some(version.id),
            });
        }

        // Avatars with no scenes.
        for avatar in &avatars {
            let scenes =
                x121_db::repositories::SceneRepo::list_by_avatar(&state.pool, avatar.id).await
                .map_err(|e| { tracing::error!(%e, avatar_id = avatar.id, "validate_delivery: list_by_avatar failed"); e })?;
            if scenes.is_empty() {
                issues.push(assembly::ValidationIssue {
                    severity: assembly::IssueSeverity::Warning,
                    category: "no_scenes".to_string(),
                    message: format!("Model '{}' has no scenes", avatar.name),
                    entity_id: Some(avatar.id),
                });
            }
        }
    }

    // --- Metadata checks (only when "metadata" is a blocking deliverable) ---
    if check_metadata {
        for avatar in &avatars {
            let approved =
                AvatarMetadataVersionRepo::find_approved(&state.pool, avatar.id).await
                .map_err(|e| { tracing::error!(%e, avatar_id = avatar.id, "validate_delivery: find_approved failed"); e })?;
            if approved.is_none() {
                issues.push(assembly::ValidationIssue {
                    severity: assembly::IssueSeverity::Error,
                    category: "metadata_not_approved".to_string(),
                    message: format!(
                        "Model '{}' has no approved metadata version",
                        avatar.name
                    ),
                    entity_id: Some(avatar.id),
                });
            }
        }
    }

    let result = assembly::ValidationResult::from_issues(issues);

    let dto_issues: Vec<ValidationIssueDto> = result
        .errors
        .iter()
        .chain(result.warnings.iter())
        .chain(result.infos.iter())
        .map(|issue| ValidationIssueDto {
            severity: match issue.severity {
                assembly::IssueSeverity::Error => "error".to_string(),
                assembly::IssueSeverity::Warning => "warning".to_string(),
                assembly::IssueSeverity::Info => "info".to_string(),
            },
            category: issue.category.clone(),
            message: issue.message.clone(),
            entity_id: issue.entity_id,
        })
        .collect();

    let error_count = result.errors.len();
    let warning_count = result.warnings.len();

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            if result.passed {
                ActivityLogLevel::Info
            } else {
                ActivityLogLevel::Warn
            },
            ActivityLogSource::Api,
            format!(
                "Delivery validation {}: {} error{}, {} warning{}",
                if result.passed { "passed" } else { "failed" },
                error_count,
                if error_count != 1 { "s" } else { "" },
                warning_count,
                if warning_count != 1 { "s" } else { "" },
            ),
        )
        .with_project(project_id)
        .with_fields(serde_json::json!({
            "passed": result.passed,
            "error_count": error_count,
            "warning_count": warning_count,
            "model_count": avatars.len(),
        })),
    );

    let response = DeliveryValidationResponse {
        passed: result.passed,
        error_count,
        warning_count,
        issues: dto_issues,
    };

    Ok(Json(DataResponse { data: response }))
}

// ===========================================================================
// WATERMARK SETTINGS HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /watermark-settings
// ---------------------------------------------------------------------------

/// List all watermark settings.
pub async fn list_watermarks(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    let items = WatermarkSettingRepo::list_all(&state.pool).await?;
    tracing::debug!(count = items.len(), "Listed watermark settings");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /watermark-settings
// ---------------------------------------------------------------------------

/// Create a new watermark setting.
pub async fn create_watermark(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateWatermarkSetting>,
) -> AppResult<impl IntoResponse> {
    assembly::validate_watermark_type(&body.watermark_type)?;
    if let Some(ref pos) = body.position {
        assembly::validate_watermark_position(pos)?;
    }
    if let Some(opacity) = body.opacity {
        assembly::validate_opacity(opacity)?;
    }

    let created = WatermarkSettingRepo::create(&state.pool, &body).await?;
    tracing::info!(id = created.id, name = %created.name, "Watermark setting created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /watermark-settings/{id}
// ---------------------------------------------------------------------------

/// Get a single watermark setting by ID.
pub async fn get_watermark(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let wm = ensure_watermark_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: wm }))
}

// ---------------------------------------------------------------------------
// PUT /watermark-settings/{id}
// ---------------------------------------------------------------------------

/// Update an existing watermark setting.
pub async fn update_watermark(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateWatermarkSetting>,
) -> AppResult<impl IntoResponse> {
    ensure_watermark_exists(&state.pool, id).await?;

    if let Some(ref wt) = body.watermark_type {
        assembly::validate_watermark_type(wt)?;
    }
    if let Some(ref pos) = body.position {
        assembly::validate_watermark_position(pos)?;
    }
    if let Some(opacity) = body.opacity {
        assembly::validate_opacity(opacity)?;
    }

    let updated = WatermarkSettingRepo::update(&state.pool, id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WatermarkSetting",
            id,
        }))?;
    tracing::info!(id = updated.id, "Watermark setting updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /watermark-settings/{id}
// ---------------------------------------------------------------------------

/// Delete a watermark setting by ID.
pub async fn delete_watermark(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = WatermarkSettingRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Watermark setting deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "WatermarkSetting",
            id,
        }))
    }
}

// ===========================================================================
// DELIVERY LOG HANDLERS (PRD-39 Amendment A.3)
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/delivery-logs
// ---------------------------------------------------------------------------

/// List delivery logs for a project with optional level filter.
pub async fn list_delivery_logs(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(params): Query<DeliveryLogQueryParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, 100, 1000);
    let items = ProjectDeliveryLogRepo::list_for_project(
        &state.pool,
        project_id,
        params.level.as_deref(),
        limit,
    )
    .await?;
    tracing::debug!(count = items.len(), project_id, "Listed delivery logs");
    Ok(Json(DataResponse { data: items }))
}

// ===========================================================================
// DELIVERY STATUS HANDLER (PRD-39 Amendment A.4)
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/delivery-status
// ---------------------------------------------------------------------------

/// Get per-avatar delivery status for a project.
pub async fn get_delivery_status(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let statuses = DeliveryExportRepo::delivery_status_by_project(&state.pool, project_id).await?;
    tracing::debug!(
        count = statuses.len(),
        project_id,
        "Computed delivery status"
    );
    Ok(Json(DataResponse { data: statuses }))
}
