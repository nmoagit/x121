//! Handlers for character metadata editing (PRD-66).
//!
//! Provides endpoints for reading and writing character metadata fields,
//! completeness calculation, and CSV export/import with diff preview.
//!
//! Metadata is stored in the `characters.metadata` JSONB column. This
//! module does **not** create new tables.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use x121_core::error::CoreError;
use x121_core::metadata_editor::{
    build_csv, calculate_completeness, calculate_project_completeness, parse_csv,
    standard_field_defs, validate_metadata_fields, CompletenessResult, CsvDiffEntry,
    MetadataFieldDef, MetadataFieldError,
};
use x121_core::types::DbId;
use x121_db::models::character::Character;
use x121_db::repositories::CharacterRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Structured metadata response for a single character.
#[derive(Debug, Serialize)]
pub struct CharacterMetadataResponse {
    pub character_id: DbId,
    pub character_name: String,
    pub fields: Vec<MetadataFieldWithValue>,
    pub completeness: CompletenessResult,
}

/// A field definition paired with its current value.
#[derive(Debug, Serialize)]
pub struct MetadataFieldWithValue {
    #[serde(flatten)]
    pub definition: MetadataFieldDef,
    pub value: serde_json::Value,
}

/// Result of a metadata update.
#[derive(Debug, Serialize)]
pub struct MetadataUpdateResult {
    pub status: String,
    pub character_id: DbId,
    pub metadata: serde_json::Value,
}

/// Result of a validation failure.
#[derive(Debug, Serialize)]
pub struct MetadataValidationFailure {
    pub status: String,
    pub errors: Vec<MetadataFieldError>,
}

/// CSV import preview response.
#[derive(Debug, Serialize)]
pub struct CsvImportPreview {
    pub total_records: usize,
    pub matched_records: usize,
    pub unmatched_records: usize,
    pub diffs: Vec<CsvDiffEntry>,
    pub validation_errors: Vec<CsvRecordError>,
}

/// Per-record validation errors from CSV import.
#[derive(Debug, Serialize)]
pub struct CsvRecordError {
    pub row_index: usize,
    pub character_id: Option<i64>,
    pub errors: Vec<MetadataFieldError>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract the metadata map from a character, defaulting to empty object.
fn character_metadata_map(character: &Character) -> serde_json::Map<String, serde_json::Value> {
    character
        .metadata
        .as_ref()
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

/// Build a structured response from a character and field definitions.
fn build_metadata_response(
    character: &Character,
    fields: &[MetadataFieldDef],
) -> CharacterMetadataResponse {
    let metadata = character_metadata_map(character);
    let completeness = calculate_completeness(character.id, &metadata, fields);

    let fields_with_values: Vec<MetadataFieldWithValue> = fields
        .iter()
        .map(|def| {
            let value = metadata
                .get(&def.name)
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            MetadataFieldWithValue {
                definition: def.clone(),
                value,
            }
        })
        .collect();

    CharacterMetadataResponse {
        character_id: character.id,
        character_name: character.name.clone(),
        fields: fields_with_values,
        completeness,
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/characters/{character_id}/metadata
///
/// Return structured metadata for a single character, including field
/// definitions, current values, and completeness status.
pub async fn get_character_metadata(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let character = CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    let fields = standard_field_defs();
    let response = build_metadata_response(&character, &fields);

    Ok(Json(DataResponse { data: response }))
}

/// PUT /api/v1/characters/{character_id}/metadata
///
/// Update metadata fields with validation. Only known fields are accepted.
/// Returns validation errors if any fields are invalid.
pub async fn update_character_metadata(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(updates): Json<serde_json::Map<String, serde_json::Value>>,
) -> AppResult<impl IntoResponse> {
    // Verify character exists.
    let character = CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    let fields = standard_field_defs();

    // Validate the incoming updates.
    let validation_errors = validate_metadata_fields(&updates, &fields);
    if !validation_errors.is_empty() {
        let failure = MetadataValidationFailure {
            status: "validation_failed".to_string(),
            errors: validation_errors,
        };
        return Ok((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(DataResponse { data: failure }),
        )
            .into_response());
    }

    // Merge updates into existing metadata.
    let mut existing = character_metadata_map(&character);
    for (key, value) in &updates {
        existing.insert(key.clone(), value.clone());
    }

    // Persist via metadata column update.
    let new_metadata = serde_json::Value::Object(existing);
    let updated = CharacterRepo::update(
        &state.pool,
        character_id,
        &x121_db::models::character::UpdateCharacter {
            name: None,
            status_id: None,
            metadata: Some(new_metadata.clone()),
            settings: None,
        },
    )
    .await?
    .ok_or(AppError::Core(CoreError::NotFound {
        entity: "Character",
        id: character_id,
    }))?;

    let result = MetadataUpdateResult {
        status: "updated".to_string(),
        character_id: updated.id,
        metadata: new_metadata,
    };

    Ok(Json(DataResponse { data: result }).into_response())
}

/// GET /api/v1/projects/{project_id}/characters/metadata
///
/// Return metadata for all characters in a project (for spreadsheet view).
pub async fn list_project_metadata(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;
    let fields = standard_field_defs();

    let responses: Vec<CharacterMetadataResponse> = characters
        .iter()
        .map(|c| build_metadata_response(c, &fields))
        .collect();

    Ok(Json(DataResponse { data: responses }))
}

/// GET /api/v1/characters/{character_id}/metadata/completeness
///
/// Return completeness status for a single character.
pub async fn get_completeness(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let character = CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    let fields = standard_field_defs();
    let metadata = character_metadata_map(&character);
    let result = calculate_completeness(character.id, &metadata, &fields);

    Ok(Json(DataResponse { data: result }))
}

/// GET /api/v1/projects/{project_id}/characters/metadata/completeness
///
/// Return project-level completeness summary.
pub async fn get_project_completeness(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;
    let fields = standard_field_defs();

    let character_data: Vec<(i64, serde_json::Map<String, serde_json::Value>)> = characters
        .iter()
        .map(|c| (c.id, character_metadata_map(c)))
        .collect();

    let result = calculate_project_completeness(&character_data, &fields);

    Ok(Json(DataResponse { data: result }))
}

/// GET /api/v1/projects/{project_id}/characters/metadata/csv
///
/// Export all character metadata as CSV.
pub async fn export_metadata_csv(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;
    let fields = standard_field_defs();

    let character_data: Vec<(i64, String, serde_json::Map<String, serde_json::Value>)> = characters
        .iter()
        .map(|c| (c.id, c.name.clone(), character_metadata_map(c)))
        .collect();

    let csv = build_csv(&character_data, &fields);

    Ok((
        StatusCode::OK,
        [
            (axum::http::header::CONTENT_TYPE, "text/csv"),
            (
                axum::http::header::CONTENT_DISPOSITION,
                "attachment; filename=\"metadata.csv\"",
            ),
        ],
        csv,
    ))
}

/// POST /api/v1/projects/{project_id}/characters/metadata/csv
///
/// Import CSV and return a diff preview showing what would change.
/// Does NOT commit changes -- the frontend must confirm and call
/// `update_character_metadata` per character.
pub async fn import_metadata_csv_preview(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    body: axum::body::Bytes,
) -> AppResult<impl IntoResponse> {
    let records =
        parse_csv(&body).map_err(|e| AppError::BadRequest(format!("CSV parse error: {e}")))?;
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;
    let fields = standard_field_defs();

    // Build lookup by character ID.
    let char_by_id: std::collections::HashMap<DbId, &Character> =
        characters.iter().map(|c| (c.id, c)).collect();

    let mut diffs = Vec::new();
    let mut validation_errors = Vec::new();
    let mut matched = 0usize;
    let mut unmatched = 0usize;

    for (row_idx, record) in records.iter().enumerate() {
        let Some(char_id) = record.id else {
            unmatched += 1;
            continue;
        };

        let Some(character) = char_by_id.get(&char_id) else {
            unmatched += 1;
            continue;
        };

        matched += 1;

        // Validate the record fields.
        let errors = validate_metadata_fields(&record.fields, &fields);
        if !errors.is_empty() {
            validation_errors.push(CsvRecordError {
                row_index: row_idx,
                character_id: Some(char_id),
                errors,
            });
        }

        // Compute diffs.
        let existing = character_metadata_map(character);
        for (field_name, new_value) in &record.fields {
            let old_value = existing
                .get(field_name)
                .cloned()
                .unwrap_or(serde_json::Value::Null);

            if old_value != *new_value {
                diffs.push(CsvDiffEntry {
                    character_id: char_id,
                    character_name: character.name.clone(),
                    field_name: field_name.clone(),
                    old_value,
                    new_value: new_value.clone(),
                });
            }
        }
    }

    let preview = CsvImportPreview {
        total_records: records.len(),
        matched_records: matched,
        unmatched_records: unmatched,
        diffs,
        validation_errors,
    };

    Ok(Json(DataResponse { data: preview }))
}
