//! Handlers for character metadata editing (PRD-66).
//!
//! Provides endpoints for reading and writing character metadata fields,
//! completeness calculation, and CSV export/import with diff preview.
//!
//! Metadata is stored in the `characters.metadata` JSONB column.
//! Field definitions come from the metadata template system (PRD-113).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use x121_core::error::CoreError;
use x121_core::metadata_editor::{
    build_csv, calculate_completeness, calculate_project_completeness, parse_csv,
    standard_field_defs, unflatten_metadata, validate_metadata_fields, CompletenessResult,
    CsvDiffEntry, FieldCategory, FieldType, MetadataFieldDef, MetadataFieldError,
};
use x121_core::types::DbId;
use x121_db::models::character::Character;
use x121_db::models::metadata_template::MetadataTemplateField;
use x121_db::repositories::{
    CharacterMetadataVersionRepo, CharacterRepo, MetadataTemplateFieldRepo, MetadataTemplateRepo,
};

use crate::error::{AppError, AppResult};
use crate::handlers::character_metadata_version::build_manual_version_input;
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

/// Response for the active template endpoint.
#[derive(Debug, Serialize)]
pub struct ActiveTemplateResponse {
    pub template_name: String,
    pub fields: Vec<MetadataTemplateField>,
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

/// Convert a DB template field type string to a core `FieldType`.
fn parse_template_field_type(ft: &str) -> FieldType {
    match ft {
        "number" => FieldType::Number,
        "boolean" | "array" | "object" => FieldType::Text,
        _ => FieldType::Text,
    }
}

/// Derive a `FieldCategory` from a dot-notation field name's sort_order range.
///
/// NOTE: The frontend `groupFieldsIntoSections()` in `characters/types.ts`
/// uses different labels for the same ranges (biographical, appearance,
/// favorites, sexual_preferences, optional) matching the production schema.
/// This mapping is only used for the core `MetadataFieldDef` category, which
/// feeds completeness calculation -- not frontend display.
fn category_from_sort_order(sort_order: i32) -> FieldCategory {
    match sort_order {
        0..=99 => FieldCategory::Biographical,
        100..=199 => FieldCategory::Physical,
        200..=299 => FieldCategory::Preferences,
        300..=399 => FieldCategory::Production,
        _ => FieldCategory::Preferences,
    }
}

/// Load template field definitions from the database.
///
/// Tries to find the default template for the given project, falling back
/// to the global default, and finally to `standard_field_defs()` if no
/// template exists in the database.
async fn load_template_fields(
    pool: &sqlx::PgPool,
    project_id: Option<DbId>,
) -> Result<Vec<MetadataFieldDef>, sqlx::Error> {
    let template = MetadataTemplateRepo::find_default(pool, project_id).await?;

    let Some(template) = template else {
        return Ok(standard_field_defs());
    };

    let db_fields = MetadataTemplateFieldRepo::list_by_template(pool, template.id).await?;

    if db_fields.is_empty() {
        return Ok(standard_field_defs());
    }

    let defs = db_fields
        .into_iter()
        .map(|f| MetadataFieldDef {
            name: f.field_name,
            label: f.description.clone().unwrap_or_else(|| "".to_string()),
            field_type: parse_template_field_type(&f.field_type),
            category: category_from_sort_order(f.sort_order),
            is_required: f.is_required,
            options: vec![],
        })
        .collect();

    Ok(defs)
}

/// Build a structured response from a character and field definitions.
///
/// Returns template fields with their current values, plus any extra
/// metadata keys not covered by the template (custom fields, source
/// blobs like `_source_bio` / `_source_tov`, etc.).
fn build_metadata_response(
    character: &Character,
    fields: &[MetadataFieldDef],
) -> CharacterMetadataResponse {
    let metadata = character_metadata_map(character);
    let completeness = calculate_completeness(character.id, &metadata, fields);

    // Collect template field names for lookup
    let template_names: std::collections::HashSet<&str> =
        fields.iter().map(|d| d.name.as_str()).collect();

    let mut fields_with_values: Vec<MetadataFieldWithValue> = fields
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

    // Append non-template keys (custom fields, _source_bio, _source_tov, etc.)
    for (key, value) in &metadata {
        if template_names.contains(key.as_str()) {
            continue;
        }
        fields_with_values.push(MetadataFieldWithValue {
            definition: MetadataFieldDef {
                name: key.clone(),
                label: key.clone(),
                field_type: FieldType::Text,
                category: FieldCategory::Preferences,
                is_required: false,
                options: vec![],
            },
            value: value.clone(),
        });
    }

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

    let fields = load_template_fields(&state.pool, Some(character.project_id)).await?;
    let response = build_metadata_response(&character, &fields);

    Ok(Json(DataResponse { data: response }))
}

/// GET /api/v1/characters/{character_id}/metadata/template
///
/// Return the active metadata template and its fields for a character.
pub async fn get_metadata_template(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let character = CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    let template =
        MetadataTemplateRepo::find_default(&state.pool, Some(character.project_id)).await?;

    let (template_name, fields) = match template {
        Some(t) => {
            let fields = MetadataTemplateFieldRepo::list_by_template(&state.pool, t.id).await?;
            (t.name, fields)
        }
        None => ("Default".to_string(), vec![]),
    };

    Ok(Json(DataResponse {
        data: ActiveTemplateResponse {
            template_name,
            fields,
        },
    }))
}

/// PUT /api/v1/characters/{character_id}/metadata
///
/// Update metadata fields with validation. Unknown fields (custom fields)
/// are allowed. Dot-notation keys are unflattened to nested JSON for storage.
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

    let fields = load_template_fields(&state.pool, Some(character.project_id)).await?;

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

    // Unflatten dot-notation keys to nested JSON, then merge into existing.
    let unflattened = unflatten_metadata(&updates);
    let mut existing = character_metadata_map(&character);
    for (key, value) in &unflattened {
        if let (Some(existing_obj), serde_json::Value::Object(new_obj)) =
            (existing.get(key).and_then(|v| v.as_object()), &value)
        {
            // Deep merge nested objects
            let mut merged = existing_obj.clone();
            for (sub_key, sub_val) in new_obj {
                merged.insert(sub_key.clone(), sub_val.clone());
            }
            existing.insert(key.clone(), serde_json::Value::Object(merged));
        } else {
            existing.insert(key.clone(), value.clone());
        }
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
            group_id: None,
            blocking_deliverables: None,
        },
    )
    .await?
    .ok_or(AppError::Core(CoreError::NotFound {
        entity: "Character",
        id: character_id,
    }))?;

    // Create a metadata version only if real metadata fields changed (dedup).
    // Source file uploads (_source_bio, _source_tov) are stored on the character
    // but do NOT create metadata versions — they are source data, not metadata.
    // Clearing all fields (setting them to null) also does NOT create a version.
    let only_source_keys = updates.keys().all(|k| k.starts_with("_source_"));

    // Check if all non-source fields are null (i.e. metadata was cleared)
    let all_fields_cleared = new_metadata
        .as_object()
        .map(|m| {
            m.iter()
                .filter(|(k, _)| !k.starts_with("_source_"))
                .all(|(_, v)| v.is_null())
        })
        .unwrap_or(false);

    let should_create_version = !only_source_keys
        && !all_fields_cleared
        && match CharacterMetadataVersionRepo::find_active(&state.pool, character_id).await {
            Ok(Some(active)) => active.metadata != new_metadata,
            _ => true, // No active version or DB error — create one
        };

    if should_create_version {
        let metadata_map = new_metadata.as_object();
        let source_bio = metadata_map.and_then(|m| m.get("_source_bio")).cloned();
        let source_tov = metadata_map.and_then(|m| m.get("_source_tov")).cloned();

        // Strip _source_* keys from the version metadata — source data lives
        // in the version's dedicated source_bio/source_tov columns, not in
        // the delivered metadata blob.
        let clean_metadata = match metadata_map {
            Some(m) => {
                let cleaned: serde_json::Map<String, serde_json::Value> = m
                    .iter()
                    .filter(|(k, _)| !k.starts_with("_source_"))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                serde_json::Value::Object(cleaned)
            }
            None => new_metadata.clone(),
        };

        let generation_report = x121_core::metadata_transform::build_report_json(&clean_metadata);

        let version_input = build_manual_version_input(
            character_id,
            clean_metadata,
            None,
            generation_report,
            source_bio,
            source_tov,
        );
        let _ = CharacterMetadataVersionRepo::create_as_active(&state.pool, &version_input).await;
    }

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
    let fields = load_template_fields(&state.pool, Some(project_id)).await?;

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

    let fields = load_template_fields(&state.pool, Some(character.project_id)).await?;
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
    let fields = load_template_fields(&state.pool, Some(project_id)).await?;

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
    let fields = load_template_fields(&state.pool, Some(project_id)).await?;

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
    let fields = load_template_fields(&state.pool, Some(project_id)).await?;

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
