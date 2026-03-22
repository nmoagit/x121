//! Handlers for avatar metadata version management.
//!
//! Provides endpoints for versioned metadata: generate from source files,
//! create manual versions, activate, reject, and delete.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::metadata_transform::{self, MetadataInput, SOURCE_GENERATED, SOURCE_MANUAL};
use x121_core::types::DbId;
use x121_db::models::avatar::UpdateAvatar;
use x121_db::models::avatar_metadata_version::{
    AvatarMetadataVersion, CreateAvatarMetadataVersion, RejectMetadataApprovalRequest,
    UpdateAvatarMetadataVersion,
};
use x121_db::repositories::{AvatarMetadataVersionRepo, AvatarRepo, AvatarReviewRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Body for the generate endpoint.
#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    pub bio_json: Option<serde_json::Value>,
    pub tov_json: Option<serde_json::Value>,
    pub activate: Option<bool>,
}

/// Body for creating a manual version.
#[derive(Debug, Deserialize)]
pub struct CreateManualVersionRequest {
    pub metadata: serde_json::Value,
    pub notes: Option<String>,
    pub activate: Option<bool>,
    /// Override the source label (defaults to "manual"). Allowed: manual, json_import, csv_import.
    pub source: Option<String>,
}

/// Body for rejecting a version.
#[derive(Debug, Deserialize)]
pub struct RejectRequest {
    pub reason: String,
}

/// Body for marking active versions as outdated.
#[derive(Debug, Deserialize)]
pub struct MarkOutdatedRequest {
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a metadata version exists, returning the full row.
async fn ensure_version_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<AvatarMetadataVersion> {
    AvatarMetadataVersionRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "AvatarMetadataVersion",
                id,
            })
        })
}

/// Verify that a avatar exists, returning its name.
async fn ensure_avatar_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<String> {
    let avatar = AvatarRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Avatar",
            id,
        }))?;
    Ok(avatar.name)
}

/// Sync version metadata to `avatars.metadata` column.
pub(crate) async fn sync_to_avatar(
    pool: &sqlx::PgPool,
    avatar_id: DbId,
    metadata: &serde_json::Value,
) -> AppResult<()> {
    // Preserve voice_id from settings — never let metadata generation/import clear it.
    let mut final_metadata = metadata.clone();
    if let Ok(Some(avatar)) = AvatarRepo::find_by_id(pool, avatar_id).await {
        if let Some(voice_id) = avatar
            .settings
            .get("elevenlabs_voice")
            .and_then(|v| v.as_str())
        {
            if !voice_id.is_empty() {
                if let Some(obj) = final_metadata.as_object_mut() {
                    obj.insert(
                        "voice_id".to_string(),
                        serde_json::Value::String(voice_id.to_string()),
                    );
                }
            }
        }
    }

    AvatarRepo::update(
        pool,
        avatar_id,
        &UpdateAvatar {
            name: None,
            status_id: None,
            metadata: Some(final_metadata),
            settings: None,
            group_id: None,
            blocking_deliverables: None,
        },
    )
    .await?;
    Ok(())
}

/// Create a version, optionally marking it active and syncing to avatar.
async fn create_version_maybe_activate(
    pool: &sqlx::PgPool,
    avatar_id: DbId,
    input: &CreateAvatarMetadataVersion,
    metadata: &serde_json::Value,
    activate: bool,
) -> AppResult<AvatarMetadataVersion> {
    if activate {
        let v = AvatarMetadataVersionRepo::create_as_active(pool, input).await?;
        sync_to_avatar(pool, avatar_id, metadata).await?;
        Ok(v)
    } else {
        Ok(AvatarMetadataVersionRepo::create(pool, input).await?)
    }
}

/// Verify that the user is authorised to approve/reject metadata.
///
/// Allowed when any of:
/// 1. The user is the assigned reviewer for this avatar.
/// 2. The user has the `admin` role (admin bypass).
/// 3. No reviewer is assigned AND the user is an admin (fallback).
async fn require_reviewer_or_admin(
    pool: &sqlx::PgPool,
    avatar_id: DbId,
    user_id: DbId,
    role: &str,
) -> AppResult<()> {
    let is_admin = role == x121_core::roles::ROLE_ADMIN;

    match AvatarReviewRepo::find_active_by_avatar(pool, avatar_id).await? {
        Some(assignment) if assignment.reviewer_user_id == user_id => Ok(()),
        Some(_) if is_admin => Ok(()), // admin bypass
        Some(_) => Err(AppError::Core(CoreError::Forbidden(
            "Only the assigned reviewer or an admin can perform this action".into(),
        ))),
        None if is_admin => Ok(()), // no reviewer assigned, admin fallback
        None => Err(AppError::Core(CoreError::Forbidden(
            "No reviewer assigned to this avatar".into(),
        ))),
    }
}

/// Build a `CreateAvatarMetadataVersion` for a manual edit.
///
/// When `source_bio` / `source_tov` are `None` they are omitted from the
/// version row.  The `avatar_metadata` handler passes them so that
/// previously-attached source blobs survive manual edits.
pub(crate) fn build_manual_version_input(
    avatar_id: DbId,
    metadata: serde_json::Value,
    notes: Option<String>,
    generation_report: Option<serde_json::Value>,
    source_bio: Option<serde_json::Value>,
    source_tov: Option<serde_json::Value>,
) -> CreateAvatarMetadataVersion {
    CreateAvatarMetadataVersion {
        avatar_id,
        metadata,
        source: SOURCE_MANUAL.to_string(),
        source_bio,
        source_tov,
        generation_report,
        is_active: None,
        notes,
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/avatars/{avatar_id}/metadata/versions
pub async fn list_versions(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let versions =
        AvatarMetadataVersionRepo::list_by_avatar(&state.pool, avatar_id).await?;
    Ok(Json(DataResponse { data: versions }))
}

/// GET /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}
pub async fn get_version(
    State(state): State<AppState>,
    Path((_avatar_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let version = ensure_version_exists(&state.pool, version_id).await?;
    Ok(Json(DataResponse { data: version }))
}

/// POST /api/v1/avatars/{avatar_id}/metadata/versions/generate
///
/// Run the metadata transform engine on bio/tov source files, create a new
/// version with source='generated', and store the generation report.
pub async fn generate_version(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<GenerateRequest>,
) -> AppResult<impl IntoResponse> {
    let char_name = ensure_avatar_exists(&state.pool, avatar_id).await?;

    let input = MetadataInput {
        bio: body.bio_json.clone(),
        tov: body.tov_json.clone(),
        name: char_name,
    };

    let result = metadata_transform::generate_metadata_via_python(&input)
        .map_err(|e| AppError::InternalError(format!("Metadata generation failed: {e}")))?;
    let report_json = serde_json::to_value(&result.report)
        .map_err(|e| AppError::InternalError(format!("Failed to serialize report: {e}")))?;

    // Source data lives in the version's source_bio/source_tov columns,
    // NOT embedded in the metadata blob. The delivered metadata.json is clean.
    let create_input = CreateAvatarMetadataVersion {
        avatar_id,
        metadata: result.metadata.clone(),
        source: SOURCE_GENERATED.to_string(),
        source_bio: body.bio_json,
        source_tov: body.tov_json,
        generation_report: Some(report_json),
        is_active: None,
        notes: None,
    };

    let version = create_version_maybe_activate(
        &state.pool,
        avatar_id,
        &create_input,
        &result.metadata,
        body.activate.unwrap_or(false),
    )
    .await?;

    Ok((StatusCode::CREATED, Json(DataResponse { data: version })))
}

/// POST /api/v1/avatars/{avatar_id}/metadata/versions
///
/// Create a manual metadata version from a form edit.
pub async fn create_manual_version(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<CreateManualVersionRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_avatar_exists(&state.pool, avatar_id).await?;

    // Build a completeness report for this version
    let report_json = metadata_transform::build_report_json(&body.metadata);

    let mut create_input = build_manual_version_input(
        avatar_id,
        body.metadata.clone(),
        body.notes,
        report_json,
        None,
        None,
    );

    // Allow callers to override source (e.g. json_import, csv_import)
    if let Some(ref src) = body.source {
        create_input.source = src.clone();
    }

    let version = create_version_maybe_activate(
        &state.pool,
        avatar_id,
        &create_input,
        &body.metadata,
        body.activate.unwrap_or(false),
    )
    .await?;

    Ok((StatusCode::CREATED, Json(DataResponse { data: version })))
}

/// PUT /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}/activate
///
/// Mark a version as active and sync its metadata to `avatars.metadata`.
pub async fn activate_version(
    State(state): State<AppState>,
    Path((avatar_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let version = AvatarMetadataVersionRepo::set_active(&state.pool, avatar_id, version_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "AvatarMetadataVersion",
                id: version_id,
            })
        })?;

    sync_to_avatar(&state.pool, avatar_id, &version.metadata).await?;

    Ok(Json(DataResponse { data: version }))
}

/// PUT /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}/reject
///
/// Store a rejection reason on a version.
pub async fn reject_version(
    State(state): State<AppState>,
    Path((_avatar_id, version_id)): Path<(DbId, DbId)>,
    Json(body): Json<RejectRequest>,
) -> AppResult<impl IntoResponse> {
    let version = AvatarMetadataVersionRepo::update(
        &state.pool,
        version_id,
        &UpdateAvatarMetadataVersion {
            notes: None,
            rejection_reason: Some(body.reason),
        },
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "AvatarMetadataVersion",
            id: version_id,
        })
    })?;

    Ok(Json(DataResponse { data: version }))
}

/// PATCH /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}
///
/// Update version notes.
pub async fn update_version(
    State(state): State<AppState>,
    Path((_avatar_id, version_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateAvatarMetadataVersion>,
) -> AppResult<impl IntoResponse> {
    let version = AvatarMetadataVersionRepo::update(&state.pool, version_id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "AvatarMetadataVersion",
                id: version_id,
            })
        })?;

    Ok(Json(DataResponse { data: version }))
}

/// DELETE /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}
///
/// Soft-delete a version. Returns 409 if the version is currently active.
pub async fn delete_version(
    State(state): State<AppState>,
    Path((_avatar_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let version = ensure_version_exists(&state.pool, version_id).await?;

    if version.is_active {
        return Err(AppError::Core(CoreError::Conflict(
            "Cannot delete the active version. Activate a different version first.".into(),
        )));
    }

    AvatarMetadataVersionRepo::soft_delete(&state.pool, version_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/avatars/{avatar_id}/metadata/mark-outdated
///
/// Mark all active metadata versions for the avatar as outdated.
/// Called when Bio or ToV source files are updated.
pub async fn mark_metadata_outdated(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<MarkOutdatedRequest>,
) -> AppResult<StatusCode> {
    ensure_avatar_exists(&state.pool, avatar_id).await?;
    AvatarMetadataVersionRepo::mark_outdated_for_avatar(
        &state.pool,
        avatar_id,
        &body.reason,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}/approve
///
/// Approve a metadata version. Only the assigned avatar reviewer may approve.
pub async fn approve_metadata_version(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((avatar_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_version_exists(&state.pool, version_id).await?;
    require_reviewer_or_admin(&state.pool, avatar_id, auth.user_id, &auth.role).await?;

    let version =
        AvatarMetadataVersionRepo::approve(&state.pool, avatar_id, version_id, auth.user_id)
            .await?
            .ok_or_else(|| {
                AppError::Core(CoreError::NotFound {
                    entity: "AvatarMetadataVersion",
                    id: version_id,
                })
            })?;

    // Log audit action
    let audit_meta = serde_json::json!({ "version_id": version_id });
    AvatarReviewRepo::log_action(
        &state.pool,
        avatar_id,
        "metadata_approved",
        auth.user_id,
        None,
        None,
        &audit_meta,
    )
    .await?;

    Ok(Json(DataResponse { data: version }))
}

/// POST /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}/unapprove
///
/// Revert a metadata version's approval back to pending. Only the assigned reviewer may unapprove.
pub async fn unapprove_metadata_version(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((avatar_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_version_exists(&state.pool, version_id).await?;
    require_reviewer_or_admin(&state.pool, avatar_id, auth.user_id, &auth.role).await?;

    let version = AvatarMetadataVersionRepo::unapprove(&state.pool, version_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "AvatarMetadataVersion",
                id: version_id,
            })
        })?;

    let audit_meta = serde_json::json!({ "version_id": version_id });
    AvatarReviewRepo::log_action(
        &state.pool,
        avatar_id,
        "metadata_unapproved",
        auth.user_id,
        None,
        None,
        &audit_meta,
    )
    .await?;

    Ok(Json(DataResponse { data: version }))
}

/// POST /api/v1/avatars/{avatar_id}/metadata/versions/{version_id}/reject-approval
///
/// Reject a metadata version's approval. Only the assigned avatar reviewer may reject.
pub async fn reject_metadata_approval(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((avatar_id, version_id)): Path<(DbId, DbId)>,
    Json(body): Json<RejectMetadataApprovalRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_version_exists(&state.pool, version_id).await?;
    require_reviewer_or_admin(&state.pool, avatar_id, auth.user_id, &auth.role).await?;

    let version = AvatarMetadataVersionRepo::reject_approval(
        &state.pool,
        version_id,
        body.comment.as_deref(),
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "AvatarMetadataVersion",
            id: version_id,
        })
    })?;

    // Log audit action
    let audit_meta = serde_json::json!({ "version_id": version_id });
    AvatarReviewRepo::log_action(
        &state.pool,
        avatar_id,
        "metadata_rejected",
        auth.user_id,
        None,
        body.comment.as_deref(),
        &audit_meta,
    )
    .await?;

    Ok(Json(DataResponse { data: version }))
}
