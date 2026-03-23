//! Handlers for the avatar ingest pipeline (PRD-113).
//!
//! Routes are nested under `/projects/{project_id}/ingest/...`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::import_rules::{self, FileClassification};
use x121_core::pipeline;
use x121_core::types::DbId;
use x121_db::models::avatar::CreateAvatar;
use x121_db::models::avatar_ingest::{
    AvatarIngestEntry, AvatarIngestSession, CreateAvatarIngestEntry, CreateAvatarIngestSession,
    UpdateAvatarIngestEntry,
};
use x121_db::repositories::{
    AvatarIngestEntryRepo, AvatarIngestSessionRepo, AvatarRepo, IngestEntryCounts,
    MetadataTemplateFieldRepo, MetadataTemplateRepo, PipelineRepo, ProjectRepo,
};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request/response types
// ---------------------------------------------------------------------------

/// Request body for creating an ingest session from a list of text names.
#[derive(Debug, Deserialize)]
pub struct TextIngestRequest {
    pub names: Vec<String>,
    pub source_type: Option<String>,
    pub target_group_id: Option<DbId>,
}

/// Full session detail including entries and counts.
#[derive(Debug, Serialize)]
pub struct IngestSessionDetail {
    pub session: AvatarIngestSession,
    pub entries: Vec<AvatarIngestEntry>,
    pub counts: IngestEntryCounts,
}

/// Summary of validation results for a session.
#[derive(Debug, Serialize)]
pub struct IngestValidationSummary {
    pub total: i64,
    pub pass: i64,
    pub warning: i64,
    pub fail: i64,
    pub pending: i64,
}

/// Result of confirming and importing avatars.
#[derive(Debug, Serialize)]
pub struct IngestConfirmResult {
    pub created: i64,
    pub failed: i64,
    pub skipped: i64,
    pub avatar_ids: Vec<DbId>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/projects/{project_id}/ingest/text
///
/// Create an ingest session from a list of avatar names.
pub async fn ingest_from_text(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<TextIngestRequest>,
) -> AppResult<(StatusCode, Json<IngestSessionDetail>)> {
    if input.names.is_empty() {
        return Err(AppError::BadRequest(
            "At least one name is required".to_string(),
        ));
    }

    let source_type = input.source_type.unwrap_or_else(|| "text".to_string());

    // Create the session.
    let session = AvatarIngestSessionRepo::create(
        &state.pool,
        &CreateAvatarIngestSession {
            project_id,
            source_type,
            source_name: Some("text input".to_string()),
            target_group_id: input.target_group_id,
            created_by: None,
        },
    )
    .await?;

    // Parse names and create entries.
    let entries_input: Vec<CreateAvatarIngestEntry> = input
        .names
        .iter()
        .map(|name| {
            let parsed = x121_core::name_parser::parse_avatar_name(name);
            CreateAvatarIngestEntry {
                session_id: session.id,
                folder_name: None,
                parsed_name: parsed.parsed,
                name_confidence: Some(parsed.confidence.as_str().to_string()),
                detected_images: None,
                image_classifications: None,
                metadata_status: Some("none".to_string()),
                metadata_json: None,
                metadata_source: None,
                tov_json: None,
                bio_json: None,
            }
        })
        .collect();

    let entries = AvatarIngestEntryRepo::create_batch(&state.pool, &entries_input).await?;

    // Update counts.
    AvatarIngestSessionRepo::update_counts(&state.pool, session.id).await?;

    let counts = AvatarIngestEntryRepo::count_by_status(&state.pool, session.id).await?;

    // Refresh session to get updated counts.
    let session = AvatarIngestSessionRepo::find_by_id(&state.pool, session.id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestSession",
            id: session.id,
        }))?;

    // Move to preview status.
    let session = AvatarIngestSessionRepo::update_status(&state.pool, session.id, 2)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestSession",
            id: session.id,
        }))?;

    Ok((
        StatusCode::CREATED,
        Json(IngestSessionDetail {
            session,
            entries,
            counts,
        }),
    ))
}

/// GET /api/v1/projects/{project_id}/ingest/{session_id}
///
/// Get a session with its entries and counts.
pub async fn get_session(
    State(state): State<AppState>,
    Path((_project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<IngestSessionDetail>> {
    let session = AvatarIngestSessionRepo::find_by_id(&state.pool, session_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestSession",
            id: session_id,
        }))?;

    let entries = AvatarIngestEntryRepo::list_by_session(&state.pool, session_id).await?;
    let counts = AvatarIngestEntryRepo::count_by_status(&state.pool, session_id).await?;

    Ok(Json(IngestSessionDetail {
        session,
        entries,
        counts,
    }))
}

/// GET /api/v1/projects/{project_id}/ingest/{session_id}/entries
///
/// List entries for a session.
pub async fn list_entries(
    State(state): State<AppState>,
    Path((_project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<Vec<AvatarIngestEntry>>> {
    let entries = AvatarIngestEntryRepo::list_by_session(&state.pool, session_id).await?;
    Ok(Json(entries))
}

/// PUT /api/v1/projects/{project_id}/ingest/{session_id}/entries/{entry_id}
///
/// Update an ingest entry.
pub async fn update_entry(
    State(state): State<AppState>,
    Path((_project_id, _session_id, entry_id)): Path<(DbId, DbId, DbId)>,
    Json(input): Json<UpdateAvatarIngestEntry>,
) -> AppResult<Json<AvatarIngestEntry>> {
    let entry = AvatarIngestEntryRepo::update(&state.pool, entry_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestEntry",
            id: entry_id,
        }))?;
    Ok(Json(entry))
}

/// POST /api/v1/projects/{project_id}/ingest/{session_id}/validate
///
/// Run metadata validation on all included entries in a session.
/// Also validates seed image coverage against the project's pipeline
/// seed slot requirements (PRD-139).
pub async fn validate_session(
    State(state): State<AppState>,
    Path((project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<IngestValidationSummary>> {
    let session = AvatarIngestSessionRepo::find_by_id(&state.pool, session_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestSession",
            id: session_id,
        }))?;

    // Get default template for the project.
    let template =
        MetadataTemplateRepo::find_default(&state.pool, Some(session.project_id)).await?;

    let template_fields = if let Some(ref tmpl) = template {
        let db_fields = MetadataTemplateFieldRepo::list_by_template(&state.pool, tmpl.id).await?;
        db_fields
            .into_iter()
            .map(|f| x121_core::metadata_validator::TemplateField {
                field_name: f.field_name,
                field_type: f.field_type,
                is_required: f.is_required,
                constraints: f.constraints,
            })
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    // Load the project's pipeline seed slots for image validation (PRD-139).
    let seed_slots = load_pipeline_seed_slots(&state.pool, project_id).await?;

    let entries = AvatarIngestEntryRepo::list_by_session(&state.pool, session_id).await?;

    let mut pass_count: i64 = 0;
    let mut warning_count: i64 = 0;
    let mut fail_count: i64 = 0;
    let mut pending_count: i64 = 0;

    for entry in &entries {
        if !entry.is_included {
            continue;
        }

        let (mut status, mut errors_json, warnings_json) = match &entry.metadata_json {
            Some(metadata) => {
                if let Some(map) = metadata.as_object() {
                    let result =
                        x121_core::metadata_validator::validate_metadata(map, &template_fields);
                    let status = if !result.is_valid {
                        "fail"
                    } else if !result.warnings.is_empty() {
                        "warning"
                    } else {
                        "pass"
                    };
                    (
                        status,
                        serde_json::to_value(&result.errors).unwrap_or_default(),
                        serde_json::to_value(&result.warnings).unwrap_or_default(),
                    )
                } else {
                    (
                        "fail",
                        serde_json::json!([{"field": "metadata", "message": "Metadata is not a JSON object", "severity": "error"}]),
                        serde_json::json!([]),
                    )
                }
            }
            None => {
                // No metadata yet — mark as pending.
                ("pending", serde_json::json!([]), serde_json::json!([]))
            }
        };

        // Validate seed images against pipeline seed slots (PRD-139).
        if !seed_slots.is_empty() {
            let provided_labels = extract_image_labels(&entry.image_classifications);
            if let Err(missing) = pipeline::validate_seed_images(&seed_slots, &provided_labels) {
                // Add seed slot errors to the validation errors.
                let seed_errors: Vec<serde_json::Value> = missing
                    .iter()
                    .map(|slot_name| {
                        serde_json::json!({
                            "field": "seed_images",
                            "message": format!("Missing required seed slot: {slot_name}"),
                            "severity": "error"
                        })
                    })
                    .collect();

                // Merge with existing errors.
                if let Some(arr) = errors_json.as_array_mut() {
                    arr.extend(seed_errors);
                }
                status = "fail";
            }
        }

        AvatarIngestEntryRepo::update_validation(
            &state.pool,
            entry.id,
            status,
            &errors_json,
            &warnings_json,
        )
        .await?;

        match status {
            "pass" => pass_count += 1,
            "warning" => warning_count += 1,
            "fail" => fail_count += 1,
            _ => pending_count += 1,
        }
    }

    // Update session counts.
    AvatarIngestSessionRepo::update_counts(&state.pool, session_id).await?;

    let total = pass_count + warning_count + fail_count + pending_count;

    Ok(Json(IngestValidationSummary {
        total,
        pass: pass_count,
        warning: warning_count,
        fail: fail_count,
        pending: pending_count,
    }))
}

/// Load the seed slots for a project's pipeline. Returns empty vec if no pipeline.
async fn load_pipeline_seed_slots(
    pool: &sqlx::PgPool,
    project_id: DbId,
) -> AppResult<Vec<pipeline::SeedSlot>> {
    let project = ProjectRepo::find_by_id(pool, project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: project_id,
        }))?;

    let pl = PipelineRepo::find_by_id(pool, project.pipeline_id).await?;
    match pl {
        Some(p) => pipeline::parse_seed_slots(&p.seed_slots)
            .map_err(|e| AppError::BadRequest(e.to_string())),
        None => Ok(Vec::new()),
    }
}

/// Load the import rules for a project's pipeline. Returns `None` if no pipeline.
pub async fn load_pipeline_import_rules(
    pool: &sqlx::PgPool,
    project_id: DbId,
) -> AppResult<Option<pipeline::ImportRules>> {
    let project = ProjectRepo::find_by_id(pool, project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: project_id,
        }))?;

    let pl = PipelineRepo::find_by_id(pool, project.pipeline_id).await?;
    match pl {
        Some(p) => {
            let rules = pipeline::parse_import_rules(&p.import_rules)
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            Ok(Some(rules))
        }
        None => Ok(None),
    }
}

/// Classify a list of filenames using the pipeline's import rules.
///
/// Returns a JSON object mapping each filename to its classification label
/// (the seed slot name for images, or a descriptive string for other types).
/// Only seed image files are included in the result; videos and metadata are
/// filtered out since ingest only cares about image classification.
pub fn classify_ingest_images(
    filenames: &[String],
    rules: &pipeline::ImportRules,
) -> serde_json::Value {
    let mut classifications = serde_json::Map::new();
    for fname in filenames {
        match import_rules::classify_file(fname, rules) {
            FileClassification::SeedImage { slot } => {
                classifications.insert(fname.clone(), serde_json::Value::String(slot));
            }
            FileClassification::Video { .. }
            | FileClassification::Metadata { .. }
            | FileClassification::Unrecognized => {}
        }
    }
    serde_json::Value::Object(classifications)
}

/// Extract image labels from the entry's `image_classifications` JSON.
///
/// Expected format: either a JSON array of strings (e.g. `["front_clothed", "front_topless"]`)
/// or a JSON object with label keys (e.g. `{"front_clothed": {...}, "front_topless": {...}}`).
fn extract_image_labels(classifications: &serde_json::Value) -> Vec<String> {
    if let Some(arr) = classifications.as_array() {
        arr.iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect()
    } else if let Some(obj) = classifications.as_object() {
        obj.keys().cloned().collect()
    } else {
        Vec::new()
    }
}

/// POST /api/v1/projects/{project_id}/ingest/{session_id}/generate-metadata
///
/// Stub: mark entries as "generating" metadata. Full LLM integration is a
/// future PRD.
pub async fn generate_metadata(
    State(state): State<AppState>,
    Path((_project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<AvatarIngestSession>> {
    // Set session status to "generating_metadata" (3).
    let session = AvatarIngestSessionRepo::update_status(&state.pool, session_id, 3)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestSession",
            id: session_id,
        }))?;

    // Mark all included entries without metadata as "generating".
    let entries = AvatarIngestEntryRepo::list_by_session(&state.pool, session_id).await?;
    for entry in &entries {
        if entry.is_included && entry.metadata_json.is_none() {
            AvatarIngestEntryRepo::update_metadata_status(
                &state.pool,
                entry.id,
                "generating",
                None,
                None,
                None,
            )
            .await?;
        }
    }

    Ok(Json(session))
}

/// POST /api/v1/projects/{project_id}/ingest/{session_id}/confirm
///
/// Create avatars from all included, validated entries.
pub async fn confirm_import(
    State(state): State<AppState>,
    Path((project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<IngestConfirmResult>> {
    // Set session status to "importing" (5).
    AvatarIngestSessionRepo::update_status(&state.pool, session_id, 5).await?;

    let entries = AvatarIngestEntryRepo::list_by_session(&state.pool, session_id).await?;

    let session = AvatarIngestSessionRepo::find_by_id(&state.pool, session_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestSession",
            id: session_id,
        }))?;

    let mut created: i64 = 0;
    let mut failed: i64 = 0;
    let mut skipped: i64 = 0;
    let mut avatar_ids = Vec::new();

    for entry in &entries {
        // Skip excluded entries.
        if !entry.is_included {
            skipped += 1;
            continue;
        }

        // Skip entries with validation failures.
        if entry.validation_status.as_deref() == Some("fail") {
            skipped += 1;
            continue;
        }

        let avatar_name = entry
            .confirmed_name
            .as_deref()
            .unwrap_or(&entry.parsed_name);

        let create_input = CreateAvatar {
            project_id,
            name: avatar_name.to_string(),
            status_id: Some(1), // Draft
            metadata: entry.metadata_json.clone(),
            settings: None,
            group_id: session.target_group_id.map(Some),
        };

        match AvatarRepo::create(&state.pool, &create_input).await {
            Ok(avatar) => {
                AvatarIngestEntryRepo::set_created_avatar(&state.pool, entry.id, avatar.id).await?;
                avatar_ids.push(avatar.id);
                created += 1;
            }
            Err(e) => {
                tracing::warn!(entry_id = entry.id, error = %e, "Failed to create avatar from ingest entry");
                failed += 1;
            }
        }
    }

    // Set session status to "completed" (6) or "failed" (7).
    let final_status = if failed > 0 && created == 0 { 7 } else { 6 };
    AvatarIngestSessionRepo::update_status(&state.pool, session_id, final_status).await?;
    AvatarIngestSessionRepo::update_counts(&state.pool, session_id).await?;

    Ok(Json(IngestConfirmResult {
        created,
        failed,
        skipped,
        avatar_ids,
    }))
}

/// DELETE /api/v1/projects/{project_id}/ingest/{session_id}
///
/// Cancel an ingest session by setting its status to "cancelled" (8).
pub async fn cancel_session(
    State(state): State<AppState>,
    Path((_project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    AvatarIngestSessionRepo::update_status(&state.pool, session_id, 8)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarIngestSession",
            id: session_id,
        }))?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/projects/{project_id}/ingest
///
/// List all ingest sessions for a project.
pub async fn list_sessions(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<Vec<AvatarIngestSession>>> {
    let sessions = AvatarIngestSessionRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(sessions))
}
