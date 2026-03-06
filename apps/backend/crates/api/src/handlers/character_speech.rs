//! Handlers for character speeches (PRD-124).
//!
//! Manages versioned speech text entries per character, with import/export
//! support for JSON and CSV formats.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character_speech::{CreateCharacterSpeech, UpdateCharacterSpeech};
use x121_db::repositories::{CharacterSpeechRepo, SpeechTypeRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Optional query parameter to filter by speech type.
#[derive(Debug, Deserialize)]
pub struct SpeechListQuery {
    pub type_id: Option<i16>,
}

/// Request body for importing speeches.
#[derive(Debug, Deserialize)]
pub struct ImportSpeechesRequest {
    pub format: String,
    pub data: String,
}

/// Response body for speech import results.
#[derive(Debug, Serialize)]
pub struct ImportSpeechesResponse {
    pub imported: usize,
    pub created_types: Vec<String>,
    pub errors: Vec<String>,
}

/// Request body for exporting speeches.
#[derive(Debug, Deserialize)]
pub struct ExportSpeechesRequest {
    pub format: String,
}

/// A single entry in JSON import format.
#[derive(Debug, Deserialize)]
struct ImportJsonEntry {
    #[serde(rename = "type")]
    speech_type: String,
    text: String,
}

/// A single entry in JSON export format.
#[derive(Debug, Serialize)]
struct ExportJsonEntry {
    #[serde(rename = "type")]
    speech_type: String,
    text: String,
    version: i32,
}

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------

/// GET /characters/{character_id}/speeches?type_id=N
///
/// List all non-deleted speeches for a character, optionally filtered by type.
pub async fn list_speeches(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Query(params): Query<SpeechListQuery>,
) -> AppResult<impl IntoResponse> {
    let speeches = match params.type_id {
        Some(type_id) => {
            CharacterSpeechRepo::list_for_character_by_type(&state.pool, character_id, type_id)
                .await?
        }
        None => CharacterSpeechRepo::list_for_character(&state.pool, character_id).await?,
    };
    Ok(Json(DataResponse { data: speeches }))
}

/// POST /characters/{character_id}/speeches
///
/// Create a new speech entry with auto-assigned version.
pub async fn create_speech(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<CreateCharacterSpeech>,
) -> AppResult<impl IntoResponse> {
    if body.text.trim().is_empty() {
        return Err(AppError::BadRequest("text must not be empty".to_string()));
    }

    let speech = CharacterSpeechRepo::create(&state.pool, character_id, &body).await?;

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        speech_id = speech.id,
        "Character speech created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: speech })))
}

/// PUT /characters/{character_id}/speeches/{speech_id}
///
/// Update the text of an existing speech entry.
pub async fn update_speech(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((character_id, speech_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateCharacterSpeech>,
) -> AppResult<impl IntoResponse> {
    if body.text.trim().is_empty() {
        return Err(AppError::BadRequest("text must not be empty".to_string()));
    }

    let speech = CharacterSpeechRepo::update(&state.pool, speech_id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "CharacterSpeech",
            id: speech_id,
        }))?;

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        speech_id = speech_id,
        "Character speech updated"
    );

    Ok(Json(DataResponse { data: speech }))
}

/// DELETE /characters/{character_id}/speeches/{speech_id}
///
/// Soft-delete a speech entry.
pub async fn delete_speech(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((character_id, speech_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = CharacterSpeechRepo::soft_delete(&state.pool, speech_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "CharacterSpeech",
            id: speech_id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        speech_id = speech_id,
        "Character speech deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

/// POST /characters/{character_id}/speeches/import
///
/// Import speeches from JSON or CSV data. Unknown type names are auto-created.
/// Empty text entries produce errors. The operation is all-or-nothing.
pub async fn import_speeches(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<ImportSpeechesRequest>,
) -> AppResult<impl IntoResponse> {
    let parsed = match body.format.as_str() {
        "json" => parse_json_import(&body.data)?,
        "csv" => parse_csv_import(&body.data)?,
        _ => {
            return Err(AppError::BadRequest(
                "format must be 'json' or 'csv'".to_string(),
            ))
        }
    };

    // Validate all entries before creating anything.
    let mut errors = Vec::new();
    for (i, (type_name, text)) in parsed.iter().enumerate() {
        if type_name.trim().is_empty() {
            errors.push(format!("row {}: type name is empty", i + 1));
        }
        if text.trim().is_empty() {
            errors.push(format!("row {}: text is empty", i + 1));
        }
    }
    if !errors.is_empty() {
        return Ok(Json(DataResponse {
            data: ImportSpeechesResponse {
                imported: 0,
                created_types: vec![],
                errors,
            },
        }));
    }

    // Resolve type names to IDs, creating new types as needed.
    let mut created_types = Vec::new();
    let mut entries: Vec<(i16, String)> = Vec::with_capacity(parsed.len());

    for (type_name, text) in &parsed {
        let trimmed_name = type_name.trim();
        let existed_before = SpeechTypeRepo::find_by_name(&state.pool, trimmed_name)
            .await?
            .is_some();
        let speech_type = SpeechTypeRepo::find_or_create(&state.pool, trimmed_name).await?;
        if !existed_before {
            created_types.push(trimmed_name.to_string());
        }
        entries.push((speech_type.id, text.clone()));
    }

    // Bulk create in a transaction.
    let created = CharacterSpeechRepo::bulk_create(&state.pool, character_id, &entries).await?;
    let imported = created.len();

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        imported = imported,
        created_types = ?created_types,
        "Speeches imported"
    );

    Ok(Json(DataResponse {
        data: ImportSpeechesResponse {
            imported,
            created_types,
            errors: vec![],
        },
    }))
}

/// POST /characters/{character_id}/speeches/export
///
/// Export speeches as JSON array or CSV string.
pub async fn export_speeches(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<ExportSpeechesRequest>,
) -> AppResult<impl IntoResponse> {
    let speeches = CharacterSpeechRepo::list_for_character(&state.pool, character_id).await?;

    // Load speech types for name lookup.
    let types = SpeechTypeRepo::list_all(&state.pool).await?;
    let type_name = |id: i16| -> String {
        types
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.name.clone())
            .unwrap_or_else(|| format!("unknown_{id}"))
    };

    match body.format.as_str() {
        "json" => {
            let items: Vec<ExportJsonEntry> = speeches
                .iter()
                .map(|s| ExportJsonEntry {
                    speech_type: type_name(s.speech_type_id),
                    text: s.text.clone(),
                    version: s.version,
                })
                .collect();
            Ok(Json(DataResponse { data: items }))
        }
        "csv" => {
            let mut csv = String::new();
            for s in &speeches {
                let escaped_text = s.text.replace('"', "\"\"");
                csv.push_str(&format!(
                    "{},\"{}\"\n",
                    type_name(s.speech_type_id),
                    escaped_text
                ));
            }
            Ok(Json(DataResponse {
                data: serde_json::Value::String(csv),
            }))
        }
        _ => Err(AppError::BadRequest(
            "format must be 'json' or 'csv'".to_string(),
        )),
    }
}

// ---------------------------------------------------------------------------
// Import parsers
// ---------------------------------------------------------------------------

/// Parse JSON import format: `[{ "type": "Greeting", "text": "Hey..." }, ...]`
fn parse_json_import(data: &str) -> AppResult<Vec<(String, String)>> {
    let entries: Vec<ImportJsonEntry> = serde_json::from_str(data)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;

    Ok(entries
        .into_iter()
        .map(|e| (e.speech_type, e.text))
        .collect())
}

/// Parse CSV import format: `type,text` per line.
///
/// Handles an optional header row (skips if first row is exactly "type,text").
fn parse_csv_import(data: &str) -> AppResult<Vec<(String, String)>> {
    let mut results = Vec::new();

    for (i, line) in data.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Skip header row if present.
        if i == 0 && trimmed.eq_ignore_ascii_case("type,text") {
            continue;
        }

        // Split on first comma only.
        let Some(comma_pos) = trimmed.find(',') else {
            return Err(AppError::BadRequest(format!(
                "row {}: expected 'type,text' format, no comma found",
                i + 1
            )));
        };

        let type_name = trimmed[..comma_pos].trim().to_string();
        let mut text = trimmed[comma_pos + 1..].trim().to_string();

        // Strip surrounding quotes if present.
        if text.starts_with('"') && text.ends_with('"') && text.len() >= 2 {
            text = text[1..text.len() - 1].replace("\"\"", "\"");
        }

        results.push((type_name, text));
    }

    Ok(results)
}
