//! Handlers for Generation Provenance & Asset Versioning (PRD-69).
//!
//! Provides endpoints for creating immutable generation receipts,
//! querying segment provenance, reverse asset usage, and staleness reports.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use trulience_core::error::CoreError;
use trulience_core::provenance;
use trulience_core::types::DbId;
use trulience_db::models::generation_receipt::{
    CompleteReceiptInput, CreateGenerationReceipt,
};
use trulience_db::repositories::GenerationReceiptRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for the staleness report.
#[derive(Debug, Deserialize)]
pub struct StalenessParams {
    pub project_id: Option<DbId>,
}

/// Query parameters for asset usage (reverse provenance).
#[derive(Debug, Deserialize)]
pub struct AssetUsageParams {
    pub version: Option<String>,
}

// ---------------------------------------------------------------------------
// POST /provenance/receipts
// ---------------------------------------------------------------------------

/// Create an immutable generation receipt.
///
/// Validates all input parameters and persists the receipt. The receipt
/// records the exact inputs used to produce a segment so that provenance
/// can be traced later.
pub async fn create_receipt(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateGenerationReceipt>,
) -> AppResult<impl IntoResponse> {
    // Validate receipt inputs.
    let lora_configs: Vec<provenance::LoraConfig> =
        serde_json::from_value(body.lora_configs.clone()).map_err(|e| {
            AppError::BadRequest(format!("Invalid lora_configs: {e}"))
        })?;

    provenance::validate_receipt_inputs(
        body.prompt_text.len(),
        lora_configs.len(),
        body.resolution_width,
        body.resolution_height,
        body.steps,
        body.cfg_scale,
    )?;

    let receipt = GenerationReceiptRepo::create(&state.pool, &body).await?;

    tracing::info!(
        receipt_id = receipt.id,
        segment_id = body.segment_id,
        "Generation receipt created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: receipt })))
}

// ---------------------------------------------------------------------------
// PATCH /provenance/receipts/{id}/complete
// ---------------------------------------------------------------------------

/// Complete a receipt by setting its timing fields.
///
/// This is the only allowed mutation on an otherwise immutable receipt.
pub async fn complete_receipt(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<CompleteReceiptInput>,
) -> AppResult<impl IntoResponse> {
    let updated =
        GenerationReceiptRepo::complete(&state.pool, id, body.completed_at, body.duration_ms)
            .await?;

    if updated {
        tracing::info!(receipt_id = id, "Generation receipt completed");
        Ok(Json(DataResponse { data: true }))
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "GenerationReceipt",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// GET /segments/{segment_id}/provenance
// ---------------------------------------------------------------------------

/// Get the most recent generation receipt for a segment.
pub async fn get_segment_provenance(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let receipt = GenerationReceiptRepo::find_for_segment(&state.pool, segment_id).await?;

    Ok(Json(DataResponse {
        data: receipt,
    }))
}

// ---------------------------------------------------------------------------
// GET /assets/{asset_id}/usage
// ---------------------------------------------------------------------------

/// Get reverse provenance: which segments used a given asset.
pub async fn get_asset_usage(
    State(state): State<AppState>,
    Path(asset_id): Path<DbId>,
    Query(params): Query<AssetUsageParams>,
) -> AppResult<impl IntoResponse> {
    let entries = GenerationReceiptRepo::find_usage_by_asset(
        &state.pool,
        asset_id,
        params.version.as_deref(),
    )
    .await?;

    Ok(Json(DataResponse { data: entries }))
}

// ---------------------------------------------------------------------------
// GET /provenance/staleness
// ---------------------------------------------------------------------------

/// Get a staleness report: segments whose model version no longer matches.
pub async fn get_staleness_report(
    State(state): State<AppState>,
    Query(params): Query<StalenessParams>,
) -> AppResult<impl IntoResponse> {
    let entries =
        GenerationReceiptRepo::find_stale_by_model(&state.pool, params.project_id).await?;

    Ok(Json(DataResponse { data: entries }))
}
