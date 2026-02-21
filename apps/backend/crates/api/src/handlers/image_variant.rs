//! Handlers for the `/image-variants` resource.
//!
//! Image variants are nested under characters:
//! `/characters/{character_id}/image-variants[/{id}]`

use axum::extract::{Multipart, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use trulience_core::error::CoreError;
use trulience_core::images;
use trulience_core::types::DbId;
use trulience_db::models::image::{CreateImageVariant, UpdateImageVariant};
use trulience_db::models::status::ImageVariantStatus;
use trulience_db::repositories::ImageVariantRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Directory for storing variant image files.
const VARIANT_STORAGE_DIR: &str = "storage/variants";

/// Return the path to the variant storage directory, creating it lazily.
async fn ensure_variant_dir() -> AppResult<std::path::PathBuf> {
    let dir = std::path::PathBuf::from(VARIANT_STORAGE_DIR);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    Ok(dir)
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

    let updated =
        ImageVariantRepo::set_hero(&state.pool, id, ImageVariantStatus::Approved.id())
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
    let storage_dir = ensure_variant_dir().await?;

    let stored_filename = format!(
        "variant_{character_id}_{id}_v{}_{}.{ext}",
        original.version + 1,
        chrono::Utc::now().timestamp()
    );
    let file_path = storage_dir.join(&stored_filename);
    tokio::fs::write(&file_path, &data)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let input = CreateImageVariant {
        character_id,
        source_image_id: original.source_image_id,
        derived_image_id: original.derived_image_id,
        variant_label: original.variant_label.clone(),
        status_id: Some(ImageVariantStatus::Generated.id()),
        file_path: file_path.to_string_lossy().to_string(),
        variant_type: original.variant_type.clone(),
        provenance: Some(images::PROVENANCE_MANUALLY_EDITED.to_string()),
        is_hero: Some(false),
        file_size_bytes: Some(data.len() as i64),
        width: None,
        height: None,
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

    let vlabel =
        variant_label.unwrap_or_else(|| format!("Manual upload ({})", &vtype));

    // Validate format
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    if !images::is_valid_image_format(&ext) {
        return Err(AppError::BadRequest(format!(
            "Unsupported image format '.{ext}'. Supported: png, jpeg, jpg, webp"
        )));
    }

    // Store file
    let storage_dir = ensure_variant_dir().await?;

    let stored_filename = format!(
        "variant_{character_id}_manual_{}.{ext}",
        chrono::Utc::now().timestamp()
    );
    let file_path = storage_dir.join(&stored_filename);
    tokio::fs::write(&file_path, &data)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let input = CreateImageVariant {
        character_id,
        source_image_id: None,
        derived_image_id: None,
        variant_label: vlabel,
        status_id: Some(ImageVariantStatus::Generated.id()),
        file_path: file_path.to_string_lossy().to_string(),
        variant_type: Some(vtype),
        provenance: Some(images::PROVENANCE_MANUAL_UPLOAD.to_string()),
        is_hero: Some(false),
        file_size_bytes: Some(data.len() as i64),
        width: None,
        height: None,
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
