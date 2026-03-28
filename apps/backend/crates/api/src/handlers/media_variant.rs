//! Handlers for the `/image-variants` resource.
//!
//! Image variants are nested under avatars:
//! `/avatars/{avatar_id}/image-variants[/{id}]`

use axum::extract::{Multipart, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::hashing::sha256_hex;
use x121_core::images;
use x121_core::types::DbId;
use x121_db::models::media::{CreateMediaVariant, UpdateMediaVariant};
use x121_db::models::status::MediaVariantStatus;
use x121_db::repositories::MediaVariantRepo;

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::storage::pipeline_scoped_key;
use x121_db::repositories::PipelineRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Storage key prefix for variant image files.
const VARIANT_KEY_PREFIX: &str = "variants";

/// Build the storage key prefix for variants, optionally scoped to a pipeline.
///
/// With pipeline: `{pipeline_code}/variants`
/// Without:       `variants`
fn variant_key_prefix(pipeline_code: Option<&str>) -> String {
    match pipeline_code {
        Some(code) => pipeline_scoped_key(code, VARIANT_KEY_PREFIX),
        None => VARIANT_KEY_PREFIX.to_string(),
    }
}

/// Return the absolute path to the variant storage directory, creating it lazily.
/// Uses the storage provider root so files go to the configured STORAGE_ROOT.
/// When `pipeline_code` is provided, the directory is scoped under the pipeline.
async fn ensure_variant_dir(
    state: &AppState,
    pipeline_code: Option<&str>,
) -> AppResult<std::path::PathBuf> {
    let prefix = variant_key_prefix(pipeline_code);
    let abs = state.resolve_to_path(&prefix).await?;
    tokio::fs::create_dir_all(&abs)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    Ok(abs)
}

/// Look up the pipeline code for the given avatar. Returns `None` if the
/// avatar or its pipeline doesn't exist (legacy data).
async fn pipeline_code_for_avatar(
    pool: &sqlx::PgPool,
    avatar_id: DbId,
) -> AppResult<Option<String>> {
    PipelineRepo::code_for_avatar(pool, avatar_id)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))
}

// ---------------------------------------------------------------------------
// Existing CRUD handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/avatars/{avatar_id}/image-variants
///
/// Overrides `input.avatar_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(mut input): Json<CreateMediaVariant>,
) -> AppResult<impl IntoResponse> {
    input.avatar_id = avatar_id;
    let variant = MediaVariantRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: variant })))
}

/// GET /api/v1/avatars/{avatar_id}/image-variants
pub async fn list_by_avatar(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Query(filters): Query<VariantListFilters>,
) -> AppResult<impl IntoResponse> {
    let variants = if let Some(ref vt) = filters.variant_type {
        MediaVariantRepo::list_by_avatar_and_type(&state.pool, avatar_id, vt).await?
    } else {
        MediaVariantRepo::list_by_avatar(&state.pool, avatar_id).await?
    };
    Ok(Json(DataResponse { data: variants }))
}

/// Query parameters for listing variants.
#[derive(Debug, Deserialize)]
pub struct VariantListFilters {
    pub variant_type: Option<String>,
}

/// GET /api/v1/avatars/{avatar_id}/image-variants/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let variant = MediaVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;
    Ok(Json(DataResponse { data: variant }))
}

/// PUT /api/v1/avatars/{avatar_id}/image-variants/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateMediaVariant>,
) -> AppResult<impl IntoResponse> {
    let variant = MediaVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;
    Ok(Json(DataResponse { data: variant }))
}

/// DELETE /api/v1/avatars/{avatar_id}/image-variants/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = MediaVariantRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// PRD-21: Variant lifecycle handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/avatars/{avatar_id}/image-variants/{id}/approve
///
/// Approve a variant and set it as the hero for its avatar+variant_type.
/// Clears the previous hero atomically.
pub async fn approve_as_hero(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    // Validate variant exists and is in an approvable state.
    let variant = MediaVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    let status = variant.status_id;
    let generated = MediaVariantStatus::Generated.id();
    let editing = MediaVariantStatus::Editing.id();
    let pending = MediaVariantStatus::Pending.id();

    if status != generated && status != editing && status != pending {
        return Err(AppError::Core(CoreError::Validation(format!(
            "Variant status must be generated, editing, or pending to approve; current status_id={status}"
        ))));
    }

    let updated = MediaVariantRepo::set_hero(&state.pool, id, MediaVariantStatus::Approved.id())
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    Ok(Json(DataResponse { data: updated }))
}

/// POST /api/v1/avatars/{avatar_id}/image-variants/{id}/unapprove
///
/// Revert an approved or rejected variant back to pending status.
pub async fn unapprove_variant(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let variant = MediaVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    let approved = MediaVariantStatus::Approved.id();
    let rejected = MediaVariantStatus::Rejected.id();
    if variant.status_id != approved && variant.status_id != rejected {
        return Err(AppError::Core(CoreError::Validation(format!(
            "Variant must be approved or rejected to unapprove; current status_id={}",
            variant.status_id
        ))));
    }

    let input = UpdateMediaVariant {
        status_id: Some(MediaVariantStatus::Pending.id()),
        source_media_id: None,
        derived_media_id: None,
        variant_label: None,
        file_path: None,
        variant_type: None,
        provenance: None,
        is_hero: Some(false),
        file_size_bytes: None,
        width: None,
        height: None,
        format: None,
        generation_params: None,
        notes: None,
    };

    let updated = MediaVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    Ok(Json(DataResponse { data: updated }))
}

/// POST /api/v1/avatars/{avatar_id}/image-variants/{id}/reject
///
/// Set variant status to rejected.
pub async fn reject_variant(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let input = UpdateMediaVariant {
        status_id: Some(MediaVariantStatus::Rejected.id()),
        source_media_id: None,
        derived_media_id: None,
        variant_label: None,
        file_path: None,
        variant_type: None,
        provenance: None,
        is_hero: Some(false),
        file_size_bytes: None,
        width: None,
        height: None,
        format: None,
        generation_params: None,
        notes: None,
    };

    let variant = MediaVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    Ok(Json(DataResponse { data: variant }))
}

/// POST /api/v1/avatars/{avatar_id}/image-variants/{id}/export
///
/// Mark a variant as being edited externally. Returns the variant with
/// status set to `editing`. The caller uses `file_path` to download the image.
pub async fn export_for_editing(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let input = UpdateMediaVariant {
        status_id: Some(MediaVariantStatus::Editing.id()),
        source_media_id: None,
        derived_media_id: None,
        variant_label: None,
        file_path: None,
        variant_type: None,
        provenance: None,
        is_hero: None,
        file_size_bytes: None,
        width: None,
        height: None,
        format: None,
        generation_params: None,
        notes: None,
    };

    let variant = MediaVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    Ok(Json(DataResponse { data: variant }))
}

/// POST /api/v1/avatars/{avatar_id}/image-variants/{id}/reimport
///
/// Re-import an edited variant. Creates a new variant record linked to the
/// original via `parent_variant_id` with provenance `manually_edited`.
pub async fn reimport_variant(
    State(state): State<AppState>,
    Path((avatar_id, id)): Path<(DbId, DbId)>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let original = MediaVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    // Parse multipart upload
    let mut file_data: Option<(String, Vec<u8>)> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("reimport.png").to_string();
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            file_data = Some((filename, data.to_vec()));
        }
    }

    let (filename, data) =
        file_data.ok_or_else(|| AppError::BadRequest("Missing required 'file' field".into()))?;

    // Validate format
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    if !images::is_valid_image_format(&ext) {
        return Err(AppError::BadRequest(format!(
            "Unsupported image format '.{ext}'. Supported: png, jpeg, jpg, webp"
        )));
    }

    // Store file (pipeline-scoped, PRD-141)
    let pc = pipeline_code_for_avatar(&state.pool, avatar_id).await?;
    let storage_dir = ensure_variant_dir(&state, pc.as_deref()).await?;

    let stored_filename = format!(
        "variant_{avatar_id}_{id}_v{}_{}.{ext}",
        original.version + 1,
        chrono::Utc::now().timestamp()
    );
    let abs_path = storage_dir.join(&stored_filename);
    tokio::fs::write(&abs_path, &data)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Store the storage key (not absolute path) in the DB.
    let prefix = variant_key_prefix(pc.as_deref());
    let storage_key = format!("{prefix}/{stored_filename}");

    let (width, height) = images::image_dimensions(&data)
        .map(|(w, h)| (Some(w as i32), Some(h as i32)))
        .unwrap_or((None, None));

    let input = CreateMediaVariant {
        avatar_id,
        source_media_id: original.source_media_id,
        derived_media_id: original.derived_media_id,
        variant_label: original.variant_label.clone(),
        status_id: Some(MediaVariantStatus::Generated.id()),
        file_path: storage_key,
        variant_type: original.variant_type.clone(),
        provenance: Some(images::PROVENANCE_MANUALLY_EDITED.to_string()),
        is_hero: Some(false),
        file_size_bytes: Some(data.len() as i64),
        width,
        height,
        format: Some(ext),
        version: Some(original.version + 1),
        parent_variant_id: Some(id),
        generation_params: None,
        content_hash: Some(sha256_hex(&data)),
    };

    let variant = MediaVariantRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: variant })))
}

/// POST /api/v1/avatars/{avatar_id}/image-variants/upload
///
/// Upload a manually created variant (not generated).
pub async fn upload_manual_variant(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let mut file_data: Option<(String, Vec<u8>)> = None;
    let mut variant_type: Option<String> = None;
    let mut variant_label: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                let filename = field.file_name().unwrap_or("upload.png").to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                file_data = Some((filename, data.to_vec()));
            }
            "variant_type" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                variant_type = Some(text);
            }
            "variant_label" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                variant_label = Some(text);
            }
            _ => {}
        }
    }

    let (filename, data) =
        file_data.ok_or_else(|| AppError::BadRequest("Missing required 'file' field".into()))?;

    let vtype = variant_type
        .ok_or_else(|| AppError::BadRequest("Missing required 'variant_type' field".into()))?;

    let vlabel = variant_label.unwrap_or_else(|| format!("Manual upload ({})", &vtype));

    // Validate format
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    if !images::is_valid_image_format(&ext) {
        return Err(AppError::BadRequest(format!(
            "Unsupported image format '.{ext}'. Supported: png, jpeg, jpg, webp"
        )));
    }

    // Store file (pipeline-scoped, PRD-141)
    let pc = pipeline_code_for_avatar(&state.pool, avatar_id).await?;
    let storage_dir = ensure_variant_dir(&state, pc.as_deref()).await?;

    let stored_filename = format!(
        "variant_{avatar_id}_{vtype}_{}.{ext}",
        chrono::Utc::now().timestamp_millis()
    );
    let abs_path = storage_dir.join(&stored_filename);
    tokio::fs::write(&abs_path, &data)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Store the storage key (not absolute path) in the DB.
    let prefix = variant_key_prefix(pc.as_deref());
    let storage_key = format!("{prefix}/{stored_filename}");

    // Auto-promote to hero if no hero exists yet for this avatar+variant_type.
    let existing_hero = MediaVariantRepo::find_hero(&state.pool, avatar_id, &vtype).await?;
    let should_be_hero = existing_hero.is_none();

    let (width, height) = images::image_dimensions(&data)
        .map(|(w, h)| (Some(w as i32), Some(h as i32)))
        .unwrap_or((None, None));

    let content_hash = sha256_hex(&data);

    let input = CreateMediaVariant {
        avatar_id,
        source_media_id: None,
        derived_media_id: None,
        variant_label: vlabel,
        status_id: Some(MediaVariantStatus::Pending.id()),
        file_path: storage_key,
        variant_type: Some(vtype),
        provenance: Some(images::PROVENANCE_MANUAL_UPLOAD.to_string()),
        is_hero: Some(should_be_hero),
        file_size_bytes: Some(data.len() as i64),
        width,
        height,
        format: Some(ext),
        version: Some(1),
        parent_variant_id: None,
        generation_params: None,
        content_hash: Some(content_hash),
    };

    let variant = MediaVariantRepo::create(&state.pool, &input).await?;

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!("Image uploaded for avatar {avatar_id}: {filename}"),
        )
        .with_fields(serde_json::json!({
            "avatar_id": avatar_id,
            "variant_id": variant.id,
            "variant_type": &input.variant_type,
            "filename": filename,
        })),
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: variant })))
}

/// GET /api/v1/avatars/{avatar_id}/image-variants/{id}/history
///
/// Return the version chain for a variant.
pub async fn variant_history(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let chain = MediaVariantRepo::list_version_chain(&state.pool, id).await?;
    if chain.is_empty() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }));
    }
    Ok(Json(DataResponse { data: chain }))
}

/// GET /api/v1/image-variants/{id}/thumbnail
///
/// Serve a resized JPEG thumbnail for the given image variant.
/// Accepts `?size=N` (default 256, max 1024). Thumbnails are cached
/// to disk alongside the original so subsequent requests are fast.
pub async fn thumbnail(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Query(params): Query<ThumbnailParams>,
) -> AppResult<impl IntoResponse> {
    let size = params.size.unwrap_or(256).min(1024).max(32);

    let variant = MediaVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }))?;

    if variant.file_path.is_empty() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "MediaVariant",
            id,
        }));
    }

    let original_path = state.resolve_to_path(&variant.file_path).await?;

    // Build cache path: same dir, `{stem}_thumb{size}.jpg`
    let stem = original_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("img");
    let cache_name = format!("{stem}_thumb{size}.jpg");
    let cache_path = original_path.with_file_name(&cache_name);

    // Serve from cache if it exists
    if cache_path.exists() {
        let bytes = tokio::fs::read(&cache_path)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?;
        return Ok((
            [
                (axum::http::header::CONTENT_TYPE, "image/jpeg"),
                (axum::http::header::CACHE_CONTROL, "public, max-age=86400"),
            ],
            bytes,
        )
            .into_response());
    }

    // Generate thumbnail
    let data = tokio::fs::read(&original_path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let thumb_bytes = images::generate_thumbnail(&data, size as u32)
        .ok_or_else(|| AppError::InternalError("Failed to generate thumbnail".into()))?;

    // Cache to disk (best-effort)
    let _ = tokio::fs::write(&cache_path, &thumb_bytes).await;

    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "image/jpeg"),
            (axum::http::header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        thumb_bytes,
    )
        .into_response())
}

#[derive(Debug, Deserialize)]
pub struct ThumbnailParams {
    pub size: Option<u16>,
}

/// POST /api/v1/avatars/{avatar_id}/image-variants/generate
///
/// Request variant generation via ComfyUI. Creates pending variant records
/// that will be updated by the generation completion callback.
#[derive(Debug, Deserialize)]
pub struct GenerateVariantsRequest {
    pub variant_type: String,
    pub variant_label: Option<String>,
    pub count: Option<u32>,
    pub generation_params: Option<serde_json::Value>,
}

pub async fn generate_variants(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<GenerateVariantsRequest>,
) -> AppResult<impl IntoResponse> {
    let count = body.count.unwrap_or(1).min(10); // cap at 10
    let label = body
        .variant_label
        .unwrap_or_else(|| format!("{} variant", &body.variant_type));

    let mut variants = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let input = CreateMediaVariant {
            avatar_id,
            source_media_id: None,
            derived_media_id: None,
            variant_label: label.clone(),
            status_id: Some(MediaVariantStatus::Generating.id()),
            file_path: String::new(),
            variant_type: Some(body.variant_type.clone()),
            provenance: Some(images::PROVENANCE_GENERATED.to_string()),
            is_hero: Some(false),
            file_size_bytes: None,
            width: None,
            height: None,
            format: None,
            version: Some(1),
            parent_variant_id: None,
            generation_params: body.generation_params.clone(),
            content_hash: None,
        };
        let variant = MediaVariantRepo::create(&state.pool, &input).await?;
        variants.push(variant);
    }

    // NOTE: Actual ComfyUI dispatch (PRD-05) will be integrated when that
    // bridge is connected. For now the variant records are created in
    // "generating" status ready for the completion callback.

    Ok((StatusCode::CREATED, Json(DataResponse { data: variants })))
}

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct BackfillParams {
    pub limit: Option<u32>,
}

/// Response body for backfill-metadata.
#[derive(Debug, Serialize)]
pub struct BackfillMetadataResponse {
    pub processed: usize,
    pub succeeded: usize,
    pub failed: usize,
}

/// POST /api/v1/image-variants/backfill-thumbnails
///
/// Pre-generate 256px thumbnails for all image variants that have files.
/// Skips variants whose cached thumbnail already exists on disk.
/// Processes up to `limit` rows (default 100) per call starting at `offset`.
pub async fn backfill_thumbnails(
    State(state): State<AppState>,
    Query(params): Query<BackfillThumbnailParams>,
) -> AppResult<Json<BackfillThumbnailResponse>> {
    let size: u32 = params.size.unwrap_or(256).min(512).max(32) as u32;
    let limit = params.limit.unwrap_or(100).min(500) as i64;
    let offset = params.offset.unwrap_or(0) as i64;

    let variants = MediaVariantRepo::list_with_files(&state.pool, limit, offset).await?;

    let total = variants.len();
    let mut generated = 0usize;
    let mut skipped = 0usize;
    let mut failed = 0usize;

    for variant in &variants {
        let original_path = match state.resolve_to_path(&variant.file_path).await {
            Ok(p) => p,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        // Build cache path
        let stem = original_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("img");
        let cache_name = format!("{stem}_thumb{size}.jpg");
        let cache_path = original_path.with_file_name(&cache_name);

        // Skip if already cached
        if cache_path.exists() {
            skipped += 1;
            continue;
        }

        // Read and generate
        let data = match tokio::fs::read(&original_path).await {
            Ok(d) => d,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        match images::generate_thumbnail(&data, size) {
            Some(thumb_bytes) => match tokio::fs::write(&cache_path, &thumb_bytes).await {
                Ok(_) => generated += 1,
                Err(_) => failed += 1,
            },
            None => failed += 1,
        }
    }

    tracing::info!(
        total,
        generated,
        skipped,
        failed,
        size,
        "Backfill thumbnails complete"
    );

    Ok(Json(BackfillThumbnailResponse {
        processed: total,
        generated,
        skipped,
        failed,
    }))
}

#[derive(Debug, Deserialize)]
pub struct BackfillThumbnailParams {
    pub size: Option<u16>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct BackfillThumbnailResponse {
    pub processed: usize,
    pub generated: usize,
    pub skipped: usize,
    pub failed: usize,
}

// ---------------------------------------------------------------------------
// Browse (cross-avatar)
// ---------------------------------------------------------------------------

/// An image variant enriched with avatar/project context for browsing.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MediaVariantBrowseItem {
    // Variant fields
    pub id: DbId,
    pub avatar_id: DbId,
    pub variant_label: String,
    pub status_id: i16,
    pub file_path: String,
    pub variant_type: Option<String>,
    pub provenance: String,
    pub is_hero: bool,
    pub file_size_bytes: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: Option<String>,
    pub version: i32,
    pub notes: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    // Context fields
    pub avatar_name: String,
    pub avatar_is_enabled: bool,
    pub project_id: DbId,
    pub project_name: String,
}

#[derive(Debug, Deserialize)]
pub struct BrowseVariantsParams {
    pub project_id: Option<DbId>,
    pub pipeline_id: Option<DbId>,
    /// Comma-separated status IDs for OR filtering (e.g., "1,2,3").
    pub status_id: Option<String>,
    pub provenance: Option<String>,
    pub variant_type: Option<String>,
    pub show_disabled: Option<bool>,
    /// Comma-separated tag IDs for label filtering (include).
    pub tag_ids: Option<String>,
    /// Comma-separated tag IDs to exclude from results.
    pub exclude_tag_ids: Option<String>,
    /// When true, only return items with no tags applied.
    pub no_tags: Option<bool>,
    /// Free-text search across avatar name, variant type/label, project.
    pub search: Option<String>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

/// Paginated browse result for image variants.
#[derive(Debug, Serialize)]
pub struct BrowseVariantsPage {
    pub items: Vec<MediaVariantBrowseItem>,
    pub total: i64,
}

// ---------------------------------------------------------------------------
// Check hashes (import deduplication)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CheckHashesRequest {
    pub hashes: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CheckHashesResponse {
    pub existing: Vec<String>,
}

/// POST /api/v1/image-variants/check-hashes
///
/// Given a list of SHA-256 content hashes, return those that already exist
/// in either `media_variants` or `scene_video_versions`. Used by the frontend
/// import flow to detect duplicates before uploading.
pub async fn check_hashes(
    State(state): State<AppState>,
    Json(body): Json<CheckHashesRequest>,
) -> AppResult<Json<DataResponse<CheckHashesResponse>>> {
    // Check image variants
    let mut existing_set = std::collections::HashSet::<String>::new();
    let image_existing = MediaVariantRepo::find_existing_hashes(&state.pool, &body.hashes).await?;
    existing_set.extend(image_existing);

    // Also check scene video versions
    if !body.hashes.is_empty() {
        let video_rows: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT content_hash FROM scene_video_versions \
             WHERE content_hash = ANY($1) AND deleted_at IS NULL",
        )
        .bind(&body.hashes)
        .fetch_all(&state.pool)
        .await?;
        existing_set.extend(video_rows.into_iter().map(|r| r.0));
    }

    Ok(Json(DataResponse {
        data: CheckHashesResponse {
            existing: existing_set.into_iter().collect(),
        },
    }))
}

/// GET /api/v1/image-variants/browse
///
/// List all image variants across avatars/projects, most recent first.
/// Returns paginated results with a total count.
pub async fn browse_variants(
    State(state): State<AppState>,
    Query(params): Query<BrowseVariantsParams>,
) -> AppResult<Json<DataResponse<BrowseVariantsPage>>> {
    let limit = params.limit.unwrap_or(200).min(500);
    let offset = params.offset.unwrap_or(0);
    let show_disabled = params.show_disabled.unwrap_or(false);

    let base_from = "\
        FROM media_variants iv \
        JOIN avatars c ON c.id = iv.avatar_id AND c.deleted_at IS NULL \
        JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL \
        WHERE iv.deleted_at IS NULL \
          AND ($1::bigint IS NULL OR p.id = $1) \
          AND ($2::bigint IS NULL OR p.pipeline_id = $2) \
          AND ($3::text IS NULL OR iv.status_id::text = ANY(string_to_array($3, ','))) \
          AND ($4::text IS NULL OR iv.provenance = ANY(string_to_array($4, ','))) \
          AND ($5::text IS NULL OR iv.variant_type = ANY(string_to_array($5, ','))) \
          AND ($6::bool OR c.is_enabled = true) \
          AND ($7::text IS NULL OR iv.id IN ( \
            SELECT et.entity_id FROM entity_tags et \
            WHERE et.entity_type = 'media_variant' \
              AND et.tag_id = ANY(string_to_array($7, ',')::bigint[]) \
          )) \
          AND ($8::text IS NULL OR ( \
            c.name ILIKE '%' || $8 || '%' \
            OR iv.variant_type ILIKE '%' || $8 || '%' \
            OR iv.variant_label ILIKE '%' || $8 || '%' \
            OR p.name ILIKE '%' || $8 || '%' \
          )) \
          AND ($9::text IS NULL OR iv.id NOT IN ( \
            SELECT et.entity_id FROM entity_tags et \
            WHERE et.entity_type = 'media_variant' \
              AND et.tag_id = ANY(string_to_array($9, ',')::bigint[]) \
          )) \
          AND (NOT $10::bool OR iv.id NOT IN ( \
            SELECT et.entity_id FROM entity_tags et \
            WHERE et.entity_type = 'media_variant' \
          ))";

    let count_sql = format!("SELECT COUNT(*) {base_from}");
    let total: i64 = sqlx::query_scalar(&count_sql)
        .bind(params.project_id)
        .bind(params.pipeline_id)
        .bind(&params.status_id)
        .bind(&params.provenance)
        .bind(&params.variant_type)
        .bind(show_disabled)
        .bind(&params.tag_ids)
        .bind(&params.search)
        .bind(&params.exclude_tag_ids)
        .bind(params.no_tags.unwrap_or(false))
        .fetch_one(&state.pool)
        .await?;

    let items_sql = format!(
        "SELECT \
            iv.id, iv.avatar_id, iv.variant_label, iv.status_id, iv.file_path, \
            iv.variant_type, iv.provenance, iv.is_hero, iv.file_size_bytes, \
            iv.width, iv.height, iv.format, iv.version, iv.notes, iv.created_at, \
            c.name AS avatar_name, c.is_enabled AS avatar_is_enabled, \
            p.id AS project_id, p.name AS project_name \
        {base_from} \
        ORDER BY iv.created_at DESC \
        LIMIT $11 OFFSET $12"
    );
    let items = sqlx::query_as::<_, MediaVariantBrowseItem>(&items_sql)
        .bind(params.project_id)
        .bind(params.pipeline_id)
        .bind(&params.status_id)
        .bind(&params.provenance)
        .bind(&params.variant_type)
        .bind(show_disabled)
        .bind(&params.tag_ids)
        .bind(&params.search)
        .bind(&params.exclude_tag_ids)
        .bind(params.no_tags.unwrap_or(false))
        .bind(limit as i64)
        .bind(offset as i64)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(DataResponse {
        data: BrowseVariantsPage { items, total },
    }))
}

/// POST /api/v1/image-variants/backfill-metadata
///
/// Backfill width/height for existing image variants that don't have dimensions
/// yet. Reads image file bytes, extracts header dimensions, and updates the DB.
/// Processes up to `limit` rows (default 50) per call.
pub async fn backfill_media_metadata(
    State(state): State<AppState>,
    Query(params): Query<BackfillParams>,
) -> AppResult<Json<BackfillMetadataResponse>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;

    let variants = MediaVariantRepo::list_missing_dimensions(&state.pool, limit).await?;

    let total = variants.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for variant in &variants {
        // Resolve the file path to read bytes.
        let abs_path = match state.resolve_to_path(&variant.file_path).await {
            Ok(p) => p,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let data = match tokio::fs::read(&abs_path).await {
            Ok(d) => d,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let (w, h) = match images::image_dimensions(&data) {
            Some(dims) => dims,
            None => {
                failed += 1;
                continue;
            }
        };

        match MediaVariantRepo::set_dimensions(&state.pool, variant.id, w as i32, h as i32).await {
            Ok(true) => succeeded += 1,
            _ => failed += 1,
        }
    }

    tracing::info!(total, succeeded, failed, "Backfill image metadata complete");

    Ok(Json(BackfillMetadataResponse {
        processed: total,
        succeeded,
        failed,
    }))
}

/// POST /api/v1/image-variants/backfill-hashes
///
/// Backfill SHA-256 content hashes for existing image variants that don't have
/// one yet. Reads each file from storage, computes the hash, and updates the DB.
/// Processes up to `limit` rows (default 200) per call.
pub async fn backfill_hashes(
    State(state): State<AppState>,
    Query(params): Query<BackfillParams>,
) -> AppResult<Json<BackfillMetadataResponse>> {
    let limit = params.limit.unwrap_or(200).min(500) as i64;

    // Find variants with no content_hash
    let variants: Vec<(DbId, String)> = sqlx::query_as(
        "SELECT id, file_path FROM media_variants \
         WHERE content_hash IS NULL AND deleted_at IS NULL \
         ORDER BY id LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let total = variants.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for (id, file_path) in &variants {
        let abs_path = match state.resolve_to_path(file_path).await {
            Ok(p) => p,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let data = match tokio::fs::read(&abs_path).await {
            Ok(d) => d,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let hash = sha256_hex(&data);

        match sqlx::query("UPDATE media_variants SET content_hash = $1 WHERE id = $2")
            .bind(&hash)
            .bind(id)
            .execute(&state.pool)
            .await
        {
            Ok(_) => succeeded += 1,
            Err(_) => failed += 1,
        }
    }

    tracing::info!(total, succeeded, failed, "Backfill content hashes complete");

    Ok(Json(BackfillMetadataResponse {
        processed: total,
        succeeded,
        failed,
    }))
}

/// POST /api/v1/image-variants/backfill-video-hashes
///
/// Backfill SHA-256 content hashes for existing scene video versions that don't
/// have one yet. Reads each file from storage, computes the hash, and updates the DB.
pub async fn backfill_video_hashes(
    State(state): State<AppState>,
    Query(params): Query<BackfillParams>,
) -> AppResult<Json<BackfillMetadataResponse>> {
    let limit = params.limit.unwrap_or(200).min(500) as i64;

    let versions: Vec<(DbId, String)> = sqlx::query_as(
        "SELECT id, file_path FROM scene_video_versions \
         WHERE content_hash IS NULL AND deleted_at IS NULL \
         ORDER BY id LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let total = versions.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for (id, file_path) in &versions {
        let abs_path = match state.resolve_to_path(file_path).await {
            Ok(p) => p,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let data = match tokio::fs::read(&abs_path).await {
            Ok(d) => d,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let hash = sha256_hex(&data);

        match sqlx::query("UPDATE scene_video_versions SET content_hash = $1 WHERE id = $2")
            .bind(&hash)
            .bind(id)
            .execute(&state.pool)
            .await
        {
            Ok(_) => succeeded += 1,
            Err(_) => failed += 1,
        }
    }

    tracing::info!(
        total,
        succeeded,
        failed,
        "Backfill video content hashes complete"
    );

    Ok(Json(BackfillMetadataResponse {
        processed: total,
        succeeded,
        failed,
    }))
}

// ---------------------------------------------------------------------------
// Bulk approve / reject
// ---------------------------------------------------------------------------

/// Result returned by bulk approve/reject operations.
#[derive(Debug, Serialize)]
pub struct BulkVariantActionResult {
    pub updated: i64,
}

/// Input for bulk media variant approve/reject.
/// Provide either `ids` (explicit list) or `filters` (same filters as browse).
#[derive(Debug, Deserialize)]
pub struct BulkVariantAction {
    pub ids: Option<Vec<DbId>>,
    pub filters: Option<BrowseVariantsParams>,
    /// Optional rejection reason (only used by bulk-reject).
    pub reason: Option<String>,
}

/// Build the shared WHERE clause used by both browse and bulk operations.
///
/// Returns the clause fragment (starting with `FROM ...`) and expects
/// parameters $1..$9 bound in the same order as `browse_variants`.
fn variant_browse_where_clause() -> &'static str {
    "FROM media_variants iv \
     JOIN avatars c ON c.id = iv.avatar_id AND c.deleted_at IS NULL \
     JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL \
     WHERE iv.deleted_at IS NULL \
       AND ($1::bigint IS NULL OR p.id = $1) \
       AND ($2::bigint IS NULL OR p.pipeline_id = $2) \
       AND ($3::text IS NULL OR iv.status_id::text = ANY(string_to_array($3, ','))) \
       AND ($4::text IS NULL OR iv.provenance = ANY(string_to_array($4, ','))) \
       AND ($5::text IS NULL OR iv.variant_type = ANY(string_to_array($5, ','))) \
       AND ($6::bool OR c.is_enabled = true) \
       AND ($7::text IS NULL OR iv.id IN ( \
         SELECT et.entity_id FROM entity_tags et \
         WHERE et.entity_type = 'media_variant' \
           AND et.tag_id = ANY(string_to_array($7, ',')::bigint[]) \
       )) \
       AND ($8::text IS NULL OR ( \
         c.name ILIKE '%' || $8 || '%' \
         OR iv.variant_type ILIKE '%' || $8 || '%' \
         OR iv.variant_label ILIKE '%' || $8 || '%' \
         OR p.name ILIKE '%' || $8 || '%' \
       )) \
       AND ($9::text IS NULL OR iv.id NOT IN ( \
         SELECT et.entity_id FROM entity_tags et \
         WHERE et.entity_type = 'media_variant' \
           AND et.tag_id = ANY(string_to_array($9, ',')::bigint[]) \
       ))"
}

/// Execute a bulk status update for media variants, either by explicit IDs or browse filters.
async fn bulk_update_variant_status(
    pool: &sqlx::PgPool,
    input: &BulkVariantAction,
    new_status_id: i16,
) -> AppResult<i64> {
    if let Some(ref ids) = input.ids {
        if ids.is_empty() {
            return Ok(0);
        }
        let result = sqlx::query(
            "UPDATE media_variants \
             SET status_id = $1, updated_at = NOW() \
             WHERE id = ANY($2::bigint[]) AND deleted_at IS NULL",
        )
        .bind(new_status_id)
        .bind(ids)
        .execute(pool)
        .await?;
        return Ok(result.rows_affected() as i64);
    }

    if let Some(ref filters) = input.filters {
        let show_disabled = filters.show_disabled.unwrap_or(false);
        let where_clause = variant_browse_where_clause();
        let sql = format!(
            "UPDATE media_variants \
             SET status_id = $10, updated_at = NOW() \
             WHERE id IN (SELECT iv.id {where_clause})"
        );
        let result = sqlx::query(&sql)
            .bind(filters.project_id)
            .bind(filters.pipeline_id)
            .bind(&filters.status_id)
            .bind(&filters.provenance)
            .bind(&filters.variant_type)
            .bind(show_disabled)
            .bind(&filters.tag_ids)
            .bind(&filters.search)
            .bind(&filters.exclude_tag_ids)
            .bind(new_status_id)
            .execute(pool)
            .await?;
        return Ok(result.rows_affected() as i64);
    }

    Err(AppError::BadRequest(
        "Either 'ids' or 'filters' must be provided".to_string(),
    ))
}

/// POST /api/v1/media-variants/bulk-approve
///
/// Bulk-approve media variants by explicit IDs or browse filters.
pub async fn bulk_approve_variants(
    _auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<BulkVariantAction>,
) -> AppResult<Json<DataResponse<BulkVariantActionResult>>> {
    let updated =
        bulk_update_variant_status(&state.pool, &input, MediaVariantStatus::Approved.id()).await?;
    tracing::info!(updated, "Bulk approved media variants");
    Ok(Json(DataResponse {
        data: BulkVariantActionResult { updated },
    }))
}

/// POST /api/v1/media-variants/bulk-reject
///
/// Bulk-reject media variants by explicit IDs or browse filters.
pub async fn bulk_reject_variants(
    _auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<BulkVariantAction>,
) -> AppResult<Json<DataResponse<BulkVariantActionResult>>> {
    let updated =
        bulk_update_variant_status(&state.pool, &input, MediaVariantStatus::Rejected.id()).await?;
    tracing::info!(updated, "Bulk rejected media variants");
    Ok(Json(DataResponse {
        data: BulkVariantActionResult { updated },
    }))
}
