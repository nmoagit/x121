//! Handlers for the character face contact sheet system (PRD-103).
//!
//! Provides endpoints for managing face crop images that form a tiled
//! contact sheet for visual consistency review, plus placeholder endpoints
//! for grid generation and export.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use x121_core::contact_sheet::{
    select_best_frames, validate_export_format, validate_grid_size, DEFAULT_GRID_COLS,
    DEFAULT_GRID_ROWS, MAX_IMAGES,
};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::contact_sheet::CreateContactSheetImage;
use x121_db::repositories::ContactSheetRepo;

use crate::error::{AppError, AppResult};
use crate::handlers::consistency_report::ensure_character_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

/// Request body for creating a contact sheet image record.
#[derive(Debug, Deserialize)]
pub struct CreateImageRequest {
    pub scene_id: DbId,
    pub face_crop_path: String,
    pub confidence_score: Option<f64>,
    pub frame_number: Option<i32>,
}

/// Request body for generating a contact sheet grid.
#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    /// Number of grid columns (1-8, default 4).
    pub cols: Option<u32>,
    /// Number of grid rows (1-8, default 4).
    pub rows: Option<u32>,
}

/// Query parameters for exporting a contact sheet.
#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    /// Export format: `"png"` or `"pdf"` (default `"png"`).
    #[serde(default = "default_export_format")]
    pub format: String,
}

fn default_export_format() -> String {
    "png".to_string()
}

/// Response for the generate endpoint (placeholder).
#[derive(Debug, Serialize)]
pub struct GenerateResponse {
    pub character_id: DbId,
    pub grid_cols: u32,
    pub grid_rows: u32,
    pub image_count: usize,
    pub best_frame_indices: Vec<usize>,
}

/// Response for the export endpoint (placeholder).
#[derive(Debug, Serialize)]
pub struct ExportResponse {
    pub character_id: DbId,
    pub format: String,
    pub image_count: usize,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /characters/{character_id}/contact-sheet
///
/// List all face crop images for a character, ordered by scene then creation time.
pub async fn list_character_images(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    let images = ContactSheetRepo::list_by_character(&state.pool, character_id).await?;

    Ok(Json(DataResponse { data: images }))
}

/// POST /characters/{character_id}/contact-sheet
///
/// Add a face crop image record for a character's contact sheet.
pub async fn create_image(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(input): Json<CreateImageRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    let create = CreateContactSheetImage {
        character_id,
        scene_id: input.scene_id,
        face_crop_path: input.face_crop_path,
        confidence_score: input.confidence_score,
        frame_number: input.frame_number,
    };

    let image = ContactSheetRepo::create(&state.pool, &create).await?;

    tracing::info!(
        user_id = auth.user_id,
        character_id,
        image_id = image.id,
        "Contact sheet image created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: image })))
}

/// DELETE /contact-sheet-images/{id}
///
/// Remove a single face crop image from a character's contact sheet.
pub async fn delete_image(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = ContactSheetRepo::delete(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ContactSheetImage",
            id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        image_id = id,
        "Contact sheet image deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

/// POST /characters/{character_id}/contact-sheet/generate
///
/// Trigger contact sheet generation for a character. Currently a placeholder
/// that returns the existing images with best-frame selection metadata.
/// The actual face crop extraction pipeline will be connected in a later phase.
pub async fn generate_contact_sheet(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(input): Json<GenerateRequest>,
) -> AppResult<impl IntoResponse> {
    let cols = input.cols.unwrap_or(DEFAULT_GRID_COLS);
    let rows = input.rows.unwrap_or(DEFAULT_GRID_ROWS);
    validate_grid_size(cols, rows)?;

    ensure_character_exists(&state.pool, character_id).await?;

    let images = ContactSheetRepo::list_by_character(&state.pool, character_id).await?;
    let max_cells = (cols * rows) as usize;
    let max_count = max_cells.min(MAX_IMAGES);

    let scores: Vec<f64> = images
        .iter()
        .map(|img| img.confidence_score.unwrap_or(0.0))
        .collect();

    let best_indices = select_best_frames(&scores, max_count);

    tracing::info!(
        user_id = auth.user_id,
        character_id,
        grid = format!("{cols}x{rows}"),
        image_count = images.len(),
        selected = best_indices.len(),
        "Contact sheet generation triggered"
    );

    Ok(Json(DataResponse {
        data: GenerateResponse {
            character_id,
            grid_cols: cols,
            grid_rows: rows,
            image_count: images.len(),
            best_frame_indices: best_indices,
        },
    }))
}

/// GET /characters/{character_id}/contact-sheet/export
///
/// Export a character's contact sheet as PNG or PDF. Currently a placeholder
/// that returns metadata about what would be exported. The actual rendering
/// pipeline will be connected in a later phase.
pub async fn export_contact_sheet(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Query(query): Query<ExportQuery>,
) -> AppResult<impl IntoResponse> {
    validate_export_format(&query.format)?;

    ensure_character_exists(&state.pool, character_id).await?;

    let images = ContactSheetRepo::list_by_character(&state.pool, character_id).await?;

    Ok(Json(DataResponse {
        data: ExportResponse {
            character_id,
            format: query.format,
            image_count: images.len(),
        },
    }))
}
