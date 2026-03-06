//! Handlers for the LLM-driven metadata refinement pipeline (PRD-125).
//!
//! Provides endpoints to trigger refinement jobs, list/view them,
//! approve results (creating a new metadata version), reject results,
//! and clear outdated markers on metadata versions.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::llm_refinement::STATUS_FAILED;
use x121_core::metadata_transform::SOURCE_LLM_REFINED;
use x121_core::types::DbId;
use x121_db::models::character_metadata_version::CreateCharacterMetadataVersion;
use x121_db::models::refinement_job::CreateRefinementJob;
use x121_db::repositories::{CharacterMetadataVersionRepo, RefinementJobRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::character_metadata_version::sync_to_character;
use crate::handlers::consistency_report::ensure_character_exists;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default LLM provider when none is configured in platform settings.
const DEFAULT_LLM_PROVIDER: &str = "openai";

/// Default LLM model when none is configured in platform settings.
const DEFAULT_LLM_MODEL: &str = "gpt-4o";

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Body for triggering a refinement job.
#[derive(Debug, Deserialize)]
pub struct TriggerRefinementRequest {
    /// Whether to allow enrichment (filling gaps with plausible data). Defaults to true.
    pub enrich: Option<bool>,
}

/// Body for approving a refinement result.
#[derive(Debug, Deserialize)]
pub struct ApproveRefinementRequest {
    /// Optional list of field names to cherry-pick. When `None`, all fields are accepted.
    pub selected_fields: Option<Vec<String>>,
}

/// Body for rejecting a refinement result.
#[derive(Debug, Deserialize)]
pub struct RejectRefinementRequest {
    /// Optional reason for the rejection.
    pub reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Cherry-pick selected fields from `full_metadata`, falling back to
/// `existing_metadata` for fields not in the selection.
fn cherry_pick_fields(
    existing_metadata: &serde_json::Value,
    full_metadata: &serde_json::Value,
    selected_fields: &[String],
) -> serde_json::Value {
    let existing = existing_metadata.as_object().cloned().unwrap_or_default();
    let refined = full_metadata.as_object().cloned().unwrap_or_default();

    let mut result = existing.clone();
    for field in selected_fields {
        if let Some(val) = refined.get(field) {
            result.insert(field.clone(), val.clone());
        }
    }
    serde_json::Value::Object(result)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/characters/{character_id}/refinement
///
/// Trigger a new LLM refinement job for a character. Returns 409 if a
/// job is already queued or running.
pub async fn trigger_refinement(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<TriggerRefinementRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    // Prevent duplicate active jobs
    if RefinementJobRepo::has_active_job(&state.pool, character_id).await? {
        return Err(AppError::Core(CoreError::Conflict(
            "A refinement job is already queued or running for this character.".into(),
        )));
    }

    // Read source bio/tov from the active metadata version (if any)
    let active_version =
        CharacterMetadataVersionRepo::find_active(&state.pool, character_id).await?;
    let (source_bio, source_tov) = match &active_version {
        Some(v) => (v.source_bio.clone(), v.source_tov.clone()),
        None => (None, None),
    };

    // TODO(PRD-125 post-MVP): read LLM config from platform settings
    let llm_provider = DEFAULT_LLM_PROVIDER.to_string();
    let llm_model = DEFAULT_LLM_MODEL.to_string();

    let input = CreateRefinementJob {
        character_id,
        source_bio,
        source_tov,
        llm_provider,
        llm_model,
        enrich: body.enrich.unwrap_or(true),
    };

    let job = RefinementJobRepo::create(&state.pool, &input).await?;

    Ok((StatusCode::CREATED, Json(DataResponse { data: job })))
}

/// GET /api/v1/characters/{character_id}/refinement-jobs
///
/// List all refinement jobs for a character, newest first.
pub async fn list_refinement_jobs(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let jobs = RefinementJobRepo::list_for_character(&state.pool, character_id).await?;
    Ok(Json(DataResponse { data: jobs }))
}

/// GET /api/v1/refinement-jobs/{job_uuid}
///
/// Get a single refinement job by UUID.
pub async fn get_refinement_job(
    State(state): State<AppState>,
    Path(job_uuid): Path<sqlx::types::Uuid>,
) -> AppResult<impl IntoResponse> {
    let job = RefinementJobRepo::find_by_uuid(&state.pool, job_uuid)
        .await?
        .ok_or_else(|| {
            // Use id=0 as placeholder since we looked up by UUID
            AppError::Core(CoreError::NotFound {
                entity: "RefinementJob",
                id: 0,
            })
        })?;
    Ok(Json(DataResponse { data: job }))
}

/// POST /api/v1/characters/{character_id}/refinement-jobs/{job_uuid}/approve
///
/// Approve a completed refinement job, creating a new metadata version
/// from the refined result. Supports cherry-picking individual fields.
pub async fn approve_refinement(
    State(state): State<AppState>,
    Path((character_id, job_uuid)): Path<(DbId, sqlx::types::Uuid)>,
    Json(body): Json<ApproveRefinementRequest>,
) -> AppResult<impl IntoResponse> {
    let job = RefinementJobRepo::find_by_uuid(&state.pool, job_uuid)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "RefinementJob",
                id: 0,
            })
        })?;

    // Verify the job belongs to this character
    if job.character_id != character_id {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "RefinementJob",
            id: 0,
        }));
    }

    let final_metadata = job.final_metadata.as_ref().ok_or_else(|| {
        AppError::BadRequest("Refinement job has no final metadata to approve.".into())
    })?;

    // Determine the metadata to use (full or cherry-picked)
    let metadata = if let Some(ref fields) = body.selected_fields {
        let existing = CharacterMetadataVersionRepo::find_active(&state.pool, character_id)
            .await?
            .map(|v| v.metadata)
            .unwrap_or(serde_json::Value::Object(Default::default()));
        cherry_pick_fields(&existing, final_metadata, fields)
    } else {
        final_metadata.clone()
    };

    // Create a new active metadata version from the refined result
    let create_input = CreateCharacterMetadataVersion {
        character_id,
        metadata: metadata.clone(),
        source: SOURCE_LLM_REFINED.to_string(),
        source_bio: job.source_bio.clone(),
        source_tov: job.source_tov.clone(),
        generation_report: job.final_report.clone(),
        is_active: None,
        notes: Some("Created from LLM refinement pipeline".into()),
    };

    let version =
        CharacterMetadataVersionRepo::create_as_active(&state.pool, &create_input).await?;

    // Sync to character.metadata column
    sync_to_character(&state.pool, character_id, &metadata).await?;

    // Update the job with the version link and mark completed
    RefinementJobRepo::set_result(
        &state.pool,
        job.id,
        final_metadata,
        job.final_report
            .as_ref()
            .unwrap_or(&serde_json::Value::Null),
        Some(version.id),
    )
    .await?;

    // Re-read the updated job to return fresh data
    let updated_job = RefinementJobRepo::find_by_id(&state.pool, job.id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "RefinementJob",
                id: job.id,
            })
        })?;

    Ok(Json(DataResponse { data: updated_job }))
}

/// POST /api/v1/characters/{character_id}/refinement-jobs/{job_uuid}/reject
///
/// Reject a refinement result, marking the job as failed with an optional reason.
pub async fn reject_refinement(
    State(state): State<AppState>,
    Path((character_id, job_uuid)): Path<(DbId, sqlx::types::Uuid)>,
    Json(body): Json<RejectRefinementRequest>,
) -> AppResult<StatusCode> {
    let job = RefinementJobRepo::find_by_uuid(&state.pool, job_uuid)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "RefinementJob",
                id: 0,
            })
        })?;

    if job.character_id != character_id {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "RefinementJob",
            id: 0,
        }));
    }

    let reason = body.reason.as_deref().unwrap_or("Rejected by user");

    RefinementJobRepo::update_status(&state.pool, job.id, STATUS_FAILED, Some(reason)).await?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/characters/{character_id}/metadata/versions/{version_id}/clear-outdated
///
/// Clear the outdated marker on a metadata version.
pub async fn clear_outdated(
    State(state): State<AppState>,
    Path((_character_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let updated = CharacterMetadataVersionRepo::clear_outdated(&state.pool, version_id).await?;

    if !updated {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "CharacterMetadataVersion",
            id: version_id,
        }));
    }

    Ok(StatusCode::NO_CONTENT)
}
