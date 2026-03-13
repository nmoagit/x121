//! Handlers for the `/image-variants` resource.
//!
//! Image variants are nested under characters:
//! `/characters/{character_id}/image-variants[/{id}]`

use axum::extract::{Multipart, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::images;
use x121_core::types::DbId;
use x121_db::models::image::{CreateImageVariant, UpdateImageVariant};
use x121_db::models::status::ImageVariantStatus;
use x121_db::repositories::ImageVariantRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Storage key prefix for variant image files.
const VARIANT_KEY_PREFIX: &str = "variants";

/// Return the absolute path to the variant storage directory, creating it lazily.
/// Uses the storage provider root so files go to the configured STORAGE_ROOT.
async fn ensure_variant_dir(state: &AppState) -> AppResult<std::path::PathBuf> {
    let abs = state.resolve_to_path(VARIANT_KEY_PREFIX).await?;
    tokio::fs::create_dir_all(&abs)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    Ok(abs)
}

// ---------------------------------------------------------------------------
// Existing CRUD handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/characters/{character_id}/image-variants
///
/// Overrides `input.character_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(mut input): Json<CreateImageVariant>,
) -> AppResult<impl IntoResponse> {
    input.character_id = character_id;
    let variant = ImageVariantRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: variant })))
}

/// GET /api/v1/characters/{character_id}/image-variants
pub async fn list_by_character(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Query(filters): Query<VariantListFilters>,
) -> AppResult<impl IntoResponse> {
    let variants = if let Some(ref vt) = filters.variant_type {
        ImageVariantRepo::list_by_character_and_type(&state.pool, character_id, vt).await?
    } else {
        ImageVariantRepo::list_by_character(&state.pool, character_id).await?
    };
    Ok(Json(DataResponse { data: variants }))
}

/// Query parameters for listing variants.
#[derive(Debug, Deserialize)]
pub struct VariantListFilters {
    pub variant_type: Option<String>,
}

/// GET /api/v1/characters/{character_id}/image-variants/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let variant = ImageVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;
    Ok(Json(DataResponse { data: variant }))
}

/// PUT /api/v1/characters/{character_id}/image-variants/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateImageVariant>,
) -> AppResult<impl IntoResponse> {
    let variant = ImageVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;
    Ok(Json(DataResponse { data: variant }))
}

/// DELETE /api/v1/characters/{character_id}/image-variants/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = ImageVariantRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// PRD-21: Variant lifecycle handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/characters/{character_id}/image-variants/{id}/approve
///
/// Approve a variant and set it as the hero for its character+variant_type.
/// Clears the previous hero atomically.
pub async fn approve_as_hero(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    // Validate variant exists and is in an approvable state.
    let variant = ImageVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;

    let status = variant.status_id;
    let generated = ImageVariantStatus::Generated.id();
    let editing = ImageVariantStatus::Editing.id();
    let pending = ImageVariantStatus::Pending.id();

    if status != generated && status != editing && status != pending {
        return Err(AppError::Core(CoreError::Validation(format!(
            "Variant status must be generated, editing, or pending to approve; current status_id={status}"
        ))));
    }

    let updated = ImageVariantRepo::set_hero(&state.pool, id, ImageVariantStatus::Approved.id())
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;

    Ok(Json(DataResponse { data: updated }))
}

/// POST /api/v1/characters/{character_id}/image-variants/{id}/reject
///
/// Set variant status to rejected.
pub async fn reject_variant(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let input = UpdateImageVariant {
        status_id: Some(ImageVariantStatus::Rejected.id()),
        source_image_id: None,
        derived_image_id: None,
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
    };

    let variant = ImageVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;

    Ok(Json(DataResponse { data: variant }))
}

/// POST /api/v1/characters/{character_id}/image-variants/{id}/export
///
/// Mark a variant as being edited externally. Returns the variant with
/// status set to `editing`. The caller uses `file_path` to download the image.
pub async fn export_for_editing(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let input = UpdateImageVariant {
        status_id: Some(ImageVariantStatus::Editing.id()),
        source_image_id: None,
        derived_image_id: None,
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
    };

    let variant = ImageVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;

    Ok(Json(DataResponse { data: variant }))
}

/// POST /api/v1/characters/{character_id}/image-variants/{id}/reimport
///
/// Re-import an edited variant. Creates a new variant record linked to the
/// original via `parent_variant_id` with provenance `manually_edited`.
pub async fn reimport_variant(
    State(state): State<AppState>,
    Path((character_id, id)): Path<(DbId, DbId)>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let original = ImageVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
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

    // Store file
    let storage_dir = ensure_variant_dir(&state).await?;

    let stored_filename = format!(
        "variant_{character_id}_{id}_v{}_{}.{ext}",
        original.version + 1,
        chrono::Utc::now().timestamp()
    );
    let abs_path = storage_dir.join(&stored_filename);
    tokio::fs::write(&abs_path, &data)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Store the storage key (not absolute path) in the DB.
    let storage_key = format!("{VARIANT_KEY_PREFIX}/{stored_filename}");

    let (width, height) = images::image_dimensions(&data)
        .map(|(w, h)| (Some(w as i32), Some(h as i32)))
        .unwrap_or((None, None));

    let input = CreateImageVariant {
        character_id,
        source_image_id: original.source_image_id,
        derived_image_id: original.derived_image_id,
        variant_label: original.variant_label.clone(),
        status_id: Some(ImageVariantStatus::Generated.id()),
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
    };

    let variant = ImageVariantRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: variant })))
}

/// POST /api/v1/characters/{character_id}/image-variants/upload
///
/// Upload a manually created variant (not generated).
pub async fn upload_manual_variant(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
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

    // Store file
    let storage_dir = ensure_variant_dir(&state).await?;

    let stored_filename = format!(
        "variant_{character_id}_{vtype}_{}.{ext}",
        chrono::Utc::now().timestamp_millis()
    );
    let abs_path = storage_dir.join(&stored_filename);
    tokio::fs::write(&abs_path, &data)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Store the storage key (not absolute path) in the DB.
    let storage_key = format!("{VARIANT_KEY_PREFIX}/{stored_filename}");

    // Auto-promote to hero if no hero exists yet for this character+variant_type.
    let existing_hero = ImageVariantRepo::find_hero(&state.pool, character_id, &vtype).await?;
    let should_be_hero = existing_hero.is_none();

    let (width, height) = images::image_dimensions(&data)
        .map(|(w, h)| (Some(w as i32), Some(h as i32)))
        .unwrap_or((None, None));

    let input = CreateImageVariant {
        character_id,
        source_image_id: None,
        derived_image_id: None,
        variant_label: vlabel,
        status_id: Some(ImageVariantStatus::Pending.id()),
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
    };

    let variant = ImageVariantRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: variant })))
}

/// GET /api/v1/characters/{character_id}/image-variants/{id}/history
///
/// Return the version chain for a variant.
pub async fn variant_history(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let chain = ImageVariantRepo::list_version_chain(&state.pool, id).await?;
    if chain.is_empty() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
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

    let variant = ImageVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;

    if variant.file_path.is_empty() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
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

/// POST /api/v1/characters/{character_id}/image-variants/generate
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
    Path(character_id): Path<DbId>,
    Json(body): Json<GenerateVariantsRequest>,
) -> AppResult<impl IntoResponse> {
    let count = body.count.unwrap_or(1).min(10); // cap at 10
    let label = body
        .variant_label
        .unwrap_or_else(|| format!("{} variant", &body.variant_type));

    let mut variants = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let input = CreateImageVariant {
            character_id,
            source_image_id: None,
            derived_image_id: None,
            variant_label: label.clone(),
            status_id: Some(ImageVariantStatus::Generating.id()),
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
        };
        let variant = ImageVariantRepo::create(&state.pool, &input).await?;
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

    let variants = ImageVariantRepo::list_with_files(&state.pool, limit, offset).await?;

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

/// POST /api/v1/image-variants/backfill-metadata
///
/// Backfill width/height for existing image variants that don't have dimensions
/// yet. Reads image file bytes, extracts header dimensions, and updates the DB.
/// Processes up to `limit` rows (default 50) per call.
pub async fn backfill_image_metadata(
    State(state): State<AppState>,
    Query(params): Query<BackfillParams>,
) -> AppResult<Json<BackfillMetadataResponse>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;

    let variants = ImageVariantRepo::list_missing_dimensions(&state.pool, limit).await?;

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

        match ImageVariantRepo::set_dimensions(&state.pool, variant.id, w as i32, h as i32).await {
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
